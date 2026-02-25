import { getMemoryStatus } from "@/lib/data";

export const dynamic = "force-dynamic";

export default function MemoryPage() {
  const statuses = getMemoryStatus();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Memory</h1>

      {statuses.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
          <p className="text-gray-400 mb-2">No memory data available.</p>
          <p className="text-sm text-gray-500">
            Run <code className="bg-gray-800 px-2 py-0.5 rounded">openclaw memory index</code> to index agent memories.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {statuses.map((mem) => (
            <div
              key={mem.agent}
              className="bg-gray-900 rounded-xl border border-gray-800 p-5"
            >
              <h2 className="font-semibold text-lg mb-4">{mem.agent}</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Indexed Files</span>
                  <span className="font-mono">{mem.files}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Chunks</span>
                  <span className="font-mono">{mem.chunks}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Full-Text Search</span>
                  <StatusIndicator status={mem.fts} />
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Vector Search</span>
                  <StatusIndicator status={mem.vector} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusIndicator({ status }: { status: string }) {
  const isActive = status === "ready" || status === "active" || status === "enabled";
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs ${
        isActive
          ? "bg-green-900/50 text-green-400"
          : "bg-gray-700 text-gray-400"
      }`}
    >
      {status}
    </span>
  );
}
