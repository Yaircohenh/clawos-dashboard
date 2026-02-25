import { getAgents, getSystemStatus } from "@/lib/data";

export function StatusBar() {
  let agentCount = 0;
  let gatewayStatus = "unknown";

  try {
    const agents = getAgents();
    agentCount = agents.length;
  } catch {
    // ignore
  }

  try {
    const system = getSystemStatus();
    gatewayStatus = system.gateway;
  } catch {
    // ignore
  }

  return (
    <div className="flex items-center gap-4 px-6 py-2 border-b border-gray-800 bg-gray-900/30 text-xs text-gray-400">
      <div className="flex items-center gap-1.5">
        <span className="text-gray-500">Agents:</span>
        <span className="text-gray-300 font-medium">{agentCount}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            gatewayStatus === "healthy" ? "bg-green-400" : "bg-red-400"
          }`}
        />
        <span className="text-gray-500">Gateway:</span>
        <span
          className={
            gatewayStatus === "healthy" ? "text-green-400" : "text-red-400"
          }
        >
          {gatewayStatus === "healthy" ? "online" : "offline"}
        </span>
      </div>
    </div>
  );
}
