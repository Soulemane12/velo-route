// ── Request ──────────────────────────────────────────────────────────────────

export type RouteMode = "balanced" | "safer" | "fastest";

export interface RouteOptionsRequest {
  origin: { lng: number; lat: number };
  destination: { lng: number; lat: number };
  mode?: RouteMode;
  maxAlternatives?: number;
}

// Legacy compat
export interface RouteRequest {
  origin: [number, number]; // [lng, lat]
  destination: [number, number]; // [lng, lat]
}

// ── Reason codes ────────────────────────────────────────────────────────────

export type RouteRiskReasonCode =
  | "complex_intersections"
  | "major_arterials_share"
  | "bike_lane_discontinuities"
  | "high_crash_density"
  | "poor_bike_infra_share"
  | "turn_frequency"
  | "night_penalty";

export interface RouteRiskReason {
  code: RouteRiskReasonCode;
  label: string;
  severity: "low" | "medium" | "high";
  value?: number;
  unit?: "%" | "count" | "score";
}

// ── Segments ────────────────────────────────────────────────────────────────

export interface RouteSegment {
  segmentId: string;
  risk: number;
  riskLevel: "low" | "medium" | "high";
  reasons: string[];
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
}

// ── Route ───────────────────────────────────────────────────────────────────

export interface RouteMetrics {
  pctHighCrashCells: number;
  pctMajorRoadCells: number;
  pctPoorBikeInfraCells: number;
  complexIntersectionCount: number;
  continuityBreakCount: number;
  sampledPoints: number;
}

export interface Route {
  id: string;
  durationSec: number;
  distanceM: number;
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
  riskScore: number;
  riskLevel: "low" | "medium" | "high";
  reasons: string[];
  reasonDetails: RouteRiskReason[];
  segments: RouteSegment[];
  metrics?: RouteMetrics;
  provider?: "mapbox";
  via?: string; // waypoint place name, e.g. "Johnny's Cafe"
}

// ── Response ────────────────────────────────────────────────────────────────

export interface RoutesResponse {
  ok: true;
  mode: RouteMode;
  routes: Route[];
  meta: {
    scorer: "real";
    artifactsLoaded: boolean;
    generatedAt: string;
    requestId?: string;
  };
}

// ── Geocoding ───────────────────────────────────────────────────────────────

export interface GeocodingFeature {
  place_name: string;
  center: [number, number]; // [lng, lat]
}
