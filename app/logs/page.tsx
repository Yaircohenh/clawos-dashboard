import { execFileSync } from "child_process";
import { readdirSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  agent?: string;
}

function getRecentLogs(): LogEntry[] {
  try {
    const logDir = "/home/node/.openclaw/logs";

    // Enumerate *.log files with fs — no shell glob expansion needed.
    let logFiles: string[];
    try {
      logFiles = readdirSync(logDir)
        .filter((f) => f.endsWith(".log"))
        .map((f) => join(logDir, f));
    } catch {
      return [];
    }

    if (logFiles.length === 0) return [];

    // execFileSync with an explicit args array — no shell invoked.
    const raw = execFileSync("tail", ["-100", ...logFiles], {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();

    if (!raw) return [];

    const entries: LogEntry[] = [];
    for (const line of raw.split("\n")) {
      const match = line.match(
        /^\[(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[^\]]*)\]\s*(\w+)?\s*(.*)/
      );
      if (match) {
        entries.push({
          timestamp: match[1],
          level: match[2] || "info",
          message: match[3],
        });
      } else if (line.trim()) {
        entries.push({
          timestamp: "",
          level: "info",
          message: line.trim(),
        });
      }
    }
    return entries.slice(-50);
  } catch {
    return [];
  }
}

export default function LogsPage() {
  const logs = getRecentLogs();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Logs</h1>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {logs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="mb-2">No log entries found.</p>
            <p className="text-sm">
              Logs appear here from gateway and agent activity.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800/50 max-h-[600px] overflow-y-auto">
            {logs.map((entry, i) => (
              <div key={i} className="px-4 py-2 text-sm hover:bg-gray-800/30 flex gap-4">
                <span className="text-gray-500 font-mono text-xs whitespace-nowrap min-w-[160px]">
                  {entry.timestamp}
                </span>
                <LevelBadge level={entry.level} />
                <span className="text-gray-300 break-all">{entry.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LevelBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    error: "text-red-400",
    warn: "text-yellow-400",
    info: "text-blue-400",
    debug: "text-gray-500",
  };
  return (
    <span
      className={`font-mono text-xs uppercase min-w-[40px] ${colors[level] || colors.info}`}
    >
      {level}
    </span>
  );
}
