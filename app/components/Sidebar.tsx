"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "./ThemeProvider";

const navItems = [
  { href: "/chat", label: "Chat", icon: "💬" },
  { href: "/monitor", label: "Monitor", icon: "📹" },
  { href: "/", label: "Overview", icon: "📊", dividerAfter: true },
  { href: "/agents", label: "Agents", icon: "🤖" },
  { href: "/models", label: "Models", icon: "🧬" },
  { href: "/sessions", label: "Sessions", icon: "🔄" },
  { href: "/skills", label: "Skills", icon: "🧩" },
  { href: "/plugins", label: "Plugins", icon: "🔌" },
  { href: "/jobs", label: "Jobs", icon: "⏰" },
  { href: "/approvals", label: "Approvals", icon: "✅" },
  { href: "/memory", label: "Memory", icon: "🧠" },
  { href: "/channels", label: "Channels", icon: "📡" },
  { href: "/costs", label: "Costs", icon: "💸" },
  { href: "/health", label: "Health", icon: "🏥" },
  { href: "/logs", label: "Logs", icon: "📋" },
];

const settingsItems = [
  { href: "/keys", label: "Keys & Connections", icon: "🔑" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0 h-screen sticky top-0">
      <div className="text-xl font-bold px-7 py-4">🐾 ClawOS</div>

      {/* Scrollable nav area */}
      <div className="flex-1 overflow-y-auto px-4 pb-2">
        <nav className="flex flex-col gap-0.5">
          {navItems.map((item) => (
            <div key={item.href}>
              <Link
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  pathname === item.href
                    ? "bg-gray-800 text-white"
                    : "text-gray-300 hover:bg-gray-800 hover:text-white"
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
              {item.dividerAfter && (
                <div className="mt-2 mb-1 border-t border-gray-800" />
              )}
            </div>
          ))}
        </nav>

        <div className="mt-4 mb-2 px-3 text-xs text-gray-600 uppercase tracking-wider font-medium">
          Settings
        </div>
        <nav className="flex flex-col gap-0.5">
          {settingsItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                pathname === item.href
                  ? "bg-gray-800 text-white"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>

      {/* Pinned bottom section — always visible */}
      <div className="px-4 py-3 border-t border-gray-800 space-y-1 shrink-0">
        <button
          onClick={toggle}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors w-full"
        >
          <span>{theme === "dark" ? "☀️" : "🌙"}</span>
          <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
        </button>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-red-900/50 hover:text-red-400 transition-colors w-full"
        >
          <span>🚪</span>
          <span>Logout</span>
        </button>
        <div className="px-3 text-xs text-gray-500">ClawOS v1.0</div>
      </div>
    </aside>
  );
}
