import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { agentScoresPath } from "@/lib/paths";

export const dynamic = "force-dynamic";

const SCORES_PATH = agentScoresPath();

export async function GET() {
  try {
    const raw = readFileSync(SCORES_PATH, "utf-8");
    const scores = JSON.parse(raw);
    return NextResponse.json(scores);
  } catch {
    return NextResponse.json({}, { status: 200 });
  }
}
