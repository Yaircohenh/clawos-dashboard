import { NextRequest, NextResponse } from "next/server";
import { execFileSync } from "child_process";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MEMORY_BASE = "/home/node/.openclaw/agents";

function getMemoryFiles(): {
  agent: string;
  file: string;
  size: number;
  modified: string;
  preview: string;
}[] {
  const results: {
    agent: string;
    file: string;
    size: number;
    modified: string;
    preview: string;
  }[] = [];

  try {
    const agents = readdirSync(MEMORY_BASE);
    for (const agentId of agents) {
      const memDir = join(MEMORY_BASE, agentId, "memory");
      try {
        const files = readdirSync(memDir).filter(
          (f) => f.endsWith(".md") || f.endsWith(".txt") || f.endsWith(".json")
        );
        for (const file of files) {
          try {
            const filePath = join(memDir, file);
            const stat = statSync(filePath);
            const content = readFileSync(filePath, "utf-8");
            results.push({
              agent: agentId,
              file,
              size: stat.size,
              modified: stat.mtime.toISOString(),
              preview: content.slice(0, 200),
            });
          } catch {
            // skip unreadable files
          }
        }
      } catch {
        // no memory dir for this agent
      }
    }
  } catch {
    // agents dir not found
  }

  return results;
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`memory:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() || "";
  const files = getMemoryFiles();

  if (query) {
    // Search using openclaw memory search if available, else filter locally
    try {
      const safeQuery = query.replace(/[^a-zA-Z0-9 _\-.,!?]/g, "").slice(0, 100);
      const raw = execFileSync(
        "openclaw",
        ["memory", "search", safeQuery, "--json"],
        {
          encoding: "utf-8",
          timeout: 10000,
          env: { ...process.env, NO_COLOR: "1" },
        }
      );
      const data = JSON.parse(raw);
      return NextResponse.json({ results: data.results || data.chunks || [], files });
    } catch {
      // Fallback: filter files by content
      const lowerQ = query.toLowerCase();
      const filtered = files.filter(
        (f) =>
          f.file.toLowerCase().includes(lowerQ) ||
          f.preview.toLowerCase().includes(lowerQ)
      );
      return NextResponse.json({ results: filtered, files });
    }
  }

  return NextResponse.json({ results: [], files });
}
