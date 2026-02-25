import { getAgents, getChannels, getSystemStatus } from "@/lib/data";

export const dynamic = "force-dynamic";

export default function OverviewPage() {
  const agents = getAgents();
  const channels = getChannels();
  const system = getSystemStatus();

  const activeAgents = agents.filter((a) => a.status === "active").length;
  const enabledChannels = channels.filter((c) => c.enabled).length;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard Overview</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Agents"
          value={agents.length}
          sub={`${activeAgents} active`}
          icon="🤖"
        />
        <StatCard
          label="Channels"
          value={channels.length}
          sub={`${enabledChannels} enabled`}
          icon="📡"
        />
        <StatCard
          label="Gateway"
          value={system.gateway === "healthy" ? "Healthy" : "Down"}
          sub={system.version}
          icon={system.gateway === "healthy" ? "🟢" : "🔴"}
        />
        <StatCard label="Security" value="0 Critical" sub="Policy active" icon="🛡️" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <h2 className="text-lg font-semibold mb-4">Agent Roster</h2>
          <div className="space-y-2">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-800/50"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{agent.emoji}</span>
                  <div>
                    <div className="font-medium text-sm">{agent.name}</div>
                    <div className="text-xs text-gray-500">{agent.model}</div>
                  </div>
                </div>
                <StatusBadge status={agent.status} />
              </div>
            ))}
          </div>
        </section>

        <section className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <h2 className="text-lg font-semibold mb-4">Connected Channels</h2>
          {channels.length === 0 ? (
            <p className="text-gray-500 text-sm">No channels configured yet.</p>
          ) : (
            <div className="space-y-2">
              {channels.map((ch) => (
                <div
                  key={ch.name}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-800/50"
                >
                  <span className="text-sm font-medium">{ch.name}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      ch.enabled
                        ? "bg-green-900/50 text-green-400"
                        : "bg-gray-700 text-gray-400"
                    }`}
                  >
                    {ch.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: string;
}) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-400">{label}</span>
        <span className="text-2xl">{icon}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{sub}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-green-900/50 text-green-400",
    idle: "bg-gray-700 text-gray-400",
    error: "bg-red-900/50 text-red-400",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full ${colors[status] || colors.idle}`}
    >
      {status}
    </span>
  );
}
