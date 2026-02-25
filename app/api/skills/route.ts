import { NextRequest, NextResponse } from "next/server";
import { execFileSync } from "child_process";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSkills } from "@/lib/data";

export const dynamic = "force-dynamic";

const SAFE_ID = /^[a-zA-Z0-9._\-/@]+$/;

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`skills:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }
  return NextResponse.json({ skills: getSkills() });
}

function run(bin: string, args: string[]): string {
  try {
    return (
      execFileSync(bin, args, {
        encoding: "utf-8",
        timeout: 30000,
        env: { ...process.env, NO_COLOR: "1" },
      }) as string
    ).trim();
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string };
    if (e?.stdout) return (e.stdout as string).trim();
    return "";
  }
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`skills:${ip}`);
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
    case "search": {
      const query = (body.query as string || "").trim();
      if (!query || query.length > 100) {
        return NextResponse.json({ error: "Invalid query" }, { status: 400 });
      }
      const safeQuery = query.replace(/[^a-zA-Z0-9 _\-]/g, "");
      const raw = run("clawhub", ["search", safeQuery, "--json", "--limit", "20"]);
      try {
        const data = JSON.parse(raw);
        return NextResponse.json({ results: data.skills || data.results || [] });
      } catch {
        return NextResponse.json({ results: [] });
      }
    }

    case "install": {
      const slug = body.slug as string;
      if (!slug || !SAFE_ID.test(slug)) {
        return NextResponse.json({ error: "Invalid skill slug" }, { status: 400 });
      }
      const output = run("clawhub", ["install", slug]);
      return NextResponse.json({ success: true, output });
    }

    case "uninstall": {
      const name = body.name as string;
      if (!name || !SAFE_ID.test(name)) {
        return NextResponse.json({ error: "Invalid skill name" }, { status: 400 });
      }
      const output = run("openclaw", ["skills", "remove", name]);
      return NextResponse.json({ success: true, output });
    }

    case "enable": {
      const name = body.name as string;
      if (!name || !SAFE_ID.test(name)) {
        return NextResponse.json({ error: "Invalid skill name" }, { status: 400 });
      }
      const output = run("openclaw", ["skills", "enable", name]);
      return NextResponse.json({ success: true, output });
    }

    case "disable": {
      const name = body.name as string;
      if (!name || !SAFE_ID.test(name)) {
        return NextResponse.json({ error: "Invalid skill name" }, { status: 400 });
      }
      const output = run("openclaw", ["skills", "disable", name]);
      return NextResponse.json({ success: true, output });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
