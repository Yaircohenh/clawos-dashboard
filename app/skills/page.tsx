"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

interface Skill {
  name: string;
  description: string;
  emoji: string;
  eligible: boolean;
  disabled: boolean;
  source: string;
  bundled: boolean;
  missing: { bins: string[]; anyBins: string[]; env: string[]; config: string[]; os: string[] };
}

interface HubSkill {
  slug: string;
  name: string;
  summary: string;
  version: string;
  downloads: number;
  author: string;
}

const REQUIREMENT_LINKS: Record<string, string> = {
  OPENAI_API_KEY: "https://platform.openai.com/api-keys",
  ANTHROPIC_API_KEY: "https://console.anthropic.com/settings/keys",
  GITHUB_TOKEN: "https://github.com/settings/tokens",
  XAI_API_KEY: "https://console.x.ai/",
  gh: "https://cli.github.com/",
  docker: "https://docs.docker.com/get-docker/",
  python3: "https://www.python.org/downloads/",
  node: "https://nodejs.org/",
};

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<HubSkill[]>([]);
  const [searching, setSearching] = useState(false);
  const [installWarning, setInstallWarning] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);

  useEffect(() => {
    fetchSkills();
  }, []);

  async function fetchSkills() {
    try {
      const res = await fetch("/api/skills");
      if (res.ok) {
        const data = await res.json();
        setSkills(data.skills || []);
      }
    } catch {
      toast.error("Failed to load skills");
    } finally {
      setLoading(false);
    }
  }

  async function searchHub() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "search", query: searchQuery }),
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
        if ((data.results || []).length === 0) toast("No results found");
      }
    } catch {
      toast.error("Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function installSkill(slug: string) {
    setInstallWarning(null);
    setActionLoading(slug);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "install", slug }),
      });
      if (res.ok) {
        toast.success(`Installed ${slug}`);
        fetchSkills();
      } else {
        toast.error("Install failed");
      }
    } catch {
      toast.error("Install failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function toggleSkill(name: string, enable: boolean) {
    setActionLoading(name);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: enable ? "enable" : "disable", name }),
      });
      if (res.ok) {
        toast.success(`Skill ${enable ? "enabled" : "disabled"}`);
        fetchSkills();
      } else {
        toast.error("Failed");
      }
    } catch {
      toast.error("Failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function removeSkill(name: string) {
    if (!confirm(`Remove skill "${name}"? This cannot be undone.`)) return;
    setActionLoading(name);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "uninstall", name }),
      });
      if (res.ok) {
        toast.success(`Removed ${name}`);
        fetchSkills();
      } else {
        toast.error("Failed to remove");
      }
    } catch {
      toast.error("Failed");
    } finally {
      setActionLoading(null);
    }
  }

  const ready = skills.filter(s => s.eligible && !s.disabled);
  const missingReqs = skills.filter(s => !s.eligible && !s.disabled);
  const disabled = skills.filter(s => s.disabled);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading skills...</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Skills</h1>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total" value={skills.length} />
        <StatCard label="Ready" value={ready.length} color="green" />
        <StatCard label="Missing Requirements" value={missingReqs.length} color="yellow" />
        <StatCard label="Disabled" value={disabled.length} color="gray" />
      </div>

      {/* ClawHub Search */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Search ClawHub</h2>
        <div className="flex gap-3 mb-4">
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && searchHub()}
            placeholder="Search for skills on ClawHub..."
            className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={searchHub}
            disabled={searching}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded-lg text-sm"
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </div>

        {/* Install Warning */}
        {installWarning && (
          <div className="bg-yellow-900/30 border border-yellow-800 rounded-xl p-4 mb-4">
            <p className="text-yellow-400 text-sm font-medium mb-2">Third-Party Skill Warning</p>
            <p className="text-sm text-gray-300 mb-3">
              This skill is from a third-party developer. Installing third-party skills can be dangerous
              — they run with your agent&apos;s permissions and could access your files, keys, and APIs.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => installSkill(installWarning)}
                className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-xs"
              >
                I understand, install anyway
              </button>
              <button
                onClick={() => setInstallWarning(null)}
                className="px-3 py-1.5 bg-gray-700 text-gray-300 rounded-lg text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {searchResults.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {searchResults.map(s => (
              <div key={s.slug} className="bg-gray-900 rounded-xl border border-gray-800 p-4 hover:border-gray-700 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium">{s.name}</span>
                  {s.version && <span className="text-xs text-gray-500">v{s.version}</span>}
                </div>
                <p className="text-xs text-gray-400 line-clamp-2 mb-2">{s.summary}</p>
                <div className="text-xs text-gray-500 mb-3">by {s.author || "unknown"}</div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">{s.downloads?.toLocaleString()} downloads</span>
                  <button
                    onClick={() => setInstallWarning(s.slug)}
                    disabled={actionLoading === s.slug}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded text-xs"
                  >
                    {actionLoading === s.slug ? "Installing..." : "Install"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Ready Skills */}
      {ready.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Active Skills ({ready.length})</h2>
          <div className="space-y-2">
            {ready.map(s => (
              <SkillRow
                key={s.name}
                skill={s}
                expanded={expandedSkill === s.name}
                onToggleExpand={() => setExpandedSkill(expandedSkill === s.name ? null : s.name)}
                actionLoading={actionLoading}
                onToggle={() => toggleSkill(s.name, false)}
                onRemove={() => removeSkill(s.name)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Missing Requirements */}
      {missingReqs.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Missing Requirements ({missingReqs.length})</h2>
          <div className="space-y-2">
            {missingReqs.map(s => (
              <SkillRow
                key={s.name}
                skill={s}
                expanded={expandedSkill === s.name}
                onToggleExpand={() => setExpandedSkill(expandedSkill === s.name ? null : s.name)}
                actionLoading={actionLoading}
                onToggle={() => toggleSkill(s.name, false)}
                onRemove={() => removeSkill(s.name)}
                showMissing
              />
            ))}
          </div>
        </section>
      )}

      {/* Disabled Skills */}
      {disabled.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Disabled Skills ({disabled.length})</h2>
          <div className="space-y-2">
            {disabled.map(s => (
              <SkillRow
                key={s.name}
                skill={s}
                expanded={expandedSkill === s.name}
                onToggleExpand={() => setExpandedSkill(expandedSkill === s.name ? null : s.name)}
                actionLoading={actionLoading}
                onToggle={() => toggleSkill(s.name, true)}
                onRemove={() => removeSkill(s.name)}
              />
            ))}
          </div>
        </section>
      )}

      {skills.length === 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center text-gray-500">
          <p className="mb-2">No skills installed.</p>
          <p className="text-sm">Search ClawHub above or run <code className="bg-gray-800 px-2 py-0.5 rounded">openclaw skills list</code></p>
        </div>
      )}
    </div>
  );
}

function SkillRow({ skill, expanded, onToggleExpand, actionLoading, onToggle, onRemove, showMissing }: {
  skill: Skill;
  expanded: boolean;
  onToggleExpand: () => void;
  actionLoading: string | null;
  onToggle: () => void;
  onRemove: () => void;
  showMissing?: boolean;
}) {
  const allMissing = [
    ...skill.missing.bins.map(b => ({ type: "binary", name: b })),
    ...skill.missing.anyBins.map(b => ({ type: "binary (any)", name: b })),
    ...skill.missing.env.map(e => ({ type: "env var", name: e })),
    ...skill.missing.config.map(c => ({ type: "config", name: c })),
    ...skill.missing.os.map(o => ({ type: "OS", name: o })),
  ];

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors">
      <div className="flex items-center justify-between p-4 cursor-pointer" onClick={onToggleExpand}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-xl">{skill.emoji || "🔧"}</span>
          <div className="min-w-0">
            <div className="font-medium text-sm">{skill.name}</div>
            <div className="text-xs text-gray-500 truncate">{skill.description}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-3">
          <span className={`px-2 py-0.5 rounded-full text-xs ${
            skill.eligible && !skill.disabled
              ? "bg-green-900/50 text-green-400"
              : skill.disabled
                ? "bg-gray-700 text-gray-400"
                : "bg-yellow-900/50 text-yellow-400"
          }`}>
            {skill.eligible && !skill.disabled ? "active" : skill.disabled ? "disabled" : "missing reqs"}
          </span>
          {skill.bundled && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-blue-900/50 text-blue-400">bundled</span>
          )}
          <span className="text-gray-500 text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-800 pt-3">
          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
            <div>
              <span className="text-gray-500">Source:</span>{" "}
              <span className="text-gray-300">{skill.source || "local"}</span>
            </div>
            <div>
              <span className="text-gray-500">Type:</span>{" "}
              <span className="text-gray-300">{skill.bundled ? "Bundled" : "Third-party"}</span>
            </div>
          </div>

          {/* Missing requirements with links */}
          {showMissing && allMissing.length > 0 && (
            <div className="mb-4">
              <div className="text-sm font-medium text-yellow-400 mb-2">Missing Requirements:</div>
              <div className="space-y-1">
                {allMissing.map(m => {
                  const link = REQUIREMENT_LINKS[m.name];
                  return (
                    <div key={`${m.type}-${m.name}`} className="flex items-center gap-2 text-sm">
                      <span className="text-red-400">●</span>
                      <span className="text-gray-400">{m.type}:</span>
                      {link ? (
                        <a href={link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                          {m.name} →
                        </a>
                      ) : (
                        <span className="text-gray-300">{m.name}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={e => { e.stopPropagation(); onToggle(); }}
              disabled={actionLoading === skill.name}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-xs disabled:opacity-50"
            >
              {actionLoading === skill.name ? "..." : skill.disabled ? "Enable" : "Disable"}
            </button>
            {!skill.bundled && (
              <button
                onClick={e => { e.stopPropagation(); onRemove(); }}
                disabled={actionLoading === skill.name}
                className="px-3 py-1.5 bg-red-900/50 hover:bg-red-900 text-red-400 rounded-lg text-xs disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  const colorMap: Record<string, string> = {
    green: "text-green-400",
    yellow: "text-yellow-400",
    gray: "text-gray-400",
  };
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <div className="text-sm text-gray-400 mb-1">{label}</div>
      <div className={`text-3xl font-bold ${colorMap[color || ""] || ""}`}>{value}</div>
    </div>
  );
}
