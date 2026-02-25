import { getSessions } from "@/lib/data";

export const dynamic = "force-dynamic";

export default function SessionsPage() {
  const sessions = getSessions();
  const activeAgents = new Set(sessions.map((s) => s.agentId)).size;
  const recent = sessions.filter(
    (s) => Date.now() - s.updatedAt < 24 * 60 * 60 * 1000
  ).length;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Sessions</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatCard label="Total Sessions" value={sessions.length} />
        <StatCard label="Active Agents" value={activeAgents} />
        <StatCard label="Last 24h" value={recent} />
      </div>

      {sessions.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center text-gray-500">
          No sessions recorded yet. Sessions appear once agents start
          processing tasks.
        </div>
      ) : (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-left">
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Session ID</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3 text-right">Tokens</th>
                <th className="px-4 py-3">Kind</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr
                  key={s.sessionId}
                  className="border-b border-gray-800/50 hover:bg-gray-800/30"
                >
                  <td className="px-4 py-3 font-medium">{s.agentId}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">
                    {s.sessionId.slice(0, 12)}...
                  </td>
                  <td className="px-4 py-3 text-gray-300">{s.model}</td>
                  <td className="px-4 py-3 text-gray-400">
                    {s.updatedAt
                      ? new Date(s.updatedAt).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300">
                    {s.totalTokens.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-700 text-gray-300">
                      {s.kind}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <div className="text-sm text-gray-400 mb-1">{label}</div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}
