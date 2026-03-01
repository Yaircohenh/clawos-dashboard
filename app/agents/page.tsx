"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

interface Agent {
  id: string;
  name: string;
  emoji: string;
  model: string;
  workspace: string;
  status: "active" | "idle" | "error";
}

interface AgentScore {
  score: number;
  completed: number;
  failed: number;
  avg_cycles: number;
  streak: number;
  last_updated: string | null;
  history: { ts: string; delta: number }[];
}

function ScoreSparkline({ history }: { history: { ts: string; delta: number }[] }) {
  if (!history || history.length === 0) return null;

  const recent = history.slice(-10);
  // Build cumulative scores from deltas
  const points: number[] = [];
  let cumulative = 0;
  for (const entry of recent) {
    cumulative += entry.delta;
    points.push(cumulative);
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = 60;
  const height = 20;
  const padding = 2;

  const coords = points.map((val, i) => {
    const x = points.length === 1 ? width / 2 : (i / (points.length - 1)) * (width - padding * 2) + padding;
    const y = height - padding - ((val - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const netDelta = cumulative;
  const color = netDelta > 0 ? "#22c55e" : netDelta < 0 ? "#ef4444" : "#6b7280";

  return (
    <svg width={width} height={height} className="inline-block ml-2">
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface RegistryModel {
  fullId: string;
  label: string;
  providerName: string;
}

interface RegistryProvider {
  id: string;
  name: string;
  prefix: string;
  models: { id: string; label: string; tier: string }[];
  keyConfigured: boolean;
}

const FALLBACK_MODELS: RegistryModel[] = [
  { fullId: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6", providerName: "Anthropic" },
  { fullId: "anthropic/claude-opus-4-6", label: "Claude Opus 4.6", providerName: "Anthropic" },
  { fullId: "anthropic/claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", providerName: "Anthropic" },
  { fullId: "xai/grok-4-1-fast", label: "Grok 4.1 Fast", providerName: "xAI" },
];

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", emoji: "", workspace: "" });
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ id: "", name: "", emoji: "🤖", model: "anthropic/claude-sonnet-4-6", workspace: "" });
  const [removeConfirm, setRemoveConfirm] = useState<{ id: string; step: "confirm" | "backup" } | null>(null);
  const [fileViewAgent, setFileViewAgent] = useState<string | null>(null);
  const [agentFiles, setAgentFiles] = useState<{ name: string; size: number }[]>([]);
  const [editingFile, setEditingFile] = useState<{ name: string; content: string } | null>(null);
  const [inlineEdit, setInlineEdit] = useState<{ agentId: string; field: "name" | "emoji"; value: string } | null>(null);
  const [scores, setScores] = useState<Record<string, AgentScore>>({});
  const [registryModels, setRegistryModels] = useState<RegistryModel[]>(FALLBACK_MODELS);
  const [registryProviders, setRegistryProviders] = useState<RegistryProvider[]>([]);

  const fetchRegistry = useCallback(async () => {
    try {
      const res = await fetch("/api/models/registry");
      if (res.ok) {
        const data = await res.json();
        const providers: RegistryProvider[] = data.providers || [];
        setRegistryProviders(providers);
        const flat: RegistryModel[] = [];
        for (const p of providers) {
          for (const m of p.models) {
            flat.push({ fullId: `${p.prefix}/${m.id}`, label: m.label, providerName: p.name });
          }
        }
        if (flat.length > 0) setRegistryModels(flat);
      }
    } catch { /* keep fallback */ }
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/monitor");
      if (res.ok) {
        const data = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAgents(data.agents.map((a: any) => ({
          id: a.agentId || a.id, name: a.name, emoji: a.emoji,
          model: a.model, workspace: a.workspace || "~/.openclaw/workspace", status: a.status,
        })));
      }
    } catch { /* retry */ } finally { setLoading(false); }
  }, []);

  const fetchScores = useCallback(async () => {
    try {
      const res = await fetch("/api/scores");
      if (res.ok) setScores(await res.json());
    } catch { /* scores are optional */ }
  }, []);

  useEffect(() => { fetchAgents(); fetchScores(); fetchRegistry(); }, [fetchAgents, fetchScores, fetchRegistry]);

  function getProviderForModel(model: string): RegistryProvider | undefined {
    return registryProviders.find((p) => model.startsWith(`${p.prefix}/`));
  }

  async function handleModelChange(agentId: string, model: string) {
    // Block if provider has no key configured
    const provider = getProviderForModel(model);
    if (provider && !provider.keyConfigured) {
      toast.error(`No API key for ${provider.name}. Configure it on the Models page.`);
      return;
    }

    const res = await fetch("/api/agents", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setModel", agentId, model }),
    });
    if (res.ok) {
      const data = await res.json();
      setAgents((prev) => prev.map((a) => (a.id === agentId ? { ...a, model } : a)));
      if (data.sessionReset) {
        toast.success(`Model updated to ${model}. Prior conversation saved — new model will have context.`);
      } else {
        toast.success(`Model updated to ${model}. Gateway restarting...`);
      }
    } else { toast.error("Failed to update model"); }
  }

  async function handleRestart(agentId: string) {
    const res = await fetch("/api/agents", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restart", agentId }),
    });
    if (res.ok) toast.success(`Agent ${agentId} restart triggered`);
    else toast.error("Failed to restart");
  }

  async function handleUpdate(agentId: string) {
    const res = await fetch("/api/agents", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", agentId, ...editForm }),
    });
    if (res.ok) { toast.success("Agent updated"); setEditingAgent(null); fetchAgents(); }
    else toast.error("Failed to update");
  }

  async function handleInlineSave(agentId: string, field: "name" | "emoji", value: string) {
    const payload: Record<string, string> = { action: "update", agentId };
    payload[field] = value;
    const res = await fetch("/api/agents", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setAgents((prev) => prev.map((a) => (a.id === agentId ? { ...a, [field]: value } : a)));
      toast.success(`${field === "name" ? "Name" : "Emoji"} updated`);
    } else { toast.error("Failed to update"); }
    setInlineEdit(null);
  }

  async function handleAddAgent() {
    if (!addForm.id || !addForm.name) { toast.error("ID and name required"); return; }
    const res = await fetch("/api/agents", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "addAgent", ...addForm }),
    });
    if (res.ok) { toast.success("Agent added"); setShowAddForm(false); setAddForm({ id: "", name: "", emoji: "🤖", model: "claude-sonnet-4-6", workspace: "" }); fetchAgents(); }
    else { const d = await res.json(); toast.error(d.error || "Failed to add agent"); }
  }

  async function handleRemoveAgent(agentId: string, backup: boolean) {
    const res = await fetch("/api/agents", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "removeAgent", agentId, backup }),
    });
    if (res.ok) { toast.success(backup ? "Agent backed up and removed" : "Agent removed"); setRemoveConfirm(null); fetchAgents(); }
    else toast.error("Failed to remove agent");
  }

  async function loadAgentFiles(agentId: string) {
    setFileViewAgent(agentId);
    try {
      const res = await fetch(`/api/agent-files?agentId=${agentId}`);
      if (res.ok) { const data = await res.json(); setAgentFiles(data.files); }
    } catch { toast.error("Failed to load files"); }
  }

  async function loadFile(agentId: string, fileName: string) {
    const res = await fetch("/api/agent-files", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read", agentId, fileName }),
    });
    if (res.ok) { const data = await res.json(); setEditingFile({ name: data.name, content: data.content }); }
    else toast.error("Failed to read file");
  }

  async function saveFile(agentId: string) {
    if (!editingFile) return;
    const res = await fetch("/api/agent-files", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "write", agentId, fileName: editingFile.name, content: editingFile.content }),
    });
    if (res.ok) { toast.success("File saved"); setEditingFile(null); }
    else toast.error("Failed to save");
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="text-gray-400">Loading agents...</div></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Agents</h1>
        <button onClick={() => setShowAddForm(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
          + New Agent
        </button>
      </div>

      {/* Add Agent Form */}
      {showAddForm && (
        <div className="bg-gray-900 rounded-xl border border-blue-800 p-5 mb-6">
          <h2 className="font-semibold mb-4">Add New Agent</h2>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <input value={addForm.id} onChange={(e) => setAddForm((f) => ({ ...f, id: e.target.value.replace(/[^a-zA-Z0-9_-]/g, "") }))} placeholder="Agent ID (e.g. researcher)" className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500" />
            <input value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} placeholder="Display Name" className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500" />
            <input value={addForm.emoji} onChange={(e) => setAddForm((f) => ({ ...f, emoji: e.target.value }))} placeholder="Emoji" className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500" />
            <select value={addForm.model} onChange={(e) => setAddForm((f) => ({ ...f, model: e.target.value }))} className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500">
              {(() => {
                const configuredProviders = registryProviders.filter((p) => p.keyConfigured);
                if (configuredProviders.length > 0) {
                  return configuredProviders.map((p) => (
                    <optgroup key={p.id} label={p.name}>
                      {p.models.map((m) => {
                        const fullId = `${p.prefix}/${m.id}`;
                        return <option key={fullId} value={fullId}>{m.label}</option>;
                      })}
                    </optgroup>
                  ));
                }
                return registryModels.map((m) => <option key={m.fullId} value={m.fullId}>{m.label} ({m.providerName})</option>);
              })()}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAddAgent} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm">Create Agent</button>
            <button onClick={() => setShowAddForm(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* File Editor Modal */}
      {fileViewAgent && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => { setFileViewAgent(null); setEditingFile(null); }}>
          <div className="bg-gray-900 rounded-xl border border-gray-800 w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
              <h2 className="font-semibold">Agent Files: {fileViewAgent}</h2>
              <button onClick={() => { setFileViewAgent(null); setEditingFile(null); }} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {editingFile ? (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium">{editingFile.name}</span>
                    <div className="flex gap-2">
                      <button onClick={() => saveFile(fileViewAgent)} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs">Save</button>
                      <button onClick={() => setEditingFile(null)} className="px-3 py-1 bg-gray-700 text-gray-300 rounded text-xs">Cancel</button>
                    </div>
                  </div>
                  <textarea value={editingFile.content} onChange={(e) => setEditingFile((f) => f ? { ...f, content: e.target.value } : f)} className="w-full h-96 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-blue-500 resize-none" />
                </div>
              ) : (
                <div className="space-y-2">
                  {agentFiles.length === 0 ? (
                    <p className="text-gray-500 text-sm">No .md files found for this agent.</p>
                  ) : agentFiles.map((f) => (
                    <button key={f.name} onClick={() => loadFile(fileViewAgent, f.name)} className="w-full flex items-center justify-between px-4 py-3 bg-gray-800/50 hover:bg-gray-800 rounded-lg text-sm transition-colors">
                      <span className="font-medium">{f.name}</span>
                      <span className="text-xs text-gray-500">{(f.size / 1024).toFixed(1)} KB</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Remove Confirmation */}
      {removeConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setRemoveConfirm(null)}>
          <div className="bg-gray-900 rounded-xl border border-red-800 p-6 max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold text-red-400 mb-3">Remove Agent: {removeConfirm.id}</h2>
            <p className="text-sm text-gray-400 mb-4">This will remove the agent from the configuration. Choose how to handle the agent&apos;s files:</p>
            <div className="flex flex-col gap-2">
              <button onClick={() => handleRemoveAgent(removeConfirm.id, true)} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm">
                Backup files, then remove
              </button>
              <button onClick={() => handleRemoveAgent(removeConfirm.id, false)} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm">
                Delete completely (no backup)
              </button>
              <button onClick={() => setRemoveConfirm(null)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <div key={agent.id} className="bg-gray-900 rounded-xl border border-gray-800 p-5 hover:border-gray-700 transition-colors">
            <div className="flex items-center gap-3 mb-4">
              {/* Inline emoji editing */}
              {inlineEdit?.agentId === agent.id && inlineEdit.field === "emoji" ? (
                <input
                  value={inlineEdit.value}
                  onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleInlineSave(agent.id, "emoji", inlineEdit.value);
                    if (e.key === "Escape") setInlineEdit(null);
                  }}
                  onBlur={() => handleInlineSave(agent.id, "emoji", inlineEdit.value)}
                  className="w-12 text-center text-3xl bg-gray-800 border border-blue-500 rounded-lg focus:outline-none"
                  autoFocus
                />
              ) : (
                <span
                  className="text-3xl cursor-pointer hover:opacity-70 transition-opacity"
                  title="Click to edit emoji"
                  onClick={() => setInlineEdit({ agentId: agent.id, field: "emoji", value: agent.emoji })}
                >
                  {agent.emoji}
                </span>
              )}
              <div className="flex-1 min-w-0">
                {/* Inline name editing */}
                {inlineEdit?.agentId === agent.id && inlineEdit.field === "name" ? (
                  <input
                    value={inlineEdit.value}
                    onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleInlineSave(agent.id, "name", inlineEdit.value);
                      if (e.key === "Escape") setInlineEdit(null);
                    }}
                    onBlur={() => handleInlineSave(agent.id, "name", inlineEdit.value)}
                    className="w-full text-lg font-semibold bg-gray-800 border border-blue-500 rounded-lg px-2 py-0.5 text-white focus:outline-none"
                    autoFocus
                  />
                ) : (
                  <h2
                    className="font-semibold text-lg cursor-pointer hover:text-blue-400 transition-colors"
                    title="Click to edit name"
                    onClick={() => setInlineEdit({ agentId: agent.id, field: "name", value: agent.name })}
                  >
                    {agent.name}
                  </h2>
                )}
                <span className="text-xs text-gray-500">ID: {agent.id}</span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs ${agent.status === "active" ? "bg-green-900/50 text-green-400" : agent.status === "error" ? "bg-red-900/50 text-red-400" : "bg-gray-700 text-gray-400"}`}>
                {agent.status}
              </span>
            </div>

            {/* Agent Score */}
            {scores[agent.id] && (
              <div className="mb-3 px-3 py-2 bg-gray-800/50 rounded-lg">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-gray-400">Score</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${scores[agent.id].score >= 80 ? "text-green-400" : scores[agent.id].score >= 60 ? "text-yellow-400" : scores[agent.id].score >= 50 ? "text-orange-400" : "text-red-400"}`}>
                      {scores[agent.id].score}
                    </span>
                    <ScoreSparkline history={scores[agent.id].history} />
                    {scores[agent.id].streak !== 0 && (
                      <span className={`text-xs ${scores[agent.id].streak > 0 ? "text-green-500" : "text-red-500"}`}>
                        {scores[agent.id].streak > 0 ? "+" : ""}{scores[agent.id].streak} streak
                      </span>
                    )}
                  </div>
                </div>
                <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${scores[agent.id].score >= 80 ? "bg-green-500" : scores[agent.id].score >= 60 ? "bg-yellow-500" : scores[agent.id].score >= 50 ? "bg-orange-500" : "bg-red-500"}`}
                    style={{ width: `${scores[agent.id].score}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5 text-xs text-gray-500">
                  <span>{scores[agent.id].completed} done · {scores[agent.id].failed} failed</span>
                  {scores[agent.id].avg_cycles > 0 && <span>avg {scores[agent.id].avg_cycles} cycles</span>}
                </div>
              </div>
            )}

            {/* Model selector with dropdown indicator */}
            <div className="mb-3">
              <label className="text-xs text-gray-400 block mb-1">Model</label>
              <div className="relative">
                <select value={agent.model} onChange={(e) => handleModelChange(agent.id, e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 appearance-none cursor-pointer pr-8">
                  {(() => {
                    const configuredProviders = registryProviders.filter((p) => p.keyConfigured);
                    const currentProvider = getProviderForModel(agent.model);
                    const currentInConfigured = currentProvider?.keyConfigured;
                    // Show agent's current model even if its provider is unconfigured
                    if (!currentInConfigured && agent.model) {
                      const currentLabel = registryModels.find((m) => m.fullId === agent.model)?.label || agent.model;
                      return (
                        <>
                          <option value={agent.model}>{currentLabel} (no key)</option>
                          {configuredProviders.map((p) => (
                            <optgroup key={p.id} label={p.name}>
                              {p.models.map((m) => {
                                const fullId = `${p.prefix}/${m.id}`;
                                return <option key={fullId} value={fullId}>{m.label}</option>;
                              })}
                            </optgroup>
                          ))}
                        </>
                      );
                    }
                    if (configuredProviders.length > 0) {
                      return configuredProviders.map((p) => (
                        <optgroup key={p.id} label={p.name}>
                          {p.models.map((m) => {
                            const fullId = `${p.prefix}/${m.id}`;
                            return <option key={fullId} value={fullId}>{m.label}</option>;
                          })}
                        </optgroup>
                      ));
                    }
                    return registryModels.map((m) => <option key={m.fullId} value={m.fullId}>{m.label} ({m.providerName})</option>);
                  })()}
                </select>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-xs">▼</span>
              </div>
              {(() => {
                const currentProvider = getProviderForModel(agent.model);
                if (currentProvider && !currentProvider.keyConfigured) {
                  return (
                    <a href="/models" className="text-xs text-amber-400 hover:text-amber-300 mt-1 inline-block">
                      No API key for {currentProvider.name}. Configure key &rarr;
                    </a>
                  );
                }
                return null;
              })()}
            </div>

            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Workspace</span>
                <span className="text-gray-200 text-xs truncate max-w-[60%]">{agent.workspace}</span>
              </div>
            </div>

            {editingAgent === agent.id ? (
              <div className="space-y-2 mt-3 pt-3 border-t border-gray-800">
                <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} placeholder="Name" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500" />
                <input value={editForm.emoji} onChange={(e) => setEditForm((f) => ({ ...f, emoji: e.target.value }))} placeholder="Emoji" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500" />
                <input value={editForm.workspace} onChange={(e) => setEditForm((f) => ({ ...f, workspace: e.target.value }))} placeholder="Workspace path" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500" />
                <div className="flex gap-2">
                  <button onClick={() => handleUpdate(agent.id)} className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg">Save</button>
                  <button onClick={() => setEditingAgent(null)} className="flex-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-800">
                <button onClick={() => { setEditingAgent(agent.id); setEditForm({ name: agent.name, emoji: agent.emoji, workspace: agent.workspace }); }} className="flex-1 px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">Edit All</button>
                <button onClick={() => loadAgentFiles(agent.id)} className="flex-1 px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">Files</button>
                <button onClick={() => handleRestart(agent.id)} className="flex-1 px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">Restart</button>
                <button onClick={() => setRemoveConfirm({ id: agent.id, step: "confirm" })} className="px-3 py-1.5 text-xs text-red-400 hover:bg-red-900/50 rounded-lg transition-colors">Remove</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
