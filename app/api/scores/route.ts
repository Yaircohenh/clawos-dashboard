import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { agentScoresPath } from "@/lib/paths";

export const dynamic = "force-dynamic";

function getScoresPath() { return agentScoresPath(); }

export async function GET() {
  try {
    const raw = readFileSync(getScoresPath(), "utf-8");
    const scores = JSON.parse(raw);
    return NextResponse.json(scores);
  } catch {
    return NextResponse.json({}, { status: 200 });
  }
}
