"""
Build intersection features from OSM nodes:
  - street count / degree
  - major-road touch count
  - nearby crash cluster score
  - combined intersection complexity (0-1)
"""
import os
import pandas as pd
import geopandas as gpd

CRS_WGS84 = "EPSG:4326"
CRS_PROJ = "EPSG:32618"
CRASH_RADIUS_M = 30

PROC_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "processed")


MAJOR_CLASSES = {
    "primary", "primary_link", "secondary", "secondary_link",
    "trunk", "trunk_link", "motorway", "motorway_link",
}


def is_major(h):
    if isinstance(h, list):
        h = h[0] if h else ""
    return str(h) in MAJOR_CLASSES


def main():
    print("Loading nodes and edges...")
    nodes = gpd.read_parquet(os.path.join(PROC_DIR, "osm_nodes.parquet")).to_crs(CRS_PROJ)
    edges = gpd.read_parquet(os.path.join(PROC_DIR, "osm_edges.parquet")).to_crs(CRS_PROJ)
    crashes = gpd.read_parquet(os.path.join(PROC_DIR, "crashes_filtered.parquet")).to_crs(CRS_PROJ)

    # ── Street count ─────────────────────────────────────────────────────────
    if "street_count" not in nodes.columns:
        print("  Computing street_count from edge incidence...")
        edges_r = edges.reset_index()
        if "u" in edges_r.columns and "v" in edges_r.columns:
            counts = pd.concat([
                edges_r[["u"]].rename(columns={"u": "osmid"}),
                edges_r[["v"]].rename(columns={"v": "osmid"}),
            ]).groupby("osmid").size().rename("street_count")
            nodes = nodes.merge(counts, left_index=True, right_index=True, how="left")
        else:
            nodes["street_count"] = 2
    nodes["street_count"] = nodes["street_count"].fillna(2).astype(int)

    # ── Major-road touch count ───────────────────────────────────────────────
    print("Computing major-road touch count...")
    edges_r = edges.reset_index()
    if "highway" in edges_r.columns:
        edges_r["is_major"] = edges_r["highway"].apply(is_major)
    else:
        edges_r["is_major"] = False

    if "u" in edges_r.columns and "v" in edges_r.columns:
        maj_u = edges_r.groupby("u")["is_major"].sum().rename("major_u")
        maj_v = edges_r.groupby("v")["is_major"].sum().rename("major_v")
        major_counts = maj_u.add(maj_v, fill_value=0).rename("major_touch_count")
        nodes = nodes.merge(major_counts, left_index=True, right_index=True, how="left")
    nodes["major_touch_count"] = nodes.get("major_touch_count", pd.Series(0, index=nodes.index)).fillna(0).astype(int)

    # ── Crash cluster within radius ──────────────────────────────────────────
    print(f"Computing crash clusters ({CRASH_RADIUS_M}m radius)...")
    # Only consider real intersections (degree >= 3)
    intersections = nodes[nodes["street_count"] >= 3].copy()
    print(f"  Intersections (degree>=3): {len(intersections):,}")

    # Buffer intersections and spatial join crashes
    inter_buf = intersections[["geometry"]].copy().reset_index()
    inter_buf = inter_buf.rename(columns={inter_buf.columns[0]: "node_id"})
    inter_buf["geometry"] = inter_buf.geometry.buffer(CRASH_RADIUS_M)

    crash_hit = gpd.sjoin(
        crashes[["SEVERITY_W", "geometry"]],
        inter_buf[["node_id", "geometry"]].set_index("node_id"),
        predicate="within",
        how="inner",
    )
    # The right index after sjoin is the node_id
    right_idx_col = "index_right" if "index_right" in crash_hit.columns else crash_hit.columns[-1]
    crash_near = crash_hit.groupby(right_idx_col)["SEVERITY_W"].sum().rename("crash_near_w")
    intersections = intersections.merge(crash_near, left_index=True, right_index=True, how="left")
    intersections["crash_near_w"] = intersections["crash_near_w"].fillna(0)

    # Normalize
    p95 = intersections["crash_near_w"].quantile(0.95)
    denom = max(p95, 1.0)
    intersections["crash_cluster_norm"] = (
        intersections["crash_near_w"].clip(upper=p95) / denom
    ).clip(0, 1)

    # ── Intersection complexity (0-1) ────────────────────────────────────────
    deg = intersections["street_count"].clip(lower=1)
    deg_norm = ((deg - 2) / 4).clip(0, 1)  # 2→0, 6+→1
    major_norm = (intersections["major_touch_count"] / 4).clip(0, 1)

    intersections["intersection_complexity"] = (
        0.5 * deg_norm + 0.3 * major_norm + 0.2 * intersections["crash_cluster_norm"]
    ).clip(0, 1)

    # ── Save ─────────────────────────────────────────────────────────────────
    out_cols = [
        "street_count", "major_touch_count",
        "crash_cluster_norm", "intersection_complexity", "geometry",
    ]
    out = intersections[out_cols].copy()
    out.to_parquet(os.path.join(PROC_DIR, "intersections.parquet"))

    print(f"  Output intersections: {len(out):,}")
    print(f"  Complexity mean: {out['intersection_complexity'].mean():.3f}")
    print(f"  Complexity p95:  {out['intersection_complexity'].quantile(0.95):.3f}")


if __name__ == "__main__":
    main()
