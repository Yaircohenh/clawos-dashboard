import { NextRequest, NextResponse } from "next/server";
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

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`chat-followups:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const baseline = parseInt(
    request.nextUrl.searchParams.get("baseline") || "0",
    10
  );

  const sessionFile = getLatestSessionFile("main");
  if (!sessionFile) {
    return NextResponse.json({ messages: [], lineCount: 0 });
  }

  try {
    const content = readFileSync(sessionFile, "utf-8").trim();
    if (!content) {
      return NextResponse.json({ messages: [], lineCount: 0 });
    }

    const allLines = content.split("\n");
    const lineCount = allLines.length;

    if (lineCount <= baseline) {
      return NextResponse.json({ messages: [], lineCount });
    }

    const newLines = allLines.slice(baseline);
    const messages: string[] = [];

    for (const line of newLines) {
      try {
        const entry = JSON.parse(line);
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
          // Skip empty and placeholder responses
          if (text && text !== "NO_REPLY") {
            messages.push(text);
          }
        }
      } catch {
        /* skip unparseable */
      }
    }

    return NextResponse.json({ messages, lineCount });
  } catch {
    return NextResponse.json({ messages: [], lineCount: 0 });
  }
}
