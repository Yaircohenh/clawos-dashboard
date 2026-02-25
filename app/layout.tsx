import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClawOS Dashboard",
  description: "ClawOS Personal AI Operating System Dashboard",
};

const navItems = [
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
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        <div className="flex min-h-screen">
          <aside className="w-56 bg-gray-900 border-r border-gray-800 p-4 flex flex-col gap-1">
            <div className="text-xl font-bold mb-6 px-3 py-2">
              🐾 ClawOS
            </div>
            <nav className="flex flex-col gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-colors text-sm"
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
            <div className="mt-auto pt-4 border-t border-gray-800 px-3 text-xs text-gray-500">
              ClawOS v1.0
            </div>
          </aside>
          <main className="flex-1 p-8 overflow-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
