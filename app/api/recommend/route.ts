import Anthropic from "@anthropic-ai/sdk";
import type { Route } from "@/app/types";

const client = new Anthropic();
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// ── Geo helpers ───────────────────────────────────────────────────────────────

function getRoutesCenter(routes: Route[]): [number, number] {
  let sumLng = 0, sumLat = 0, count = 0;
  for (const route of routes) {
    for (const [lng, lat] of route.geometry.coordinates) {
      sumLng += lng; sumLat += lat; count++;
    }
  }
  return count > 0 ? [sumLng / count, sumLat / count] : [-73.985, 40.758];
}

function minDistToRoute(coords: [number, number][], targetLng: number, targetLat: number): number {
  let min = Infinity;
  for (const [lng, lat] of coords) {
    const dlat = (lat - targetLat) * 111000;
    const dlng = (lng - targetLng) * 84000;
    const d = Math.sqrt(dlat * dlat + dlng * dlng);
    if (d < min) min = d;
  }
  return min;
}

/** Geocode a query biased to NYC. Returns null if not a real place or low confidence. */
async function geocodeNYC(query: string, proximity: [number, number]): Promise<[number, number] | null> {
  if (!MAPBOX_TOKEN) return null;
  try {
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
      `?access_token=${MAPBOX_TOKEN}` +
      `&limit=1` +
      `&proximity=${proximity[0]},${proximity[1]}` +
      `&bbox=-74.2591,40.4774,-73.7004,40.9176`; // NYC bounding box
    const res = await fetch(url);
    const data = await res.json();
    const feature = data.features?.[0];
    // Only trust high-confidence results (relevance ≥ 0.5)
    if (feature && feature.relevance >= 0.5) {
      return feature.center as [number, number];
    }
  } catch {
    // silently fall through
  }
  return null;
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(routes: Route[], concerns: string, placeContext: string): string {
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
    ? `The rider says: "${concerns.trim()}"${placeContext}\n\nWhich route best matches? Start EXACTLY with "Route 1:", "Route 2:", or "Route 3:", then one sentence. Under 30 words total.`
    : `Which route? Start EXACTLY with "Route 1:", "Route 2:", or "Route 3:", then one sentence on the key safety tradeoff. Under 30 words total.`;

  return `${routeLines}\n\n${question}`;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const body = await req.json();
  const routes: Route[] = body.routes ?? [];
  const concerns: string = body.concerns ?? "";

  if (routes.length === 0) {
    return new Response("Missing routes", { status: 400 });
  }

  // Try to resolve a location from the rider's message
  let placeContext = "";
  if (concerns.trim()) {
    const center = getRoutesCenter(routes);
    const coords = await geocodeNYC(concerns.trim(), center);
    if (coords) {
      const [lng, lat] = coords;
      const distances = routes
        .map((route, i) => ({
          num: i + 1,
          m: Math.round(minDistToRoute(route.geometry.coordinates, lng, lat)),
        }))
        .sort((a, b) => a.m - b.m);

      placeContext =
        `\n\nLocation data: "${concerns.trim()}" geocodes to [${lat.toFixed(4)}, ${lng.toFixed(4)}]. ` +
        distances.map((d) => `Route ${d.num} passes ${d.m}m away`).join(", ") +
        `. Route ${distances[0].num} is closest.`;
    }
  }

  const stream = client.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 70,
    system:
      "You are a direct NYC cycling route advisor. Always start with 'Route N:' (N = 1, 2, or 3). One sentence, under 30 words. When location data is provided, use it to pick the route that passes closest to the requested place. No fluff.",
    messages: [{ role: "user", content: buildPrompt(routes, concerns, placeContext) }],
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
