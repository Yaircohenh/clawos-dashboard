import { NextRequest, NextResponse } from "next/server";
import { execFileSync } from "child_process";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join } from "path";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// OpenClaw stores workspace files here:
// Main agent: ~/.openclaw/workspace/  (MEMORY.md, IDENTITY.md, etc.)
// Sub-agents: ~/.openclaw/workspace/workspace/<agentId>/  (.md files)
// Memory subdirs: ~/.openclaw/workspace/workspace/<agentId>/memory/
// Legacy: ~/.openclaw/agents/<agentId>/memory/
const WORKSPACE_BASE = "/home/node/.openclaw/workspace";
const AGENTS_BASE = "/home/node/.openclaw/agents";

function scanDir(dir: string, agentId: string, results: MemoryFile[]) {
  try {
    const files = readdirSync(dir).filter(
      (f) => f.endsWith(".md") || f.endsWith(".txt") || f.endsWith(".json")
    );
    for (const file of files) {
      try {
        const filePath = join(dir, file);
        const stat = statSync(filePath);
        if (!stat.isFile()) continue;
        const content = readFileSync(filePath, "utf-8");
        results.push({
          agent: agentId,
          file,
          size: stat.size,
          modified: stat.mtime.toISOString(),
          preview: content.slice(0, 500),
          fullContent: content,
        });
      } catch {
        // skip unreadable
      }
    }
  } catch {
    // dir doesn't exist
  }
}

interface MemoryFile {
  agent: string;
  file: string;
  size: number;
  modified: string;
  preview: string;
  fullContent: string;
}

function getMemoryFiles(): MemoryFile[] {
  const results: MemoryFile[] = [];

  // 1. Main agent top-level workspace .md files
  scanDir(WORKSPACE_BASE, "main", results);
  // Main agent memory subdir
  scanDir(join(WORKSPACE_BASE, "memory"), "main", results);

  // 2. Sub-agent workspace dirs
  const workspaceDir = join(WORKSPACE_BASE, "workspace");
  try {
    const agentDirs = readdirSync(workspaceDir);
    for (const agentId of agentDirs) {
      const agentPath = join(workspaceDir, agentId);
      try {
        if (!statSync(agentPath).isDirectory()) continue;
      } catch { continue; }

      // Agent workspace root .md files
      scanDir(agentPath, agentId, results);
      // Agent memory subdir
      scanDir(join(agentPath, "memory"), agentId, results);
    }
  } catch {
    // workspace dir doesn't exist
  }

  // 3. Legacy: agents dir
  try {
    const agents = readdirSync(AGENTS_BASE);
    for (const agentId of agents) {
      scanDir(join(AGENTS_BASE, agentId, "memory"), agentId, results);
    }
  } catch {
    // agents dir doesn't exist
  }

  // Deduplicate by agent+file
  const seen = new Set<string>();
  return results.filter((f) => {
    const key = `${f.agent}/${f.file}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`memory:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() || "";
  const allFiles = getMemoryFiles();

  // Strip fullContent from the response files (only used for search)
  const files = allFiles.map(({ fullContent, ...rest }) => rest);

  if (query) {
    // Try openclaw memory search first (FTS)
    try {
      const safeQuery = query.replace(/[^a-zA-Z0-9 _\-.,!?]/g, "").slice(0, 100);
      if (safeQuery) {
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
        const cliResults = data.results || data.chunks || [];
        if (cliResults.length > 0) {
          return NextResponse.json({ results: cliResults, files });
        }
      }
    } catch {
      // CLI search failed, fall through to local search
    }

    // Fallback: search full file content (not just 200-char preview)
    const lowerQ = query.toLowerCase();
    const filtered = allFiles
      .filter(
        (f) =>
          f.file.toLowerCase().includes(lowerQ) ||
          f.fullContent.toLowerCase().includes(lowerQ)
      )
      .map((f) => {
        // Extract a relevant snippet around the match
        const idx = f.fullContent.toLowerCase().indexOf(lowerQ);
        const start = Math.max(0, idx - 80);
        const end = Math.min(f.fullContent.length, idx + query.length + 200);
        const snippet = (start > 0 ? "..." : "") + f.fullContent.slice(start, end) + (end < f.fullContent.length ? "..." : "");
        return {
          agent: f.agent,
          file: f.file,
          text: snippet,
          preview: snippet,
        };
      });
    return NextResponse.json({ results: filtered, files });
  }

  return NextResponse.json({ results: [], files });
}
