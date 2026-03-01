import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { checkRateLimit } from "@/lib/rate-limit";
import { openclawConfigPath, dashboardModelsPath, envFilePath } from "@/lib/paths";
import { detectProviderFromRegistry, getModelRegistry } from "@/lib/model-registry";
import { registerAuthProfile, removeAuthProfile, isProviderKeyAvailable } from "@/lib/auth-profiles";
import { restartGateway } from "@/lib/gateway";

export const dynamic = "force-dynamic";

function getConfigPath() { return openclawConfigPath(); }
function getModelsPath() { return dashboardModelsPath(); }

function readConfig(): Record<string, any> {
  try {
    return JSON.parse(readFileSync(getConfigPath(), "utf-8"));
  } catch {
    return {};
  }
}

function readModelsConfig(): { available: string[]; fallback: string } {
  try {
    if (existsSync(getModelsPath())) {
      return JSON.parse(readFileSync(getModelsPath(), "utf-8"));
    }
  } catch { /* ok */ }
  return { available: [], fallback: "" };
}

function writeModelsConfig(models: { available: string[]; fallback: string }) {
  const dir = getModelsPath().replace(/\/[^/]+$/, "");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(getModelsPath(), JSON.stringify(models, null, 2) + "\n");
}

interface ModelInfo {
  id: string;
  provider: string;
  usedBy: string[];
  isFallback: boolean;
}

function detectProvider(modelId: string): string {
  return detectProviderFromRegistry(modelId);
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

    case "addProviderKey": {
      const envKey = (body.envKey as string || "").trim();
      const value = (body.value as string || "").trim();

      // Validate envKey is a known registry key
      const registry = getModelRegistry();
      const validKeys = registry.providers.map((p) => p.envKey);
      if (!validKeys.includes(envKey)) {
        return NextResponse.json({ error: "Unknown provider key" }, { status: 400 });
      }
      if (!value || value.length > 500) {
        return NextResponse.json({ error: "API key required (max 500 chars)" }, { status: 400 });
      }

      // Check if this is a NEW provider (not previously configured)
      const wasConfigured = isProviderKeyAvailable(envKey);

      // Write to .env file
      const envPath = envFilePath();
      try {
        let envContent = "";
        try { envContent = readFileSync(envPath, "utf-8"); } catch { /* file may not exist */ }
        const lines = envContent.split("\n").filter((l) => !l.startsWith(`${envKey}=`));
        lines.push(`${envKey}=${value}`);
        writeFileSync(envPath, lines.filter((l) => l.trim()).join("\n") + "\n");
        process.env[envKey] = value;

        // Register key with gateway's auth-profiles so internal agent runner finds it
        registerAuthProfile(envKey, value);

        // Restart gateway only if this is a NEW provider (gateway needs to rebuild provider map)
        let restarted = false;
        if (!wasConfigured) {
          try {
            restartGateway();
            restarted = true;
          } catch { /* gateway restart is best-effort */ }
        }

        return NextResponse.json({ success: true, restarted });
      } catch (err: unknown) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save key" }, { status: 500 });
      }
    }

    case "removeProviderKey": {
      const envKey = (body.envKey as string || "").trim();

      const registry = getModelRegistry();
      const validKeys = registry.providers.map((p) => p.envKey);
      if (!validKeys.includes(envKey)) {
        return NextResponse.json({ error: "Unknown provider key" }, { status: 400 });
      }

      // Remove from .env file
      const envPath = envFilePath();
      try {
        let envContent = "";
        try { envContent = readFileSync(envPath, "utf-8"); } catch { /* ok */ }
        const lines = envContent.split("\n").filter((l) => !l.startsWith(`${envKey}=`));
        writeFileSync(envPath, lines.filter((l) => l.trim()).join("\n") + "\n");
        delete process.env[envKey];

        // Remove from gateway's auth-profiles
        removeAuthProfile(envKey);

        return NextResponse.json({ success: true });
      } catch (err: unknown) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to remove key" }, { status: 500 });
      }
    }

    case "refreshPricing": {
      const registry = getModelRegistry();
      const pricing: Record<string, { input: number; output: number }> = {};
      for (const p of registry.providers) {
        if ((p as any).isGateway) continue;
        for (const m of p.models) {
          if ((m as any).pricing) {
            pricing[`${p.prefix}/${m.id}`] = (m as any).pricing;
          }
        }
      }
      return NextResponse.json({ pricing, source: "registry", updatedAt: new Date().toISOString() });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
