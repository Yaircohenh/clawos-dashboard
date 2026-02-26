import { NextRequest } from "next/server";
import { spawn } from "child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { checkRateLimit } from "@/lib/rate-limit";
import { agentsRuntimeDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

const AGENT_BASE = agentsRuntimeDir();

function getLatestSessionFile(agentId: string): string | null {
  try {
    const sessDir = join(AGENT_BASE, agentId, "sessions");
    const files = readdirSync(sessDir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => ({
        name: f,
        mtime: statSync(join(sessDir, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);
    return files.length > 0 ? join(sessDir, files[0].name) : null;
  } catch {
    return null;
  }
}

function getSessionFileById(agentId: string, sessionId: string): string | null {
  const sessDir = join(AGENT_BASE, agentId, "sessions");
  // Direct match: {sessionId}.jsonl
  const direct = join(sessDir, `${sessionId}.jsonl`);
  if (existsSync(direct)) return direct;
  // Check sessions.json mapping
  try {
    const meta = JSON.parse(readFileSync(join(sessDir, "sessions.json"), "utf8"));
    for (const entry of Object.values(meta) as Record<string, unknown>[]) {
      if (entry.sessionId === sessionId && typeof entry.sessionFile === "string") {
        return entry.sessionFile;
      }
    }
  } catch { /* no sessions.json or parse error */ }
  // Fallback to latest
  return getLatestSessionFile(agentId);
}

/**
 * Swap the agent:main:main session entry to point to a specific conversation's
 * session file. The gateway always resolves CLI calls to agent:main:main, so we
 * swap the entry before spawning to route to the right .jsonl transcript.
 */
function activateSession(agentId: string, sessionId: string): void {
  const sessDir = join(AGENT_BASE, agentId, "sessions");
  const sessJsonPath = join(sessDir, "sessions.json");
  const sessionFile = join(sessDir, `${sessionId}.jsonl`);
  const sessionKey = `agent:${agentId}:main`;

  mkdirSync(sessDir, { recursive: true });

  // Create empty session file if it doesn't exist
  if (!existsSync(sessionFile)) {
    writeFileSync(sessionFile, "", "utf8");
  }

  // Read current sessions.json
  let store: Record<string, Record<string, unknown>> = {};
  try {
    store = JSON.parse(readFileSync(sessJsonPath, "utf8"));
  } catch { /* missing or corrupt — start fresh */ }

  // Copy existing entry fields (model, provider, skills, etc.) and swap the session
  const existing = (store[sessionKey] ?? {}) as Record<string, unknown>;
  store[sessionKey] = {
    ...existing,
    sessionId,
    sessionFile,
    updatedAt: Date.now(),
    systemSent: false,
    abortedLastRun: false,
  };

  writeFileSync(sessJsonPath, JSON.stringify(store, null, 2), "utf8");
}

function countFileLines(filePath: string): number {
  try {
    const content = readFileSync(filePath, "utf-8").trim();
    return content ? content.split("\n").length : 0;
  } catch {
    return 0;
  }
}

function hasSpawnCallsInRange(
  filePath: string,
  fromLine: number,
  toLine: number
): boolean {
  try {
    const content = readFileSync(filePath, "utf-8").trim();
    if (!content) return false;
    const lines = content.split("\n").slice(fromLine, toLine);
    return lines.some((line) => line.includes('"sessions_spawn"'));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`chat:${ip}`);
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Rate limited" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { message?: string; sessionId?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  if (!message || message.length > 100000) {
    return new Response(
      JSON.stringify({ error: "Message required (max 100000 chars)" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Activate the target session before spawning the CLI
      if (sessionId) {
        activateSession("main", sessionId);
      }

      // Snapshot session line count BEFORE CLI starts
      const preSessionFile = sessionId
        ? getSessionFileById("main", sessionId)
        : getLatestSessionFile("main");
      const preBaseline = preSessionFile ? countFileLines(preSessionFile) : 0;

      const args = ["agent", "--agent", "main", "--message", message];
      if (sessionId) {
        args.push("--session-id", sessionId);
      }

      const proc = spawn("openclaw", args, {
        env: { ...process.env, NO_COLOR: "1" },
        timeout: 120000,
      });

      let output = "";

      proc.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        output += text;
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "chunk", text })}\n\n`
          )
        );
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        if (text.includes("Error") || text.includes("error")) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", text: text.trim() })}\n\n`
            )
          );
        }
      });

      proc.on("close", (code) => {
        // Check if Tom spawned subagents during THIS request
        const sessionFile = sessionId
          ? getSessionFileById("main", sessionId)
          : getLatestSessionFile("main");
        let spawned = false;
        let baseline = 0;

        if (sessionFile && code === 0) {
          const postBaseline = countFileLines(sessionFile);
          if (hasSpawnCallsInRange(sessionFile, preBaseline, postBaseline)) {
            spawned = true;
            baseline = postBaseline;
          }
        }

        // Send done with spawn info — frontend uses this to start polling
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              code,
              output: output.trim(),
              spawned,
              baseline,
            })}\n\n`
          )
        );
        controller.close();
      });

      proc.on("error", (err) => {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", text: err.message })}\n\n`
          )
        );
        controller.close();
      });

      request.signal.addEventListener("abort", () => {
        proc.kill("SIGTERM");
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
