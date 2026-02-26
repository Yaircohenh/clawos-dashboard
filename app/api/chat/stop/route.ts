import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`chat-stop:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  let killed = 0;

  try {
    // Kill openclaw-agent processes (Tom and subagents)
    // Then kill orphaned openclaw worker processes
    // But NOT openclaw-gateway
    const script = [
      // Kill the agent process
      "pkill -TERM -x openclaw-agent 2>/dev/null && echo 1 || echo 0",
      // Kill openclaw worker processes (subagents) — match exact name, not gateway
      "pkill -TERM -x openclaw 2>/dev/null && echo 1 || echo 0",
    ].join("; ");

    const result = execSync(script, {
      encoding: "utf-8",
      timeout: 5000,
    });

    // Count how many pkill commands succeeded
    killed = result
      .trim()
      .split("\n")
      .filter((l) => l.trim() === "1").length;
  } catch {
    // best effort
  }

  return NextResponse.json({ stopped: true, killed });
}
