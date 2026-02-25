"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

interface SecurityRule {
  id: string;
  action: string;
  policy: string;
  reason: string;
  riskScore: number;
}

export default function ApprovalsPage() {
  const [rules, setRules] = useState<SecurityRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [locked, setLocked] = useState(true);
  const [showUnlockModal, setShowUnlockModal] = useState(false);

  // Add form
  const [newAction, setNewAction] = useState("");
  const [newPolicy, setNewPolicy] = useState("require_approval");
  const [newReason, setNewReason] = useState("");
  const [newRisk, setNewRisk] = useState(0.5);

  useEffect(() => {
    fetchRules();
  }, []);

  async function fetchRules() {
    try {
      const res = await fetch("/api/approvals");
      if (res.ok) {
        const data = await res.json();
        setRules(data.rules || []);
      }
    } catch {
      toast.error("Failed to load rules");
    } finally {
      setLoading(false);
    }
  }

  async function updateRisk(ruleId: string, riskScore: number) {
    if (locked) return;
    setActionLoading(ruleId);
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updateRisk", ruleId, riskScore }),
      });
      if (res.ok) {
        toast.success("Risk score updated");
        setRules(prev => prev.map(r => r.id === ruleId ? { ...r, riskScore } : r));
      } else {
        toast.error("Failed to update");
      }
    } catch {
      toast.error("Failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function addRule() {
    if (!newAction.trim() || !newReason.trim()) {
      toast.error("Action and reason are required");
      return;
    }
    setActionLoading("add");
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addRule",
          ruleAction: newAction.trim(),
          policy: newPolicy,
          reason: newReason.trim(),
          riskScore: newRisk,
        }),
      });
      if (res.ok) {
        toast.success("Rule added");
        setShowAddForm(false);
        setNewAction("");
        setNewReason("");
        setNewRisk(0.5);
        fetchRules();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed");
      }
    } catch {
      toast.error("Failed");
    } finally {
      setActionLoading(null);
    }
  }

  const approvalRules = rules.filter(r => r.policy === "require_approval");
  const denyRules = rules.filter(r => r.policy === "deny");
  const allowRules = rules.filter(r => r.policy === "allow");

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading rules...</div>
      </div>
    );
  }

  return (
    <div>
      {/* Unlock Modal */}
      {showUnlockModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowUnlockModal(false)}>
          <div className="bg-gray-900 rounded-xl border border-yellow-800 p-6 max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold text-yellow-400 mb-3 text-lg">Unlock Security Policy?</h2>
            <div className="space-y-3 text-sm text-gray-300 mb-4">
              <p>
                You are about to unlock the security policy for editing. Changes to these rules directly affect what actions agents can perform.
              </p>
              <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-red-300">
                <strong>Warning:</strong> Incorrect changes can allow agents to perform dangerous operations (file deletion, code deployment, financial transactions) without approval.
              </div>
              <p>Only unlock if you understand the implications of modifying security rules.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setLocked(false); setShowUnlockModal(false); toast.success("Policy unlocked for editing"); }}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm"
              >
                I understand, unlock
              </button>
              <button
                onClick={() => setShowUnlockModal(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Approvals & Security Policy</h1>
          <button
            onClick={() => {
              if (locked) setShowUnlockModal(true);
              else { setLocked(true); toast.success("Policy locked"); }
            }}
            className={`text-xl transition-colors ${locked ? "text-red-400 hover:text-yellow-400" : "text-green-400 hover:text-red-400"}`}
            title={locked ? "Click to unlock editing" : "Click to lock editing"}
          >
            {locked ? "🔒" : "🔓"}
          </button>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          disabled={locked}
          className={`px-3 py-2 rounded-lg text-sm ${locked ? "bg-gray-700 text-gray-500 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
        >
          + Add Rule
        </button>
      </div>

      {/* Risk Score Info (always visible) */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-6">
        <h3 className="text-sm font-semibold mb-2 text-gray-300">Understanding Risk Scores</h3>
        <p className="text-xs text-gray-400 mb-3">
          Risk Score = severity level. Higher percentage = more dangerous action.
        </p>
        <div className="flex flex-wrap gap-3">
          <span className="flex items-center gap-1.5 text-xs">
            <span className="w-3 h-3 rounded-full bg-gray-700" />
            <span className="text-gray-400">0-69% Normal</span>
          </span>
          <span className="flex items-center gap-1.5 text-xs">
            <span className="w-3 h-3 rounded-full bg-yellow-900/50" />
            <span className="text-yellow-400">70-89% Warning</span>
          </span>
          <span className="flex items-center gap-1.5 text-xs">
            <span className="w-3 h-3 rounded-full bg-red-900/50" />
            <span className="text-red-400">90-100% Critical</span>
          </span>
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && !locked && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-6">
          <h3 className="text-sm font-semibold mb-3">Add Security Rule</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Action Pattern</label>
              <input value={newAction} onChange={e => setNewAction(e.target.value)}
                placeholder="e.g., git push, rm -rf, deploy *"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Policy</label>
              <div className="relative">
                <select value={newPolicy} onChange={e => setNewPolicy(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 appearance-none">
                  <option value="require_approval">Require Approval</option>
                  <option value="deny">Deny</option>
                  <option value="allow">Allow</option>
                </select>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs pointer-events-none">▼</span>
              </div>
            </div>
          </div>
          <div className="mb-3">
            <label className="text-xs text-gray-500 mb-1 block">Reason</label>
            <input value={newReason} onChange={e => setNewReason(e.target.value)}
              placeholder="Why this rule exists..."
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500" />
          </div>
          <div className="mb-3">
            <label className="text-xs text-gray-500 mb-1 block">
              Risk Score: {(newRisk * 100).toFixed(0)}%
            </label>
            <input type="range" min="0" max="1" step="0.05" value={newRisk}
              onChange={e => setNewRisk(parseFloat(e.target.value))}
              className="w-full accent-blue-500" />
          </div>
          <div className="flex gap-2">
            <button onClick={addRule} disabled={actionLoading === "add"}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded-lg text-sm">
              {actionLoading === "add" ? "Adding..." : "Add Rule"}
            </button>
            <button onClick={() => setShowAddForm(false)}
              className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Approval-Required Actions */}
      <RuleSection
        title={`Approval-Required Actions (${approvalRules.length})`}
        rules={approvalRules}
        actionLoading={actionLoading}
        onUpdateRisk={updateRisk}
        color="yellow"
        locked={locked}
      />

      {/* Denied Actions */}
      <RuleSection
        title={`Denied Actions (${denyRules.length})`}
        rules={denyRules}
        actionLoading={actionLoading}
        onUpdateRisk={updateRisk}
        color="red"
        locked={locked}
      />

      {/* Allowed Actions */}
      {allowRules.length > 0 && (
        <RuleSection
          title={`Allowed Actions (${allowRules.length})`}
          rules={allowRules}
          actionLoading={actionLoading}
          onUpdateRisk={updateRisk}
          color="green"
          locked={locked}
        />
      )}

      {rules.length === 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center text-gray-500">
          No security rules configured.
        </div>
      )}
    </div>
  );
}

function RuleSection({ title, rules, actionLoading, onUpdateRisk, color, locked }: {
  title: string;
  rules: SecurityRule[];
  actionLoading: string | null;
  onUpdateRisk: (id: string, score: number) => void;
  color: string;
  locked: boolean;
}) {
  if (rules.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400">
              <th className="text-left p-3">Action</th>
              <th className="text-left p-3">Reason</th>
              <th className="text-right p-3 w-48">Risk Score</th>
            </tr>
          </thead>
          <tbody>
            {rules.map(rule => (
              <tr key={rule.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="p-3 font-mono text-xs">{rule.action}</td>
                <td className="p-3 text-gray-300">{rule.reason}</td>
                <td className="p-3 text-right">
                  <div className="flex items-center gap-2 justify-end">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={rule.riskScore}
                      onChange={e => {
                        const val = parseFloat(e.target.value);
                        onUpdateRisk(rule.id, val);
                      }}
                      disabled={locked || actionLoading === rule.id}
                      className={`w-20 accent-blue-500 ${locked ? "opacity-50 cursor-not-allowed" : ""}`}
                    />
                    <RiskBadge score={rule.riskScore} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RiskBadge({ score }: { score: number }) {
  const color =
    score >= 0.9
      ? "bg-red-900/50 text-red-400"
      : score >= 0.7
        ? "bg-yellow-900/50 text-yellow-400"
        : "bg-gray-700 text-gray-400";
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs min-w-[40px] text-center ${color}`}>
      {(score * 100).toFixed(0)}%
    </span>
  );
}
