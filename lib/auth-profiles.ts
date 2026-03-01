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
 * Check if a provider key is available from any persistent source.
 * Checks: process.env → .env file → auth-profiles.json.
 * Hydrates process.env if found on disk so subsequent checks are fast.
 */
export function isProviderKeyAvailable(envKey: string): boolean {
  // 1. Already in memory
  if (process.env[envKey]) return true;

  // 2. Check .env file on disk
  try {
    const content = readFileSync(envFilePath(), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq > 0 && trimmed.slice(0, eq) === envKey) {
        const value = trimmed.slice(eq + 1);
        if (value) {
          process.env[envKey] = value;
          return true;
        }
      }
    }
  } catch { /* .env may not exist */ }

  // 3. Check auth-profiles.json for a matching provider profile
  const provider = PROVIDER_ENV_MAP[envKey];
  if (provider) {
    try {
      const authPath = join(openclawHome(), "agents", "main", "agent", "auth-profiles.json");
      const store = JSON.parse(readFileSync(authPath, "utf-8"));
      const profile = store.profiles?.[`${provider}:manual`];
      if (profile?.key) {
        process.env[envKey] = profile.key;
        return true;
      }
    } catch { /* auth-profiles may not exist */ }
  }

  return false;
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
