import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import { checkRateLimit } from "@/lib/rate-limit";
import { infraWorkspaceDir, infraAgentsDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

const SAFE_ID = /^[a-zA-Z0-9_\-]+$/;
const SAFE_FILENAME = /^[a-zA-Z0-9_\-.]+\.md$/;
const WORKSPACE_BASE = infraWorkspaceDir();
const AGENT_CONFIG_BASE = infraAgentsDir();

function getAgentMdFiles(agentId: string): { name: string; path: string; content: string }[] {
  const files: { name: string; path: string; content: string }[] = [];

  // Check workspace root .md files (shared orchestrator files)
  if (agentId === "main" || agentId === "orchestrator") {
    try {
      const wsFiles = readdirSync(WORKSPACE_BASE).filter((f) => f.endsWith(".md"));
      for (const f of wsFiles) {
        try {
          const filePath = join(WORKSPACE_BASE, f);
          files.push({
            name: f,
            path: filePath,
            content: readFileSync(filePath, "utf-8"),
          });
        } catch {
          // skip
        }
      }
    } catch {
      // workspace dir not found
    }
  }

  // Check agent's prompts directory
  const promptsDir = join(AGENT_CONFIG_BASE, agentId, "prompts");
  try {
    const promptFiles = readdirSync(promptsDir).filter((f) => f.endsWith(".md"));
    for (const f of promptFiles) {
      try {
        const filePath = join(promptsDir, f);
        files.push({
          name: `prompts/${f}`,
          path: filePath,
          content: readFileSync(filePath, "utf-8"),
        });
      } catch {
        // skip
      }
    }
  } catch {
    // no prompts dir
  }

  return files;
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`agent-files:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const agentId = request.nextUrl.searchParams.get("agentId") || "";
  if (!agentId || !SAFE_ID.test(agentId)) {
    return NextResponse.json({ error: "Invalid agent ID" }, { status: 400 });
  }

  const files = getAgentMdFiles(agentId);
  // Don't send full content in list view - just names
  return NextResponse.json({
    files: files.map((f) => ({ name: f.name, size: f.content.length })),
  });
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`agent-files:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action as string;
  const agentId = body.agentId as string;

  if (!agentId || !SAFE_ID.test(agentId)) {
    return NextResponse.json({ error: "Invalid agent ID" }, { status: 400 });
  }

  switch (action) {
    case "read": {
      const fileName = body.fileName as string;
      if (!fileName) {
        return NextResponse.json({ error: "File name required" }, { status: 400 });
      }
      // Validate each segment of the path
      const parts = fileName.split("/");
      if (parts.length > 2 || !parts.every((p) => SAFE_FILENAME.test(p) || p === "prompts")) {
        return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
      }

      const files = getAgentMdFiles(agentId);
      const file = files.find((f) => f.name === fileName);
      if (!file) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }

      return NextResponse.json({ name: file.name, content: file.content });
    }

    case "write": {
      const fileName = body.fileName as string;
      const content = body.content as string;

      if (!fileName) {
        return NextResponse.json({ error: "File name required" }, { status: 400 });
      }
      const parts = fileName.split("/");
      if (parts.length > 2 || !parts.every((p) => SAFE_FILENAME.test(p) || p === "prompts")) {
        return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
      }
      if (typeof content !== "string" || content.length > 50000) {
        return NextResponse.json({ error: "Content required (max 50KB)" }, { status: 400 });
      }

      const files = getAgentMdFiles(agentId);
      const file = files.find((f) => f.name === fileName);
      if (!file) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }

      writeFileSync(file.path, content, "utf-8");
      return NextResponse.json({ success: true });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
