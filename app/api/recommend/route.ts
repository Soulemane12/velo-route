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

/** Extract a place name from a natural language message using Claude. */
async function extractPlaceName(message: string): Promise<string | null> {
  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 30,
      system:
        "Extract the NYC place name from the message. Return ONLY the place name (e.g. 'Symphony Space', 'Central Park'). If no specific place is mentioned, return 'NONE'.",
      messages: [{ role: "user", content: message }],
    });
    const text = (msg.content[0] as { type: "text"; text: string }).text.trim();
    return text === "NONE" || !text ? null : text;
  } catch {
    return null;
  }
}

/** Geocode a place name biased to NYC. Tries Search Box API first, then v5. */
async function geocodeNYC(
  query: string,
  proximity: [number, number]
): Promise<{ coords: [number, number]; name: string } | null> {
  if (!MAPBOX_TOKEN) return null;

  // 1. Search Box API (v6) — better POI/business coverage
  try {
    const url =
      `https://api.mapbox.com/search/searchbox/v1/forward?` +
      `q=${encodeURIComponent(query)}` +
      `&access_token=${MAPBOX_TOKEN}` +
      `&limit=1` +
      `&proximity=${proximity[0]},${proximity[1]}` +
      `&bbox=-74.2591,40.4774,-73.7004,40.9176`;
    const res = await fetch(url);
    const data = await res.json();
    const feature = data.features?.[0];
    if (feature?.geometry?.coordinates) {
      const [lng, lat] = feature.geometry.coordinates as [number, number];
      return { coords: [lng, lat], name: feature.properties?.name ?? query };
    }
  } catch { /* fall through */ }

  // 2. Geocoding v5 fallback
  try {
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
      `?access_token=${MAPBOX_TOKEN}` +
      `&limit=1` +
      `&proximity=${proximity[0]},${proximity[1]}` +
      `&bbox=-74.2591,40.4774,-73.7004,40.9176`;
    const res = await fetch(url);
    const data = await res.json();
    const feature = data.features?.[0];
    if (feature && feature.relevance >= 0.4) {
      return { coords: feature.center as [number, number], name: feature.place_name.split(",")[0] };
    }
  } catch { /* fall through */ }

  // 3. Last resort: OpenStreetMap Nominatim — best venue/POI coverage
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(query + " New York")}&format=json&limit=1` +
      `&viewbox=-74.2591,40.9176,-73.7004,40.4774&bounded=1`;
    const res = await fetch(url, { headers: { "User-Agent": "velo-route-app/1.0" } });
    const data = await res.json();
    if (data[0]) {
      const lng = parseFloat(data[0].lon);
      const lat = parseFloat(data[0].lat);
      const name = data[0].display_name.split(",")[0].trim();
      return { coords: [lng, lat], name };
    }
  } catch { /* fall through */ }

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
      const viaTag = r.via ? ` [custom route via ${r.via}]` : "";
      return `Route ${i + 1}${viaTag}: ${r.riskLevel} risk (${r.riskScore}/100), ${duration}, ${distance}${extra}. Factors: ${r.reasons.join("; ")}`;
    })
    .join("\n");

  const n = routes.length;
  const routeChoices = Array.from({ length: n }, (_, i) => `"Route ${i + 1}:"`).join(", ");

  const question = concerns.trim()
    ? `The rider says: "${concerns.trim()}"${placeContext}\n\nWhich route best matches? Start EXACTLY with one of ${routeChoices}, then one sentence. Under 30 words total.`
    : `Which route? Start EXACTLY with one of ${routeChoices}, then one sentence on the key safety tradeoff. Under 30 words total.`;

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
    const placeName = await extractPlaceName(concerns.trim());
    if (placeName) {
      const result = await geocodeNYC(placeName, center);
      if (result) {
        const { coords, name } = result;
        const [lng, lat] = coords;
        const distances = routes
          .map((route, i) => ({
            num: i + 1,
            m: Math.round(minDistToRoute(route.geometry.coordinates, lng, lat)),
          }))
          .sort((a, b) => a.m - b.m);

        placeContext =
          `\n\nLocation data: "${name}" is at [${lat.toFixed(4)}, ${lng.toFixed(4)}]. ` +
          distances.map((d) => `Route ${d.num} passes ${d.m}m away`).join(", ") +
          `. Route ${distances[0].num} is closest.`;
      }
    }
  }

  const stream = client.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 70,
    system:
      "You are a direct NYC cycling route advisor. Always start with 'Route N:' where N is the route number. One sentence, under 30 words. When a via-route exists (generated through a specific place), prefer it if it matches the rider's request. When location data is provided, use it to pick the best route. No fluff.",
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
