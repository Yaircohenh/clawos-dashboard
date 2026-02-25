import { getCostSummary } from "@/lib/data";

export const dynamic = "force-dynamic";

export default function CostsPage() {
  const cost = getCostSummary();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Cost Tracking</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="text-sm text-gray-400 mb-1">Total Cost</div>
          <div className="text-3xl font-bold">${cost.totalCost.toFixed(4)}</div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="text-sm text-gray-400 mb-1">Total Tokens</div>
          <div className="text-3xl font-bold">
            {cost.totalTokens.toLocaleString()}
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="text-sm text-gray-400 mb-1">Avg Cost/Token</div>
          <div className="text-3xl font-bold">
            {cost.totalTokens > 0
              ? `$${(cost.totalCost / cost.totalTokens * 1000).toFixed(4)}/1K`
              : "N/A"}
          </div>
        </div>
      </div>

      <section className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-6">
        <h2 className="text-lg font-semibold mb-4">Cost Alerts</h2>
        <div className="space-y-2 text-sm">
          {cost.totalCost > 20 ? (
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

      <section className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <h2 className="text-lg font-semibold mb-4">Raw Cost Output</h2>
        <pre className="text-sm text-gray-400 bg-gray-800/50 p-4 rounded-lg overflow-x-auto whitespace-pre-wrap">
          {cost.raw || "No cost data available. Gateway sessions will populate this."}
        </pre>
      </section>
    </div>
  );
}
