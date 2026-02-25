import { getAgents } from "@/lib/data";

export const dynamic = "force-dynamic";

export default function AgentsPage() {
  const agents = getAgents();

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
              <div>
                <h2 className="font-semibold text-lg">{agent.name}</h2>
                <span className="text-xs text-gray-500">ID: {agent.id}</span>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <InfoRow label="Model" value={agent.model} />
              <InfoRow label="Workspace" value={agent.workspace} />
              <InfoRow
                label="Status"
                value={
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
                }
              />
            </div>
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
      <span className="text-gray-200">{value}</span>
    </div>
  );
}
