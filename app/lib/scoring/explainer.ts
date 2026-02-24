/**
 * Explanation generator — converts scoring metrics into structured
 * RouteRiskReason objects and human-readable reason strings.
 */
import type { RouteRiskReason, RouteMetrics } from "@/app/types";
import type { ScoringOutput, IntersectionPoint } from "./scorer";

export function computeMetrics(output: ScoringOutput): RouteMetrics {
  const n = output.samples.length || 1;
  return {
    pctHighCrashCells:
      output.samples.filter((s) => s.cell.crashDensity > 0.5).length / n,
    pctMajorRoadCells:
      output.samples.filter((s) => s.cell.roadClassPenalty > 0.6).length / n,
    pctPoorBikeInfraCells:
      output.samples.filter((s) => s.cell.bikeLanePenalty > 0.6).length / n,
    complexIntersectionCount:
      output.nearbyIntersections.filter((i) => i.complexity > 0.6).length,
    continuityBreakCount: output.continuityBreakCount,
    sampledPoints: output.samples.length,
  };
}

export function generateReasonDetails(
  metrics: RouteMetrics,
  output: ScoringOutput
): RouteRiskReason[] {
  const details: RouteRiskReason[] = [];

  if (metrics.complexIntersectionCount > 0) {
    const sev =
      metrics.complexIntersectionCount >= 5
        ? "high"
        : metrics.complexIntersectionCount >= 3
          ? "medium"
          : "low";
    details.push({
      code: "complex_intersections",
      label: `${metrics.complexIntersectionCount} complex intersection${metrics.complexIntersectionCount > 1 ? "s" : ""}`,
      severity: sev,
      value: metrics.complexIntersectionCount,
      unit: "count",
    });
  }

  if (metrics.pctMajorRoadCells > 0.15) {
    const pct = Math.round(metrics.pctMajorRoadCells * 100);
    details.push({
      code: "major_arterials_share",
      label: `${pct}% on major roads`,
      severity: pct > 50 ? "high" : pct > 30 ? "medium" : "low",
      value: pct,
      unit: "%",
    });
  }

  if (metrics.pctPoorBikeInfraCells > 0.2) {
    const pct = Math.round(metrics.pctPoorBikeInfraCells * 100);
    details.push({
      code: "poor_bike_infra_share",
      label: `${pct}% with limited bike infrastructure`,
      severity: pct > 60 ? "high" : pct > 40 ? "medium" : "low",
      value: pct,
      unit: "%",
    });
  }

  if (metrics.pctHighCrashCells > 0.15) {
    const pct = Math.round(metrics.pctHighCrashCells * 100);
    details.push({
      code: "high_crash_density",
      label: `${pct}% through high crash-density areas`,
      severity: pct > 50 ? "high" : pct > 30 ? "medium" : "low",
      value: pct,
      unit: "%",
    });
  }

  if (metrics.continuityBreakCount >= 2) {
    details.push({
      code: "bike_lane_discontinuities",
      label: `${metrics.continuityBreakCount} bike-lane continuity break${metrics.continuityBreakCount > 1 ? "s" : ""}`,
      severity: metrics.continuityBreakCount >= 4 ? "high" : "medium",
      value: metrics.continuityBreakCount,
      unit: "count",
    });
  }

  // Sort by severity (high first)
  const sevOrder = { high: 0, medium: 1, low: 2 };
  details.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

  return details;
}

export function generateReasonStrings(details: RouteRiskReason[]): string[] {
  if (details.length === 0) {
    return ["relatively safe residential streets"];
  }
  return details.slice(0, 4).map((d) => d.label);
}
