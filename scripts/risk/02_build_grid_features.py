"""
Clean/filter crashes, build a simple lat/lng grid, compute per-cell features:
  - crash density (severity-weighted)
  - road class penalty
  - bike lane penalty
  - bike coverage ratio
"""
import os
import numpy as np
import pandas as pd
import geopandas as gpd
from shapely.geometry import box

CRS_WGS84 = "EPSG:4326"
CRS_PROJ = "EPSG:32618"  # UTM 18N (meters)
CELL_M = 200  # grid cell size in meters (projected CRS)

PROC_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "processed")
RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "raw")


# ── Road class → penalty mapping ──────────────────────────────────────────────
def highway_penalty(h):
    if isinstance(h, list):
        h = h[0] if h else ""
    h = str(h) if h is not None else ""
    mapping = {
        "motorway": 1.0, "motorway_link": 1.0,
        "trunk": 1.0, "trunk_link": 1.0,
        "primary": 1.0, "primary_link": 1.0,
        "secondary": 0.75, "secondary_link": 0.75,
        "tertiary": 0.55, "tertiary_link": 0.55,
        "residential": 0.25, "unclassified": 0.25,
        "service": 0.1, "living_street": 0.1,
        "cycleway": 0.05, "path": 0.05, "track": 0.15,
        "pedestrian": 0.1, "footway": 0.1, "steps": 0.15,
    }
    return mapping.get(h, 0.35)


# ── Bike infra → penalty mapping ─────────────────────────────────────────────
def bike_penalty(row):
    vals = []
    for col in ["cycleway", "cycleway:left", "cycleway:right", "cycleway:both"]:
        v = row.get(col)
        if pd.notna(v):
            vals.append(str(v).lower())
    joined = " ".join(vals)
    if not joined:
        return 0.8  # no tag = assume poor
    if "track" in joined or "separate" in joined:
        return 0.05
    if "lane" in joined and "shared" not in joined:
        return 0.3
    if "shared_lane" in joined or "share_busway" in joined:
        return 0.7
    if "no" in joined:
        return 1.0
    return 0.8


CRIME_SEVERITY = {
    "ROBBERY": 2.5,
    "FELONY ASSAULT": 2.0,
    "ASSAULT 3 & RELATED OFFENSES": 1.5,
    "GRAND LARCENY": 1.0,
    "GRAND LARCENY OF MOTOR VEHICLE": 0.8,
    "BURGLARY": 0.8,
}


def main():
    # ── 1. Load + filter crashes ─────────────────────────────────────────────
    print("Loading crash data...")
    df = pd.read_csv(os.path.join(RAW_DIR, "nyc_crashes.csv"), low_memory=False)
    df.columns = [c.strip().upper() for c in df.columns]

    lat_col, lon_col = "LATITUDE", "LONGITUDE"
    cyclist_inj = "NUMBER OF CYCLIST INJURED"
    cyclist_kil = "NUMBER OF CYCLIST KILLED"

    # Basic quality filter
    df = df.dropna(subset=[lat_col, lon_col])
    df = df[(df[lat_col] != 0) & (df[lon_col] != 0)]
    df[lat_col] = pd.to_numeric(df[lat_col], errors="coerce")
    df[lon_col] = pd.to_numeric(df[lon_col], errors="coerce")
    df = df.dropna(subset=[lat_col, lon_col])

    # Cyclist involvement filter
    for col in [cyclist_inj, cyclist_kil]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
    if cyclist_inj in df.columns and cyclist_kil in df.columns:
        df = df[(df[cyclist_inj] > 0) | (df[cyclist_kil] > 0)]

    # Severity weight
    df["SEVERITY_W"] = 1.0
    if cyclist_inj in df.columns:
        df["SEVERITY_W"] += 1.0 * (df[cyclist_inj] > 0).astype(float)
    if cyclist_kil in df.columns:
        df["SEVERITY_W"] += 4.0 * (df[cyclist_kil] > 0).astype(float)

    crashes = gpd.GeoDataFrame(
        df,
        geometry=gpd.points_from_xy(df[lon_col], df[lat_col]),
        crs=CRS_WGS84,
    ).to_crs(CRS_PROJ)
    crashes.to_parquet(os.path.join(PROC_DIR, "crashes_filtered.parquet"))
    print(f"  Filtered crashes: {len(crashes):,}")

    # ── 2. Load OSM edges ────────────────────────────────────────────────────
    print("Loading OSM edges...")
    edges = gpd.read_parquet(os.path.join(PROC_DIR, "osm_edges.parquet"))
    edges = edges.to_crs(CRS_PROJ)

    # Keep useful columns
    tag_cols = [c for c in ["highway", "cycleway", "cycleway:left",
                            "cycleway:right", "cycleway:both", "length"]
                if c in edges.columns]
    edges = edges[["geometry"] + tag_cols].copy()
    edges["road_class_pen"] = edges["highway"].apply(highway_penalty) if "highway" in edges.columns else 0.35
    edges["bike_pen"] = edges.apply(bike_penalty, axis=1)
    if "length" not in edges.columns:
        edges["length"] = edges.geometry.length

    # ── 3. Build projected grid ──────────────────────────────────────────────
    print("Building grid...")
    # Use crash extent + a buffer
    minx, miny, maxx, maxy = crashes.total_bounds
    pad = CELL_M * 5
    minx -= pad; miny -= pad; maxx += pad; maxy += pad

    xs = np.arange(minx, maxx + CELL_M, CELL_M)
    ys = np.arange(miny, maxy + CELL_M, CELL_M)

    cells = []
    cell_ids = []
    for i in range(len(xs) - 1):
        for j in range(len(ys) - 1):
            cells.append(box(xs[i], ys[j], xs[i + 1], ys[j + 1]))
            cell_ids.append(f"{i}_{j}")

    grid = gpd.GeoDataFrame({"cell_id": cell_ids}, geometry=cells, crs=CRS_PROJ)
    print(f"  Grid cells: {len(grid):,}")

    # ── 4. Crash density per cell ────────────────────────────────────────────
    print("Computing crash density...")
    crash_join = gpd.sjoin(
        crashes[["SEVERITY_W", "geometry"]],
        grid[["cell_id", "geometry"]],
        predicate="within",
        how="inner",
    )
    crash_agg = crash_join.groupby("cell_id")["SEVERITY_W"].sum().rename("crash_w_sum")
    grid = grid.merge(crash_agg, on="cell_id", how="left")
    grid["crash_w_sum"] = grid["crash_w_sum"].fillna(0.0)

    # ── 5. Road class + bike penalty per cell (length-weighted) ──────────────
    print("Computing road/bike features per cell...")
    # Spatial join edges to grid (intersect)
    edge_cell = gpd.sjoin(
        edges[["geometry", "road_class_pen", "bike_pen", "length"]],
        grid[["cell_id", "geometry"]],
        predicate="intersects",
        how="inner",
    )

    # Use original edge length as weight (approximation, avoids slow overlay)
    for col in ["road_class_pen", "bike_pen"]:
        edge_cell[f"{col}_w"] = edge_cell[col] * edge_cell["length"]

    agg = edge_cell.groupby("cell_id").agg(
        road_pen_num=("road_class_pen_w", "sum"),
        bike_pen_num=("bike_pen_w", "sum"),
        road_len=("length", "sum"),
    ).reset_index()

    agg["road_class_penalty"] = agg["road_pen_num"] / agg["road_len"].clip(lower=1e-6)
    agg["bike_lane_penalty"] = agg["bike_pen_num"] / agg["road_len"].clip(lower=1e-6)

    # Bike coverage: fraction of road length with decent bike infra (penalty < 0.5)
    good_bike = edge_cell[edge_cell["bike_pen"] < 0.5]
    good_agg = good_bike.groupby("cell_id")["length"].sum().rename("good_bike_len")
    agg = agg.merge(good_agg, on="cell_id", how="left")
    agg["good_bike_len"] = agg["good_bike_len"].fillna(0)
    agg["bike_coverage"] = (agg["good_bike_len"] / agg["road_len"].clip(lower=1e-6)).clip(0, 1)

    grid = grid.merge(
        agg[["cell_id", "road_class_penalty", "bike_lane_penalty", "bike_coverage"]],
        on="cell_id", how="left",
    )
    grid["road_class_penalty"] = grid["road_class_penalty"].fillna(0.5)
    grid["bike_lane_penalty"] = grid["bike_lane_penalty"].fillna(0.8)
    grid["bike_coverage"] = grid["bike_coverage"].fillna(0.0)

    # ── 6. Load + join crime data ─────────────────────────────────────────────
    crime_path = os.path.join(RAW_DIR, "nyc_crimes.csv")
    if os.path.exists(crime_path):
        print("Loading crime data...")
        cdf = pd.read_csv(crime_path, low_memory=False)
        cdf.columns = [c.strip().upper() for c in cdf.columns]

        cdf = cdf.dropna(subset=["LATITUDE", "LONGITUDE"])
        cdf["LATITUDE"] = pd.to_numeric(cdf["LATITUDE"], errors="coerce")
        cdf["LONGITUDE"] = pd.to_numeric(cdf["LONGITUDE"], errors="coerce")
        cdf = cdf.dropna(subset=["LATITUDE", "LONGITUDE"])
        cdf = cdf[(cdf["LATITUDE"] != 0) & (cdf["LONGITUDE"] != 0)]

        # Severity weight by offense type
        offense_col = "OFNS_DESC" if "OFNS_DESC" in cdf.columns else None
        if offense_col:
            cdf["CRIME_W"] = cdf[offense_col].str.upper().map(CRIME_SEVERITY).fillna(0.5)
        else:
            cdf["CRIME_W"] = 1.0

        crimes = gpd.GeoDataFrame(
            cdf,
            geometry=gpd.points_from_xy(cdf["LONGITUDE"], cdf["LATITUDE"]),
            crs=CRS_WGS84,
        ).to_crs(CRS_PROJ)
        print(f"  Loaded crimes: {len(crimes):,}")

        crime_join = gpd.sjoin(
            crimes[["CRIME_W", "geometry"]],
            grid[["cell_id", "geometry"]],
            predicate="within",
            how="inner",
        )
        crime_agg = crime_join.groupby("cell_id")["CRIME_W"].sum().rename("crime_w_sum")
        grid = grid.merge(crime_agg, on="cell_id", how="left")
        grid["crime_w_sum"] = grid["crime_w_sum"].fillna(0.0)
        print(f"  Cells with crime data: {(grid['crime_w_sum'] > 0).sum():,}")
    else:
        print("No crime data found — skipping (run 00b_download_crimes.py first)")
        grid["crime_w_sum"] = 0.0

    # ── 7. Normalize crash + crime density ───────────────────────────────────
    p95 = grid["crash_w_sum"].quantile(0.95)
    denom = max(p95, 1.0)
    grid["crash_density_norm"] = (grid["crash_w_sum"].clip(upper=p95) / denom).clip(0, 1)

    p95_crime = grid["crime_w_sum"].quantile(0.95)
    denom_crime = max(p95_crime, 1.0)
    grid["crime_density_norm"] = (grid["crime_w_sum"].clip(upper=p95_crime) / denom_crime).clip(0, 1)

    # ── 7. Add WGS84 centroid for runtime lookup ─────────────────────────────
    centroids = grid.geometry.centroid.to_crs(CRS_WGS84)
    grid["centroid_lng"] = centroids.x
    grid["centroid_lat"] = centroids.y

    # ── 8. Save ──────────────────────────────────────────────────────────────
    out = os.path.join(PROC_DIR, "grid_features.parquet")
    grid.to_parquet(out)

    non_empty = grid[grid["crash_w_sum"] > 0]
    non_empty_crime = grid[grid["crime_w_sum"] > 0]
    print(f"  Cells with crashes: {len(non_empty):,}")
    print(f"  Cells with crimes:  {len(non_empty_crime):,}")
    print(f"  Saved: {out}")
    print(f"  Crash density p95:  {p95:.2f}")
    print(f"  Crime density p95:  {p95_crime:.2f}")
    print(f"  Road penalty mean:  {grid['road_class_penalty'].mean():.3f}")
    print(f"  Bike penalty mean:  {grid['bike_lane_penalty'].mean():.3f}")


if __name__ == "__main__":
    main()
