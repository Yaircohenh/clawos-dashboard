import { cookies } from "next/headers";
import { readFileSync } from "fs";

const SESSION_COOKIE = "clawos_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getDashboardPassword(): string {
  // Check environment variable first, then fall back to a config file
  if (process.env.DASHBOARD_PASSWORD) {
    return process.env.DASHBOARD_PASSWORD;
  }
  try {
    const config = JSON.parse(
      readFileSync("/home/node/.openclaw/openclaw.json", "utf-8")
    );
    return config.dashboard?.password || "clawos";
  } catch {
    return "clawos";
  }
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Simple in-memory session store (resets on server restart)
const validSessions = new Set<string>();

export async function createSession(): Promise<string> {
  const token = generateToken();
  validSessions.add(token);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
  return token;
}

export async function validateSession(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get(SESSION_COOKIE);
    if (!session?.value) return false;
    return validSessions.has(session.value);
  } catch {
    return false;
  }
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE);
  if (session?.value) {
    validSessions.delete(session.value);
  }
  cookieStore.delete(SESSION_COOKIE);
}

export function checkPassword(password: string): boolean {
  const expected = getDashboardPassword();
  // Constant-time comparison
  if (password.length !== expected.length) return false;
  let result = 0;
  for (let i = 0; i < password.length; i++) {
    result |= password.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return result === 0;
}

export function maskSecret(value: string, showChars = 4): string {
  if (!value || value.length <= showChars) return "****";
  return value.slice(0, showChars) + "..." + value.slice(-showChars);
}
