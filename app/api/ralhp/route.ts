import { NextRequest, NextResponse } from "next/server";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const PROJECTS_DIR = "/workspace/workspace/ops/projects";

interface Step {
  id: string;
  title: string;
  agent: string;
  status: string;
  qa_cycles: number;
  depends_on: string[];
}

interface Project {
  name: string;
  goal: string;
  created_at: string;
  dir: string;
  steps: Step[];
  progress: Record<string, unknown>[];
}

function parsePlanYml(content: string): { project: string; goal: string; created_at: string; steps: Step[] } {
  const lines = content.split("\n");
  let project = "";
  let goal = "";
  let created_at = "";
  const steps: Step[] = [];

  let currentStep: Partial<Step> | null = null;
  let inDependsOn = false;

  for (const line of lines) {
    const trimmed = line.trimStart();

    // Top-level fields
    if (line.startsWith("project:")) {
      project = line.replace("project:", "").trim().replace(/^["']|["']$/g, "");
    } else if (line.startsWith("goal:")) {
      goal = line.replace("goal:", "").trim().replace(/^["']|["']$/g, "");
    } else if (line.startsWith("created_at:")) {
      created_at = line.replace("created_at:", "").trim().replace(/^["']|["']$/g, "");
    }

    // Step parsing — look for `- id:` pattern
    if (trimmed.startsWith("- id:")) {
      if (currentStep && currentStep.id) {
        steps.push({
          id: currentStep.id,
          title: currentStep.title || "",
          agent: currentStep.agent || "",
          status: currentStep.status || "pending",
          qa_cycles: currentStep.qa_cycles || 0,
          depends_on: currentStep.depends_on || [],
        });
      }
      currentStep = { id: trimmed.replace("- id:", "").trim().replace(/^["']|["']$/g, ""), depends_on: [] };
      inDependsOn = false;
    } else if (currentStep) {
      if (trimmed.startsWith("title:")) {
        currentStep.title = trimmed.replace("title:", "").trim().replace(/^["']|["']$/g, "");
        inDependsOn = false;
      } else if (trimmed.startsWith("agent:")) {
        currentStep.agent = trimmed.replace("agent:", "").trim().replace(/^["']|["']$/g, "");
        inDependsOn = false;
      } else if (trimmed.startsWith("status:")) {
        currentStep.status = trimmed.replace("status:", "").trim().replace(/^["']|["']$/g, "");
        inDependsOn = false;
      } else if (trimmed.startsWith("qa_cycles:")) {
        currentStep.qa_cycles = parseInt(trimmed.replace("qa_cycles:", "").trim(), 10) || 0;
        inDependsOn = false;
      } else if (trimmed.startsWith("depends_on:")) {
        inDependsOn = true;
        // Check for inline array: depends_on: ["1.1", "1.2"]
        const inline = trimmed.replace("depends_on:", "").trim();
        if (inline.startsWith("[")) {
          const matches = inline.match(/["']([^"']+)["']/g);
          currentStep.depends_on = matches ? matches.map(m => m.replace(/["']/g, "")) : [];
          inDependsOn = false;
        }
      } else if (inDependsOn && trimmed.startsWith("- ")) {
        currentStep.depends_on = currentStep.depends_on || [];
        currentStep.depends_on.push(trimmed.replace("- ", "").trim().replace(/^["']|["']$/g, ""));
      } else if (!trimmed.startsWith("-") && !trimmed.startsWith("#") && trimmed.includes(":")) {
        inDependsOn = false;
      }
    }
  }

  // Push last step
  if (currentStep && currentStep.id) {
    steps.push({
      id: currentStep.id,
      title: currentStep.title || "",
      agent: currentStep.agent || "",
      status: currentStep.status || "pending",
      qa_cycles: currentStep.qa_cycles || 0,
      depends_on: currentStep.depends_on || [],
    });
  }

  return { project, goal, created_at, steps };
}

function parseProgressJsonl(content: string): Record<string, unknown>[] {
  const entries: Record<string, unknown>[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed));
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`ralhp:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  try {
    let dirs: string[];
    try {
      dirs = readdirSync(PROJECTS_DIR).filter((name) => {
        try {
          return statSync(join(PROJECTS_DIR, name)).isDirectory();
        } catch {
          return false;
        }
      });
    } catch {
      return NextResponse.json({ projects: [] });
    }

    const projects: Project[] = [];

    for (const dir of dirs) {
      const projectDir = join(PROJECTS_DIR, dir);
      const planPath = join(projectDir, "plan.yml");
      const progressPath = join(projectDir, "progress.jsonl");

      let planContent = "";
      try {
        planContent = readFileSync(planPath, "utf-8");
      } catch {
        continue; // skip directories without a plan.yml
      }

      const parsed = parsePlanYml(planContent);

      let progress: Record<string, unknown>[] = [];
      try {
        progress = parseProgressJsonl(readFileSync(progressPath, "utf-8"));
      } catch {
        // no progress file yet — that's fine
      }

      projects.push({
        name: parsed.project || dir,
        goal: parsed.goal,
        created_at: parsed.created_at,
        dir,
        steps: parsed.steps,
        progress,
      });
    }

    return NextResponse.json({ projects });
  } catch {
    return NextResponse.json({ projects: [] });
  }
}
