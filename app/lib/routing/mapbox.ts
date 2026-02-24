/**
 * Mapbox Directions API — fetch cycling routes and normalize to internal shape.
 */

export interface MapboxStep {
  distance: number;
  duration: number;
  name: string;
  intersections?: unknown[];
  geometry: { type: string; coordinates: [number, number][] };
}

export interface MapboxLeg {
  steps: MapboxStep[];
}

export interface MapboxRoute {
  duration: number;
  distance: number;
  geometry: { type: "LineString"; coordinates: [number, number][] };
  legs: MapboxLeg[];
}

export interface NormalizedCandidate {
  id: string;
  durationSec: number;
  distanceM: number;
  geometry: { type: "LineString"; coordinates: [number, number][] };
  stepsCount: number;
  raw: MapboxRoute;
}

export async function fetchCyclingRoutes(
  origin: { lng: number; lat: number },
  destination: { lng: number; lat: number },
  token: string,
  maxAlternatives: number = 3
): Promise<{ candidates: NormalizedCandidate[]; error?: string }> {
  try {
    const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/cycling/${coords}?alternatives=true&geometries=geojson&steps=true&overview=full&access_token=${token}`;

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      return {
        candidates: [],
        error: `Mapbox ${res.status}: ${data.message ?? res.statusText}`,
      };
    }

    if (!data.routes || data.routes.length === 0) {
      return { candidates: [], error: "No cycling routes found between these points" };
    }

    const routes: MapboxRoute[] = data.routes.slice(0, maxAlternatives);

    const candidates: NormalizedCandidate[] = routes.map((r, i) => ({
      id: `r${i + 1}`,
      durationSec: Math.round(r.duration),
      distanceM: Math.round(r.distance),
      geometry: r.geometry,
      stepsCount: r.legs[0]?.steps?.length ?? 0,
      raw: r,
    }));

    return { candidates };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[mapbox] directions request failed:", message);
    return {
      candidates: [],
      error: `Mapbox request failed: ${message}`,
    };
  }
}
