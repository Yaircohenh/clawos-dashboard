import { NextResponse } from "next/server";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { checkRateLimit } from "@/lib/rate-limit";
import { agentsRuntimeDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

function getLatestSessionFile(agentId: string): string | null {
  try {
    const sessDir = join(agentsRuntimeDir(), agentId, "sessions");
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
  const sessDir = join(agentsRuntimeDir(), agentId, "sessions");
  const direct = join(sessDir, `${sessionId}.jsonl`);
  if (existsSync(direct)) return direct;
  try {
    const meta = JSON.parse(readFileSync(join(sessDir, "sessions.json"), "utf8"));
    for (const entry of Object.values(meta) as Record<string, unknown>[]) {
      if (entry.sessionId === sessionId && typeof entry.sessionFile === "string") {
        return entry.sessionFile;
      }
    }
  } catch { /* no sessions.json or parse error */ }
  return getLatestSessionFile(agentId);
}

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * GET /api/chat/history
 *
 * Returns ALL user and assistant messages from a session file in
 * chronological order. This allows the frontend to rebuild the full
 * conversation after a page refresh or tab switch.
 */
export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`chat-history:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId") || "";

  const sessionFile = sessionId
    ? getSessionFileById("main", sessionId)
    : getLatestSessionFile("main");
  if (!sessionFile) {
    return NextResponse.json({ messages: [] });
  }

  try {
    const content = readFileSync(sessionFile, "utf-8").trim();
    if (!content) {
      return NextResponse.json({ messages: [] });
    }

    const allLines = content.split("\n");
    const messages: HistoryMessage[] = [];

    for (const line of allLines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type !== "message") continue;

        const role = entry.message?.role;
        if (role !== "user" && role !== "assistant") continue;

        const arr = Array.isArray(entry.message.content)
          ? entry.message.content
          : [];
        const parts = arr
          .filter(
            (c: Record<string, unknown>) => c.type === "text" && c.text
          )
          .map((c: Record<string, unknown>) => c.text as string);
        const text = parts.join("\n").trim();

        if (!text || text === "NO_REPLY") continue;

        messages.push({ role, content: text });
      } catch {
        /* skip unparseable lines */
      }
    }

    return NextResponse.json({ messages });
  } catch {
    return NextResponse.json({ messages: [] });
  }
}
