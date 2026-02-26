import { NextResponse } from "next/server";
import { readFileSync } from "fs";

export const dynamic = "force-dynamic";

const SCORES_PATH = "/workspace/memory/agent-scores.json";

export async function GET() {
  try {
    const raw = readFileSync(SCORES_PATH, "utf-8");
    const scores = JSON.parse(raw);
    return NextResponse.json(scores);
  } catch {
    return NextResponse.json({}, { status: 200 });
  }
}
