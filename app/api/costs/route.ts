import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { checkRateLimit } from "@/lib/rate-limit";
import { getCostSummary, getSessions, getAgents } from "@/lib/data";

export const dynamic = "force-dynamic";

const LIMITS_PATH = "/home/node/.openclaw/cost-limits.json";

function readLimits(): Record<string, number> {
  try {
    if (existsSync(LIMITS_PATH)) {
      return JSON.parse(readFileSync(LIMITS_PATH, "utf-8"));
    }
  } catch { /* ok */ }
  return {};
}

function writeLimits(limits: Record<string, number>) {
  writeFileSync(LIMITS_PATH, JSON.stringify(limits, null, 2) + "\n");
}

interface AgentTokenBreakdown {
  agentId: string;
  name: string;
  emoji: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`costs:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const cost = getCostSummary();
  const limits = readLimits();

  // Aggregate tokens by agent
  const sessions = getSessions();
  const agents = getAgents();
  const agentMap = new Map(agents.map((a) => [a.id, { name: a.name, emoji: a.emoji }]));

  const tokensByAgent = new Map<string, { inputTokens: number; outputTokens: number; totalTokens: number }>();
  for (const session of sessions) {
    const existing = tokensByAgent.get(session.agentId) || { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    existing.inputTokens += session.inputTokens;
    existing.outputTokens += session.outputTokens;
    existing.totalTokens += session.totalTokens;
    tokensByAgent.set(session.agentId, existing);
  }

  const agentBreakdown: AgentTokenBreakdown[] = Array.from(tokensByAgent.entries()).map(([agentId, tokens]) => {
    const info = agentMap.get(agentId) || { name: agentId, emoji: "🤖" };
    return { agentId, name: info.name, emoji: info.emoji, ...tokens };
  }).sort((a, b) => b.totalTokens - a.totalTokens);

  return NextResponse.json({ ...cost, limits, agentBreakdown });
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`costs:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "setLimit") {
    const daily = body.daily as number;
    if (typeof daily !== "number" || daily < 0 || daily > 10000) {
      return NextResponse.json({ error: "Invalid limit (0-10000)" }, { status: 400 });
    }

    const limits = readLimits();
    limits.daily = daily;
    writeLimits(limits);

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
