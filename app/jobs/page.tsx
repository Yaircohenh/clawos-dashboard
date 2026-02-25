"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  agent: string;
  task: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
}

const JOB_SUGGESTIONS = [
  { name: "Morning News Brief", id: "news-brief", schedule: "0 8 * * *", agent: "main", task: "Summarize the top 5 news stories relevant to the user's interests and deliver a concise morning brief." },
  { name: "Weather Report", id: "weather-report", schedule: "0 7 * * *", agent: "main", task: "Get the current weather forecast for the user's location and summarize key conditions for today." },
  { name: "Yesterday's Recap", id: "daily-recap", schedule: "0 9 * * *", agent: "main", task: "Review all agent activity from yesterday and create a summary of completed tasks, pending items, and any issues." },
  { name: "Open Tasks Review", id: "open-tasks", schedule: "0 10 * * 1", agent: "ops", task: "Review all open tasks and projects across agents. Prioritize and flag any overdue items." },
  { name: "Daily Reminders", id: "daily-reminders", schedule: "0 8 * * *", agent: "main", task: "Check the user's calendar and task list for today. Send reminders for upcoming deadlines and meetings." },
];

export default function JobsPage() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [agents, setAgents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Add form state
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newSchedule, setNewSchedule] = useState("");
  const [newAgent, setNewAgent] = useState("main");
  const [newTask, setNewTask] = useState("");

  useEffect(() => {
    fetchJobs();
  }, []);

  async function fetchJobs() {
    try {
      const res = await fetch("/api/cron");
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
        setAgents(data.agents || []);
      }
    } catch {
      toast.error("Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }

  async function addJob() {
    if (!newId.trim() || !newName.trim() || !newSchedule.trim() || !newTask.trim()) {
      toast.error("All fields are required");
      return;
    }
    setActionLoading("add");
    try {
      const res = await fetch("/api/cron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          id: newId.trim(),
          name: newName.trim(),
          schedule: newSchedule.trim(),
          agent: newAgent,
          task: newTask.trim(),
        }),
      });
      if (res.ok) {
        toast.success("Job added");
        setShowAddForm(false);
        resetForm();
        fetchJobs();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to add job");
      }
    } catch {
      toast.error("Failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function toggleJob(jobId: string, enabled: boolean) {
    setActionLoading(jobId);
    try {
      const res = await fetch("/api/cron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", jobId, enabled }),
      });
      if (res.ok) {
        toast.success(`Job ${enabled ? "enabled" : "disabled"}`);
        fetchJobs();
      } else {
        toast.error("Failed");
      }
    } catch {
      toast.error("Failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function deleteJob(jobId: string) {
    if (!confirm(`Delete job "${jobId}"?`)) return;
    setActionLoading(jobId);
    try {
      const res = await fetch("/api/cron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", jobId }),
      });
      if (res.ok) {
        toast.success("Job deleted");
        fetchJobs();
      } else {
        toast.error("Failed");
      }
    } catch {
      toast.error("Failed");
    } finally {
      setActionLoading(null);
    }
  }

  function applySuggestion(s: typeof JOB_SUGGESTIONS[0]) {
    setNewId(s.id);
    setNewName(s.name);
    setNewSchedule(s.schedule);
    setNewAgent(s.agent);
    setNewTask(s.task);
    setShowSuggestions(false);
    setShowAddForm(true);
  }

  function resetForm() {
    setNewId("");
    setNewName("");
    setNewSchedule("");
    setNewAgent("main");
    setNewTask("");
  }

  const enabled = jobs.filter(j => j.enabled);
  const disabled = jobs.filter(j => !j.enabled);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading jobs...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Cron Jobs</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSuggestions(!showSuggestions)}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm"
          >
            Suggestions
          </button>
          <button
            onClick={() => { setShowAddForm(!showAddForm); setShowSuggestions(false); }}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
          >
            + New Job
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatCard label="Total Jobs" value={jobs.length} />
        <StatCard label="Enabled" value={enabled.length} color="green" />
        <StatCard label="Disabled" value={disabled.length} color="gray" />
      </div>

      {/* Suggestions */}
      {showSuggestions && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-6">
          <h3 className="text-sm font-semibold mb-3">Suggested Jobs</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {JOB_SUGGESTIONS.filter(s => !jobs.some(j => j.id === s.id)).map(s => (
              <button
                key={s.id}
                onClick={() => applySuggestion(s)}
                className="text-left p-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <div className="font-medium text-sm mb-1">{s.name}</div>
                <div className="text-xs text-gray-500">{s.schedule} · {s.agent}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-6">
          <h3 className="text-sm font-semibold mb-3">Add New Job</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Job ID</label>
              <input value={newId} onChange={e => setNewId(e.target.value)} placeholder="my-job-id"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Name</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="My Scheduled Job"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Schedule (cron expression)</label>
              <input value={newSchedule} onChange={e => setNewSchedule(e.target.value)} placeholder="0 */6 * * *"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500" />
              <div className="text-xs text-gray-600 mt-1">e.g., &quot;0 8 * * *&quot; = daily at 8am, &quot;*/30 * * * *&quot; = every 30 min</div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Agent</label>
              <div className="relative">
                <select value={newAgent} onChange={e => setNewAgent(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 appearance-none">
                  {agents.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs pointer-events-none">▼</span>
              </div>
            </div>
          </div>
          <div className="mb-3">
            <label className="text-xs text-gray-500 mb-1 block">Task Description</label>
            <textarea value={newTask} onChange={e => setNewTask(e.target.value)} placeholder="What should the agent do..."
              rows={2} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 resize-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={addJob} disabled={actionLoading === "add"}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded-lg text-sm">
              {actionLoading === "add" ? "Adding..." : "Add Job"}
            </button>
            <button onClick={() => { setShowAddForm(false); resetForm(); }}
              className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Job List */}
      {jobs.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center text-gray-500">
          <p className="mb-2">No cron jobs configured.</p>
          <p className="text-sm">Click &quot;+ New Job&quot; or check &quot;Suggestions&quot; to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map(j => (
            <div key={j.id} className="bg-gray-900 rounded-xl border border-gray-800 p-5 hover:border-gray-700 transition-colors">
              <div className="flex items-center gap-3 mb-3">
                <span className="font-medium text-base">{j.name}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  j.enabled ? "bg-green-900/50 text-green-400" : "bg-gray-700 text-gray-400"
                }`}>
                  {j.enabled ? "enabled" : "disabled"}
                </span>
                <span className="ml-auto text-xs text-gray-500">
                  Agent: <span className="text-gray-300">{j.agent}</span>
                </span>
              </div>
              <div className="flex items-center gap-6 text-sm mb-3">
                <div>
                  <span className="text-gray-500">Schedule: </span>
                  <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs text-gray-300">{j.schedule}</code>
                </div>
                {j.lastRun && (
                  <div><span className="text-gray-500">Last: </span><span className="text-gray-400">{j.lastRun}</span></div>
                )}
                {j.nextRun && (
                  <div><span className="text-gray-500">Next: </span><span className="text-gray-400">{j.nextRun}</span></div>
                )}
              </div>
              <p className="text-xs text-gray-400 mb-3 line-clamp-2">{j.task}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => toggleJob(j.id, !j.enabled)}
                  disabled={actionLoading === j.id}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs disabled:opacity-50"
                >
                  {actionLoading === j.id ? "..." : j.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  onClick={() => deleteJob(j.id)}
                  disabled={actionLoading === j.id}
                  className="px-3 py-1 bg-red-900/50 hover:bg-red-900 text-red-400 rounded text-xs disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  const colorMap: Record<string, string> = { green: "text-green-400", gray: "text-gray-400" };
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <div className="text-sm text-gray-400 mb-1">{label}</div>
      <div className={`text-3xl font-bold ${colorMap[color || ""] || ""}`}>{value}</div>
    </div>
  );
}
