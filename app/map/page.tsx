"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import SearchPanel from "@/app/components/SearchPanel";
import RouteList from "@/app/components/RouteList";
import RouteChat from "@/app/components/RouteChat";
import type { Route } from "@/app/types";

const Map = dynamic(() => import("@/app/components/Map"), { ssr: false });

export default function MapPage() {
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [destination, setDestination] = useState<[number, number] | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [concerns, setConcerns] = useState("");

  // Per-route AI briefing
  const [briefingText, setBriefingText] = useState("");
  const [briefingLoading, setBriefingLoading] = useState(false);
  const briefingAbort = useRef<AbortController | null>(null);

  // Cross-route AI recommendation
  const [recommendationText, setRecommendationText] = useState("");
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const recommendAbort = useRef<AbortController | null>(null);
  const autoSelectedRef = useRef(false);

  // Waypoint route generation
  const [waypointLoading, setWaypointLoading] = useState(false);

  async function findRoutes() {
    if (!origin || !destination) return;
    setLoading(true);
    try {
      const res = await fetch("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin, destination }),
      });
      const data = await res.json();
      const fetched: Route[] = data.routes ?? [];
      setRoutes(fetched);
      setSelectedRouteId(fetched[0]?.id ?? null);
      setConcerns(""); // reset chat on new search
    } finally {
      setLoading(false);
    }
  }

  // Runs the recommendation API with an explicit routes array + message,
  // bypassing the useEffect closure so we always use the freshest data.
  function fireRecommendation(liveRoutes: Route[], msg: string) {
    recommendAbort.current?.abort();
    const ctrl = new AbortController();
    recommendAbort.current = ctrl;
    autoSelectedRef.current = false;
    setRecommendationText("");
    setRecommendationLoading(true);

    (async () => {
      try {
        const res = await fetch("/api/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ routes: liveRoutes, concerns: msg }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          setRecommendationText(accumulated);
          if (!autoSelectedRef.current) {
            const match = accumulated.match(/Route\s+([1-4])/i);
            if (match) {
              const rec = liveRoutes[parseInt(match[1]) - 1];
              if (rec) { setSelectedRouteId(rec.id); autoSelectedRef.current = true; }
            }
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError")
          setRecommendationText("Could not load recommendation.");
      } finally {
        setRecommendationLoading(false);
      }
    })();
  }

  async function handleChatSend(message: string) {
    // Clear case — wipe concerns and any via-route
    if (!message.trim()) {
      setConcerns("");
      setRoutes((prev) => prev.filter((r) => !r.id.startsWith("via-")));
      return;
    }

    if (!origin || !destination) {
      setConcerns(message);
      return;
    }

    setWaypointLoading(true);
    // Build the final routes array explicitly so we can pass it
    // directly to the recommendation (avoids React closure timing issues)
    let finalRoutes = routes.filter((r) => !r.id.startsWith("via-"));

    try {
      const res = await fetch("/api/waypoint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin, destination, message }),
      });
      const data = await res.json();
      if (data.ok && data.route) {
        finalRoutes = [...finalRoutes, data.route];
        setRoutes(finalRoutes);
        setSelectedRouteId(data.route.id);
      }
    } catch {
      // fall through with original routes
    } finally {
      setWaypointLoading(false);
    }

    // Update UI concerns display and fire recommendation with the
    // EXPLICIT finalRoutes (guaranteed to include any via-route)
    setConcerns(message);
    fireRecommendation(finalRoutes, message);
  }

  function clear() {
    setOrigin(null);
    setDestination(null);
    setRoutes([]);
    setSelectedRouteId(null);
    setBriefingText("");
    setRecommendationText("");
    setConcerns("");
  }

  function handleMapClick(lngLat: [number, number]) {
    if (!origin) setOrigin(lngLat);
    else if (!destination) setDestination(lngLat);
  }

  // ── Per-route briefing (fires on selected route change) ──────────────────
  useEffect(() => {
    if (!selectedRouteId || routes.length === 0) {
      setBriefingText("");
      return;
    }
    const route = routes.find((r) => r.id === selectedRouteId);
    if (!route) return;

    briefingAbort.current?.abort();
    const ctrl = new AbortController();
    briefingAbort.current = ctrl;
    const idx = routes.findIndex((r) => r.id === selectedRouteId);

    setBriefingText("");
    setBriefingLoading(true);

    (async () => {
      try {
        const res = await fetch("/api/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ route, routeIndex: idx, totalRoutes: routes.length }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          setBriefingText((p) => p + decoder.decode(value, { stream: true }));
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setBriefingText("Could not load briefing.");
      } finally {
        setBriefingLoading(false);
      }
    })();

    return () => ctrl.abort();
  }, [selectedRouteId, routes]);

  // ── Recommendation (fires on initial route load only — no concerns yet) ──
  // Chat-triggered recommendations go through fireRecommendation() directly
  // so they always receive the freshest routes array.
  useEffect(() => {
    if (routes.length === 0) {
      setRecommendationText("");
      return;
    }
    // Skip if the user already has an active concern — handled by fireRecommendation
    if (concerns.trim()) return;

    fireRecommendation(routes, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes]);

  return (
    <div className="flex h-full w-full">
      {/* Sidebar */}
      <aside className="w-80 shrink-0 flex flex-col bg-zinc-950 border-r border-zinc-800 overflow-hidden">
        <SearchPanel
          origin={origin}
          destination={destination}
          onOriginChange={setOrigin}
          onDestinationChange={setDestination}
          onFindRoutes={findRoutes}
          onClear={clear}
          loading={loading}
        />

        {/* Scrollable route list */}
        <RouteList
          routes={routes}
          selectedRouteId={selectedRouteId}
          onSelectRoute={setSelectedRouteId}
          briefingText={briefingText}
          briefingLoading={briefingLoading}
          recommendationText={recommendationText}
          recommendationLoading={recommendationLoading}
          concerns={concerns}
        />

        {/* Chat input — only shown once routes are loaded */}
        {routes.length > 0 && (
          <RouteChat
            onSend={handleChatSend}
            lastMessage={concerns}
            loading={waypointLoading || recommendationLoading}
            waypointLoading={waypointLoading}
          />
        )}
      </aside>

      {/* Map */}
      <div className="flex-1 relative">
        <Map
          routes={routes}
          selectedRouteId={selectedRouteId}
          origin={origin}
          destination={destination}
          onMapClick={handleMapClick}
        />
      </div>
    </div>
  );
}
