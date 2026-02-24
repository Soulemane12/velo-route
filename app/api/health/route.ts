import { NextResponse } from "next/server";
import { getArtifactStats, ensureLoaded } from "@/app/lib/scoring/scorer";

export async function GET() {
  let scoring;
  try {
    ensureLoaded();
    const stats = getArtifactStats();
    scoring = {
      realScorerReady: true,
      artifactsLoaded: stats.loaded,
      riskGridCells: stats.gridCells,
      intersections: stats.intersections,
      mode: "real",
    };
  } catch (e) {
    scoring = {
      realScorerReady: false,
      artifactsLoaded: false,
      mode: "unavailable",
      error: e instanceof Error ? e.message : String(e),
    };
  }

  return NextResponse.json({
    ok: scoring.realScorerReady,
    service: "route-safety-api",
    mapbox: { configured: !!process.env.MAPBOX_TOKEN },
    scoring,
    version: "dev",
    time: new Date().toISOString(),
  });
}
