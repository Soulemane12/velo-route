import { NextRequest, NextResponse } from "next/server";
import type { Route, RouteMode, RoutesResponse } from "@/app/types";
import { fetchCyclingRoutes } from "@/app/lib/routing/mapbox";
import { scoreGeometry, ensureLoaded, getArtifactStats } from "@/app/lib/scoring/scorer";
import { computeMetrics, generateReasonDetails, generateReasonStrings } from "@/app/lib/scoring/explainer";
import { buildSegments } from "@/app/lib/scoring/segmentizer";
import { rankRoutes } from "@/app/lib/scoring/ranker";

const VALID_MODES: RouteMode[] = ["balanced", "safer", "fastest"];

export async function POST(request: NextRequest) {
  // ── 1. Parse + validate ─────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Support both: { origin: [lng, lat] } and { origin: { lng, lat } }
  let originLng: number, originLat: number, destLng: number, destLat: number;

  const origin = body.origin;
  const destination = body.destination;

  if (Array.isArray(origin) && origin.length === 2) {
    originLng = origin[0] as number;
    originLat = origin[1] as number;
  } else if (origin && typeof origin === "object" && "lng" in origin && "lat" in origin) {
    originLng = (origin as { lng: number }).lng;
    originLat = (origin as { lat: number }).lat;
  } else {
    return NextResponse.json(
      { error: "origin must be [lng, lat] or { lng, lat }" },
      { status: 400 }
    );
  }

  if (Array.isArray(destination) && destination.length === 2) {
    destLng = destination[0] as number;
    destLat = destination[1] as number;
  } else if (destination && typeof destination === "object" && "lng" in destination && "lat" in destination) {
    destLng = (destination as { lng: number }).lng;
    destLat = (destination as { lat: number }).lat;
  } else {
    return NextResponse.json(
      { error: "destination must be [lng, lat] or { lng, lat }" },
      { status: 400 }
    );
  }

  if (
    [originLng, originLat, destLng, destLat].some((v) => typeof v !== "number" || isNaN(v))
  ) {
    return NextResponse.json(
      { error: "Coordinates must be valid numbers" },
      { status: 400 }
    );
  }

  if (
    originLng < -180 || originLng > 180 ||
    destLng < -180 || destLng > 180 ||
    originLat < -90 || originLat > 90 ||
    destLat < -90 || destLat > 90
  ) {
    return NextResponse.json(
      { error: "Coordinates out of range (lng: -180..180, lat: -90..90)" },
      { status: 400 }
    );
  }

  if (Math.abs(originLng - destLng) < 0.00001 && Math.abs(originLat - destLat) < 0.00001) {
    return NextResponse.json(
      { error: "Origin and destination are the same point" },
      { status: 400 }
    );
  }

  const modeRaw = body.mode;
  if (modeRaw !== undefined && (!VALID_MODES.includes(modeRaw as RouteMode) || typeof modeRaw !== "string")) {
    return NextResponse.json(
      { error: `mode must be one of: ${VALID_MODES.join(", ")}` },
      { status: 400 }
    );
  }
  const mode: RouteMode = (modeRaw as RouteMode) ?? "balanced";

  const maxAlt = Math.min(3, Math.max(1, Number(body.maxAlternatives) || 3));
  const requestId = request.headers.get("x-request-id") ?? undefined;

  // ── 2. Fetch routes from Mapbox ─────────────────────────────────────────
  const token = process.env.MAPBOX_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "MAPBOX_TOKEN not configured" }, { status: 500 });
  }

  const { candidates, error } = await fetchCyclingRoutes(
    { lng: originLng, lat: originLat },
    { lng: destLng, lat: destLat },
    token,
    maxAlt
  );

  if (error || candidates.length === 0) {
    return NextResponse.json(
      { error: error ?? "No cycling routes found" },
      { status: 502 }
    );
  }

  // ── 3. Score each route ─────────────────────────────────────────────────
  let scored: Route[];
  let artifactsLoaded = false;
  try {
    ensureLoaded();
    artifactsLoaded = getArtifactStats().loaded;

    scored = candidates.map((candidate) => {
      const output = scoreGeometry(candidate.geometry.coordinates);
      const metrics = computeMetrics(output);
      const reasonDetails = generateReasonDetails(metrics, output);
      const reasons = generateReasonStrings(reasonDetails);
      const segments = buildSegments(output.samples, candidate.geometry.coordinates);

      return {
        id: candidate.id,
        durationSec: candidate.durationSec,
        distanceM: candidate.distanceM,
        geometry: candidate.geometry,
        riskScore: output.riskScore,
        riskLevel: output.riskLevel,
        reasons,
        reasonDetails,
        segments,
        metrics,
        provider: "mapbox" as const,
      };
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[routes] scoring unavailable:", message);
    return NextResponse.json(
      {
        ok: false,
        error: "Scoring unavailable",
        detail: message,
        meta: {
          artifactsLoaded: false,
          generatedAt: new Date().toISOString(),
          requestId,
        },
      },
      { status: 503 }
    );
  }

  // ── 4. Rank by mode ─────────────────────────────────────────────────────
  const ranked = rankRoutes(scored, mode);

  console.log(
    `[routes] mode=${mode} | ${ranked.map((r) => `${r.id}=${r.riskScore}(${r.riskLevel})`).join(", ")}`
  );

  // ── 5. Return response ─────────────────────────────────────────────────
  const response: RoutesResponse = {
    ok: true,
    mode,
    routes: ranked,
    meta: {
      scorer: "real",
      artifactsLoaded,
      generatedAt: new Date().toISOString(),
      requestId,
    },
  };

  return NextResponse.json(response);
}
