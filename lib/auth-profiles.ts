import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { openclawHome, envFilePath } from "@/lib/paths";

// Provider key → auth-profiles.json mapping
// The gateway's internal agent runner looks for keys in auth-profiles.json
// before falling back to env vars. We write directly to ensure keys are found.

export const PROVIDER_ENV_MAP: Record<string, string> = {
  ANTHROPIC_API_KEY: "anthropic",
  OPENAI_API_KEY: "openai",
  XAI_API_KEY: "xai",
  GEMINI_API_KEY: "google",
  MOONSHOT_API_KEY: "moonshot",
  OPENROUTER_API_KEY: "openrouter",
};

/**
 * Read a key value from the .env file on disk (returns empty string if not found).
 */
function readEnvKey(envKey: string): string {
  try {
    const content = readFileSync(envFilePath(), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq > 0 && trimmed.slice(0, eq) === envKey) {
        return trimmed.slice(eq + 1);
      }
    }
  } catch { /* .env may not exist */ }
  return "";
}

/**
 * Write or update a key in the .env file on disk.
 */
function writeEnvKey(envKey: string, value: string) {
  const envPath = envFilePath();
  const dir = envPath.replace(/\/[^/]+$/, "");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  let content = "";
  try { content = readFileSync(envPath, "utf-8"); } catch { /* ok */ }
  const lines = content.split("\n").filter((l) => !l.startsWith(`${envKey}=`));
  lines.push(`${envKey}=${value}`);
  writeFileSync(envPath, lines.filter((l) => l.trim()).join("\n") + "\n");
}

/**
 * Read a key from auth-profiles.json (returns empty string if not found).
 */
function readAuthProfileKey(envKey: string): string {
  const provider = PROVIDER_ENV_MAP[envKey];
  if (!provider) return "";
  try {
    const authPath = join(openclawHome(), "agents", "main", "agent", "auth-profiles.json");
    const store = JSON.parse(readFileSync(authPath, "utf-8"));
    return store.profiles?.[`${provider}:manual`]?.key || "";
  } catch { return ""; }
}

/**
 * Check if a provider key is available from any persistent source.
 * Checks: process.env → .env file → auth-profiles.json.
 * Auto-syncs keys across all stores so upgrades work seamlessly.
 */
export function isProviderKeyAvailable(envKey: string): boolean {
  // Gather key from all sources
  const fromEnv = process.env[envKey] || "";
  const fromDisk = readEnvKey(envKey);
  const fromAuth = readAuthProfileKey(envKey);

  // Pick the first available value
  const key = fromEnv || fromDisk || fromAuth;
  if (!key) return false;

  // Sync to all stores that are missing it
  if (!fromEnv) process.env[envKey] = key;
  if (!fromDisk) { try { writeEnvKey(envKey, key); } catch { /* best-effort */ } }
  if (!fromAuth) { try { registerAuthProfile(envKey, key); } catch { /* best-effort */ } }

  return true;
}

export function registerAuthProfile(envKey: string, apiKey: string) {
  const provider = PROVIDER_ENV_MAP[envKey];
  if (!provider) return;

  const authDir = join(openclawHome(), "agents", "main", "agent");
  if (!existsSync(authDir)) mkdirSync(authDir, { recursive: true });

  const authPath = join(authDir, "auth-profiles.json");
  let store: { version: number; profiles: Record<string, unknown> };
  try {
    store = JSON.parse(readFileSync(authPath, "utf-8"));
  } catch {
    store = { version: 1, profiles: {} };
  }

  const profileId = `${provider}:manual`;
  store.profiles[profileId] = {
    type: "api_key",
    provider,
    key: apiKey,
  };
  writeFileSync(authPath, JSON.stringify(store, null, 2) + "\n");
}

export function removeAuthProfile(envKey: string) {
  const provider = PROVIDER_ENV_MAP[envKey];
  if (!provider) return;

  const authPath = join(openclawHome(), "agents", "main", "agent", "auth-profiles.json");
  let store: { version: number; profiles: Record<string, unknown> };
  try {
    store = JSON.parse(readFileSync(authPath, "utf-8"));
  } catch {
    return;
  }

  delete store.profiles[`${provider}:manual`];
  writeFileSync(authPath, JSON.stringify(store, null, 2) + "\n");
}
