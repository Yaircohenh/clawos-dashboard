import { join, dirname } from "path";
import { homedir } from "os";
import { existsSync } from "fs";

// ── Env-overridable roots ──────────────────────────────────────────────

/** ~/.openclaw (runtime home for gateway, agents, sessions, logs) */
export function openclawHome(): string {
  return process.env.CLAWOS_OPENCLAW_HOME || join(homedir(), ".openclaw");
}

/**
 * Infrastructure repo dir (agents/, workspace/, cron/, memory/, scripts/, templates/).
 * Checks env override, then ~/Projects/clawos/clawos-infra, then /workspace.
 */
export function infraDir(): string {
  if (process.env.CLAWOS_INFRA_DIR) return process.env.CLAWOS_INFRA_DIR;
  const candidate = join(homedir(), "Projects", "clawos", "clawos-infra");
  if (existsSync(candidate)) return candidate;
  return "/workspace";
}

// ── OpenClaw runtime paths ─────────────────────────────────────────────

export function openclawConfigPath(): string {
  return join(openclawHome(), "openclaw.json");
}

export function agentsRuntimeDir(): string {
  return join(openclawHome(), "agents");
}

export function agentDir(id: string): string {
  return join(agentsRuntimeDir(), id);
}

export function agentSessionsDir(id: string): string {
  return join(agentDir(id), "sessions");
}

export function workspaceDir(): string {
  return join(openclawHome(), "workspace");
}

export function logsDir(): string {
  return join(openclawHome(), "logs");
}

// ── Files that live in infra but may be copied to ~/.openclaw ──────────

function firstExisting(...paths: string[]): string {
  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  return paths[0]; // fallback to first candidate even if missing
}

export function securityPolicyPath(): string {
  return firstExisting(
    join(openclawHome(), "workspace", "security-policy.json"),
    join(infraDir(), "workspace", "security-policy.json"),
  );
}

export function cronJobsPath(): string {
  return firstExisting(
    join(openclawHome(), "cron", "jobs.json"),
    join(infraDir(), "cron", "jobs.json"),
  );
}

export function agentScoresPath(): string {
  return firstExisting(
    join(openclawHome(), "memory", "agent-scores.json"),
    join(infraDir(), "memory", "agent-scores.json"),
  );
}

export function costLimitsPath(): string {
  return join(openclawHome(), "cost-limits.json");
}

export function dashboardModelsPath(): string {
  return join(openclawHome(), "dashboard-models.json");
}

export function ralhpProjectsDir(): string {
  return firstExisting(
    join(openclawHome(), "workspace", "ops", "projects"),
    join(infraDir(), "workspace", "ops", "projects"),
  );
}

// ── Dashboard-specific paths ───────────────────────────────────────────

export function uploadDir(): string {
  return process.env.CLAWOS_UPLOAD_DIR || "/tmp/clawos-uploads";
}

export function inboxDir(): string {
  return process.env.CLAWOS_INBOX_DIR || join(homedir(), "Inbox");
}

// ── Infra source dirs (for agent-files editing) ────────────────────────

export function infraWorkspaceDir(): string {
  return join(infraDir(), "workspace");
}

export function infraAgentsDir(): string {
  return join(infraDir(), "agents");
}

// ── QMD binary ─────────────────────────────────────────────────────────

export function qmdBin(): string {
  if (process.env.QMD_BIN) return process.env.QMD_BIN;
  // Check PATH first (which() equivalent)
  const pathDirs = (process.env.PATH || "").split(":");
  for (const dir of pathDirs) {
    const candidate = join(dir, "qmd");
    if (existsSync(candidate)) return candidate;
  }
  // Fallback: common bun location
  return join(homedir(), ".bun", "bin", "qmd");
}

// ── .env file (for key persistence) ────────────────────────────────────

export function envFilePath(): string {
  if (process.env.CLAWOS_ENV_FILE) return process.env.CLAWOS_ENV_FILE;
  // Check install dir first
  const installEnv = join(homedir(), "Projects", "clawos", ".env");
  if (existsSync(installEnv)) return installEnv;
  // Fallback: dashboard .env.local
  return join(dirname(__dirname), ".env.local");
}

export function agentsBackupDir(): string {
  return join(openclawHome(), "agents-backup");
}
