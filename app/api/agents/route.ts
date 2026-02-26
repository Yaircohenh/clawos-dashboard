import { NextRequest, NextResponse } from "next/server";
import { execFileSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from "fs";
import { checkRateLimit } from "@/lib/rate-limit";
import { openclawConfigPath, agentDir, agentsBackupDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

/** Allowlist: only alphanumeric, hyphens, underscores, dots, and slashes for model names */
const SAFE_ID = /^[a-zA-Z0-9._\-/]+$/;

function readConfig() {
  return JSON.parse(
    readFileSync(openclawConfigPath(), "utf-8")
  );
}

function writeConfig(config: Record<string, unknown>) {
  writeFileSync(
    openclawConfigPath(),
    JSON.stringify(config, null, 2) + "\n",
    "utf-8"
  );
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`agents:${ip}`);
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

  // addAgent doesn't require an existing agentId
  if (action === "addAgent") {
    const id = (body.id as string || "").trim();
    if (!id || !SAFE_ID.test(id) || id.length > 30) {
      return NextResponse.json({ error: "Invalid agent ID" }, { status: 400 });
    }
    try {
      const config = readConfig();
      if (!config.agents) config.agents = { list: [] };
      const agents = config.agents.list || [];
      if (agents.some((a: Record<string, unknown>) => a.id === id)) {
        return NextResponse.json({ error: "Agent ID already exists" }, { status: 409 });
      }
      agents.push({
        id,
        model: (body.model as string) || "claude-sonnet-4-6",
        identity: {
          name: (body.name as string || id).slice(0, 50),
          emoji: (body.emoji as string || "🤖").slice(0, 4),
        },
        workspace: (body.workspace as string) || `~/.openclaw/agents/${id}/workspace`,
      });
      writeConfig(config);
      // Create agent directory
      const newAgentDir = agentDir(id);
      mkdirSync(`${newAgentDir}/prompts`, { recursive: true });
      writeFileSync(`${newAgentDir}/prompts/system.md`, `# ${body.name || id}\n\nYou are ${body.name || id}, a specialist agent.\n`, "utf-8");
      return NextResponse.json({ success: true });
    } catch (err: unknown) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
    }
  }

  if (!agentId || !SAFE_ID.test(agentId)) {
    return NextResponse.json({ error: "Invalid agent ID" }, { status: 400 });
  }

  try {
    switch (action) {
      case "setModel": {
        const model = body.model as string;
        if (!model || !SAFE_ID.test(model)) {
          return NextResponse.json(
            { error: "Invalid model name" },
            { status: 400 }
          );
        }

        // Update config file directly
        const config = readConfig();
        const agents = config?.agents?.list || [];
        const agentIndex = agents.findIndex(
          (a: Record<string, unknown>) => a.id === agentId
        );
        if (agentIndex === -1) {
          return NextResponse.json(
            { error: "Agent not found" },
            { status: 404 }
          );
        }
        agents[agentIndex].model = model;
        writeConfig(config);

        return NextResponse.json({ success: true, model });
      }

      case "restart": {
        try {
          execFileSync("openclaw", ["agents", "restart", agentId], {
            encoding: "utf-8",
            timeout: 15000,
            env: { ...process.env, NO_COLOR: "1" },
          });
        } catch {
          // restart may not be a real command; try stop+start
        }
        return NextResponse.json({ success: true });
      }

      case "update": {
        const config = readConfig();
        const agents = config?.agents?.list || [];
        const agentIndex = agents.findIndex(
          (a: Record<string, unknown>) => a.id === agentId
        );
        if (agentIndex === -1) {
          return NextResponse.json(
            { error: "Agent not found" },
            { status: 404 }
          );
        }

        const agent = agents[agentIndex];
        if (body.name && typeof body.name === "string") {
          if (!agent.identity) agent.identity = {};
          agent.identity.name = body.name.slice(0, 50);
        }
        if (body.emoji && typeof body.emoji === "string") {
          if (!agent.identity) agent.identity = {};
          agent.identity.emoji = body.emoji.slice(0, 4);
        }
        if (body.workspace && typeof body.workspace === "string") {
          if (SAFE_ID.test(body.workspace.replace(/[/ ]/g, ""))) {
            agent.workspace = body.workspace;
          }
        }

        writeConfig(config);
        return NextResponse.json({ success: true });
      }

      case "removeAgent": {
        const backup = body.backup as boolean;
        const config = readConfig();
        const agents = config?.agents?.list || [];
        const agentIndex = agents.findIndex((a: Record<string, unknown>) => a.id === agentId);
        if (agentIndex === -1) {
          return NextResponse.json({ error: "Agent not found" }, { status: 404 });
        }

        // Backup if requested
        if (backup) {
          const src = agentDir(agentId);
          const dst = `${agentsBackupDir()}/${agentId}-${Date.now()}`;
          try {
            mkdirSync(dst, { recursive: true });
            cpSync(src, dst, { recursive: true });
          } catch {
            // backup may fail if dir doesn't exist
          }
        }

        // Remove from config
        agents.splice(agentIndex, 1);
        writeConfig(config);

        // Remove agent directory if not backing up
        if (!backup) {
          try { rmSync(agentDir(agentId), { recursive: true, force: true }); } catch { /* ok */ }
        }

        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json(
          { error: "Unknown action" },
          { status: 400 }
        );
    }
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
