/**
 * Segmentizer — groups consecutive sampled points into risk-level
 * segments with geometry chunks for map rendering.
 */
import type { RouteSegment } from "@/app/types";
import type { SampleResult } from "./scorer";

function riskLevel(score: number): "low" | "medium" | "high" {
  if (score < 35) return "low";
  if (score < 65) return "medium";
  return "high";
}

/**
 * Build segments by grouping consecutive samples with the same risk level.
 * Each segment gets its own geometry slice from the original route coordinates.
 */
export function buildSegments(
  samples: SampleResult[],
  allCoords: [number, number][]
): RouteSegment[] {
  if (samples.length === 0) return [];

  const segments: RouteSegment[] = [];
  let groupStart = 0;

  for (let i = 1; i <= samples.length; i++) {
    const prevRisk = Math.round(
      Math.min(99, Math.max(1, samples[i - 1].segmentRisk * 100))
    );
    const prevLevel = riskLevel(prevRisk);

    // Check if we should close the current group
    const atEnd = i === samples.length;
    let curLevel: "low" | "medium" | "high" | null = null;
    if (!atEnd) {
      const curRisk = Math.round(
        Math.min(99, Math.max(1, samples[i].segmentRisk * 100))
      );
      curLevel = riskLevel(curRisk);
    }

    if (atEnd || curLevel !== prevLevel) {
      const chunk = samples.slice(groupStart, i);

      // Geometry: slice from first sample's coordIdx to last sample's coordIdx
      const startIdx = chunk[0].coordIdx;
      const endIdx = chunk[chunk.length - 1].coordIdx;
      const coords = allCoords.slice(startIdx, endIdx + 1);
      // Need at least 2 points for a LineString
      if (coords.length < 2 && startIdx > 0) {
        coords.unshift(allCoords[startIdx - 1]);
      }

      const avgRisk =
        chunk.reduce((s, c) => s + c.segmentRisk, 0) / chunk.length;
      const risk = Math.round(Math.min(99, Math.max(1, avgRisk * 100)));

      // Segment reasons
      const reasons: string[] = [];
      const avgCrash =
        chunk.reduce((s, c) => s + c.cell.crashDensity, 0) / chunk.length;
      const avgRoad =
        chunk.reduce((s, c) => s + c.cell.roadClassPenalty, 0) / chunk.length;
      const avgBike =
        chunk.reduce((s, c) => s + c.cell.bikeLanePenalty, 0) / chunk.length;

      if (avgCrash > 0.5) reasons.push("high crash density");
      if (avgRoad > 0.6) reasons.push("major road segment");
      if (avgBike > 0.6) reasons.push("poor bike infrastructure");
      if (reasons.length === 0) reasons.push("standard residential street");

      segments.push({
        segmentId: `s${segments.length + 1}`,
        risk,
        riskLevel: riskLevel(risk),
        reasons,
        geometry: {
          type: "LineString",
          coordinates: coords,
        },
      });

      groupStart = i;
    }
  }

  // Cap at 12 segments max — if too many, merge adjacent same-level
  if (segments.length > 12) {
    return mergeSmallSegments(segments);
  }

  return segments;
}

function mergeSmallSegments(segments: RouteSegment[]): RouteSegment[] {
  const merged: RouteSegment[] = [segments[0]];

  for (let i = 1; i < segments.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = segments[i];

    if (prev.riskLevel === cur.riskLevel) {
      // Merge: combine geometry and average risk
      prev.risk = Math.round((prev.risk + cur.risk) / 2);
      prev.geometry.coordinates = [
        ...prev.geometry.coordinates,
        ...cur.geometry.coordinates.slice(1), // skip duplicate join point
      ];
      // Union reasons
      for (const r of cur.reasons) {
        if (!prev.reasons.includes(r)) prev.reasons.push(r);
      }
    } else {
      merged.push(cur);
    }
  }

  // Re-number
  merged.forEach((s, i) => (s.segmentId = `s${i + 1}`));
  return merged;
}
