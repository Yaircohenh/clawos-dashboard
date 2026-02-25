import { getPlugins } from "@/lib/data";

export const dynamic = "force-dynamic";

export default function PluginsPage() {
  const plugins = getPlugins();
  const loaded = plugins.filter((p) => p.status === "loaded");
  const disabled = plugins.filter((p) => p.status === "disabled");
  const errors = plugins.filter((p) => p.status === "error");

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Plugins</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatCard label="Loaded" value={loaded.length} color="green" />
        <StatCard label="Disabled" value={disabled.length} color="gray" />
        <StatCard label="Errors" value={errors.length} color="red" />
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-left">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Version</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Tools</th>
              <th className="px-4 py-3">Origin</th>
            </tr>
          </thead>
          <tbody>
            {plugins.map((p) => (
              <tr
                key={p.id}
                className="border-b border-gray-800/50 hover:bg-gray-800/30"
              >
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-400">
                  {p.id}
                </td>
                <td className="px-4 py-3 text-gray-400">
                  {p.version || "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs ${
                      p.status === "loaded"
                        ? "bg-green-900/50 text-green-400"
                        : p.status === "error"
                          ? "bg-red-900/50 text-red-400"
                          : "bg-gray-700 text-gray-400"
                    }`}
                  >
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-gray-300">
                  {p.toolNames.length}
                </td>
                <td className="px-4 py-3 text-gray-400">{p.origin}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Error details */}
      {errors.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold mb-4">Plugin Errors</h2>
          <div className="space-y-3">
            {errors.map((p) => (
              <div
                key={p.id}
                className="bg-gray-900 rounded-xl border border-red-900/50 p-4"
              >
                <div className="font-medium text-red-400 mb-1">{p.name}</div>
                <pre className="text-xs text-gray-400 bg-gray-800/50 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">
                  {p.error || "Unknown error"}
                </pre>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    green: "text-green-400",
    red: "text-red-400",
    gray: "text-gray-400",
  };
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <div className="text-sm text-gray-400 mb-1">{label}</div>
      <div className={`text-3xl font-bold ${colorMap[color] || ""}`}>
        {value}
      </div>
    </div>
  );
}
