import { NextResponse } from "next/server";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

interface AgentActivity {
  agentId: string;
  name: string;
  emoji: string;
  model: string;
  status: "active" | "idle" | "offline";
  lines: { type: string; text: string; timestamp?: string }[];
}

const AGENT_BASE = "/home/node/.openclaw/agents";

function getAgentInfo(): {
  id: string;
  name: string;
  emoji: string;
  model: string;
}[] {
  try {
    const config = JSON.parse(
      readFileSync("/home/node/.openclaw/openclaw.json", "utf-8")
    );
    return (config?.agents?.list || []).map((a: Record<string, unknown>) => ({
      id: a.id as string,
      name:
        ((a.identity as Record<string, unknown>)?.name as string) ||
        (a.name as string) ||
        (a.id as string),
      emoji:
        ((a.identity as Record<string, unknown>)?.emoji as string) ||
        (a.id === "main" ? "🚀" : "🤖"),
      model: (a.model as string) || "default",
    }));
  } catch {
    return [];
  }
}

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

function parseSessionLines(
  filePath: string
): { type: string; text: string; timestamp?: string }[] {
  try {
    const content = readFileSync(filePath, "utf-8");
    const rawLines = content.trim().split("\n").slice(-100);
    const result: { type: string; text: string; timestamp?: string }[] = [];

    for (const line of rawLines) {
      try {
        const entry = JSON.parse(line);

        // OpenClaw session format: { type: "message", message: { role, content: [...] } }
        if (entry.type === "message" && entry.message) {
          const msg = entry.message;
          const role = msg.role;

          // Extract text from content array
          const contentArr = Array.isArray(msg.content) ? msg.content : [];
          const textParts = contentArr
            .filter((c: Record<string, unknown>) => c.type === "text" && c.text)
            .map((c: Record<string, unknown>) => c.text as string);
          const text = textParts.join("\n").trim();

          // Check for tool_use blocks in content
          const toolUses = contentArr.filter(
            (c: Record<string, unknown>) => c.type === "tool_use"
          );

          if (role === "assistant") {
            // Add tool calls first
            for (const t of toolUses) {
              const inputStr = t.input
                ? JSON.stringify(t.input).slice(0, 200)
                : "";
              result.push({
                type: "tool",
                text: `[${t.name || "tool"}] ${inputStr}`,
                timestamp: entry.timestamp,
              });
            }
            // Then add text response
            if (text) {
              result.push({
                type: "response",
                text: text.slice(0, 500),
                timestamp: entry.timestamp,
              });
            }
          } else if (role === "user") {
            if (text) {
              result.push({
                type: "user",
                text: text.slice(0, 300),
                timestamp: entry.timestamp,
              });
            }
          }
        } else if (
          entry.type === "error" ||
          entry.level === "error" ||
          entry.error
        ) {
          result.push({
            type: "error",
            text:
              entry.message || entry.error || JSON.stringify(entry).slice(0, 300),
            timestamp: entry.timestamp,
          });
        }
        // Skip "custom" entries (cache-ttl etc.)
      } catch {
        // skip non-JSON lines
      }
    }

    return result.slice(-50);
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`monitor:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const agents = getAgentInfo();
  const activities: AgentActivity[] = [];

  for (const agent of agents) {
    const sessionFile = getLatestSessionFile(agent.id);
    const lines = sessionFile ? parseSessionLines(sessionFile) : [];

    // Determine status based on recent activity
    let agentStatus: "active" | "idle" | "offline" = "offline";
    if (sessionFile) {
      try {
        const stat = statSync(sessionFile);
        const minutesAgo = (Date.now() - stat.mtimeMs) / 60000;
        agentStatus = minutesAgo < 5 ? "active" : "idle";
      } catch {
        agentStatus = "offline";
      }
    }

    activities.push({
      agentId: agent.id,
      name: agent.name,
      emoji: agent.emoji,
      model: agent.model,
      status: agentStatus,
      lines,
    });
  }

  return NextResponse.json({ agents: activities });
}
