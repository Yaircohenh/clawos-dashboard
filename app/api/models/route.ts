import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const CONFIG_PATH = "/home/node/.openclaw/openclaw.json";
const MODELS_PATH = "/home/node/.openclaw/dashboard-models.json";

function readConfig(): Record<string, any> {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function readModelsConfig(): { available: string[]; fallback: string } {
  try {
    if (existsSync(MODELS_PATH)) {
      return JSON.parse(readFileSync(MODELS_PATH, "utf-8"));
    }
  } catch { /* ok */ }
  return { available: [], fallback: "" };
}

function writeModelsConfig(models: { available: string[]; fallback: string }) {
  const dir = MODELS_PATH.replace(/\/[^/]+$/, "");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(MODELS_PATH, JSON.stringify(models, null, 2) + "\n");
}

interface ModelInfo {
  id: string;
  provider: string;
  usedBy: string[];
  isFallback: boolean;
}

function detectProvider(modelId: string): string {
  if (/claude|anthropic/i.test(modelId)) return "Anthropic";
  if (/gpt|o1|o3|openai/i.test(modelId)) return "OpenAI";
  if (/grok|xai/i.test(modelId)) return "xAI";
  if (/gemini|google/i.test(modelId)) return "Google";
  return "Other";
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`models:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const config = readConfig();
  const agents = config?.agents?.list || [];
  const modelsConfig = readModelsConfig();
  const available = modelsConfig.available;
  const fallback = modelsConfig.fallback;

  // Collect all models in use by agents
  const modelsInUse = new Map<string, string[]>();
  for (const agent of agents) {
    const model = agent.model || "default";
    if (model === "default") continue;
    if (!modelsInUse.has(model)) modelsInUse.set(model, []);
    modelsInUse.get(model)!.push(agent.identity?.name || agent.name || agent.id);
  }

  // Merge available list with in-use models
  const allModelIds = new Set([...available, ...modelsInUse.keys()]);
  const models: ModelInfo[] = Array.from(allModelIds).map((id) => ({
    id,
    provider: detectProvider(id),
    usedBy: modelsInUse.get(id) || [],
    isFallback: id === fallback,
  }));

  return NextResponse.json({ models, available, fallback });
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`models:${ip}`);
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
  const modelsConfig = readModelsConfig();

  switch (action) {
    case "addModel": {
      const modelId = (body.modelId as string || "").trim();
      if (!modelId || modelId.length > 100) {
        return NextResponse.json({ error: "Invalid model ID" }, { status: 400 });
      }
      if (modelsConfig.available.includes(modelId)) {
        return NextResponse.json({ error: "Model already exists" }, { status: 400 });
      }
      modelsConfig.available.push(modelId);
      writeModelsConfig(modelsConfig);
      return NextResponse.json({ success: true });
    }

    case "removeModel": {
      const modelId = (body.modelId as string || "").trim();
      if (!modelId) {
        return NextResponse.json({ error: "Model ID required" }, { status: 400 });
      }
      // Check if in use
      const config = readConfig();
      const agents = config?.agents?.list || [];
      const usedBy = agents.filter((a: any) => a.model === modelId).map((a: any) => a.identity?.name || a.name || a.id);
      if (usedBy.length > 0) {
        return NextResponse.json({ error: `Model in use by: ${usedBy.join(", ")}`, usedBy }, { status: 400 });
      }
      modelsConfig.available = modelsConfig.available.filter((m: string) => m !== modelId);
      if (modelsConfig.fallback === modelId) modelsConfig.fallback = "";
      writeModelsConfig(modelsConfig);
      return NextResponse.json({ success: true });
    }

    case "setFallback": {
      const modelId = (body.modelId as string || "").trim();
      modelsConfig.fallback = modelId;
      writeModelsConfig(modelsConfig);
      return NextResponse.json({ success: true });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
