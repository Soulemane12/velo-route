"use client";

import type { Route } from "@/app/types";
import RouteCard from "./RouteCard";
import RouteRecommendation from "./RouteRecommendation";

interface Props {
  routes: Route[];
  selectedRouteId: string | null;
  onSelectRoute: (id: string) => void;
  briefingText: string;
  briefingLoading: boolean;
  recommendationText: string;
  recommendationLoading: boolean;
  concerns: string;
}

export default function RouteList({
  routes,
  selectedRouteId,
  onSelectRoute,
  briefingText,
  briefingLoading,
  recommendationText,
  recommendationLoading,
  concerns,
}: Props) {
  if (routes.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 text-zinc-600">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-400">No routes yet</p>
          <p className="text-xs text-zinc-600 mt-0.5">
            Enter origin &amp; destination, then hit Find Routes
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* AI cross-route recommendation */}
      <RouteRecommendation
        text={recommendationText}
        loading={recommendationLoading}
        concerns={concerns}
      />

      <div className="px-4 py-3 mt-1 border-b border-zinc-800">
        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">
          {routes.length} route{routes.length !== 1 ? "s" : ""} found
        </p>
      </div>

      {routes.map((route, i) => (
        <RouteCard
          key={route.id}
          route={route}
          index={i}
          selected={route.id === selectedRouteId}
          onSelect={() => onSelectRoute(route.id)}
          briefingText={route.id === selectedRouteId ? briefingText : ""}
          briefingLoading={route.id === selectedRouteId ? briefingLoading : false}
        />
      ))}
    </div>
  );
}
