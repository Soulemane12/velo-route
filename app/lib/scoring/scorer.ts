/**
 * Core scoring engine — loads artifacts, samples route geometry,
 * computes per-point risk from precomputed grid/intersection data.
 */
import { readFileSync } from "fs";
import { join } from "path";

// ── Artifact types ──────────────────────────────────────────────────────────

export interface CellFeatures {
  crashDensity: number;
  crimeDensity: number;
  roadClassPenalty: number;
  bikeLanePenalty: number;
  bikeCoverage: number;
}

interface RiskGrid {
  gridStep: number;
  cells: Record<string, CellFeatures>;
}

export interface IntersectionPoint {
  id: string;
  lng: number;
  lat: number;
  complexity: number;
  crashCluster: number;
}

export interface ScoringConfig {
  gridStep: number;
  weights: {
    crashDensity: number;
    crimeDensity: number;
    roadClassPenalty: number;
    bikeLanePenalty: number;
    continuityPenalty: number;
  };
  intersectionLambda: number;
  normalization: {
    routeRawMin: number;
    routeRawMax: number;
  };
  intersectionSearchRadiusDeg: number;
}

export interface SampleResult {
  lat: number;
  lng: number;
  coordIdx: number; // index into original coords for geometry slicing
  cell: CellFeatures;
  segmentRisk: number;
}

export interface ScoringOutput {
  samples: SampleResult[];
  nearbyIntersections: IntersectionPoint[];
  continuityBreakCount: number;
  continuityPenalty: number;
  intersectionPenalty: number;
  meanSegRisk: number;
  routeRaw: number;
  riskScore: number;
  riskLevel: "low" | "medium" | "high";
}

// ── Artifact loading ────────────────────────────────────────────────────────

const ARTIFACTS_DIR = join(process.cwd(), "data", "artifacts");

let _grid: RiskGrid;
let _intersections: IntersectionPoint[];
let _config: ScoringConfig;
let _loaded = false;

export function ensureLoaded() {
  if (_loaded) return;
  _loaded = true;

  _grid = JSON.parse(readFileSync(join(ARTIFACTS_DIR, "risk_grid.json"), "utf-8"));
  _intersections = JSON.parse(readFileSync(join(ARTIFACTS_DIR, "intersections.json"), "utf-8"));
  _config = JSON.parse(readFileSync(join(ARTIFACTS_DIR, "scoring_config.json"), "utf-8"));

  console.log(
    `[scorer] Loaded: ${Object.keys(_grid.cells).length} grid cells, ${_intersections.length} intersections`
  );
}

export function getConfig(): ScoringConfig {
  ensureLoaded();
  return _config;
}

export function getArtifactStats() {
  ensureLoaded();
  return {
    gridCells: Object.keys(_grid.cells).length,
    intersections: _intersections.length,
    loaded: _loaded,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function cellKey(lat: number, lng: number, step: number): string {
  return `${Math.floor(lat / step)},${Math.floor(lng / step)}`;
}

function lookupCell(lat: number, lng: number): CellFeatures {
  const key = cellKey(lat, lng, _grid.gridStep);
  return _grid.cells[key] ?? {
    crashDensity: 0,
    crimeDensity: 0,
    roadClassPenalty: 0.5,
    bikeLanePenalty: 0.8,
    bikeCoverage: 0,
  };
}

export function samplePoints(
  coords: [number, number][],
  sampleM: number = 25
): { point: [number, number]; coordIdx: number }[] {
  if (coords.length === 0) return [];
  const points: { point: [number, number]; coordIdx: number }[] = [
    { point: coords[0], coordIdx: 0 },
  ];
  let accum = 0;

  for (let i = 1; i < coords.length; i++) {
    const dx = coords[i][0] - coords[i - 1][0];
    const dy = coords[i][1] - coords[i - 1][1];
    const dist = Math.sqrt((dx * 84000) ** 2 + (dy * 111000) ** 2);
    accum += dist;
    if (accum >= sampleM) {
      points.push({ point: coords[i], coordIdx: i });
      accum = 0;
    }
  }
  if (coords.length > 1) {
    points.push({ point: coords[coords.length - 1], coordIdx: coords.length - 1 });
  }
  return points;
}

function findNearbyIntersections(
  points: [number, number][],
  radiusDeg: number
): IntersectionPoint[] {
  let minLng = Infinity, maxLng = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of points) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  minLng -= radiusDeg;
  maxLng += radiusDeg;
  minLat -= radiusDeg;
  maxLat += radiusDeg;

  const candidates = _intersections.filter(
    (i) => i.lng >= minLng && i.lng <= maxLng && i.lat >= minLat && i.lat <= maxLat
  );

  const hits = new Set<string>();
  const result: IntersectionPoint[] = [];
  const r2 = radiusDeg * radiusDeg;

  for (const inter of candidates) {
    for (const [lng, lat] of points) {
      const dlng = inter.lng - lng;
      const dlat = inter.lat - lat;
      if (dlng * dlng + dlat * dlat <= r2) {
        if (!hits.has(inter.id)) {
          hits.add(inter.id);
          result.push(inter);
        }
        break;
      }
    }
  }
  return result;
}

// ── Core scoring ────────────────────────────────────────────────────────────

export function scoreGeometry(coords: [number, number][]): ScoringOutput {
  ensureLoaded();

  const sampled = samplePoints(coords, 25);
  const w = _config.weights;

  const samples: SampleResult[] = sampled.map(({ point: [lng, lat], coordIdx }) => {
    const cell = lookupCell(lat, lng);
    const segmentRisk =
      w.crashDensity * cell.crashDensity +
      (w.crimeDensity ?? 0) * (cell.crimeDensity ?? 0) +
      w.roadClassPenalty * cell.roadClassPenalty +
      w.bikeLanePenalty * cell.bikeLanePenalty;
    return { lat, lng, coordIdx, cell, segmentRisk };
  });

  const rawPoints = sampled.map((s) => s.point);
  const nearbyIntersections = findNearbyIntersections(
    rawPoints,
    _config.intersectionSearchRadiusDeg
  );

  // Continuity breaks
  let continuityBreakCount = 0;
  for (let i = 1; i < samples.length; i++) {
    const delta = samples[i].cell.bikeLanePenalty - samples[i - 1].cell.bikeLanePenalty;
    if (delta > 0.3) continuityBreakCount++;
  }
  const continuityPenalty = Math.min(1.0, continuityBreakCount / 5);

  // Intersection penalty
  const intersectionPenalty =
    _config.intersectionLambda *
    nearbyIntersections.reduce((s, i) => s + i.complexity, 0);

  // Route-level risk
  const meanSegRisk =
    samples.length > 0
      ? samples.reduce((s, c) => s + c.segmentRisk, 0) / samples.length
      : 0.5;

  const routeRaw =
    meanSegRisk +
    w.continuityPenalty * continuityPenalty +
    intersectionPenalty;

  const { routeRawMin, routeRawMax } = _config.normalization;
  const normalized =
    ((routeRaw - routeRawMin) / (routeRawMax - routeRawMin)) * 100;
  const riskScore = Math.round(Math.min(99, Math.max(1, normalized)));
  const riskLevel: "low" | "medium" | "high" =
    riskScore < 40 ? "low" : riskScore < 70 ? "medium" : "high";

  return {
    samples,
    nearbyIntersections,
    continuityBreakCount,
    continuityPenalty,
    intersectionPenalty,
    meanSegRisk,
    routeRaw,
    riskScore,
    riskLevel,
  };
}
