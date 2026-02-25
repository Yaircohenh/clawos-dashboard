"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

interface CostData {
  totalCost: number;
  totalTokens: number;
  raw: string;
  limits: { daily?: number };
}

export default function CostsPage() {
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingLimit, setEditingLimit] = useState(false);
  const [limitValue, setLimitValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCosts();
  }, []);

  async function fetchCosts() {
    try {
      const res = await fetch("/api/costs");
      if (res.ok) {
        const d = await res.json();
        setData(d);
        if (d.limits?.daily !== undefined) {
          setLimitValue(String(d.limits.daily));
        }
      }
    } catch {
      toast.error("Failed to load costs");
    } finally {
      setLoading(false);
    }
  }

  async function saveLimit() {
    const val = parseFloat(limitValue);
    if (isNaN(val) || val < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setLimit", daily: val }),
      });
      if (res.ok) {
        toast.success("Limit saved");
        setEditingLimit(false);
        fetchCosts();
      } else {
        toast.error("Failed to save");
      }
    } catch {
      toast.error("Failed");
    } finally {
      setSaving(false);
    }
  }

  // Parse raw cost output for per-provider breakdown
  function parseProviderCosts(raw: string): { provider: string; cost: number; tokens: number }[] {
    const providers: { provider: string; cost: number; tokens: number }[] = [];
    if (!raw) return providers;

    // Try to extract provider-level info from raw output
    const lines = raw.split("\n");
    for (const line of lines) {
      const match = line.match(/(\w+[\w\s]*?):\s*\$([\d.]+)\s*.*?(\d[\d,]*)\s*tokens/i);
      if (match) {
        providers.push({
          provider: match[1].trim(),
          cost: parseFloat(match[2]),
          tokens: parseInt(match[3].replace(/,/g, "")),
        });
      }
    }

    // If we couldn't parse providers, create a summary line
    if (providers.length === 0 && data) {
      providers.push({
        provider: "All Providers",
        cost: data.totalCost,
        tokens: data.totalTokens,
      });
    }

    return providers;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading costs...</div>
      </div>
    );
  }

  const cost = data || { totalCost: 0, totalTokens: 0, raw: "", limits: {} };
  const providerCosts = parseProviderCosts(cost.raw);
  const dailyLimit = cost.limits?.daily;
  const usagePercent = dailyLimit && dailyLimit > 0 ? Math.min(100, (cost.totalCost / dailyLimit) * 100) : 0;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Cost Tracking</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="text-sm text-gray-400 mb-1">Total Cost</div>
          <div className="text-3xl font-bold">${cost.totalCost.toFixed(4)}</div>
          <div className="text-xs text-gray-500 mt-1">USD</div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="text-sm text-gray-400 mb-1">Total Tokens</div>
          <div className="text-3xl font-bold">{cost.totalTokens.toLocaleString()}</div>
          <div className="text-xs text-gray-500 mt-1">tokens</div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="text-sm text-gray-400 mb-1">Cost per 1K Tokens</div>
          <div className="text-3xl font-bold">
            {cost.totalTokens > 0
              ? `$${(cost.totalCost / cost.totalTokens * 1000).toFixed(4)}`
              : "N/A"}
          </div>
          <div className="text-xs text-gray-500 mt-1">USD/1K tokens</div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="text-sm text-gray-400 mb-1">Daily Limit</div>
          {editingLimit ? (
            <div className="flex gap-2 items-center">
              <span className="text-lg">$</span>
              <input
                value={limitValue}
                onChange={e => setLimitValue(e.target.value)}
                onKeyDown={e => e.key === "Enter" && saveLimit()}
                className="w-24 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-blue-500"
                autoFocus
              />
              <button onClick={saveLimit} disabled={saving} className="text-xs text-blue-400 hover:text-blue-300">
                {saving ? "..." : "Save"}
              </button>
              <button onClick={() => setEditingLimit(false)} className="text-xs text-gray-500">Cancel</button>
            </div>
          ) : (
            <div>
              <div className="text-3xl font-bold">
                {dailyLimit ? `$${dailyLimit.toFixed(2)}` : "No limit"}
              </div>
              <button onClick={() => setEditingLimit(true)} className="text-xs text-blue-400 hover:text-blue-300 mt-1">
                {dailyLimit ? "Change" : "Set limit"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Usage Bar */}
      {dailyLimit && dailyLimit > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Daily Usage</span>
            <span className="text-sm text-gray-400">{usagePercent.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all ${
                usagePercent > 90 ? "bg-red-500" : usagePercent > 70 ? "bg-yellow-500" : "bg-green-500"
              }`}
              style={{ width: `${Math.min(100, usagePercent)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>${cost.totalCost.toFixed(4)} used</span>
            <span>${dailyLimit.toFixed(2)} limit</span>
          </div>
        </div>
      )}

      {/* Cost Alerts */}
      <section className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-6">
        <h2 className="text-lg font-semibold mb-4">Cost Alerts</h2>
        <div className="space-y-2 text-sm">
          {dailyLimit && cost.totalCost > dailyLimit ? (
            <div className="flex items-center gap-2 p-3 bg-red-900/30 rounded-lg text-red-400">
              <span>CRITICAL:</span>
              <span>Daily cost exceeds ${dailyLimit.toFixed(2)} limit</span>
            </div>
          ) : cost.totalCost > 20 ? (
            <div className="flex items-center gap-2 p-3 bg-red-900/30 rounded-lg text-red-400">
              <span>CRITICAL:</span>
              <span>Daily cost exceeds $20 threshold</span>
            </div>
          ) : cost.totalCost > 5 ? (
            <div className="flex items-center gap-2 p-3 bg-yellow-900/30 rounded-lg text-yellow-400">
              <span>WARNING:</span>
              <span>Daily cost exceeds $5 threshold</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 bg-gray-800/50 rounded-lg text-gray-400">
              <span>OK:</span>
              <span>Costs within normal range</span>
            </div>
          )}
        </div>
      </section>

      {/* Provider Breakdown */}
      <section className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-6">
        <h2 className="text-lg font-semibold mb-4">Provider Breakdown</h2>
        {providerCosts.length > 0 ? (
          <div className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400">
                  <th className="text-left pb-3">Provider</th>
                  <th className="text-right pb-3">Cost (USD)</th>
                  <th className="text-right pb-3">Tokens</th>
                  <th className="text-right pb-3">$/1K Tokens</th>
                </tr>
              </thead>
              <tbody>
                {providerCosts.map((p, i) => (
                  <tr key={i} className="border-b border-gray-800/50">
                    <td className="py-3 text-gray-300">{p.provider}</td>
                    <td className="py-3 text-right font-mono">${p.cost.toFixed(4)}</td>
                    <td className="py-3 text-right font-mono text-gray-400">{p.tokens.toLocaleString()}</td>
                    <td className="py-3 text-right font-mono text-gray-400">
                      {p.tokens > 0 ? `$${(p.cost / p.tokens * 1000).toFixed(4)}` : "N/A"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-700">
                  <td className="pt-3 font-medium">Total</td>
                  <td className="pt-3 text-right font-mono font-medium">${cost.totalCost.toFixed(4)}</td>
                  <td className="pt-3 text-right font-mono text-gray-400">{cost.totalTokens.toLocaleString()}</td>
                  <td className="pt-3 text-right font-mono text-gray-400">
                    {cost.totalTokens > 0 ? `$${(cost.totalCost / cost.totalTokens * 1000).toFixed(4)}` : "N/A"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No provider data available yet.</p>
        )}
      </section>

      {/* Raw Output */}
      <section className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <h2 className="text-lg font-semibold mb-4">Raw Cost Output</h2>
        <pre className="text-sm text-gray-400 bg-gray-800/50 p-4 rounded-lg overflow-x-auto whitespace-pre-wrap">
          {cost.raw || "No cost data available. Gateway sessions will populate this."}
        </pre>
      </section>
    </div>
  );
}
