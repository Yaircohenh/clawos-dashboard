import { readFileSync, writeFileSync, openSync, closeSync } from "fs";
import { join } from "path";
import { execFileSync, spawn, type SpawnOptions } from "child_process";
import { envFilePath } from "@/lib/paths";

export function restartGateway() {
  // Load API keys from .env into spawn environment
  const envPath = envFilePath();
  const env = { ...process.env };
  try {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq > 0) {
        env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
      }
    }
  } catch { /* .env may not exist yet */ }

  // Stop existing gateway
  try { execFileSync("openclaw", ["gateway", "stop"], { timeout: 5000, stdio: "ignore" }); } catch { /* ok */ }
  try { execFileSync("pkill", ["-f", "openclaw gateway"], { timeout: 5000, stdio: "ignore" }); } catch { /* ok */ }
  try { execFileSync("sleep", ["1"], { timeout: 3000 }); } catch { /* ok */ }

  // Start gateway with updated keys
  const installDir = envPath.replace(/\/\.env$/, "");
  const logPath = join(installDir, "gateway.log");
  const logFd = openSync(logPath, "a");

  const opts: SpawnOptions = {
    env,
    detached: true,
    stdio: ["ignore", logFd, logFd],
  };
  const gw = spawn("openclaw", [
    "gateway", "run",
    "--port", "18789",
    "--bind", "lan",
    "--auth", "token",
    "--allow-unconfigured",
  ], opts);
  gw.unref();
  closeSync(logFd);

  // Update PID file so stop.sh can find the new gateway
  if (gw.pid) {
    const pidFile = join(installDir, ".clawos.pids");
    try {
      const lines = readFileSync(pidFile, "utf-8").trim().split("\n");
      lines[0] = String(gw.pid);
      writeFileSync(pidFile, lines.join("\n") + "\n");
    } catch {
      writeFileSync(pidFile, String(gw.pid) + "\n");
    }
  }
}
