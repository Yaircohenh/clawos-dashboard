import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSecurityPolicy } from "@/lib/data";
import { securityPolicyPath } from "@/lib/paths";

export const dynamic = "force-dynamic";

function getPolicyPath() { return securityPolicyPath(); }

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`approvals:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }
  return NextResponse.json({ rules: getSecurityPolicy() });
}

function readPolicy(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(getPolicyPath(), "utf-8"));
  } catch {
    return { rules: [] };
  }
}

function writePolicy(data: Record<string, unknown>) {
  writeFileSync(getPolicyPath(), JSON.stringify(data, null, 2) + "\n");
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`approvals:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action as string;

  switch (action) {
    case "updateRisk": {
      const ruleId = body.ruleId as string;
      const riskScore = body.riskScore as number;

      if (!ruleId || typeof ruleId !== "string") {
        return NextResponse.json({ error: "Invalid rule ID" }, { status: 400 });
      }
      if (typeof riskScore !== "number" || riskScore < 0 || riskScore > 1) {
        return NextResponse.json({ error: "Risk score must be 0-1" }, { status: 400 });
      }

      const policy = readPolicy();
      const rules = (policy.rules || []) as Record<string, unknown>[];
      const rule = rules.find((r) => r.id === ruleId);
      if (!rule) {
        return NextResponse.json({ error: "Rule not found" }, { status: 404 });
      }
      rule.riskScore = riskScore;
      writePolicy(policy);

      return NextResponse.json({ success: true });
    }

    case "addRule": {
      const ruleAction = (body.ruleAction as string || "").trim();
      const policy_type = (body.policy as string || "").trim();
      const reason = (body.reason as string || "").trim();
      const riskScore = typeof body.riskScore === "number" ? body.riskScore : 0.5;

      if (!ruleAction || ruleAction.length > 200) {
        return NextResponse.json({ error: "Action required (max 200 chars)" }, { status: 400 });
      }
      if (!["require_approval", "deny", "allow"].includes(policy_type)) {
        return NextResponse.json({ error: "Policy must be: require_approval, deny, or allow" }, { status: 400 });
      }
      if (!reason || reason.length > 300) {
        return NextResponse.json({ error: "Reason required (max 300 chars)" }, { status: 400 });
      }

      const policy = readPolicy();
      if (!policy.rules) policy.rules = [];
      const rules = policy.rules as Record<string, unknown>[];

      const id = `custom-${Date.now()}`;
      rules.push({
        id,
        action: ruleAction,
        policy: policy_type,
        reason,
        riskScore: Math.max(0, Math.min(1, riskScore)),
      });
      writePolicy(policy);

      return NextResponse.json({ success: true, id });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
