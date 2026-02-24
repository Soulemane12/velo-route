"""Download OSM bike-capable street network for NYC via OSMnx."""
import os
import osmnx as ox

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "raw")
PROC_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "processed")
GRAPHML = os.path.join(RAW_DIR, "nyc_bike_network.graphml")
PLACE = "New York City, New York, USA"


def main():
    os.makedirs(RAW_DIR, exist_ok=True)
    os.makedirs(PROC_DIR, exist_ok=True)

    if os.path.exists(GRAPHML):
        print(f"Graph already exists: {GRAPHML}. Delete to re-download.")
        G = ox.load_graphml(GRAPHML)
    else:
        print(f"Downloading OSM bike network for {PLACE}...")
        print("(This may take 5-15 minutes for all of NYC)")
        G = ox.graph_from_place(PLACE, network_type="bike", simplify=True)
        ox.save_graphml(G, GRAPHML)
        print(f"Saved graph: {GRAPHML}")

    nodes_gdf, edges_gdf = ox.graph_to_gdfs(G)

    # Convert mixed-type columns to strings to avoid parquet serialization errors
    for col in edges_gdf.columns:
        if col == "geometry":
            continue
        if edges_gdf[col].dtype == object:
            edges_gdf[col] = edges_gdf[col].astype(str)
    for col in nodes_gdf.columns:
        if col == "geometry":
            continue
        if nodes_gdf[col].dtype == object:
            nodes_gdf[col] = nodes_gdf[col].astype(str)

    nodes_out = os.path.join(PROC_DIR, "osm_nodes.parquet")
    edges_out = os.path.join(PROC_DIR, "osm_edges.parquet")
    nodes_gdf.to_parquet(nodes_out)
    edges_gdf.to_parquet(edges_out)

    print(f"Nodes: {nodes_gdf.shape[0]:,} → {nodes_out}")
    print(f"Edges: {edges_gdf.shape[0]:,} → {edges_out}")


if __name__ == "__main__":
    main()
