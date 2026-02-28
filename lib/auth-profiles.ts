import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { openclawHome } from "@/lib/paths";

// Provider key → auth-profiles.json mapping
// The gateway's internal agent runner looks for keys in auth-profiles.json
// before falling back to env vars. We write directly to ensure keys are found.

export const PROVIDER_ENV_MAP: Record<string, string> = {
  ANTHROPIC_API_KEY: "anthropic",
  OPENAI_API_KEY: "openai",
  XAI_API_KEY: "xai",
  GOOGLE_API_KEY: "google",
  MOONSHOT_API_KEY: "moonshot",
  STEP_API_KEY: "stepfun",
  OPENROUTER_API_KEY: "openrouter",
};

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
