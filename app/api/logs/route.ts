import { NextRequest, NextResponse } from "next/server";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
import { checkRateLimit } from "@/lib/rate-limit";
import { logsDir, agentsRuntimeDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  source: string;
}

function getLogEntries(limit: number = 100): LogEntry[] {
  const entries: LogEntry[] = [];

  // 1. Read gateway log files
  try {
    const logDir = logsDir();
    const logFiles = readdirSync(logDir)
      .filter(f => f.endsWith(".log"))
      .map(f => join(logDir, f));

    if (logFiles.length > 0) {
      const raw = execFileSync("tail", ["-100", ...logFiles], {
        encoding: "utf-8",
        timeout: 5000,
      }).trim();

      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        const match = line.match(/^\[(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[^\]]*)\]\s*(\w+)?\s*(.*)/);
        if (match) {
          entries.push({ timestamp: match[1], level: match[2] || "info", message: match[3], source: "gateway" });
        } else {
          entries.push({ timestamp: "", level: "info", message: line.trim(), source: "gateway" });
        }
      }
    }
  } catch { /* ok */ }

  // 2. Read recent session activity as log entries
  try {
    const agentBase = agentsRuntimeDir();
    const agents = readdirSync(agentBase);
    for (const agentId of agents) {
      const sessDir = join(agentBase, agentId, "sessions");
      try {
        const sessions = readdirSync(sessDir)
          .filter(f => f.endsWith(".jsonl"))
          .map(f => ({ name: f, path: join(sessDir, f), mtime: statSync(join(sessDir, f)).mtimeMs }))
          .sort((a, b) => b.mtime - a.mtime)
          .slice(0, 2); // last 2 sessions per agent

        for (const sess of sessions) {
          try {
            const content = readFileSync(sess.path, "utf-8");
            const lines = content.trim().split("\n").slice(-10); // last 10 lines per session
            for (const line of lines) {
              try {
                const entry = JSON.parse(line);
                if (entry.type === "message" && entry.message) {
                  const role = entry.message.role || "unknown";
                  const contentArr = Array.isArray(entry.message.content) ? entry.message.content : [];
                  const text = contentArr.filter((c: any) => c.type === "text" && c.text).map((c: any) => c.text).join(" ");
                  if (text) {
                    entries.push({
                      timestamp: entry.timestamp || new Date(sess.mtime).toISOString(),
                      level: role === "assistant" ? "info" : "debug",
                      message: `[${agentId}] ${role}: ${text.slice(0, 200)}`,
                      source: agentId,
                    });
                  }
                }
              } catch { /* skip bad lines */ }
            }
          } catch { /* skip unreadable sessions */ }
        }
      } catch { /* no sessions dir */ }
    }
  } catch { /* ok */ }

  // Sort by timestamp desc, limit
  entries.sort((a, b) => {
    if (!a.timestamp) return 1;
    if (!b.timestamp) return -1;
    return b.timestamp.localeCompare(a.timestamp);
  });

  return entries.slice(0, limit);
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`logs:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = Math.min(500, Math.max(10, parseInt(limitParam || "100") || 100));
  const source = request.nextUrl.searchParams.get("source") || "";

  let entries = getLogEntries(limit);
  if (source) {
    entries = entries.filter(e => e.source === source);
  }

  return NextResponse.json({ entries });
}
