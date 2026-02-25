import { NextResponse } from "next/server";
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

/**
 * GET /api/chat/latest
 *
 * Returns the last user message and all assistant messages that follow it
 * from the main agent's session file. This lets the frontend "catch up"
 * on responses that arrived while the user was on another page.
 */
export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`chat-latest:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const sessionFile = getLatestSessionFile("main");
  if (!sessionFile) {
    return NextResponse.json({ userMessage: null, responses: [] });
  }

  try {
    const content = readFileSync(sessionFile, "utf-8").trim();
    if (!content) {
      return NextResponse.json({ userMessage: null, responses: [] });
    }

    const allLines = content.split("\n");

    // Walk backwards to find the last user message, then collect all
    // assistant responses after it
    let lastUserText: string | null = null;
    let lastUserIdx = -1;

    for (let i = allLines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(allLines[i]);
        if (entry.type === "message" && entry.message?.role === "user") {
          const arr = Array.isArray(entry.message.content)
            ? entry.message.content
            : [];
          const parts = arr
            .filter(
              (c: Record<string, unknown>) => c.type === "text" && c.text
            )
            .map((c: Record<string, unknown>) => c.text as string);
          const text = parts.join("\n").trim();
          if (text) {
            lastUserText = text;
            lastUserIdx = i;
            break;
          }
        }
      } catch {
        /* skip */
      }
    }

    if (lastUserIdx === -1) {
      return NextResponse.json({ userMessage: null, responses: [] });
    }

    // Collect all assistant text responses after the last user message
    const responses: string[] = [];
    for (let i = lastUserIdx + 1; i < allLines.length; i++) {
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
          if (text && text !== "NO_REPLY") {
            responses.push(text);
          }
        }
      } catch {
        /* skip */
      }
    }

    return NextResponse.json({
      userMessage: lastUserText,
      responses,
      lineCount: allLines.length,
    });
  } catch {
    return NextResponse.json({ userMessage: null, responses: [] });
  }
}
