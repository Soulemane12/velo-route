"use client";

import { useRef, useEffect, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Route } from "@/app/types";

const ROUTE_COLORS = ["#3b82f6", "#22c55e", "#f97316"];

function riskColor(risk: number): string {
  if (risk < 35) return "#22c55e";
  if (risk < 65) return "#eab308";
  return "#ef4444";
}

interface Props {
  routes: Route[];
  selectedRouteId: string | null;
  origin: [number, number] | null;
  destination: [number, number] | null;
  onMapClick: (lngLat: [number, number]) => void;
}

type HeatmapData = {
  crashes: object;
  crimes: object;
};

const CRASH_COLOR = [
  "interpolate",
  ["linear"],
  ["heatmap-density"],
  0, "rgba(0,0,0,0)",
  0.2, "rgba(254,224,144,0.5)",
  0.5, "rgba(253,141,60,0.65)",
  0.8, "rgba(240,59,32,0.8)",
  1, "rgba(189,0,38,0.9)",
];

const CRIME_COLOR = [
  "interpolate",
  ["linear"],
  ["heatmap-density"],
  0, "rgba(0,0,0,0)",
  0.2, "rgba(213,183,250,0.5)",
  0.5, "rgba(147,51,234,0.65)",
  0.8, "rgba(109,40,217,0.8)",
  1, "rgba(76,29,149,0.9)",
];

export default function Map({
  routes,
  selectedRouteId,
  origin,
  destination,
  onMapClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const layerIds = useRef<string[]>([]);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const heatmapDataRef = useRef<HeatmapData | null>(null);

  const [showCrash, setShowCrash] = useState(false);
  const [showCrime, setShowCrime] = useState(false);
  const [heatmapLoading, setHeatmapLoading] = useState(false);

  // Initialize map
  useEffect(() => {
    let map: mapboxgl.Map;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;

      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

      map = new mapboxgl.Map({
        container: containerRef.current!,
        style: "mapbox://styles/mapbox/light-v11",
        center: [-73.985, 40.758],
        zoom: 12,
      });

      map.addControl(new mapboxgl.NavigationControl(), "top-right");

      map.on("click", (e) => {
        onMapClick([e.lngLat.lng, e.lngLat.lat]);
      });

      mapRef.current = map;
    })();

    return () => {
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch + apply heatmap layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyHeatmaps = (data: HeatmapData) => {
      // Remove existing heatmap layers/sources
      for (const id of ["heatmap-crashes-layer", "heatmap-crimes-layer"]) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      for (const id of ["heatmap-crashes", "heatmap-crimes"]) {
        if (map.getSource(id)) map.removeSource(id);
      }

      // Find first route layer to insert heatmaps beneath it (fallback: top)
      const firstRouteLayer = layerIds.current[0];

      if (showCrash) {
        map.addSource("heatmap-crashes", { type: "geojson", data: data.crashes as never });
        map.addLayer({
          id: "heatmap-crashes-layer",
          type: "heatmap",
          source: "heatmap-crashes",
          paint: {
            "heatmap-weight": ["interpolate", ["linear"], ["get", "intensity"], 0, 0, 1, 1],
            "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 0.8, 15, 2],
            "heatmap-color": CRASH_COLOR as never,
            "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 15, 14, 25],
            "heatmap-opacity": 0.8,
          },
        }, firstRouteLayer);
      }

      if (showCrime) {
        map.addSource("heatmap-crimes", { type: "geojson", data: data.crimes as never });
        map.addLayer({
          id: "heatmap-crimes-layer",
          type: "heatmap",
          source: "heatmap-crimes",
          paint: {
            "heatmap-weight": ["interpolate", ["linear"], ["get", "intensity"], 0, 0, 1, 1],
            "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 0.8, 15, 2],
            "heatmap-color": CRIME_COLOR as never,
            "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 15, 14, 25],
            "heatmap-opacity": 0.75,
          },
        }, firstRouteLayer);
      }
    };

    const run = async () => {
      if (!showCrash && !showCrime) {
        // Remove both
        for (const id of ["heatmap-crashes-layer", "heatmap-crimes-layer"]) {
          if (map.getLayer(id)) map.removeLayer(id);
        }
        for (const id of ["heatmap-crashes", "heatmap-crimes"]) {
          if (map.getSource(id)) map.removeSource(id);
        }
        return;
      }

      if (!heatmapDataRef.current) {
        setHeatmapLoading(true);
        try {
          const res = await fetch("/api/heatmap");
          heatmapDataRef.current = await res.json();
        } catch {
          setHeatmapLoading(false);
          return;
        }
        setHeatmapLoading(false);
      }

      if (map.isStyleLoaded()) {
        applyHeatmaps(heatmapDataRef.current!);
      } else {
        map.once("load", () => applyHeatmaps(heatmapDataRef.current!));
      }
    };

    run();
  }, [showCrash, showCrime]);

  // Draw routes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const draw = () => {
      // Remove old layers/sources
      for (const id of layerIds.current) {
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(id)) map.removeSource(id);
      }
      layerIds.current = [];

      if (routes.length === 0) return;

      // Draw non-selected routes first (behind)
      routes.forEach((route, i) => {
        if (route.id === selectedRouteId) return;
        const id = `route-${route.id}`;
        map.addSource(id, {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: route.geometry },
        });
        map.addLayer({
          id,
          type: "line",
          source: id,
          paint: {
            "line-color": ROUTE_COLORS[i % ROUTE_COLORS.length],
            "line-width": 3,
            "line-opacity": 0.4,
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
        layerIds.current.push(id);
      });

      // Draw selected route on top with per-segment coloring
      const selected = routes.find((r) => r.id === selectedRouteId);

      if (selected && selected.segments.length > 0) {
        const features = selected.segments.map((seg) => ({
          type: "Feature" as const,
          properties: { color: riskColor(seg.risk), risk: seg.risk },
          geometry: seg.geometry ?? selected.geometry,
        }));

        const id = `route-${selected.id}-segments`;
        map.addSource(id, {
          type: "geojson",
          data: { type: "FeatureCollection", features },
        });
        map.addLayer({
          id,
          type: "line",
          source: id,
          paint: {
            "line-color": ["get", "color"],
            "line-width": 6,
            "line-opacity": 1,
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
        layerIds.current.push(id);
      } else if (selected) {
        const selectedIdx = routes.findIndex((r) => r.id === selectedRouteId);
        const id = `route-${selected.id}`;
        map.addSource(id, {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: selected.geometry },
        });
        map.addLayer({
          id,
          type: "line",
          source: id,
          paint: {
            "line-color": ROUTE_COLORS[selectedIdx % ROUTE_COLORS.length],
            "line-width": 6,
            "line-opacity": 1,
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
        layerIds.current.push(id);
      }

      // Fit bounds
      const allCoords = routes.flatMap((r) => r.geometry.coordinates);
      if (allCoords.length > 0) {
        const lngs = allCoords.map((c) => c[0]);
        const lats = allCoords.map((c) => c[1]);
        map.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { padding: 60, duration: 500 }
        );
      }
    };

    if (map.isStyleLoaded()) {
      draw();
    } else {
      map.once("load", draw);
    }
  }, [routes, selectedRouteId]);

  // Markers for origin/destination
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const place = async () => {
      const mapboxgl = (await import("mapbox-gl")).default;

      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      if (origin) {
        const m = new mapboxgl.Marker({ color: "#22c55e" })
          .setLngLat(origin)
          .addTo(map);
        markersRef.current.push(m);
      }
      if (destination) {
        const m = new mapboxgl.Marker({ color: "#ef4444" })
          .setLngLat(destination)
          .addTo(map);
        markersRef.current.push(m);
      }
    };

    place();
  }, [origin, destination]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {/* Heatmap toggles */}
      <div className="absolute bottom-8 left-3 flex flex-col gap-1.5 z-10">
        <button
          onClick={() => setShowCrash((v) => !v)}
          disabled={heatmapLoading}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all shadow-sm ${
            showCrash
              ? "bg-red-500/20 border-red-500/50 text-red-300"
              : "bg-zinc-900/80 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
          }`}
        >
          <span className={`w-2 h-2 rounded-full shrink-0 ${showCrash ? "bg-red-400" : "bg-zinc-600"}`} />
          Crash zones
        </button>

        <button
          onClick={() => setShowCrime((v) => !v)}
          disabled={heatmapLoading}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all shadow-sm ${
            showCrime
              ? "bg-violet-500/20 border-violet-500/50 text-violet-300"
              : "bg-zinc-900/80 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
          }`}
        >
          <span className={`w-2 h-2 rounded-full shrink-0 ${showCrime ? "bg-violet-400" : "bg-zinc-600"}`} />
          Crime zones
        </button>

        {heatmapLoading && (
          <p className="text-[10px] text-zinc-500 px-1">Loading…</p>
        )}
      </div>
    </div>
  );
}
