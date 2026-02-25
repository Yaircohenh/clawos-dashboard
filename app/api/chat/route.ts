import { NextRequest } from "next/server";
import { spawn } from "child_process";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const AGENT_BASE = "/home/node/.openclaw/agents";

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

  let body: { message?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 10000) {
    return new Response(
      JSON.stringify({ error: "Message required (max 10000 chars)" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Snapshot session line count BEFORE CLI starts
      const preSessionFile = getLatestSessionFile("main");
      const preBaseline = preSessionFile ? countFileLines(preSessionFile) : 0;

      const proc = spawn(
        "openclaw",
        ["agent", "--agent", "main", "--message", message],
        { env: { ...process.env, NO_COLOR: "1" }, timeout: 120000 }
      );

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
        const sessionFile = getLatestSessionFile("main");
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
