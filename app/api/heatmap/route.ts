/**
 * Returns crash and crime density as GeoJSON FeatureCollections
 * for use in Mapbox heatmap layers.
 */
import { readFileSync } from "fs";
import { join } from "path";

interface CellFeatures {
  crashDensity: number;
  crimeDensity?: number;
}

interface RiskGrid {
  gridStep: number;
  cells: Record<string, CellFeatures>;
}

let _cached: { crashes: object; crimes: object } | null = null;

export async function GET() {
  if (_cached) {
    return Response.json(_cached, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  }

  const gridPath = join(process.cwd(), "data", "artifacts", "risk_grid.json");
  const { gridStep, cells }: RiskGrid = JSON.parse(
    readFileSync(gridPath, "utf-8")
  );

  const crashFeatures: object[] = [];
  const crimeFeatures: object[] = [];

  for (const [key, cell] of Object.entries(cells)) {
    const [latIdxStr, lngIdxStr] = key.split(",");
    const lat = (parseInt(latIdxStr) + 0.5) * gridStep;
    const lng = (parseInt(lngIdxStr) + 0.5) * gridStep;

    if (cell.crashDensity > 0.05) {
      crashFeatures.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lng, lat] },
        properties: { intensity: cell.crashDensity },
      });
    }

    if ((cell.crimeDensity ?? 0) > 0.05) {
      crimeFeatures.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lng, lat] },
        properties: { intensity: cell.crimeDensity },
      });
    }
  }

  _cached = {
    crashes: { type: "FeatureCollection", features: crashFeatures },
    crimes: { type: "FeatureCollection", features: crimeFeatures },
  };

  return Response.json(_cached, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
