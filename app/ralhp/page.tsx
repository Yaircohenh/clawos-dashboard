"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

interface Step {
  id: string;
  title: string;
  agent: string;
  status: string;
  qa_cycles: number;
  depends_on: string[];
}

interface ProgressEntry {
  ts?: string;
  agent?: string;
  step?: string;
  status?: string;
  msg?: string;
}

interface Project {
  name: string;
  goal: string;
  created_at: string;
  dir: string;
  steps: Step[];
  progress: ProgressEntry[];
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-700 text-gray-300",
  in_progress: "bg-blue-900/50 text-blue-400",
  review: "bg-yellow-900/50 text-yellow-400",
  passed: "bg-green-900/50 text-green-400",
  failed: "bg-red-900/50 text-red-400",
  escalated: "bg-orange-900/50 text-orange-400",
};

export default function RalhpPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/ralhp");
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      } else {
        toast.error("Failed to load RALHP projects");
      }
    } catch {
      toast.error("Failed to load RALHP projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const totalProjects = projects.length;
  const allSteps = projects.flatMap((p) => p.steps);
  const activeSteps = allSteps.filter((s) => s.status === "in_progress" || s.status === "review").length;
  const completedSteps = allSteps.filter((s) => s.status === "passed").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading RALHP projects...</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">RALHP Projects</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="text-sm text-gray-400 mb-1">Total Projects</div>
          <div className="text-3xl font-bold">{totalProjects}</div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="text-sm text-gray-400 mb-1">Active Steps</div>
          <div className="text-3xl font-bold text-blue-400">{activeSteps}</div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="text-sm text-gray-400 mb-1">Completed Steps</div>
          <div className="text-3xl font-bold text-green-400">{completedSteps}</div>
        </div>
      </div>

      {/* Projects */}
      {projects.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
          <div className="text-4xl mb-3">🏗️</div>
          <h2 className="text-lg font-semibold mb-2">No RALHP projects yet</h2>
          <p className="text-gray-400 text-sm max-w-md mx-auto">
            Projects appear here when Tom delegates builds via the RALHP workflow.
            RALHP (Request → Assess → Layout → Handoff → Prove) is the multi-agent
            build pipeline that plans, delegates, and QA-verifies every step.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {projects.map((project) => {
            const passedCount = project.steps.filter((s) => s.status === "passed").length;
            const totalCount = project.steps.length;
            const progressPct = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;
            const isLogExpanded = expandedLogs[project.dir] || false;
            const recentProgress = project.progress.slice(-10).reverse();

            return (
              <div key={project.dir} className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                {/* Project Header */}
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-lg font-semibold">{project.name}</h2>
                    {project.goal && <p className="text-sm text-gray-400 mt-0.5">{project.goal}</p>}
                  </div>
                  {project.created_at && (
                    <span className="text-xs text-gray-500">{project.created_at}</span>
                  )}
                </div>

                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                    <span>Progress</span>
                    <span>{passedCount}/{totalCount} steps ({progressPct}%)</span>
                  </div>
                  <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>

                {/* Step Table */}
                {project.steps.length > 0 && (
                  <div className="overflow-x-auto mb-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                          <th className="pb-2 pr-3">ID</th>
                          <th className="pb-2 pr-3">Title</th>
                          <th className="pb-2 pr-3">Agent</th>
                          <th className="pb-2 pr-3">Status</th>
                          <th className="pb-2 pr-3">QA</th>
                          <th className="pb-2">Deps</th>
                        </tr>
                      </thead>
                      <tbody>
                        {project.steps.map((step) => (
                          <tr key={step.id} className="border-b border-gray-800/50">
                            <td className="py-2 pr-3 text-gray-300 font-mono text-xs">{step.id}</td>
                            <td className="py-2 pr-3 text-gray-200">{step.title}</td>
                            <td className="py-2 pr-3 text-gray-400">{step.agent}</td>
                            <td className="py-2 pr-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[step.status] || "bg-gray-700 text-gray-300"}`}>
                                {step.status}
                              </span>
                            </td>
                            <td className="py-2 pr-3 text-gray-400">{step.qa_cycles}</td>
                            <td className="py-2 text-gray-500 text-xs">
                              {step.depends_on.length > 0 ? step.depends_on.join(", ") : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Progress Log */}
                {project.progress.length > 0 && (
                  <div>
                    <button
                      onClick={() => setExpandedLogs((prev) => ({ ...prev, [project.dir]: !prev[project.dir] }))}
                      className="text-xs text-gray-400 hover:text-white transition-colors mb-2"
                    >
                      {isLogExpanded ? "▾" : "▸"} Progress Log ({project.progress.length} entries)
                    </button>
                    {isLogExpanded && (
                      <div className="space-y-1.5 pl-3 border-l border-gray-800">
                        {recentProgress.map((entry, i) => (
                          <div key={i} className="text-xs">
                            <span className="text-gray-500">{entry.ts || "—"}</span>
                            <span className="text-gray-400 ml-2">[{entry.agent || "?"}]</span>
                            <span className="text-gray-400 ml-1">step {entry.step || "?"}</span>
                            <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${STATUS_COLORS[entry.status || ""] || "bg-gray-700 text-gray-300"}`}>
                              {entry.status || "?"}
                            </span>
                            {entry.msg && <span className="text-gray-300 ml-2">{entry.msg}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
