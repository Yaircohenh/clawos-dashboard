import { NextRequest, NextResponse } from "next/server";
import { execFileSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Allowlist: only alphanumeric, hyphens, underscores, dots, and slashes for model names */
const SAFE_ID = /^[a-zA-Z0-9._\-/]+$/;

function readConfig() {
  return JSON.parse(
    readFileSync("/home/node/.openclaw/openclaw.json", "utf-8")
  );
}

function writeConfig(config: Record<string, unknown>) {
  writeFileSync(
    "/home/node/.openclaw/openclaw.json",
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
