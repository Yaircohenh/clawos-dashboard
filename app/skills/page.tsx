import { getSkills, getHubSkills } from "@/lib/data";

export const dynamic = "force-dynamic";

export default function SkillsPage() {
  const skills = getSkills();
  const ready = skills.filter((s) => s.eligible);
  const missing = skills.filter(
    (s) => !s.eligible && !s.disabled && hasMissing(s)
  );
  const disabled = skills.filter((s) => s.disabled);
  const hubSkills = getHubSkills(12);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Skills</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total" value={skills.length} />
        <StatCard label="Ready" value={ready.length} color="green" />
        <StatCard
          label="Missing Requirements"
          value={missing.length}
          color="yellow"
        />
        <StatCard label="Disabled" value={disabled.length} color="gray" />
      </div>

      {/* Ready Skills */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Ready Skills</h2>
        {ready.length === 0 ? (
          <p className="text-gray-500 text-sm">No skills ready.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {ready.map((s) => (
              <div
                key={s.name}
                className="bg-gray-900 rounded-xl border border-green-900/50 p-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{s.emoji}</span>
                  <span className="font-medium">{s.name}</span>
                  <span className="ml-auto px-2 py-0.5 rounded-full text-xs bg-green-900/50 text-green-400">
                    ready
                  </span>
                </div>
                <p className="text-xs text-gray-400 line-clamp-2">
                  {s.description}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Missing Requirements */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Missing Requirements</h2>
        {missing.length === 0 ? (
          <p className="text-gray-500 text-sm">
            All eligible skills have requirements met.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {missing.map((s) => (
              <div
                key={s.name}
                className="bg-gray-900 rounded-xl border border-yellow-900/50 p-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{s.emoji}</span>
                  <span className="font-medium">{s.name}</span>
                  <span className="ml-auto px-2 py-0.5 rounded-full text-xs bg-yellow-900/50 text-yellow-400">
                    missing
                  </span>
                </div>
                <p className="text-xs text-gray-400 line-clamp-2 mb-2">
                  {s.description}
                </p>
                <div className="flex flex-wrap gap-1">
                  {s.missing.bins.map((b) => (
                    <Tag key={b} label={`bin: ${b}`} color="red" />
                  ))}
                  {s.missing.env.map((e) => (
                    <Tag key={e} label={`env: ${e}`} color="blue" />
                  ))}
                  {s.missing.config.map((c) => (
                    <Tag key={c} label={`config: ${c}`} color="purple" />
                  ))}
                  {s.missing.os.map((o) => (
                    <Tag key={o} label={`os: ${o}`} color="orange" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ClawHub Discovery */}
      <section>
        <h2 className="text-lg font-semibold mb-4">
          Discover from ClawHub
        </h2>
        {hubSkills.length === 0 ? (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-center text-gray-500 text-sm">
            ClawHub not available. Install with{" "}
            <code className="bg-gray-800 px-1.5 py-0.5 rounded">
              npm install -g clawhub
            </code>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {hubSkills.map((s) => (
              <div
                key={s.slug}
                className="bg-gray-900 rounded-xl border border-gray-800 p-4 hover:border-gray-700 transition-colors"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium">{s.name}</span>
                  {s.version && (
                    <span className="text-xs text-gray-500">v{s.version}</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 line-clamp-2 mb-3">
                  {s.summary}
                </p>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{s.downloads.toLocaleString()} downloads</span>
                  <code className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-400">
                    clawhub install {s.slug}
                  </code>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
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
    yellow: "text-yellow-400",
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

function Tag({ label, color }: { label: string; color: string }) {
  const colors: Record<string, string> = {
    red: "bg-red-900/40 text-red-400",
    blue: "bg-blue-900/40 text-blue-400",
    purple: "bg-purple-900/40 text-purple-400",
    orange: "bg-orange-900/40 text-orange-400",
  };
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-xs ${colors[color] || "bg-gray-800 text-gray-400"}`}
    >
      {label}
    </span>
  );
}

function hasMissing(s: { missing: { bins: string[]; env: string[]; config: string[]; os: string[] } }) {
  return (
    s.missing.bins.length > 0 ||
    s.missing.env.length > 0 ||
    s.missing.config.length > 0 ||
    s.missing.os.length > 0
  );
}
