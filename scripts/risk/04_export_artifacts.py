"""
Export precomputed features as JSON artifacts for the TS runtime scorer.

Outputs:
  data/artifacts/risk_grid.json      - cell features keyed by "latIdx_lngIdx"
  data/artifacts/intersections.json  - intersection points with complexity
  data/artifacts/scoring_config.json - weights + normalization constants
"""
import json
import os
import numpy as np
import geopandas as gpd

CRS_WGS84 = "EPSG:4326"
GRID_STEP = 0.002  # ~200m lat, ~150m lng at NYC latitude

PROC_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "processed")
ART_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "artifacts")


def main():
    os.makedirs(ART_DIR, exist_ok=True)

    # ── 1. Risk grid ────────────────────────────────────────────────────────
    print("Exporting risk grid...")
    grid = gpd.read_parquet(os.path.join(PROC_DIR, "grid_features.parquet"))

    has_crime = "crime_density_norm" in grid.columns

    # Build lookup keyed by quantized lat/lng of centroid
    cells = {}
    for _, row in grid.iterrows():
        # Skip empty cells (no crashes, default penalties, no crime)
        if row["crash_w_sum"] == 0 and row["road_class_penalty"] == 0.5:
            if not has_crime or row.get("crime_w_sum", 0) == 0:
                continue

        lat = row["centroid_lat"]
        lng = row["centroid_lng"]
        lat_idx = int(np.floor(lat / GRID_STEP))
        lng_idx = int(np.floor(lng / GRID_STEP))
        key = f"{lat_idx},{lng_idx}"

        cells[key] = {
            "crashDensity": round(float(row["crash_density_norm"]), 4),
            "crimeDensity": round(float(row["crime_density_norm"]), 4) if has_crime else 0.0,
            "roadClassPenalty": round(float(row["road_class_penalty"]), 4),
            "bikeLanePenalty": round(float(row["bike_lane_penalty"]), 4),
            "bikeCoverage": round(float(row["bike_coverage"]), 4),
        }

    grid_out = os.path.join(ART_DIR, "risk_grid.json")
    with open(grid_out, "w") as f:
        json.dump({"gridStep": GRID_STEP, "cells": cells}, f)

    size_mb = os.path.getsize(grid_out) / 1e6
    print(f"  Grid cells exported: {len(cells):,} ({size_mb:.1f} MB)")

    # ── 2. Intersections ────────────────────────────────────────────────────
    print("Exporting intersections...")
    inter = gpd.read_parquet(os.path.join(PROC_DIR, "intersections.parquet"))
    inter = inter.to_crs(CRS_WGS84)

    # Only export intersections with meaningful complexity (> 0.3)
    inter = inter[inter["intersection_complexity"] > 0.3]

    records = []
    for idx, row in inter.iterrows():
        pt = row.geometry
        records.append({
            "id": f"i_{idx}",
            "lng": round(pt.x, 6),
            "lat": round(pt.y, 6),
            "complexity": round(float(row["intersection_complexity"]), 4),
            "crashCluster": round(float(row["crash_cluster_norm"]), 4),
        })

    inter_out = os.path.join(ART_DIR, "intersections.json")
    with open(inter_out, "w") as f:
        json.dump(records, f)

    size_mb = os.path.getsize(inter_out) / 1e6
    print(f"  Intersections exported: {len(records):,} ({size_mb:.1f} MB)")

    # ── 3. Scoring config ───────────────────────────────────────────────────
    print("Exporting scoring config...")
    config = {
        "gridStep": GRID_STEP,
        "weights": {
            "crashDensity": 0.35,
            "crimeDensity": 0.15,
            "roadClassPenalty": 0.22,
            "bikeLanePenalty": 0.22,
            "continuityPenalty": 0.06,
        },
        "intersectionLambda": 0.08,
        "normalization": {
            "routeRawMin": 0.05,
            "routeRawMax": 2.50,
        },
        "intersectionSearchRadiusDeg": 0.0003,  # ~30m
    }

    config_out = os.path.join(ART_DIR, "scoring_config.json")
    with open(config_out, "w") as f:
        json.dump(config, f, indent=2)

    print(f"  Config: {config_out}")
    print("Done.")


if __name__ == "__main__":
    main()
