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

const AVAILABLE_MODELS = [
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "claude-haiku-4-5-20251001",
  "grok-4-1-fast",
];

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    emoji: "",
    workspace: "",
  });

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/monitor");
      if (res.ok) {
        const data = await res.json();
        setAgents(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data.agents.map((a: any) => ({
            id: a.agentId || a.id,
            name: a.name,
            emoji: a.emoji,
            model: a.model,
            workspace: a.workspace || "~/.openclaw/workspace",
            status: a.status,
          }))
        );
      }
    } catch {
      // fallback: try the server data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  async function handleModelChange(agentId: string, model: string) {
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setModel", agentId, model }),
      });

      if (res.ok) {
        setAgents((prev) =>
          prev.map((a) => (a.id === agentId ? { ...a, model } : a))
        );
        toast.success(`Model updated to ${model}`);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update model");
      }
    } catch {
      toast.error("Connection error");
    }
  }

  async function handleRestart(agentId: string) {
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restart", agentId }),
      });

      if (res.ok) {
        toast.success(`Agent ${agentId} restart triggered`);
      } else {
        toast.error("Failed to restart agent");
      }
    } catch {
      toast.error("Connection error");
    }
  }

  async function handleUpdate(agentId: string) {
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          agentId,
          ...editForm,
        }),
      });

      if (res.ok) {
        toast.success("Agent updated");
        setEditingAgent(null);
        fetchAgents();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update agent");
      }
    } catch {
      toast.error("Connection error");
    }
  }

  function startEdit(agent: Agent) {
    setEditingAgent(agent.id);
    setEditForm({
      name: agent.name,
      emoji: agent.emoji,
      workspace: agent.workspace,
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading agents...</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Agents</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="bg-gray-900 rounded-xl border border-gray-800 p-5 hover:border-gray-700 transition-colors"
          >
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">{agent.emoji}</span>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-lg">{agent.name}</h2>
                <span className="text-xs text-gray-500">ID: {agent.id}</span>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-xs ${
                  agent.status === "active"
                    ? "bg-green-900/50 text-green-400"
                    : agent.status === "error"
                      ? "bg-red-900/50 text-red-400"
                      : "bg-gray-700 text-gray-400"
                }`}
              >
                {agent.status}
              </span>
            </div>

            {/* Model selector */}
            <div className="mb-3">
              <label className="text-xs text-gray-400 block mb-1">Model</label>
              <select
                value={agent.model}
                onChange={(e) => handleModelChange(agent.id, e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 appearance-none cursor-pointer"
              >
                {AVAILABLE_MODELS.includes(agent.model) ? null : (
                  <option value={agent.model}>{agent.model}</option>
                )}
                {AVAILABLE_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 text-sm mb-4">
              <InfoRow label="Workspace" value={agent.workspace} />
            </div>

            {/* Edit form */}
            {editingAgent === agent.id ? (
              <div className="space-y-2 mt-3 pt-3 border-t border-gray-800">
                <input
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="Name"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                />
                <input
                  value={editForm.emoji}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, emoji: e.target.value }))
                  }
                  placeholder="Emoji"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                />
                <input
                  value={editForm.workspace}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, workspace: e.target.value }))
                  }
                  placeholder="Workspace path"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleUpdate(agent.id)}
                    className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingAgent(null)}
                    className="flex-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 mt-3 pt-3 border-t border-gray-800">
                <button
                  onClick={() => startEdit(agent)}
                  className="flex-1 px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleRestart(agent.id)}
                  className="flex-1 px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Restart
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-200 text-xs truncate max-w-[60%]">
        {value}
      </span>
    </div>
  );
}
