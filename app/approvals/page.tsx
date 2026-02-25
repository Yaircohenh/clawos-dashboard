import { getSecurityPolicy } from "@/lib/data";

export const dynamic = "force-dynamic";

export default function ApprovalsPage() {
  const rules = getSecurityPolicy();

  const approvalRules = rules.filter((r) => r.policy === "require_approval");
  const denyRules = rules.filter((r) => r.policy === "deny");

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Approvals & Security Policy</h1>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">
          Approval-Required Actions ({approvalRules.length})
        </h2>
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <th className="text-left p-3">Action</th>
                <th className="text-left p-3">Reason</th>
                <th className="text-right p-3">Risk</th>
              </tr>
            </thead>
            <tbody>
              {approvalRules.map((rule) => (
                <tr
                  key={rule.id}
                  className="border-b border-gray-800/50 hover:bg-gray-800/30"
                >
                  <td className="p-3 font-mono text-xs">{rule.action}</td>
                  <td className="p-3 text-gray-300">{rule.reason}</td>
                  <td className="p-3 text-right">
                    <RiskBadge score={rule.riskScore} />
                  </td>
                </tr>
              ))}
              {approvalRules.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-3 text-gray-500 text-center">
                    No approval rules configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">
          Denied Actions ({denyRules.length})
        </h2>
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <th className="text-left p-3">Action</th>
                <th className="text-left p-3">Reason</th>
                <th className="text-right p-3">Risk</th>
              </tr>
            </thead>
            <tbody>
              {denyRules.map((rule) => (
                <tr
                  key={rule.id}
                  className="border-b border-gray-800/50 hover:bg-gray-800/30"
                >
                  <td className="p-3 font-mono text-xs">{rule.action}</td>
                  <td className="p-3 text-gray-300">{rule.reason}</td>
                  <td className="p-3 text-right">
                    <RiskBadge score={rule.riskScore} />
                  </td>
                </tr>
              ))}
              {denyRules.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-3 text-gray-500 text-center">
                    No deny rules configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
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
    <span className={`px-2 py-0.5 rounded-full text-xs ${color}`}>
      {(score * 100).toFixed(0)}%
    </span>
  );
}
