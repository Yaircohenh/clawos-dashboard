"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface AgentLine {
  type: string;
  text: string;
  timestamp?: string;
}

interface AgentActivity {
  agentId: string;
  name: string;
  emoji: string;
  model: string;
  status: "active" | "idle" | "offline";
  lines: AgentLine[];
}

type LayoutMode = "grid" | "list";
type FilterMode = "all" | "active" | "idle";

export default function MonitorPage() {
  const [agents, setAgents] = useState<AgentActivity[]>([]);
  const [layout, setLayout] = useState<LayoutMode>("grid");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [fullScreen, setFullScreen] = useState<string | null>(null);
  const [paused, setPaused] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/monitor");
      if (res.ok) {
        const data = await res.json();
        setAgents((prev) => {
          // Only update agents that aren't paused
          return (data.agents as AgentActivity[]).map((a: AgentActivity) => {
            if (pausedRef.current.has(a.agentId)) {
              const existing = prev.find((p) => p.agentId === a.agentId);
              return existing || a;
            }
            return a;
          });
        });
      }
    } catch {
      // silently retry
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, 3000);
    return () => clearInterval(interval);
  }, [fetchAgents]);

  const togglePause = (id: string) => {
    setPaused((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const filteredAgents = agents.filter((a) => {
    if (filter === "active") return a.status === "active";
    if (filter === "idle") return a.status === "idle";
    return true;
  });

  const fullScreenAgent = fullScreen
    ? agents.find((a) => a.agentId === fullScreen)
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading agent monitor...</div>
      </div>
    );
  }

  if (fullScreenAgent) {
    return (
      <div className="fixed inset-0 bg-gray-950 z-50 flex flex-col">
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{fullScreenAgent.emoji}</span>
            <span className="font-semibold text-lg">{fullScreenAgent.name}</span>
            <StatusDot status={fullScreenAgent.status} />
            <span className="text-xs px-2 py-0.5 bg-gray-800 rounded-full text-gray-400">
              {fullScreenAgent.model}
            </span>
          </div>
          <button
            onClick={() => setFullScreen(null)}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"
          >
            Exit Full Screen
          </button>
        </div>
        <TerminalOutput lines={fullScreenAgent.lines} maxHeight="calc(100vh - 60px)" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Agent Monitor</h1>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-800 rounded-lg overflow-hidden text-sm">
            {(["all", "active", "idle"] as FilterMode[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 capitalize ${
                  filter === f
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="flex bg-gray-800 rounded-lg overflow-hidden text-sm">
            <button
              onClick={() => setLayout("grid")}
              className={`px-3 py-1.5 ${
                layout === "grid"
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Grid
            </button>
            <button
              onClick={() => setLayout("list")}
              className={`px-3 py-1.5 ${
                layout === "list"
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              List
            </button>
          </div>
        </div>
      </div>

      {filteredAgents.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center text-gray-500">
          No agents match the current filter.
        </div>
      ) : (
        <div
          className={
            layout === "grid"
              ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
              : "space-y-4"
          }
        >
          {filteredAgents.map((agent) => (
            <div
              key={agent.agentId}
              className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-800/50">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{agent.emoji}</span>
                  <span className="font-medium text-sm">{agent.name}</span>
                  <StatusDot status={agent.status} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 bg-gray-700 rounded-full text-gray-400">
                    {agent.model}
                  </span>
                  <button
                    onClick={() => togglePause(agent.agentId)}
                    className={`text-xs px-2 py-1 rounded ${
                      paused.has(agent.agentId)
                        ? "bg-yellow-900/50 text-yellow-400"
                        : "text-gray-500 hover:text-white hover:bg-gray-700"
                    }`}
                    title={paused.has(agent.agentId) ? "Resume" : "Pause"}
                  >
                    {paused.has(agent.agentId) ? "▶" : "⏸"}
                  </button>
                  <button
                    onClick={() => setFullScreen(agent.agentId)}
                    className="text-xs px-2 py-1 text-gray-500 hover:text-white hover:bg-gray-700 rounded"
                    title="Full Screen"
                  >
                    ⛶
                  </button>
                </div>
              </div>

              {/* Terminal */}
              <TerminalOutput
                lines={agent.lines}
                maxHeight={layout === "list" ? "200px" : "250px"}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: "active" | "idle" | "offline" }) {
  const colors = {
    active: "bg-green-400",
    idle: "bg-yellow-400",
    offline: "bg-gray-500",
  };
  return (
    <span className="flex items-center gap-1.5 text-xs text-gray-400">
      <span className={`w-2 h-2 rounded-full ${colors[status]}`} />
      {status}
    </span>
  );
}

function TerminalOutput({
  lines,
  maxHeight,
}: {
  lines: AgentLine[];
  maxHeight: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines]);

  const typeColors: Record<string, string> = {
    tool: "text-blue-400",
    response: "text-green-400",
    user: "text-yellow-400",
    error: "text-red-400",
  };

  return (
    <div
      ref={containerRef}
      className="bg-gray-950 p-3 font-mono text-xs overflow-y-auto"
      style={{ maxHeight }}
    >
      {lines.length === 0 ? (
        <div className="text-gray-600 text-center py-4">No activity</div>
      ) : (
        lines.map((line, i) => (
          <div key={i} className={`py-0.5 ${typeColors[line.type] || "text-gray-400"}`}>
            <span className="text-gray-600 mr-2">
              {line.type === "tool"
                ? ">"
                : line.type === "user"
                  ? "$"
                  : line.type === "error"
                    ? "!"
                    : " "}
            </span>
            <span className="break-all">{line.text}</span>
          </div>
        ))
      )}
    </div>
  );
}
