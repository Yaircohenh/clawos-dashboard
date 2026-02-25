"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  source: string;
}

export default function LogsPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    fetchLogs();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  async function fetchLogs() {
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (sourceFilter) params.set("source", sourceFilter);
      const res = await fetch(`/api/logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
      }
    } catch {
      toast.error("Failed to load logs");
    } finally {
      setLoading(false);
    }
  }

  // Get unique sources and levels for filters
  const sources = [...new Set(entries.map(e => e.source))].filter(Boolean);
  const levels = [...new Set(entries.map(e => e.level))].filter(Boolean);

  const filtered = entries.filter(e => {
    if (levelFilter && e.level !== levelFilter) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading logs...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Logs</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 rounded-lg text-xs ${
              autoRefresh
                ? "bg-green-900/50 text-green-400 border border-green-800"
                : "bg-gray-800 text-gray-400"
            }`}
          >
            {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
          </button>
          <button
            onClick={() => { setLoading(true); fetchLogs(); }}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative">
          <select
            value={sourceFilter}
            onChange={e => { setSourceFilter(e.target.value); }}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 appearance-none pr-8"
          >
            <option value="">All Sources</option>
            {sources.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs pointer-events-none">▼</span>
        </div>
        <div className="relative">
          <select
            value={levelFilter}
            onChange={e => setLevelFilter(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 appearance-none pr-8"
          >
            <option value="">All Levels</option>
            {levels.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs pointer-events-none">▼</span>
        </div>
        <span className="text-sm text-gray-500 self-center ml-2">
          {filtered.length} entries
        </span>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="mb-2">No log entries found.</p>
            <p className="text-sm">
              Logs appear here from gateway activity and agent sessions.
              Try running a chat with Tom to generate some activity.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800/50 max-h-[600px] overflow-y-auto">
            {filtered.map((entry, i) => (
              <div key={i} className="px-4 py-2 text-sm hover:bg-gray-800/30 flex gap-4">
                <span className="text-gray-500 font-mono text-xs whitespace-nowrap min-w-[160px]">
                  {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : "—"}
                </span>
                <LevelBadge level={entry.level} />
                <span className="text-xs text-gray-600 min-w-[60px]">{entry.source}</span>
                <span className="text-gray-300 break-all">{entry.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LevelBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    error: "text-red-400",
    warn: "text-yellow-400",
    info: "text-blue-400",
    debug: "text-gray-500",
  };
  return (
    <span className={`font-mono text-xs uppercase min-w-[40px] ${colors[level] || colors.info}`}>
      {level}
    </span>
  );
}
