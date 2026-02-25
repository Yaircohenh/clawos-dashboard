import { getHealthStatus } from "@/lib/data";

export const dynamic = "force-dynamic";

export default function HealthPage() {
  const health = getHealthStatus();

  const criticalCount = health.checks.filter((c) => c.level === "critical").length;
  const warnCount = health.checks.filter((c) => c.level === "warn").length;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">System Health</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Gateway</span>
            <span className="text-2xl">{health.gatewayHealthy ? "🟢" : "🔴"}</span>
          </div>
          <div className="text-2xl font-bold">
            {health.gatewayHealthy ? "Healthy" : "Down"}
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Critical Issues</span>
            <span className="text-2xl">{criticalCount > 0 ? "🔴" : "🟢"}</span>
          </div>
          <div className="text-2xl font-bold">{criticalCount}</div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Warnings</span>
            <span className="text-2xl">{warnCount > 0 ? "🟡" : "🟢"}</span>
          </div>
          <div className="text-2xl font-bold">{warnCount}</div>
        </div>
      </div>

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
              <span className="font-mono text-xs uppercase min-w-[60px]">
                {check.level}
              </span>
              <span>{check.message}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <h2 className="text-lg font-semibold mb-4">Disk Usage</h2>
          <pre className="text-sm text-gray-400 bg-gray-800/50 p-4 rounded-lg font-mono">
            {health.disk}
          </pre>
        </section>
        <section className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <h2 className="text-lg font-semibold mb-4">Memory Usage</h2>
          <pre className="text-sm text-gray-400 bg-gray-800/50 p-4 rounded-lg font-mono">
            {health.memory}
          </pre>
        </section>
      </div>
    </div>
  );
}
