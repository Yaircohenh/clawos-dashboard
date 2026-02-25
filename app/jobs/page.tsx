import { getCronJobs } from "@/lib/data";

export const dynamic = "force-dynamic";

export default function JobsPage() {
  const jobs = getCronJobs();
  const enabled = jobs.filter((j) => j.enabled);
  const disabled = jobs.filter((j) => !j.enabled);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Cron Jobs</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatCard label="Total Jobs" value={jobs.length} />
        <StatCard label="Enabled" value={enabled.length} color="green" />
        <StatCard label="Disabled" value={disabled.length} color="gray" />
      </div>

      {jobs.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center text-gray-500">
          No cron jobs configured. Add jobs with{" "}
          <code className="bg-gray-800 px-1.5 py-0.5 rounded">
            openclaw cron add
          </code>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((j) => (
            <div
              key={j.id}
              className="bg-gray-900 rounded-xl border border-gray-800 p-5 hover:border-gray-700 transition-colors"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="font-medium text-base">{j.name}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs ${
                    j.enabled
                      ? "bg-green-900/50 text-green-400"
                      : "bg-gray-700 text-gray-400"
                  }`}
                >
                  {j.enabled ? "enabled" : "disabled"}
                </span>
                <span className="ml-auto text-xs text-gray-500">
                  Agent: <span className="text-gray-300">{j.agent}</span>
                </span>
              </div>
              <div className="flex items-center gap-6 text-sm mb-3">
                <div>
                  <span className="text-gray-500">Schedule: </span>
                  <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs text-gray-300">
                    {j.schedule}
                  </code>
                </div>
                {j.lastRun && (
                  <div>
                    <span className="text-gray-500">Last: </span>
                    <span className="text-gray-400">{j.lastRun}</span>
                  </div>
                )}
                {j.nextRun && (
                  <div>
                    <span className="text-gray-500">Next: </span>
                    <span className="text-gray-400">{j.nextRun}</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-400 line-clamp-2">{j.task}</p>
            </div>
          ))}
        </div>
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
  color?: string;
}) {
  const colorMap: Record<string, string> = {
    green: "text-green-400",
    gray: "text-gray-400",
  };
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <div className="text-sm text-gray-400 mb-1">{label}</div>
      <div className={`text-3xl font-bold ${colorMap[color || ""] || ""}`}>
        {value}
      </div>
    </div>
  );
}
