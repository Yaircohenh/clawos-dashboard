import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
import { maskSecret } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { agentsRuntimeDir, openclawConfigPath, envFilePath } from "@/lib/paths";
import { getModelRegistry } from "@/lib/model-registry";

export const dynamic = "force-dynamic";

function getAgentBase() { return agentsRuntimeDir(); }
function getConfigPath() { return openclawConfigPath(); }

interface KeyInfo {
  id: string;
  section: string;
  provider: string;
  keyType: string;
  maskedValue: string;
  status: "valid" | "unknown" | "error";
  lastUsed?: string;
}

function readJsonSafe(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function getAuthProfiles(): KeyInfo[] {
  const keys: KeyInfo[] = [];
  try {
    const agentDirs = readdirSync(getAgentBase());
    for (const agentId of agentDirs) {
      const profilePath = join(
        getAgentBase(),
        agentId,
        "agent",
        "auth-profiles.json"
      );
      const data = readJsonSafe(profilePath);
      if (!data) continue;

      const profiles = (data.profiles || data) as Record<string, unknown>[];
      if (Array.isArray(profiles)) {
        for (const p of profiles) {
          const profile = p as Record<string, unknown>;
          const key = (profile.apiKey || profile.key || "") as string;
          keys.push({
            id: `${agentId}:${profile.provider || "unknown"}`,
            section: "auth-profiles",
            provider: (profile.provider as string) || "unknown",
            keyType: (profile.type as string) || "api-key",
            maskedValue: maskSecret(key),
            status: profile.error ? "error" : "unknown",
            lastUsed: profile.lastUsed as string | undefined,
          });
        }
      }
    }
  } catch {
    // agents dir may not exist
  }
  return keys;
}

function getGatewayInfo(): KeyInfo[] {
  const config = readJsonSafe(getConfigPath());
  if (!config) return [];

  const keys: KeyInfo[] = [];
  const gateway = config.gateway as Record<string, unknown> | undefined;

  if (gateway) {
    const port = gateway.port || 18789;
    keys.push({
      id: "gateway:url",
      section: "gateway",
      provider: "Gateway",
      keyType: "url",
      maskedValue: `ws://localhost:${port}`,
      status: "unknown",
    });

    const token = (gateway.authToken || gateway.token || "") as string;
    if (token) {
      keys.push({
        id: "gateway:token",
        section: "gateway",
        provider: "Gateway",
        keyType: "auth-token",
        maskedValue: maskSecret(token),
        status: "unknown",
      });
    }
  }

  return keys;
}

function getModelProviders(): KeyInfo[] {
  const keys: KeyInfo[] = [];
  const registry = getModelRegistry();

  for (const p of registry.providers) {
    const key = process.env[p.envKey];
    if (key) {
      keys.push({
        id: `provider:${p.id}`,
        section: "providers",
        provider: p.name,
        keyType: "api-key",
        maskedValue: maskSecret(key),
        status: "unknown",
      });
    }
  }

  return keys;
}

function getIntegrations(): KeyInfo[] {
  const keys: KeyInfo[] = [];

  // Check GitHub auth
  try {
    const ghOutput = execFileSync("gh", ["auth", "status"], {
      encoding: "utf-8",
      timeout: 5000,
      env: { ...process.env, NO_COLOR: "1" },
    });
    const accountMatch = ghOutput.match(/Logged in to .* as (\S+)/);
    keys.push({
      id: "integration:github",
      section: "integrations",
      provider: "GitHub",
      keyType: "oauth",
      maskedValue: accountMatch ? accountMatch[1] : "connected",
      status: "valid",
    });
  } catch {
    keys.push({
      id: "integration:github",
      section: "integrations",
      provider: "GitHub",
      keyType: "oauth",
      maskedValue: "not connected",
      status: "error",
    });
  }

  return keys;
}

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`keys:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const providers = getModelProviders();
  const authProfiles = getAuthProfiles();
  const integrations = getIntegrations();
  const gateway = getGatewayInfo();

  return NextResponse.json({
    providers,
    authProfiles,
    integrations,
    gateway,
  });
}

const SAFE_ID = /^[a-zA-Z0-9._\-/: ]+$/;

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`keys:${ip}`);
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

  if (action === "test") {
    const keyId = body.keyId as string;
    if (!keyId || !SAFE_ID.test(keyId)) {
      return NextResponse.json({ error: "Invalid key ID" }, { status: 400 });
    }

    // Test connectivity
    if (keyId.startsWith("provider:anthropic")) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": process.env.ANTHROPIC_API_KEY || "",
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 1,
            messages: [{ role: "user", content: "test" }],
          }),
        });
        return NextResponse.json({
          success: true,
          valid: res.ok,
          status: res.status,
        });
      } catch (err: unknown) {
        return NextResponse.json({
          success: false,
          error: err instanceof Error ? err.message : "Connection failed",
        });
      }
    }

    if (keyId.startsWith("provider:openai")) {
      try {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY || ""}` },
        });
        return NextResponse.json({ success: true, valid: res.ok, status: res.status });
      } catch (err: unknown) {
        return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Connection failed" });
      }
    }

    if (keyId.startsWith("provider:xai")) {
      try {
        const res = await fetch("https://api.x.ai/v1/models", {
          headers: { Authorization: `Bearer ${process.env.XAI_API_KEY || ""}` },
        });
        return NextResponse.json({ success: true, valid: res.ok, status: res.status });
      } catch (err: unknown) {
        return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Connection failed" });
      }
    }

    if (keyId.startsWith("provider:google")) {
      try {
        const key = process.env.GOOGLE_API_KEY || "";
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
        return NextResponse.json({ success: true, valid: res.ok, status: res.status });
      } catch (err: unknown) {
        return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Connection failed" });
      }
    }

    if (keyId.startsWith("provider:moonshot")) {
      try {
        const res = await fetch("https://api.moonshot.ai/v1/models", {
          headers: { Authorization: `Bearer ${process.env.MOONSHOT_API_KEY || ""}` },
        });
        return NextResponse.json({ success: true, valid: res.ok, status: res.status });
      } catch (err: unknown) {
        return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Connection failed" });
      }
    }

    if (keyId.startsWith("provider:stepfun")) {
      try {
        const res = await fetch("https://api.stepfun.ai/v1/models", {
          headers: { Authorization: `Bearer ${process.env.STEP_API_KEY || ""}` },
        });
        return NextResponse.json({ success: true, valid: res.ok, status: res.status });
      } catch (err: unknown) {
        return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Connection failed" });
      }
    }

    if (keyId.startsWith("provider:openrouter")) {
      try {
        const res = await fetch("https://openrouter.ai/api/v1/models", {
          headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY || ""}` },
        });
        return NextResponse.json({ success: true, valid: res.ok, status: res.status });
      } catch (err: unknown) {
        return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Connection failed" });
      }
    }

    if (keyId === "integration:github") {
      try {
        execFileSync("gh", ["auth", "status"], {
          encoding: "utf-8",
          timeout: 5000,
        });
        return NextResponse.json({ success: true, valid: true });
      } catch {
        return NextResponse.json({ success: true, valid: false });
      }
    }

    return NextResponse.json({ success: true, valid: true });
  }

  if (action === "add") {
    const name = (body.name as string || "").trim();
    const value = (body.value as string || "").trim();
    const type = (body.type as string || "env").trim();

    if (!name || !/^[A-Z_][A-Z0-9_]*$/.test(name) || name.length > 50) {
      return NextResponse.json({ error: "Invalid key name (use UPPER_SNAKE_CASE)" }, { status: 400 });
    }
    if (!value || value.length > 500) {
      return NextResponse.json({ error: "Value required (max 500 chars)" }, { status: 400 });
    }

    if (type === "env") {
      // Write to .env.local file for the dashboard process
      const envPath = envFilePath();
      try {
        let envContent = "";
        try { envContent = readFileSync(envPath, "utf-8"); } catch { /* file may not exist */ }
        // Remove existing line if present
        const lines = envContent.split("\n").filter(l => !l.startsWith(`${name}=`));
        lines.push(`${name}=${value}`);
        writeFileSync(envPath, lines.filter(l => l.trim()).join("\n") + "\n");
        // Also set in current process
        process.env[name] = value;
        return NextResponse.json({ success: true });
      } catch (err: unknown) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
      }
    }

    return NextResponse.json({ error: "Unsupported key type" }, { status: 400 });
  }

  if (action === "remove") {
    const name = (body.name as string || "").trim();
    if (!name || !/^[A-Z_][A-Z0-9_]*$/.test(name)) {
      return NextResponse.json({ error: "Invalid key name" }, { status: 400 });
    }

    const removeEnvPath = envFilePath();
    try {
      let envContent = "";
      try { envContent = readFileSync(removeEnvPath, "utf-8"); } catch { /* ok */ }
      const lines = envContent.split("\n").filter(l => !l.startsWith(`${name}=`));
      writeFileSync(removeEnvPath, lines.filter(l => l.trim()).join("\n") + "\n");
      delete process.env[name];
      return NextResponse.json({ success: true });
    } catch (err: unknown) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
    }
  }

  if (action === "updateGateway") {
    const port = body.port as number;
    if (typeof port !== "number" || port < 1 || port > 65535) {
      return NextResponse.json({ error: "Invalid port" }, { status: 400 });
    }

    try {
      const config = JSON.parse(readFileSync(getConfigPath(), "utf-8"));
      if (!config.gateway) config.gateway = {};
      config.gateway.port = port;
      writeFileSync(getConfigPath(), JSON.stringify(config, null, 2) + "\n");
      return NextResponse.json({ success: true });
    } catch (err: unknown) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
