"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

interface DoctorCheck {
  level: "critical" | "warn" | "info" | "ok";
  id: string;
  message: string;
}

interface HealthData {
  gatewayHealthy: boolean;
  checks: DoctorCheck[];
  disk: string;
  memory: string;
}

export default function HealthPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  // Report sections toggles
  const [showGateway, setShowGateway] = useState(true);
  const [showChecks, setShowChecks] = useState(true);
  const [showDisk, setShowDisk] = useState(true);
  const [showMemory, setShowMemory] = useState(true);

  useEffect(() => {
    fetchHealth();
  }, []);

  async function fetchHealth() {
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        setHealth(await res.json());
      }
    } catch {
      toast.error("Failed to load health data");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading health data...</div>
      </div>
    );
  }

  if (!health) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center text-gray-500">
        Unable to load health data. Is the gateway running?
      </div>
    );
  }

  const criticalCount = health.checks.filter(c => c.level === "critical").length;
  const warnCount = health.checks.filter(c => c.level === "warn").length;

  // Parse disk info
  const diskParts = health.disk.trim().split(/\s+/);
  const diskUsed = diskParts.length >= 3 ? diskParts[2] : "N/A";
  const diskAvail = diskParts.length >= 4 ? diskParts[3] : "N/A";
  const diskPercent = diskParts.length >= 5 ? diskParts[4] : "N/A";

  // Parse memory info
  const memParts = health.memory.trim().split(/\s+/);
  const memTotal = memParts.length >= 2 ? `${memParts[1]} MB` : "N/A";
  const memUsed = memParts.length >= 3 ? `${memParts[2]} MB` : "N/A";
  const memFree = memParts.length >= 4 ? `${memParts[3]} MB` : "N/A";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">System Health</h1>
        <button
          onClick={() => { setLoading(true); fetchHealth(); }}
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm"
        >
          Refresh
        </button>
      </div>

      {/* Report Configuration */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-6">
        <div className="text-sm font-medium text-gray-400 mb-2">Report Sections</div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Gateway Status", value: showGateway, set: setShowGateway },
            { label: "Doctor Checks", value: showChecks, set: setShowChecks },
            { label: "Disk Usage", value: showDisk, set: setShowDisk },
            { label: "Memory Usage", value: showMemory, set: setShowMemory },
          ].map(s => (
            <button
              key={s.label}
              onClick={() => s.set(!s.value)}
              className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                s.value
                  ? "bg-blue-900/50 text-blue-400 border border-blue-800"
                  : "bg-gray-800 text-gray-500 border border-gray-700"
              }`}
            >
              {s.value ? "✓ " : ""}{s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Gateway</span>
            <span className="text-2xl">{health.gatewayHealthy ? "🟢" : "🔴"}</span>
          </div>
          <div className="text-2xl font-bold">{health.gatewayHealthy ? "Healthy" : "Down"}</div>
          <div className="text-xs text-gray-500 mt-1">status</div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Critical Issues</span>
            <span className="text-2xl">{criticalCount > 0 ? "🔴" : "🟢"}</span>
          </div>
          <div className="text-2xl font-bold">{criticalCount}</div>
          <div className="text-xs text-gray-500 mt-1">issues</div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Warnings</span>
            <span className="text-2xl">{warnCount > 0 ? "🟡" : "🟢"}</span>
          </div>
          <div className="text-2xl font-bold">{warnCount}</div>
          <div className="text-xs text-gray-500 mt-1">warnings</div>
        </div>
      </div>

      {/* Doctor Checks */}
      {showChecks && (
        <section className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-6">
          <h2 className="text-lg font-semibold mb-4">Doctor Checks</h2>
          <div className="space-y-2">
            {health.checks.map((check, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 p-3 rounded-lg text-sm ${
                  check.level === "critical"
                    ? "bg-red-900/30 text-red-400"
                    : check.level === "warn"
                      ? "bg-yellow-900/30 text-yellow-400"
                      : check.level === "ok"
                        ? "bg-green-900/20 text-green-400"
                        : "bg-gray-800/50 text-gray-400"
                }`}
              >
                <span className="font-mono text-xs uppercase min-w-[60px]">{check.level}</span>
                <span>{check.message}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Disk Usage */}
        {showDisk && (
          <section className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <h2 className="text-lg font-semibold mb-4">Disk Usage</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Used</span>
                <span className="font-mono">{diskUsed}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Available</span>
                <span className="font-mono">{diskAvail}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Usage</span>
                <span className="font-mono">{diskPercent}</span>
              </div>
            </div>
            <pre className="text-xs text-gray-500 bg-gray-800/50 p-3 rounded-lg font-mono mt-3">{health.disk}</pre>
          </section>
        )}

        {/* Memory Usage */}
        {showMemory && (
          <section className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <h2 className="text-lg font-semibold mb-4">Memory Usage</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Total</span>
                <span className="font-mono">{memTotal}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Used</span>
                <span className="font-mono">{memUsed}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Free</span>
                <span className="font-mono">{memFree}</span>
              </div>
            </div>
            <pre className="text-xs text-gray-500 bg-gray-800/50 p-3 rounded-lg font-mono mt-3">{health.memory}</pre>
          </section>
        )}
      </div>
    </div>
  );
}
