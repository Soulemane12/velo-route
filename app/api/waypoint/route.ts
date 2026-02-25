/**
 * Waypoint route — extract a place name from a natural language message,
 * geocode it, fetch a new Mapbox cycling route that passes through it,
 * score it, and return a full Route object ready to add to the UI.
 */
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { Route } from "@/app/types";
import { scoreGeometry, ensureLoaded } from "@/app/lib/scoring/scorer";
import { computeMetrics, generateReasonDetails, generateReasonStrings } from "@/app/lib/scoring/explainer";
import { buildSegments } from "@/app/lib/scoring/segmentizer";

const TOKEN = process.env.MAPBOX_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const anthropic = new Anthropic();

// ── Place extraction ───────────────────────────────────────────────────────────

/**
 * Use Claude Haiku to extract a geocodable place name from natural language.
 * Returns null if no place is mentioned.
 */
async function extractPlaceName(message: string): Promise<string | null> {
  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 30,
      system:
        "Extract the NYC place name from the message. Return ONLY the place name (e.g. 'Forest Park', 'Johnny\\'s Cafe on Myrtle Ave'). If no specific place is mentioned, return 'NONE'.",
      messages: [{ role: "user", content: message }],
    });
    const text = (msg.content[0] as { type: "text"; text: string }).text.trim();
    return text === "NONE" || !text ? null : text;
  } catch {
    return null;
  }
}

// ── Geocoding ─────────────────────────────────────────────────────────────────

async function geocodeNYC(
  query: string,
  proximity: [number, number]
): Promise<{ coords: [number, number]; placeName: string } | null> {
  if (!TOKEN) return null;

  // 1. Try Mapbox Search Box API (v6) — better POI/business coverage
  try {
    const url =
      `https://api.mapbox.com/search/searchbox/v1/forward?` +
      `q=${encodeURIComponent(query)}` +
      `&access_token=${TOKEN}` +
      `&limit=1` +
      `&proximity=${proximity[0]},${proximity[1]}` +
      `&bbox=-74.2591,40.4774,-73.7004,40.9176`;
    const res = await fetch(url);
    const data = await res.json();
    const feature = data.features?.[0];
    if (feature?.geometry?.coordinates) {
      const [lng, lat] = feature.geometry.coordinates as [number, number];
      const name =
        feature.properties?.name ?? feature.properties?.full_address ?? query;
      return { coords: [lng, lat], placeName: name };
    }
  } catch {
    // fall through to v5
  }

  // 2. Fallback: Geocoding v5 (landmarks, addresses, neighborhoods)
  try {
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
      `?access_token=${TOKEN}` +
      `&limit=1` +
      `&proximity=${proximity[0]},${proximity[1]}` +
      `&bbox=-74.2591,40.4774,-73.7004,40.9176`;
    const res = await fetch(url);
    const data = await res.json();
    const feature = data.features?.[0];
    if (feature && feature.relevance >= 0.4) {
      return {
        coords: feature.center as [number, number],
        placeName: feature.place_name as string,
      };
    }
  } catch {
    // fall through
  }

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
      return { coords: [lng, lat], placeName: name };
    }
  } catch {
    // fall through
  }

  return null;
}

// ── Mapbox Directions with 3 waypoints ───────────────────────────────────────

async function fetchViaRoute(
  origin: [number, number],
  waypoint: [number, number],
  destination: [number, number]
): Promise<{
  durationSec: number;
  distanceM: number;
  geometry: { type: "LineString"; coordinates: [number, number][] };
} | null> {
  if (!TOKEN) return null;
  const coords = [origin, waypoint, destination]
    .map(([lng, lat]) => `${lng},${lat}`)
    .join(";");
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/cycling/${coords}` +
    `?alternatives=false&geometries=geojson&steps=false&overview=full&access_token=${TOKEN}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || !data.routes?.[0]) return null;
    const r = data.routes[0];
    return {
      durationSec: Math.round(r.duration),
      distanceM: Math.round(r.distance),
      geometry: r.geometry,
    };
  } catch {
    return null;
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const body = await req.json();
  const origin: [number, number] = body.origin;
  const destination: [number, number] = body.destination;
  const message: string = body.message ?? "";

  if (!origin || !destination || !message.trim()) {
    return NextResponse.json({ ok: false, reason: "Missing params" });
  }

  if (!TOKEN) {
    return NextResponse.json({ ok: false, reason: "No Mapbox token" });
  }

  // 1. Extract the place name from natural language, then geocode it
  const proximity: [number, number] = [
    (origin[0] + destination[0]) / 2,
    (origin[1] + destination[1]) / 2,
  ];

  const placeName = await extractPlaceName(message);
  if (!placeName) {
    return NextResponse.json({ ok: false, reason: "No place mentioned in message" });
  }

  const place = await geocodeNYC(placeName, proximity);
  if (!place) {
    return NextResponse.json({ ok: false, reason: `"${placeName}" not found in NYC` });
  }

  // 2. Fetch a new Mapbox route: origin → place → destination
  const raw = await fetchViaRoute(origin, place.coords, destination);
  if (!raw) {
    return NextResponse.json({ ok: false, reason: "Mapbox could not route via that waypoint" });
  }

  // 3. Score the new route with our crash/infrastructure data
  try {
    ensureLoaded();
    const output = scoreGeometry(raw.geometry.coordinates);
    const metrics = computeMetrics(output);
    const reasonDetails = generateReasonDetails(metrics, output);
    const reasons = generateReasonStrings(reasonDetails);
    const segments = buildSegments(output.samples, raw.geometry.coordinates);

    // Use the extracted place name (what the user said) as the label,
    // falling back to the geocoded name if extraction was too generic.
    const shortName = placeName.length <= 40 ? placeName : place.placeName.split(",")[0].trim();

    const route: Route = {
      id: `via-${Date.now()}`,
      durationSec: raw.durationSec,
      distanceM: raw.distanceM,
      geometry: raw.geometry,
      riskScore: output.riskScore,
      riskLevel: output.riskLevel,
      reasons,
      reasonDetails,
      segments,
      metrics,
      provider: "mapbox",
      via: shortName,
    };

    return NextResponse.json({ ok: true, route, placeName: shortName });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, reason: `Scoring failed: ${msg}` });
  }
}
