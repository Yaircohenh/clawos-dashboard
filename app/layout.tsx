import type { Metadata } from "next";
import Link from "next/link";
import { Toaster } from "sonner";
import { StatusBar } from "./components/StatusBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClawOS Dashboard",
  description: "ClawOS Personal AI Operating System Dashboard",
};

const navItems = [
  { href: "/chat", label: "Chat", icon: "💬" },
  { href: "/monitor", label: "Monitor", icon: "📹" },
  { href: "/", label: "Overview", icon: "📊" },
  { href: "/agents", label: "Agents", icon: "🤖" },
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
  { href: "/keys", label: "Keys & Connections", icon: "🔑", section: true },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "#1f2937",
              border: "1px solid #374151",
              color: "#f3f4f6",
            },
          }}
        />
        <div className="flex min-h-screen">
          <aside className="w-56 bg-gray-900 border-r border-gray-800 p-4 flex flex-col gap-1 shrink-0">
            <div className="text-xl font-bold mb-6 px-3 py-2">
              🐾 ClawOS
            </div>
            <nav className="flex flex-col gap-0.5">
              {navItems.map((item, i) => (
                <div key={item.href}>
                  {item.section && (
                    <div className="mt-4 mb-2 px-3 text-xs text-gray-600 uppercase tracking-wider font-medium">
                      Settings
                    </div>
                  )}
                  {!item.section && i === 2 && (
                    <div className="mt-3 mb-1 border-t border-gray-800" />
                  )}
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-colors text-sm"
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                </div>
              ))}
            </nav>
            <div className="mt-auto pt-4 border-t border-gray-800 px-3 text-xs text-gray-500">
              ClawOS v1.0
            </div>
          </aside>
          <div className="flex-1 flex flex-col min-w-0">
            <StatusBar />
            <main className="flex-1 p-8 overflow-auto">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
