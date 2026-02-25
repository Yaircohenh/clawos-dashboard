import { NextRequest } from "next/server";
import { spawn } from "child_process";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const { allowed } = checkRateLimit(`chat:${ip}`);
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Rate limited" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { message?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 10000) {
    return new Response(
      JSON.stringify({ error: "Message required (max 10000 chars)" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Use SSE to stream the response from openclaw CLI
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const proc = spawn("openclaw", ["agent", "--agent", "main", "--message", message], {
        env: { ...process.env, NO_COLOR: "1" },
        timeout: 120000,
      });

      let output = "";

      proc.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        output += text;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "chunk", text })}\n\n`)
        );
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        // Ignore stderr noise but collect for debugging
        const text = chunk.toString();
        if (text.includes("Error") || text.includes("error")) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", text: text.trim() })}\n\n`
            )
          );
        }
      });

      proc.on("close", (code) => {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "done", code, output: output.trim() })}\n\n`
          )
        );
        controller.close();
      });

      proc.on("error", (err) => {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", text: err.message })}\n\n`
          )
        );
        controller.close();
      });

      // Handle client disconnect
      request.signal.addEventListener("abort", () => {
        proc.kill("SIGTERM");
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
