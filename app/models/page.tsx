"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

interface ModelInfo {
  id: string;
  provider: string;
  usedBy: string[];
  isFallback: boolean;
}

interface ModelPricing {
  input: number;
  output: number;
}

interface ModelEntry {
  id: string;
  label: string;
  tier: "premium" | "standard" | "budget";
  pricing?: ModelPricing;
}

interface ProviderColor {
  bg: string;
  text: string;
  border: string;
}

interface ProviderWithStatus {
  id: string;
  name: string;
  prefix: string;
  envKey: string;
  consoleUrl: string;
  color: ProviderColor;
  models: ModelEntry[];
  keyConfigured: boolean;
  isGateway?: boolean;
}

interface PricingRow {
  fullId: string;
  label: string;
  providerName: string;
  providerColor: ProviderColor;
  input: number;
  output: number;
  keyConfigured: boolean;
  alreadyAdded: boolean;
}

const TIER_BADGE: Record<string, { label: string; cls: string }> = {
  premium: { label: "Premium", cls: "bg-amber-900/50 text-amber-400" },
  standard: { label: "Standard", cls: "bg-blue-900/50 text-blue-400" },
  budget: { label: "Budget", cls: "bg-gray-700 text-gray-400" },
};

type SortField = "output" | "input";
type SortDir = "asc" | "desc";

export default function ModelsPage() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [fallback, setFallback] = useState("");
  const [loading, setLoading] = useState(true);
  const [newModelId, setNewModelId] = useState("");
  const [adding, setAdding] = useState(false);
  const [providers, setProviders] = useState<ProviderWithStatus[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"models" | "pricing">("models");
  const [sortField, setSortField] = useState<SortField>("output");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchModels();
    fetchRegistry();
  }, []);

  async function fetchModels() {
    try {
      const res = await fetch("/api/models");
      if (res.ok) {
        const data = await res.json();
        setModels(data.models || []);
        setFallback(data.fallback || "");
      }
    } catch {
      toast.error("Failed to load models");
    } finally {
      setLoading(false);
    }
  }

  async function fetchRegistry() {
    try {
      const res = await fetch("/api/models/registry");
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers || []);
      }
    } catch {
      // Registry is supplementary — page still works without it
    }
  }

  async function addModel(modelId?: string) {
    const id = (modelId || newModelId).trim();
    if (!id) { toast.error("Enter a model ID"); return; }
    setAdding(true);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "addModel", modelId: id }),
      });
      if (res.ok) {
        toast.success("Model added");
        if (!modelId) setNewModelId("");
        fetchModels();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to add");
      }
    } catch {
      toast.error("Failed");
    } finally {
      setAdding(false);
    }
  }

  async function removeModel(modelId: string) {
    const res = await fetch("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "removeModel", modelId }),
    });
    if (res.ok) {
      toast.success("Model removed");
      fetchModels();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to remove");
    }
  }

  async function changeFallback(modelId: string) {
    const res = await fetch("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setFallback", modelId }),
    });
    if (res.ok) {
      toast.success(`Fallback set to ${modelId || "none"}`);
      setFallback(modelId);
      setModels((prev) => prev.map((m) => ({ ...m, isFallback: m.id === modelId })));
    } else {
      toast.error("Failed to set fallback");
    }
  }

  async function saveProviderKey(envKey: string) {
    const value = (keyInputs[envKey] || "").trim();
    if (!value) { toast.error("Enter an API key"); return; }
    setSavingKey(envKey);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "addProviderKey", envKey, value }),
      });
      if (res.ok) {
        toast.success("API key saved");
        setKeyInputs((prev) => ({ ...prev, [envKey]: "" }));
        fetchRegistry();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save key");
      }
    } catch {
      toast.error("Failed to save key");
    } finally {
      setSavingKey(null);
    }
  }

  async function refreshPricing() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refreshPricing" }),
      });
      if (res.ok) {
        toast.success("Pricing updated");
        fetchRegistry();
      } else {
        toast.error("Failed to refresh pricing");
      }
    } catch {
      toast.error("Failed to refresh pricing");
    } finally {
      setRefreshing(false);
    }
  }

  function toggleCollapse(providerId: string) {
    setCollapsed((prev) => ({ ...prev, [providerId]: !prev[providerId] }));
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function buildPricingRows(): PricingRow[] {
    const rows: PricingRow[] = [];
    for (const provider of providers) {
      if (provider.isGateway) continue;
      for (const model of provider.models) {
        const fullId = `${provider.prefix}/${model.id}`;
        rows.push({
          fullId,
          label: model.label,
          providerName: provider.name,
          providerColor: provider.color,
          input: model.pricing?.input || 0,
          output: model.pricing?.output || 0,
          keyConfigured: provider.keyConfigured,
          alreadyAdded: models.some((m) => m.id === fullId),
        });
      }
    }
    rows.sort((a, b) => {
      const va = sortField === "input" ? a.input : a.output;
      const vb = sortField === "input" ? b.input : b.output;
      return sortDir === "asc" ? va - vb : vb - va;
    });
    return rows;
  }

  const gatewayProviders = providers.filter((p) => p.isGateway);
  const directProviders = providers.filter((p) => !p.isGateway);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading models...</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Models</h1>
      <p className="text-gray-400 text-sm mb-6">
        Manage LLM models available to your agents. Set a fallback model, add providers, and compare pricing.
      </p>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-800">
        <button
          onClick={() => setActiveTab("models")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "models"
              ? "border-blue-500 text-white"
              : "border-transparent text-gray-400 hover:text-gray-200"
          }`}
        >
          Models
        </button>
        <button
          onClick={() => setActiveTab("pricing")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "pricing"
              ? "border-blue-500 text-white"
              : "border-transparent text-gray-400 hover:text-gray-200"
          }`}
        >
          Pricing
        </button>
      </div>

      {/* ───── Models Tab ───── */}
      {activeTab === "models" && (
        <>
          {/* Models In Use Table */}
          <section className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-6">
            <h2 className="text-lg font-semibold mb-4">Models In Use</h2>
            {models.length > 0 ? (
              <div className="overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-400">
                      <th className="text-left pb-3">Provider</th>
                      <th className="text-left pb-3">Model ID</th>
                      <th className="text-left pb-3">Used By</th>
                      <th className="text-center pb-3">Fallback</th>
                      <th className="text-right pb-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {models.map((model) => {
                      const regProvider = providers.find((p) => p.name === model.provider);
                      const colorCls = regProvider
                        ? `${regProvider.color.bg} ${regProvider.color.text}`
                        : "bg-gray-700 text-gray-400";
                      return (
                        <tr key={model.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                          <td className="py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs ${colorCls}`}>
                              {model.provider}
                            </span>
                          </td>
                          <td className="py-3 font-mono text-xs text-gray-200">{model.id}</td>
                          <td className="py-3 text-gray-400 text-xs">
                            {model.usedBy.length > 0 ? model.usedBy.join(", ") : <span className="text-gray-600">&mdash;</span>}
                          </td>
                          <td className="py-3 text-center">
                            <button
                              onClick={() => changeFallback(model.isFallback ? "" : model.id)}
                              className={`text-lg ${model.isFallback ? "text-yellow-400" : "text-gray-600 hover:text-yellow-400"} transition-colors`}
                              title={model.isFallback ? "Remove as fallback" : "Set as fallback"}
                            >
                              {model.isFallback ? "\u2605" : "\u2606"}
                            </button>
                          </td>
                          <td className="py-3 text-right">
                            <button
                              onClick={() => removeModel(model.id)}
                              className="text-xs text-red-400 hover:text-red-300 transition-colors"
                              title={model.usedBy.length > 0 ? "Cannot remove \u2014 in use" : "Remove model"}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No models registered. Add one below or assign a model to an agent.</p>
            )}
          </section>

          {/* Fallback Selector */}
          <section className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-6">
            <h2 className="text-lg font-semibold mb-4">Fallback Model</h2>
            <p className="text-gray-400 text-sm mb-3">
              The fallback model is used when an agent&apos;s primary model is unavailable.
            </p>
            <div className="relative">
              <select
                value={fallback}
                onChange={(e) => changeFallback(e.target.value)}
                className="w-full max-w-md px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 appearance-none pr-8"
              >
                <option value="">No fallback</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>{m.id} ({m.provider})</option>
                ))}
              </select>
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-xs">{"\u25BC"}</span>
            </div>
          </section>

          {/* Provider Sections */}
          {directProviders.length > 0 && (
            <section className="mb-6">
              <h2 className="text-lg font-semibold mb-4">Providers</h2>
              <div className="space-y-4">
                {directProviders.map((provider) => (
                  <div key={provider.id} className={`bg-gray-900 rounded-xl border ${provider.keyConfigured ? "border-gray-800" : provider.color.border} overflow-hidden`}>
                    {/* Provider Header */}
                    <button
                      onClick={() => toggleCollapse(provider.id)}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-800/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${provider.color.bg} ${provider.color.text}`}>
                          {provider.name}
                        </span>
                        <span className={`inline-flex items-center gap-1.5 text-xs ${provider.keyConfigured ? "text-green-400" : "text-red-400"}`}>
                          <span className={`w-2 h-2 rounded-full ${provider.keyConfigured ? "bg-green-400" : "bg-red-400"}`} />
                          {provider.keyConfigured ? "Key configured" : "No key"}
                        </span>
                        <span className="text-xs text-gray-500">{provider.models.length} models</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <a
                          href={provider.consoleUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:text-blue-300"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Get API Key {"\u2192"}
                        </a>
                        <span className="text-gray-500 text-xs">{collapsed[provider.id] ? "\u25B6" : "\u25BC"}</span>
                      </div>
                    </button>

                    {/* Provider Body */}
                    {!collapsed[provider.id] && (
                      <div className="border-t border-gray-800 px-5 pb-4">
                        {/* Inline Key Setup (if no key) */}
                        {!provider.keyConfigured && (
                          <div className="mt-4 mb-4 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                            <p className="text-xs text-gray-400 mb-2">
                              Enter your {provider.name} API key to use these models.{" "}
                              <a href={provider.consoleUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                                Get one here {"\u2192"}
                              </a>
                            </p>
                            <div className="flex gap-2">
                              <input
                                type="password"
                                value={keyInputs[provider.envKey] || ""}
                                onChange={(e) => setKeyInputs((prev) => ({ ...prev, [provider.envKey]: e.target.value }))}
                                onKeyDown={(e) => e.key === "Enter" && saveProviderKey(provider.envKey)}
                                placeholder={`${provider.envKey}=sk-...`}
                                className="flex-1 px-3 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                              />
                              <button
                                onClick={() => saveProviderKey(provider.envKey)}
                                disabled={savingKey === provider.envKey || !(keyInputs[provider.envKey] || "").trim()}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded text-xs"
                              >
                                {savingKey === provider.envKey ? "Saving..." : "Save"}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Model Rows */}
                        <div className="mt-3 space-y-1">
                          {provider.models.map((model) => {
                            const fullId = `${provider.prefix}/${model.id}`;
                            const alreadyAdded = models.some((m) => m.id === fullId);
                            const tierInfo = TIER_BADGE[model.tier] || TIER_BADGE.standard;
                            return (
                              <div key={model.id} className="flex items-center justify-between py-2 px-2 rounded hover:bg-gray-800/30">
                                <div className="flex items-center gap-3">
                                  <code className="text-xs text-gray-200 font-mono">{fullId}</code>
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${tierInfo.cls}`}>
                                    {tierInfo.label}
                                  </span>
                                  {model.pricing && (
                                    <span className="text-[10px] text-gray-500">
                                      ${model.pricing.input}/{model.pricing.output}
                                    </span>
                                  )}
                                </div>
                                <div>
                                  {alreadyAdded ? (
                                    <span className="text-xs text-gray-500">Added</span>
                                  ) : (
                                    <button
                                      onClick={() => addModel(fullId)}
                                      disabled={!provider.keyConfigured}
                                      className="text-xs text-blue-400 hover:text-blue-300 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
                                      title={!provider.keyConfigured ? "Configure API key first" : `Add ${fullId}`}
                                    >
                                      Use
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Gateway Providers (OpenRouter etc.) */}
          {gatewayProviders.length > 0 && (
            <section className="mb-6">
              <h2 className="text-lg font-semibold mb-4">Gateway Providers</h2>
              <div className="space-y-4">
                {gatewayProviders.map((provider) => (
                  <div key={provider.id} className={`bg-gray-900 rounded-xl border ${provider.keyConfigured ? "border-gray-800" : provider.color.border} p-5`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${provider.color.bg} ${provider.color.text}`}>
                          {provider.name}
                        </span>
                        <span className={`inline-flex items-center gap-1.5 text-xs ${provider.keyConfigured ? "text-green-400" : "text-red-400"}`}>
                          <span className={`w-2 h-2 rounded-full ${provider.keyConfigured ? "bg-green-400" : "bg-red-400"}`} />
                          {provider.keyConfigured ? "Key configured" : "No key"}
                        </span>
                      </div>
                      <a
                        href={provider.consoleUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        Get API Key {"\u2192"}
                      </a>
                    </div>
                    <p className="text-xs text-gray-400 mb-3">
                      Access 290+ models from all providers with a single API key. 5.5% fee on credit purchase, no per-token markup.
                    </p>
                    {!provider.keyConfigured && (
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={keyInputs[provider.envKey] || ""}
                          onChange={(e) => setKeyInputs((prev) => ({ ...prev, [provider.envKey]: e.target.value }))}
                          onKeyDown={(e) => e.key === "Enter" && saveProviderKey(provider.envKey)}
                          placeholder={`${provider.envKey}=sk-...`}
                          className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-600 rounded text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                        />
                        <button
                          onClick={() => saveProviderKey(provider.envKey)}
                          disabled={savingKey === provider.envKey || !(keyInputs[provider.envKey] || "").trim()}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded text-xs"
                        >
                          {savingKey === provider.envKey ? "Saving..." : "Save"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Add Custom Model Form */}
          <section className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <h2 className="text-lg font-semibold mb-4">Add Custom Model</h2>
            <div className="flex gap-3">
              <input
                value={newModelId}
                onChange={(e) => setNewModelId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addModel()}
                placeholder="Model ID (e.g. anthropic/claude-sonnet-4-6)"
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={() => addModel()}
                disabled={adding || !newModelId.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded-lg text-sm"
              >
                {adding ? "Adding..." : "Add Model"}
              </button>
            </div>
          </section>
        </>
      )}

      {/* ───── Pricing Tab ───── */}
      {activeTab === "pricing" && (
        <>
          {/* Pricing Table */}
          <section className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Price Comparison</h2>
              <button
                onClick={refreshPricing}
                disabled={refreshing}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800 disabled:text-gray-500 text-sm text-gray-300 rounded-lg border border-gray-700 transition-colors"
              >
                {refreshing ? "Refreshing..." : "Refresh Costs"}
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Prices in USD per million tokens. Click column headers to sort.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400">
                    <th className="text-left pb-3 pr-4">Provider</th>
                    <th className="text-left pb-3 pr-4">Model</th>
                    <th
                      className="text-right pb-3 pr-4 cursor-pointer hover:text-gray-200 select-none"
                      onClick={() => toggleSort("input")}
                    >
                      Input $/M {sortField === "input" ? (sortDir === "asc" ? "\u25B2" : "\u25BC") : ""}
                    </th>
                    <th
                      className="text-right pb-3 pr-4 cursor-pointer hover:text-gray-200 select-none"
                      onClick={() => toggleSort("output")}
                    >
                      Output $/M {sortField === "output" ? (sortDir === "asc" ? "\u25B2" : "\u25BC") : ""}
                    </th>
                    <th className="text-center pb-3">Status</th>
                    <th className="text-right pb-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {buildPricingRows().map((row) => (
                    <tr key={row.fullId} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="py-2.5 pr-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${row.providerColor.bg} ${row.providerColor.text}`}>
                          {row.providerName}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="text-gray-200 text-xs">{row.label}</span>
                        <span className="text-gray-600 text-[10px] ml-2 font-mono">{row.fullId}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono text-xs text-gray-300">
                        ${row.input.toFixed(2)}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono text-xs text-gray-300">
                        ${row.output.toFixed(2)}
                      </td>
                      <td className="py-2.5 text-center">
                        {row.keyConfigured ? (
                          <span className="text-green-400 text-xs" title="API key configured">&#10003;</span>
                        ) : (
                          <span className="text-gray-600 text-xs" title="No API key">&mdash;</span>
                        )}
                      </td>
                      <td className="py-2.5 text-right">
                        {row.alreadyAdded ? (
                          <span className="text-xs text-gray-500">Added</span>
                        ) : (
                          <button
                            onClick={() => addModel(row.fullId)}
                            disabled={!row.keyConfigured}
                            className="text-xs text-blue-400 hover:text-blue-300 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
                            title={!row.keyConfigured ? "Configure API key first" : `Add ${row.fullId}`}
                          >
                            Use
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* OpenRouter Gateway Section */}
          {gatewayProviders.map((provider) => (
            <section key={provider.id} className={`bg-gray-900 rounded-xl border ${provider.color.border} p-5 mb-6`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${provider.color.bg} ${provider.color.text}`}>
                    {provider.name}
                  </span>
                  <span className={`inline-flex items-center gap-1.5 text-xs ${provider.keyConfigured ? "text-green-400" : "text-red-400"}`}>
                    <span className={`w-2 h-2 rounded-full ${provider.keyConfigured ? "bg-green-400" : "bg-red-400"}`} />
                    {provider.keyConfigured ? "Key configured" : "No key"}
                  </span>
                </div>
                <a
                  href={provider.consoleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Get API Key {"\u2192"}
                </a>
              </div>
              <p className="text-xs text-gray-400 mb-3">
                Via openrouter.ai &mdash; access 290+ models with one API key. 5.5% fee on credit purchase. No per-token markup.
              </p>
              {!provider.keyConfigured && (
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={keyInputs[provider.envKey] || ""}
                    onChange={(e) => setKeyInputs((prev) => ({ ...prev, [provider.envKey]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && saveProviderKey(provider.envKey)}
                    placeholder={`${provider.envKey}=sk-...`}
                    className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-600 rounded text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={() => saveProviderKey(provider.envKey)}
                    disabled={savingKey === provider.envKey || !(keyInputs[provider.envKey] || "").trim()}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded text-xs"
                  >
                    {savingKey === provider.envKey ? "Saving..." : "Save"}
                  </button>
                </div>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
