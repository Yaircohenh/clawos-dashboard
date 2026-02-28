import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { openclawConfigPath } from "@/lib/paths";
import { getModelRegistry } from "@/lib/model-registry";

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

export function setAgentModels(providerId: string) {
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
