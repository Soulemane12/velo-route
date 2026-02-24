"use client";

import { useRef, useEffect } from "react";
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
        // Each segment has its own geometry — use it directly
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

  return <div ref={containerRef} className="w-full h-full" />;
}
