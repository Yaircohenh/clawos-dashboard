import registryData from "./model-registry.json";

// ── Types ─────────────────────────────────────────────────────────────

export interface ModelEntry {
  id: string;
  label: string;
  tier: "premium" | "standard" | "budget";
}

export interface ProviderColor {
  bg: string;
  text: string;
  border: string;
}

export interface AgentTiers {
  flagship: string;
  standard: string;
  light: string;
}

export interface Provider {
  id: string;
  name: string;
  prefix: string;
  envKey: string;
  consoleUrl: string;
  color: ProviderColor;
  models: ModelEntry[];
  agentTiers: AgentTiers;
}

export interface ModelRegistry {
  providers: Provider[];
}

/** Provider with runtime key status (returned by /api/models/registry) */
export interface ProviderWithStatus extends Provider {
  keyConfigured: boolean;
}

export interface RegistryResponse {
  providers: ProviderWithStatus[];
}

// ── Flat model entry (for dropdowns) ──────────────────────────────────

export interface FlatModel {
  fullId: string; // e.g. "anthropic/claude-sonnet-4-6"
  label: string;
  tier: "premium" | "standard" | "budget";
  providerId: string;
  providerName: string;
}

// ── Helpers ───────────────────────────────────────────────────────────

/** Load the registry from the bundled JSON. */
export function getModelRegistry(): ModelRegistry {
  return registryData as ModelRegistry;
}

/** Detect provider name from a model ID string using the registry prefixes. */
export function detectProviderFromRegistry(modelId: string): string {
  const registry = getModelRegistry();
  // Check prefix match first (e.g. "anthropic/claude-sonnet-4-6")
  for (const provider of registry.providers) {
    if (modelId.startsWith(`${provider.prefix}/`)) return provider.name;
  }
  // Fuzzy fallback: check if model name contains known keywords
  const lower = modelId.toLowerCase();
  for (const provider of registry.providers) {
    for (const model of provider.models) {
      if (lower.includes(model.id.toLowerCase())) return provider.name;
    }
  }
  if (/claude|anthropic/i.test(modelId)) return "Anthropic";
  if (/gpt|o1|o3|openai/i.test(modelId)) return "OpenAI";
  if (/grok|xai/i.test(modelId)) return "xAI";
  if (/gemini|google/i.test(modelId)) return "Google";
  return "Other";
}

/** Return all models as flat entries with provider info (for dropdowns). */
export function getAllModelsFlat(): FlatModel[] {
  const registry = getModelRegistry();
  const result: FlatModel[] = [];
  for (const provider of registry.providers) {
    for (const model of provider.models) {
      result.push({
        fullId: `${provider.prefix}/${model.id}`,
        label: model.label,
        tier: model.tier,
        providerId: provider.id,
        providerName: provider.name,
      });
    }
  }
  return result;
}
