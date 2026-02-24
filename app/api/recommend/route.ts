import Anthropic from "@anthropic-ai/sdk";
import type { Route } from "@/app/types";

const client = new Anthropic();

function buildPrompt(routes: Route[], concerns: string): string {
  const routeLines = routes
    .map((r, i) => {
      const duration = `${Math.round(r.durationSec / 60)} min`;
      const distance = `${(r.distanceM / 1000).toFixed(1)} km`;
      const m = r.metrics;
      const extra = m
        ? ` · ${Math.round(m.pctHighCrashCells * 100)}% crash-dense, ${m.complexIntersectionCount} complex intersections`
        : "";
      return `Route ${i + 1}: ${r.riskLevel} risk (${r.riskScore}/100), ${duration}, ${distance}${extra}. Factors: ${r.reasons.join("; ")}`;
    })
    .join("\n");

  const question = concerns.trim()
    ? `The rider says: "${concerns.trim()}"\n\nWhich route best matches what they want? Start EXACTLY with "Route 1:", "Route 2:", or "Route 3:", then one sentence explaining how it fits their request. Under 30 words total.`
    : `Which route? Start EXACTLY with "Route 1:", "Route 2:", or "Route 3:", then one sentence on the key safety tradeoff. Under 30 words total.`;

  return `${routeLines}\n\n${question}`;
}

export async function POST(req: Request) {
  const body = await req.json();
  const routes: Route[] = body.routes ?? [];
  const concerns: string = body.concerns ?? "";

  if (routes.length === 0) {
    return new Response("Missing routes", { status: 400 });
  }

  const stream = client.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 70,
    system:
      "You are a direct NYC cycling route advisor. Always start your response with 'Route N:' (N = 1, 2, or 3). One sentence only, under 30 words. When the rider gives a natural language instruction (e.g. 'avoid busy streets', 'I want bike lanes', 'safest option'), pick the route that best matches. No fluff.",
    messages: [{ role: "user", content: buildPrompt(routes, concerns) }],
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
