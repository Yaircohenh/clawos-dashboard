import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getModelRegistry, type ProviderWithStatus } from "@/lib/model-registry";
import { isProviderKeyAvailable } from "@/lib/auth-profiles";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`registry:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const registry = getModelRegistry();

  const providers: ProviderWithStatus[] = registry.providers.map((p) => ({
    ...p,
    keyConfigured: isProviderKeyAvailable(p.envKey),
  }));

  return NextResponse.json({ providers });
}
