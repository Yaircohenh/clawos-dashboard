import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { checkRateLimit } from "@/lib/rate-limit";
import { getCronJobs, getAgents } from "@/lib/data";

export const dynamic = "force-dynamic";

const SAFE_ID = /^[a-zA-Z0-9_\-]+$/;
const JOBS_PATH = "/workspace/cron/jobs.json";

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`cron:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }
  return NextResponse.json({ jobs: getCronJobs(), agents: getAgents().map(a => a.id) });
}

function readJobs(): { jobs: Record<string, unknown>[] } {
  try {
    return JSON.parse(readFileSync(JOBS_PATH, "utf-8"));
  } catch {
    return { jobs: [] };
  }
}

function writeJobs(data: { jobs: Record<string, unknown>[] }) {
  writeFileSync(JOBS_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`cron:${ip}`);
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
    case "add": {
      const id = (body.id as string || "").trim();
      const name = (body.name as string || "").trim();
      const schedule = (body.schedule as string || "").trim();
      const agent = (body.agent as string || "").trim();
      const task = (body.task as string || "").trim();

      if (!id || !SAFE_ID.test(id)) {
        return NextResponse.json({ error: "Invalid job ID (alphanumeric, hyphens, underscores)" }, { status: 400 });
      }
      if (!name || name.length > 100) {
        return NextResponse.json({ error: "Name required (max 100 chars)" }, { status: 400 });
      }
      if (!schedule) {
        return NextResponse.json({ error: "Schedule required" }, { status: 400 });
      }
      if (!agent || !SAFE_ID.test(agent)) {
        return NextResponse.json({ error: "Valid agent ID required" }, { status: 400 });
      }
      if (!task || task.length > 500) {
        return NextResponse.json({ error: "Task description required (max 500 chars)" }, { status: 400 });
      }

      const data = readJobs();
      if (data.jobs.some((j) => j.id === id)) {
        return NextResponse.json({ error: "Job ID already exists" }, { status: 409 });
      }

      data.jobs.push({
        id,
        name,
        schedule,
        agent,
        task,
        enabled: true,
      });
      writeJobs(data);

      return NextResponse.json({ success: true });
    }

    case "toggle": {
      const jobId = body.jobId as string;
      if (!jobId || !SAFE_ID.test(jobId)) {
        return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
      }
      const enabled = body.enabled as boolean;

      const data = readJobs();
      const job = data.jobs.find((j) => j.id === jobId);
      if (!job) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }
      job.enabled = !!enabled;
      writeJobs(data);

      return NextResponse.json({ success: true });
    }

    case "delete": {
      const jobId = body.jobId as string;
      if (!jobId || !SAFE_ID.test(jobId)) {
        return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
      }

      const data = readJobs();
      data.jobs = data.jobs.filter((j) => j.id !== jobId);
      writeJobs(data);

      return NextResponse.json({ success: true });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
