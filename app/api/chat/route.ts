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

/** Check if any lines in [fromLine, toLine) contain sessions_spawn tool calls */
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

function extractAssistantTexts(
  filePath: string,
  afterLine: number
): string[] {
  try {
    const content = readFileSync(filePath, "utf-8").trim();
    if (!content) return [];
    const allLines = content.split("\n");
    if (allLines.length <= afterLine) return [];

    const texts: string[] = [];
    for (let i = afterLine; i < allLines.length; i++) {
      try {
        const entry = JSON.parse(allLines[i]);
        if (entry.type === "message" && entry.message?.role === "assistant") {
          const arr = Array.isArray(entry.message.content)
            ? entry.message.content
            : [];
          const parts = arr
            .filter(
              (c: Record<string, unknown>) => c.type === "text" && c.text
            )
            .map((c: Record<string, unknown>) => c.text as string);
          const text = parts.join("\n").trim();
          // Skip empty and placeholder responses (Tom says "NO_REPLY" when deferring)
          if (text && text !== "NO_REPLY") texts.push(text);
        }
      } catch {
        /* skip unparseable lines */
      }
    }
    return texts;
  } catch {
    return [];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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
      // so we can scope spawn detection to only this request's lines
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
        // Non-zero exit or client disconnected — close immediately
        if (code !== 0 || request.signal.aborted) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "done", code, output: output.trim() })}\n\n`
            )
          );
          controller.close();
          return;
        }

        // Check if Tom spawned subagents in THIS request (not previous ones)
        const sessionFile = getLatestSessionFile("main");
        if (!sessionFile) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "done", code, output: output.trim() })}\n\n`
            )
          );
          controller.close();
          return;
        }

        const postBaseline = countFileLines(sessionFile);

        // Only check lines added during THIS CLI invocation for spawn calls
        if (!hasSpawnCallsInRange(sessionFile, preBaseline, postBaseline)) {
          // No subagents spawned — close immediately (fast path)
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "done", code, output: output.trim() })}\n\n`
            )
          );
          controller.close();
          return;
        }

        // Subagents were spawned — poll session file for follow-up responses
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "waiting" })}\n\n`
          )
        );

        (async () => {
          try {
            let sentCount = 0;
            let lastActivity = Date.now();
            const startTime = Date.now();
            const MAX_TOTAL_MS = 90_000; // 90s max total poll time
            const IDLE_TIMEOUT_MS = 30_000; // 30s with no new messages
            const POLL_INTERVAL_MS = 2_000; // check every 2s
            let separatorSent = false;

            // Initial delay — let subagents start working
            await sleep(3000);

            while (!request.signal.aborted) {
              const newTexts = extractAssistantTexts(
                sessionFile,
                postBaseline
              );

              if (newTexts.length > sentCount) {
                // New follow-up responses arrived
                if (!separatorSent) {
                  const sep = "\n\n---\n\n";
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ type: "chunk", text: sep })}\n\n`
                    )
                  );
                  output += sep;
                  separatorSent = true;
                }

                for (let i = sentCount; i < newTexts.length; i++) {
                  const chunk = newTexts[i] + "\n\n";
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ type: "chunk", text: chunk })}\n\n`
                    )
                  );
                  output += chunk;
                }
                sentCount = newTexts.length;
                lastActivity = Date.now();
              }

              // Check timeouts
              if (Date.now() - startTime > MAX_TOTAL_MS) break;
              if (Date.now() - lastActivity > IDLE_TIMEOUT_MS) break;

              await sleep(POLL_INTERVAL_MS);
            }
          } catch {
            // aborted or read error — close gracefully
          }

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "done", code: 0, output: output.trim() })}\n\n`
            )
          );
          controller.close();
        })();
      });

      proc.on("error", (err) => {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", text: err.message })}\n\n`
          )
        );
        controller.close();
      });

      // Handle client disconnect
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
