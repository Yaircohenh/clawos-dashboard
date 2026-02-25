import type { Metadata } from "next";
import Link from "next/link";
import { Toaster } from "sonner";
import { StatusBar } from "./components/StatusBar";
import { ThemeProvider } from "./components/ThemeProvider";
import { Sidebar } from "./components/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClawOS Dashboard",
  description: "ClawOS Personal AI Operating System Dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        <ThemeProvider>
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
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
              <StatusBar />
              <main className="flex-1 p-8 overflow-auto">{children}</main>
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
