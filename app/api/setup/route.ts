import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync, openSync, closeSync } from "fs";
import { join } from "path";
import { execFileSync, spawn, type SpawnOptions } from "child_process";
import { checkRateLimit } from "@/lib/rate-limit";
import { openclawConfigPath, openclawHome, infraDir, envFilePath } from "@/lib/paths";
import { getModelRegistry } from "@/lib/model-registry";
import { createSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const SAFE_TEXT = /^[\w\s\-'.,()/]+$/;

function setupMarkerPath(): string {
  return join(openclawHome(), "setup-complete");
}

function readConfig(): Record<string, any> {
  try {
    return JSON.parse(readFileSync(openclawConfigPath(), "utf-8"));
  } catch {
    return {};
  }
}

function writeConfig(config: Record<string, unknown>) {
  const dir = openclawConfigPath().replace(/\/[^/]+$/, "");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(openclawConfigPath(), JSON.stringify(config, null, 2) + "\n");
}

function runFile(bin: string, args: string[]): string {
  try {
    const stdout = execFileSync(bin, args, {
      encoding: "utf-8",
      timeout: 15000,
      env: { ...process.env, NO_COLOR: "1" },
    });
    return (stdout as string).trim();
  } catch (err: any) {
    if (err?.stdout) return (err.stdout as string).trim();
    return "";
  }
}

// Agent ID → tier mapping
const AGENT_TIERS: Record<string, "flagship" | "standard" | "light"> = {
  main: "flagship",
  ninja: "standard",
  ops: "standard",
  cto: "standard",
  legal: "standard",
  accounting: "light",
  finance: "light",
  marketing: "light",
};

function setAgentModels(providerId: string) {
  const registry = getModelRegistry();
  const provider = registry.providers.find((p) => p.id === providerId);
  if (!provider?.agentTiers) return;

  const config = readConfig();
  if (!config.agents?.list) return;

  for (const agent of config.agents.list) {
    const tier = AGENT_TIERS[agent.id];
    if (!tier) continue;
    const modelId = provider.agentTiers[tier];
    if (modelId) {
      agent.model = `${provider.prefix}/${modelId}`;
    }
  }
  writeConfig(config);
}

function restartGateway() {
  // Load API keys from .env into spawn environment
  const envPath = envFilePath();
  const env = { ...process.env };
  try {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq > 0) {
        env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
      }
    }
  } catch { /* .env may not exist yet */ }

  // Stop existing gateway
  try { execFileSync("openclaw", ["gateway", "stop"], { timeout: 5000, stdio: "ignore" }); } catch { /* ok */ }
  try { execFileSync("pkill", ["-f", "openclaw gateway"], { timeout: 5000, stdio: "ignore" }); } catch { /* ok */ }
  try { execFileSync("sleep", ["1"], { timeout: 3000 }); } catch { /* ok */ }

  // Start gateway with updated keys
  const installDir = envPath.replace(/\/\.env$/, "");
  const logPath = join(installDir, "gateway.log");
  const logFd = openSync(logPath, "a");

  const opts: SpawnOptions = {
    env,
    detached: true,
    stdio: ["ignore", logFd, logFd],
  };
  const gw = spawn("openclaw", [
    "gateway", "run",
    "--port", "18789",
    "--bind", "lan",
    "--auth", "token",
    "--allow-unconfigured",
  ], opts);
  gw.unref();
  closeSync(logFd);

  // Update PID file so stop.sh can find the new gateway
  if (gw.pid) {
    const pidFile = join(installDir, ".clawos.pids");
    try {
      const lines = readFileSync(pidFile, "utf-8").trim().split("\n");
      lines[0] = String(gw.pid);
      writeFileSync(pidFile, lines.join("\n") + "\n");
    } catch {
      writeFileSync(pidFile, String(gw.pid) + "\n");
    }
  }
}

// ── GET: setup status ──────────────────────────────────────────────────

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`setup:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const setupComplete = existsSync(setupMarkerPath());

  // Provider status from registry
  const registry = getModelRegistry();
  const providers = registry.providers.map((p) => ({
    id: p.id,
    name: p.name,
    envKey: p.envKey,
    consoleUrl: p.consoleUrl,
    color: p.color,
    keyConfigured: !!process.env[p.envKey],
  }));

  // Agents from config
  const config = readConfig();
  const agents = (config?.agents?.list || []).map((a: any) => ({
    id: a.id,
    name: a.identity?.name || a.id,
    emoji: a.identity?.emoji || "🤖",
    model: a.model || "claude-sonnet-4-6",
    enabled: a.enabled !== false,
  }));

  return NextResponse.json({ setupComplete, providers, agents });
}

// ── POST: setup actions ────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`setup:${ip}`);
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

  switch (action) {
    // ── Save user profile ────────────────────────────────────────────
    case "saveUser": {
      const name = (body.name as string || "").trim();
      const timezone = (body.timezone as string || "").trim();
      const language = (body.language as string || "English").trim();

      if (!name || name.length > 100) {
        return NextResponse.json({ error: "Name required (max 100 chars)" }, { status: 400 });
      }
      if (timezone && timezone.length > 50) {
        return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
      }

      try {
        // Write USER.md to infra workspace
        const wsDir = join(infraDir(), "workspace");
        if (!existsSync(wsDir)) mkdirSync(wsDir, { recursive: true });
        const userMd = `# User Profile\n\n- **Name:** ${name}\n- **Timezone:** ${timezone || "auto"}\n- **Language:** ${language}\n`;
        writeFileSync(join(wsDir, "USER.md"), userMd, "utf-8");

        // Write user.json to openclaw home
        const homeDir = openclawHome();
        if (!existsSync(homeDir)) mkdirSync(homeDir, { recursive: true });
        writeFileSync(
          join(homeDir, "user.json"),
          JSON.stringify({ name, timezone, language, createdAt: new Date().toISOString() }, null, 2) + "\n",
        );

        return NextResponse.json({ success: true });
      } catch (err: unknown) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
      }
    }

    // ── Save provider API key ────────────────────────────────────────
    case "saveProviderKey": {
      const envKey = (body.envKey as string || "").trim();
      const value = (body.value as string || "").trim();

      const registry = getModelRegistry();
      const validKeys = registry.providers.map((p) => p.envKey);
      if (!validKeys.includes(envKey)) {
        return NextResponse.json({ error: "Unknown provider key" }, { status: 400 });
      }
      if (!value || value.length > 500) {
        return NextResponse.json({ error: "API key required (max 500 chars)" }, { status: 400 });
      }

      try {
        const envPath = envFilePath();
        const dir = envPath.replace(/\/[^/]+$/, "");
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

        let envContent = "";
        try { envContent = readFileSync(envPath, "utf-8"); } catch { /* may not exist */ }
        const lines = envContent.split("\n").filter((l) => !l.startsWith(`${envKey}=`));
        lines.push(`${envKey}=${value}`);
        writeFileSync(envPath, lines.filter((l) => l.trim()).join("\n") + "\n");
        process.env[envKey] = value;

        // Set all agent models to this provider's tier-appropriate models
        const provider = registry.providers.find((p) => p.envKey === envKey);
        if (provider) {
          setAgentModels(provider.id);
        }

        return NextResponse.json({ success: true });
      } catch (err: unknown) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
      }
    }

    // ── Test a provider key (before saving) ──────────────────────────
    case "testProviderKey": {
      const providerId = (body.providerId as string || "").trim();
      const apiKey = (body.apiKey as string || "").trim();

      if (!providerId || !apiKey) {
        return NextResponse.json({ error: "Provider ID and API key required" }, { status: 400 });
      }

      try {
        if (providerId === "anthropic") {
          const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 1,
              messages: [{ role: "user", content: "test" }],
            }),
          });
          return NextResponse.json({ valid: res.ok, status: res.status });
        }

        if (providerId === "openai") {
          const res = await fetch("https://api.openai.com/v1/models", {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          return NextResponse.json({ valid: res.ok, status: res.status });
        }

        if (providerId === "xai") {
          const res = await fetch("https://api.x.ai/v1/models", {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          return NextResponse.json({ valid: res.ok, status: res.status });
        }

        if (providerId === "google") {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
          );
          return NextResponse.json({ valid: res.ok, status: res.status });
        }

        return NextResponse.json({ valid: true, status: 200 });
      } catch (err: unknown) {
        return NextResponse.json({
          valid: false,
          error: err instanceof Error ? err.message : "Connection failed",
        });
      }
    }

    // ── Enable/disable agents ────────────────────────────────────────
    // Note: OpenClaw doesn't support an "enabled" key on agents.
    // Disabled agents are removed from the list; re-enabling would need
    // to re-add them from the infra config. For now, we accept the list
    // but only remove agents the user unchecked (main is always kept).
    case "enableAgents": {
      const agentIds = body.agentIds as string[];
      if (!Array.isArray(agentIds)) {
        return NextResponse.json({ error: "agentIds must be an array" }, { status: 400 });
      }

      try {
        const config = readConfig();
        if (!config.agents?.list) {
          return NextResponse.json({ error: "No agents configured" }, { status: 400 });
        }

        // Keep main + any agent the user checked
        config.agents.list = config.agents.list.filter(
          (a: any) => a.id === "main" || a.default || agentIds.includes(a.id)
        );
        // Clean up any stale "enabled" keys from previous versions
        for (const agent of config.agents.list) {
          delete agent.enabled;
        }
        writeConfig(config);

        return NextResponse.json({ success: true });
      } catch (err: unknown) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
      }
    }

    // ── Configure a channel ──────────────────────────────────────────
    case "configureChannel": {
      const channelType = body.channelType as string;
      const channelConfig = body.config as Record<string, string>;

      const validChannels = ["telegram", "whatsapp", "gmail"];
      if (!channelType || !validChannels.includes(channelType)) {
        return NextResponse.json({ error: "Invalid channel type" }, { status: 400 });
      }
      if (!channelConfig || typeof channelConfig !== "object") {
        return NextResponse.json({ error: "Config required" }, { status: 400 });
      }

      try {
        const config = readConfig();
        if (!config.channels) config.channels = {};
        const channels = config.channels as Record<string, unknown>;
        channels[channelType] = {
          enabled: true,
          ...channelConfig,
        };
        writeConfig(config);

        // Auto-enable the corresponding gateway plugin
        const pluginMap: Record<string, string> = {
          telegram: "telegram",
          whatsapp: "whatsapp",
          gmail: "imap",
        };
        const pluginName = pluginMap[channelType];
        if (pluginName) {
          runFile("openclaw", ["plugins", "enable", pluginName]);
        }

        // Lock down DM policy
        runFile("openclaw", ["config", "set", `channels.${channelType}.dmPolicy`, "allowlist"]);

        return NextResponse.json({ success: true });
      } catch (err: unknown) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
      }
    }

    // ── Complete setup ───────────────────────────────────────────────
    case "completeSetup": {
      try {
        // Write marker file
        const homeDir = openclawHome();
        if (!existsSync(homeDir)) mkdirSync(homeDir, { recursive: true });
        writeFileSync(
          setupMarkerPath(),
          JSON.stringify({ completedAt: new Date().toISOString() }) + "\n",
        );

        // Strip any keys OpenClaw doesn't recognize before restarting
        try {
          const config = readConfig();
          if (config.agents?.list) {
            for (const agent of config.agents.list) {
              delete agent.enabled;
            }
            writeConfig(config);
          }
        } catch { /* ok */ }

        // Restart gateway so it picks up newly saved API keys
        restartGateway();

        // Create session (auto-login)
        await createSession();

        return NextResponse.json({ success: true, redirect: "/" });
      } catch (err: unknown) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
      }
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
