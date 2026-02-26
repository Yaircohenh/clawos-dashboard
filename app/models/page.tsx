"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

interface ModelInfo {
  id: string;
  provider: string;
  usedBy: string[];
  isFallback: boolean;
}

const COMMON_MODELS = [
  { provider: "Anthropic", prefix: "anthropic", models: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"], link: "https://console.anthropic.com", linkLabel: "console.anthropic.com" },
  { provider: "OpenAI", prefix: "openai", models: ["gpt-4o", "gpt-4o-mini", "o1", "o3-mini"], link: "https://platform.openai.com/api-keys", linkLabel: "platform.openai.com/api-keys" },
  { provider: "xAI", prefix: "xai", models: ["grok-4-1-fast", "grok-3"], link: "https://console.x.ai", linkLabel: "console.x.ai" },
  { provider: "Google", prefix: "google", models: ["gemini-2.5-pro", "gemini-2.5-flash"], link: "https://aistudio.google.com/app/apikey", linkLabel: "aistudio.google.com/app/apikey" },
];

export default function ModelsPage() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [fallback, setFallback] = useState("");
  const [loading, setLoading] = useState(true);
  const [newModelId, setNewModelId] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchModels();
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

  async function addModel() {
    const id = newModelId.trim();
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
        setNewModelId("");
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
        Manage LLM models available to your agents. Set a fallback model and add new providers.
      </p>

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
                {models.map((model) => (
                  <tr key={model.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        model.provider === "Anthropic" ? "bg-purple-900/50 text-purple-400" :
                        model.provider === "OpenAI" ? "bg-green-900/50 text-green-400" :
                        model.provider === "xAI" ? "bg-blue-900/50 text-blue-400" :
                        model.provider === "Google" ? "bg-yellow-900/50 text-yellow-400" :
                        "bg-gray-700 text-gray-400"
                      }`}>
                        {model.provider}
                      </span>
                    </td>
                    <td className="py-3 font-mono text-xs text-gray-200">{model.id}</td>
                    <td className="py-3 text-gray-400 text-xs">
                      {model.usedBy.length > 0 ? model.usedBy.join(", ") : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="py-3 text-center">
                      <button
                        onClick={() => changeFallback(model.isFallback ? "" : model.id)}
                        className={`text-lg ${model.isFallback ? "text-yellow-400" : "text-gray-600 hover:text-yellow-400"} transition-colors`}
                        title={model.isFallback ? "Remove as fallback" : "Set as fallback"}
                      >
                        {model.isFallback ? "★" : "☆"}
                      </button>
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => removeModel(model.id)}
                        className="text-xs text-red-400 hover:text-red-300 transition-colors"
                        title={model.usedBy.length > 0 ? "Cannot remove — in use" : "Remove model"}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No models registered. Add one below or assign a model to an agent.</p>
        )}
      </section>

      {/* Add Model Form */}
      <section className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-6">
        <h2 className="text-lg font-semibold mb-4">Add Model</h2>
        <div className="flex gap-3">
          <input
            value={newModelId}
            onChange={(e) => setNewModelId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addModel()}
            placeholder="Model ID (e.g. anthropic/claude-sonnet-4-6)"
            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={addModel}
            disabled={adding || !newModelId.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded-lg text-sm"
          >
            {adding ? "Adding..." : "Add Model"}
          </button>
        </div>
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
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-xs">▼</span>
        </div>
      </section>

      {/* Common Models Reference */}
      <section className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <h2 className="text-lg font-semibold mb-4">Common Models Reference</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {COMMON_MODELS.map((group) => (
            <div key={group.provider} className="bg-gray-800/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-sm">{group.provider}</h3>
                <a
                  href={group.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  {group.linkLabel} →
                </a>
              </div>
              <div className="space-y-1">
                {group.models.map((modelId) => (
                  <div key={modelId} className="flex items-center justify-between">
                    <code className="text-xs text-gray-300">{group.prefix}/{modelId}</code>
                    <button
                      onClick={() => { setNewModelId(`${group.prefix}/${modelId}`); }}
                      className="text-xs text-gray-500 hover:text-blue-400 transition-colors"
                    >
                      Use
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
