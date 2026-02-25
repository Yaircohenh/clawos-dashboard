import { NextRequest, NextResponse } from "next/server";
import { execFileSync } from "child_process";
import { checkRateLimit } from "@/lib/rate-limit";
import { getPlugins } from "@/lib/data";

export const dynamic = "force-dynamic";

const SAFE_ID = /^[a-zA-Z0-9._\-/@]+$/;

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`plugins:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }
  return NextResponse.json({ plugins: getPlugins() });
}

function run(bin: string, args: string[]): string {
  try {
    return (
      execFileSync(bin, args, {
        encoding: "utf-8",
        timeout: 15000,
        env: { ...process.env, NO_COLOR: "1" },
      }) as string
    ).trim();
  } catch (err: unknown) {
    const e = err as { stdout?: string };
    if (e?.stdout) return (e.stdout as string).trim();
    return "";
  }
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`plugins:${ip}`);
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
  const pluginId = body.pluginId as string;

  if (!pluginId || !SAFE_ID.test(pluginId)) {
    return NextResponse.json({ error: "Invalid plugin ID" }, { status: 400 });
  }

  switch (action) {
    case "enable": {
      const output = run("openclaw", ["plugins", "enable", pluginId]);
      return NextResponse.json({ success: true, output });
    }
    case "disable": {
      const output = run("openclaw", ["plugins", "disable", pluginId]);
      return NextResponse.json({ success: true, output });
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
