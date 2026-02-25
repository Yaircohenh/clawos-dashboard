"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

interface Plugin {
  id: string;
  name: string;
  description: string;
  version: string;
  status: "loaded" | "disabled" | "error";
  origin: string;
  toolNames: string[];
  error?: string;
}

export default function PluginsPage() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null);

  useEffect(() => {
    fetchPlugins();
  }, []);

  async function fetchPlugins() {
    try {
      const res = await fetch("/api/plugins");
      if (res.ok) {
        const data = await res.json();
        setPlugins(data.plugins || []);
      }
    } catch {
      toast.error("Failed to load plugins");
    } finally {
      setLoading(false);
    }
  }

  async function togglePlugin(id: string, enable: boolean) {
    setActionLoading(id);
    try {
      const res = await fetch("/api/plugins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: enable ? "enable" : "disable", pluginId: id }),
      });
      if (res.ok) {
        toast.success(`Plugin ${enable ? "enabled" : "disabled"}`);
        fetchPlugins();
      } else {
        toast.error("Failed");
      }
    } catch {
      toast.error("Failed");
    } finally {
      setActionLoading(null);
    }
  }

  const loaded = plugins.filter(p => p.status === "loaded");
  const disabledPlugins = plugins.filter(p => p.status === "disabled");
  const errors = plugins.filter(p => p.status === "error");

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading plugins...</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Plugins</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatCard label="Loaded" value={loaded.length} color="green" />
        <StatCard label="Disabled" value={disabledPlugins.length} color="gray" />
        <StatCard label="Errors" value={errors.length} color="red" />
      </div>

      <div className="space-y-2">
        {plugins.map(p => (
          <div key={p.id} className="bg-gray-900 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors">
            <div
              className="flex items-center justify-between p-4 cursor-pointer"
              onClick={() => setExpandedPlugin(expandedPlugin === p.id ? null : p.id)}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{p.name}</span>
                    {p.version && <span className="text-xs text-gray-500">v{p.version}</span>}
                  </div>
                  <div className="text-xs text-gray-500 truncate">{p.description || p.id}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-3">
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  p.status === "loaded"
                    ? "bg-green-900/50 text-green-400"
                    : p.status === "error"
                      ? "bg-red-900/50 text-red-400"
                      : "bg-gray-700 text-gray-400"
                }`}>
                  {p.status}
                </span>
                <span className="text-gray-500 text-xs">{expandedPlugin === p.id ? "▲" : "▼"}</span>
              </div>
            </div>

            {expandedPlugin === p.id && (
              <div className="px-4 pb-4 border-t border-gray-800 pt-3">
                <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                  <div>
                    <span className="text-gray-500">Plugin ID:</span>{" "}
                    <span className="font-mono text-xs text-gray-300">{p.id}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Origin:</span>{" "}
                    <span className="text-gray-300">{p.origin || "built-in"}</span>
                  </div>
                </div>

                {p.toolNames.length > 0 && (
                  <div className="mb-4">
                    <div className="text-sm text-gray-500 mb-1">Provides {p.toolNames.length} tool{p.toolNames.length !== 1 ? "s" : ""}:</div>
                    <div className="flex flex-wrap gap-1">
                      {p.toolNames.map(t => (
                        <span key={t} className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-300 font-mono">{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                {p.error && (
                  <div className="mb-4">
                    <div className="text-sm text-red-400 mb-1">Error:</div>
                    <pre className="text-xs text-gray-400 bg-gray-800/50 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">{p.error}</pre>
                  </div>
                )}

                <button
                  onClick={e => { e.stopPropagation(); togglePlugin(p.id, p.status !== "loaded"); }}
                  disabled={actionLoading === p.id}
                  className={`px-3 py-1.5 rounded-lg text-xs disabled:opacity-50 ${
                    p.status === "loaded"
                      ? "bg-gray-700 hover:bg-gray-600 text-white"
                      : "bg-green-900/50 hover:bg-green-900 text-green-400"
                  }`}
                >
                  {actionLoading === p.id ? "..." : p.status === "loaded" ? "Disable" : "Enable"}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {plugins.length === 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center text-gray-500">
          <p className="mb-2">No plugins found.</p>
          <p className="text-sm">
            Plugins are managed via <code className="bg-gray-800 px-2 py-0.5 rounded">openclaw plugins</code>
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = { green: "text-green-400", red: "text-red-400", gray: "text-gray-400" };
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <div className="text-sm text-gray-400 mb-1">{label}</div>
      <div className={`text-3xl font-bold ${colorMap[color] || ""}`}>{value}</div>
    </div>
  );
}
