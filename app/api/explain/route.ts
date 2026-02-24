import Anthropic from "@anthropic-ai/sdk";
import type { Route } from "@/app/types";

const client = new Anthropic();

function buildPrompt(route: Route, routeIndex: number, totalRoutes: number): string {
  const duration = `${Math.round(route.durationSec / 60)} min`;
  const distance = `${(route.distanceM / 1000).toFixed(1)} km`;
  const m = route.metrics;

  const dataLines = m
    ? [
        `Crash-dense segments: ${Math.round(m.pctHighCrashCells * 100)}% of route`,
        `Major road exposure: ${Math.round(m.pctMajorRoadCells * 100)}%`,
        `Poor bike infrastructure: ${Math.round(m.pctPoorBikeInfraCells * 100)}%`,
        `Complex intersections nearby: ${m.complexIntersectionCount}`,
        `Bike lane continuity breaks: ${m.continuityBreakCount}`,
      ].join("\n")
    : "";

  return `Route ${routeIndex + 1} of ${totalRoutes} — ${route.riskLevel} risk (score ${route.riskScore}/100)
Duration: ${duration} · Distance: ${distance}
Risk factors: ${route.reasons.join("; ")}
${dataLines}

In 1-2 sentences max: state the main risk and one actionable tip. Be blunt and specific.`;
}

export async function POST(req: Request) {
  const body = await req.json();
  const route: Route = body.route;
  const routeIndex: number = body.routeIndex ?? 0;
  const totalRoutes: number = body.totalRoutes ?? 1;

  if (!route) {
    return new Response("Missing route", { status: 400 });
  }

  const stream = client.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 80,
    system:
      "You are a blunt NYC cycling safety analyst. One or two sentences only — no more. State the biggest risk and one tip. No bullet points, no fluff.",
    messages: [{ role: "user", content: buildPrompt(route, routeIndex, totalRoutes) }],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(chunk.delta.text));
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
