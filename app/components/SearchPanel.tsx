"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface DemoPreset {
  label: string;
  kind: "risk" | "mode";
  originText: string;
  destText: string;
  origin: [number, number];
  destination: [number, number];
}

const DEMO_PRESETS: DemoPreset[] = [
  {
    label: "Chick-fil-A → Columbia University",
    kind: "risk",
    originText: "Chick-fil-A, 1536 3rd Ave",
    destText: "Columbia University",
    origin: [-73.951872, 40.777412],
    destination: [-73.960678, 40.807537],
  },
  {
    label: "Bushwick → East Queens",
    kind: "mode",
    originText: "Bushwick / Ridgewood",
    destText: "East Queens corridor",
    origin: [-73.923728, 40.713194],
    destination: [-73.889547, 40.712783],
  },
  {
    label: "New Dorp → Stapleton",
    kind: "risk",
    originText: "New Dorp, Staten Island",
    destText: "Stapleton, Staten Island",
    origin: [-74.116000, 40.571000],
    destination: [-74.077000, 40.629000],
  },
];

interface Props {
  origin: [number, number] | null;
  destination: [number, number] | null;
  onOriginChange: (coords: [number, number]) => void;
  onDestinationChange: (coords: [number, number]) => void;
  onFindRoutes: () => void;
  onClear: () => void;
  loading: boolean;
}

interface SearchSuggestion {
  id: string;
  label: string;
  center: [number, number];
}

interface GeocodeFeature {
  id: string;
  place_name: string;
  center: [number, number];
}

const COUNTRY_FILTER = "us";

function distanceKm(a: [number, number], b: [number, number]): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h =
    s1 * s1 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * s2 * s2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

async function fetchSuggestions(
  query: string,
  proximity: [number, number] | null
): Promise<SearchSuggestion[]> {
  if (!query.trim()) return [];
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return [];
  const proximityParam = proximity ? `&proximity=${proximity[0]},${proximity[1]}` : "";

  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
      query
    )}.json?access_token=${token}&autocomplete=true&limit=6&types=address,poi,place,neighborhood&country=${COUNTRY_FILTER}${proximityParam}`
  );
  if (!res.ok) return [];

  const data = (await res.json()) as { features?: GeocodeFeature[] };
  const suggestions = (data.features ?? [])
    .filter((feature) => Array.isArray(feature.center) && feature.center.length === 2)
    .map((feature) => ({
      id: feature.id,
      label: feature.place_name,
      center: feature.center,
    }));
  if (!proximity) return suggestions;
  return suggestions.sort(
    (a, b) => distanceKm(a.center, proximity) - distanceKm(b.center, proximity)
  );
}

async function geocode(query: string): Promise<[number, number] | null> {
  if (!query.trim()) return null;
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;
  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
      query
    )}.json?access_token=${token}&limit=1&country=${COUNTRY_FILTER}`
  );
  if (!res.ok) return null;
  const data = await res.json();
  if (data.features?.length > 0) return data.features[0].center as [number, number];
  return null;
}

export default function SearchPanel({
  origin,
  destination,
  onOriginChange,
  onDestinationChange,
  onFindRoutes,
  onClear,
  loading,
}: Props) {
  const [originText, setOriginText] = useState("");
  const [destText, setDestText] = useState("");
  const [originSuggestions, setOriginSuggestions] = useState<SearchSuggestion[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<SearchSuggestion[]>([]);
  const [originLoading, setOriginLoading] = useState(false);
  const [destLoading, setDestLoading] = useState(false);
  const [originFocused, setOriginFocused] = useState(false);
  const [destFocused, setDestFocused] = useState(false);
  const [originActiveIndex, setOriginActiveIndex] = useState(-1);
  const [destActiveIndex, setDestActiveIndex] = useState(-1);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const originReqId = useRef(0);
  const destReqId = useRef(0);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation([pos.coords.longitude, pos.coords.latitude]);
      },
      () => {
        setUserLocation(null);
      },
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 5000 }
    );
  }, []);

  async function handleGeocode(text: string, setter: (c: [number, number]) => void) {
    const coords = await geocode(text);
    if (coords) setter(coords);
  }

  function clearOriginSuggestions() {
    setOriginSuggestions([]);
    setOriginActiveIndex(-1);
  }

  function clearDestSuggestions() {
    setDestSuggestions([]);
    setDestActiveIndex(-1);
  }

  function applyOriginSuggestion(suggestion: SearchSuggestion) {
    setOriginText(suggestion.label);
    onOriginChange(suggestion.center);
    clearOriginSuggestions();
    setOriginFocused(false);
  }

  function applyDestSuggestion(suggestion: SearchSuggestion) {
    setDestText(suggestion.label);
    onDestinationChange(suggestion.center);
    clearDestSuggestions();
    setDestFocused(false);
  }

  function handleOriginKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && originSuggestions.length > 0) {
      e.preventDefault();
      setOriginActiveIndex((idx) => (idx + 1) % originSuggestions.length);
      return;
    }
    if (e.key === "ArrowUp" && originSuggestions.length > 0) {
      e.preventDefault();
      setOriginActiveIndex((idx) =>
        idx <= 0 ? originSuggestions.length - 1 : idx - 1
      );
      return;
    }
    if (e.key === "Escape") {
      clearOriginSuggestions();
      return;
    }
    if (e.key === "Enter") {
      if (originActiveIndex >= 0 && originSuggestions[originActiveIndex]) {
        e.preventDefault();
        applyOriginSuggestion(originSuggestions[originActiveIndex]);
        return;
      }
      handleGeocode(originText, onOriginChange);
    }
  }

  function handleDestKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && destSuggestions.length > 0) {
      e.preventDefault();
      setDestActiveIndex((idx) => (idx + 1) % destSuggestions.length);
      return;
    }
    if (e.key === "ArrowUp" && destSuggestions.length > 0) {
      e.preventDefault();
      setDestActiveIndex((idx) => (idx <= 0 ? destSuggestions.length - 1 : idx - 1));
      return;
    }
    if (e.key === "Escape") {
      clearDestSuggestions();
      return;
    }
    if (e.key === "Enter") {
      if (destActiveIndex >= 0 && destSuggestions[destActiveIndex]) {
        e.preventDefault();
        applyDestSuggestion(destSuggestions[destActiveIndex]);
        return;
      }
      handleGeocode(destText, onDestinationChange);
    }
  }

  function applyPreset(p: DemoPreset) {
    setOriginText(p.originText);
    setDestText(p.destText);
    onOriginChange(p.origin);
    onDestinationChange(p.destination);
    setPresetsOpen(false);
    clearOriginSuggestions();
    clearDestSuggestions();
  }

  useEffect(() => {
    const query = originText.trim();
    if (query.length < 3) {
      originReqId.current += 1;
      clearOriginSuggestions();
      setOriginLoading(false);
      return;
    }

    const id = ++originReqId.current;
    const timer = setTimeout(async () => {
      setOriginLoading(true);
      const suggestions = await fetchSuggestions(query, userLocation);
      if (id !== originReqId.current) return;
      setOriginSuggestions(suggestions);
      setOriginActiveIndex(-1);
      setOriginLoading(false);
    }, 220);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originText, userLocation]);

  useEffect(() => {
    const query = destText.trim();
    if (query.length < 3) {
      destReqId.current += 1;
      clearDestSuggestions();
      setDestLoading(false);
      return;
    }

    const id = ++destReqId.current;
    const timer = setTimeout(async () => {
      setDestLoading(true);
      const suggestions = await fetchSuggestions(query, userLocation);
      if (id !== destReqId.current) return;
      setDestSuggestions(suggestions);
      setDestActiveIndex(-1);
      setDestLoading(false);
    }, 220);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destText, userLocation]);

  const canSearch = origin !== null && destination !== null;
  const showOriginDropdown = originFocused && originText.trim().length >= 3;
  const showDestDropdown = destFocused && destText.trim().length >= 3;

  return (
    <div className="flex flex-col border-b border-zinc-800">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-green-500 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5 text-black">
              <circle cx="5.5" cy="17.5" r="3" />
              <circle cx="18.5" cy="17.5" r="3" />
              <path strokeLinecap="round" d="M5.5 17.5 9 6h5l3 8-5.5 3.5M9 6h4" />
            </svg>
          </div>
          <span className="font-bold text-sm text-white">Velo</span>
        </div>
        <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          ← Home
        </Link>
      </div>

      {/* Inputs */}
      <div className="px-4 pt-4 pb-3 space-y-3">

        {/* Origin */}
        <div>
          <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-1.5">
            From
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-green-500 shrink-0" />
            <input
              type="text"
              placeholder="Address or click map"
              value={originText}
              onChange={(e) => {
                setOriginText(e.target.value);
                setOriginActiveIndex(-1);
                setOriginFocused(true);
              }}
              onFocus={() => setOriginFocused(true)}
              onBlur={() => {
                setOriginFocused(false);
                handleGeocode(originText, onOriginChange);
                setTimeout(clearOriginSuggestions, 80);
              }}
              onKeyDown={handleOriginKeyDown}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-8 pr-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-green-500/60 transition-colors"
            />
            {showOriginDropdown && (
              <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden shadow-xl">
                {originLoading ? (
                  <div className="px-3 py-2 text-xs text-zinc-500">Searching addresses…</div>
                ) : originSuggestions.length > 0 ? (
                  originSuggestions.map((suggestion, idx) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyOriginSuggestion(suggestion);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                        idx === originActiveIndex
                          ? "bg-zinc-800 text-white"
                          : "text-zinc-300 hover:bg-zinc-800"
                      }`}
                    >
                      {suggestion.label}
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-2 text-xs text-zinc-500">No address matches.</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Destination */}
        <div>
          <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-1.5">
            To
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-sm bg-red-500 shrink-0" />
            <input
              type="text"
              placeholder="Address or click map"
              value={destText}
              onChange={(e) => {
                setDestText(e.target.value);
                setDestActiveIndex(-1);
                setDestFocused(true);
              }}
              onFocus={() => setDestFocused(true)}
              onBlur={() => {
                setDestFocused(false);
                handleGeocode(destText, onDestinationChange);
                setTimeout(clearDestSuggestions, 80);
              }}
              onKeyDown={handleDestKeyDown}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-8 pr-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-green-500/60 transition-colors"
            />
            {showDestDropdown && (
              <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden shadow-xl">
                {destLoading ? (
                  <div className="px-3 py-2 text-xs text-zinc-500">Searching addresses…</div>
                ) : destSuggestions.length > 0 ? (
                  destSuggestions.map((suggestion, idx) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyDestSuggestion(suggestion);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                        idx === destActiveIndex
                          ? "bg-zinc-800 text-white"
                          : "text-zinc-300 hover:bg-zinc-800"
                      }`}
                    >
                      {suggestion.label}
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-2 text-xs text-zinc-500">No address matches.</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onFindRoutes}
            disabled={!canSearch || loading}
            className="flex-1 bg-green-500 hover:bg-green-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-semibold py-2.5 rounded-xl transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Finding…
              </span>
            ) : (
              "Find Routes"
            )}
          </button>
          <button
            onClick={() => {
              onClear();
              setOriginText("");
              setDestText("");
              clearOriginSuggestions();
              clearDestSuggestions();
              setOriginFocused(false);
              setDestFocused(false);
            }}
            className="px-3 py-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 text-sm transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Demo presets */}
      <div className="px-4 pb-4">
        <button
          onClick={() => setPresetsOpen((o) => !o)}
          className="flex items-center justify-between w-full text-[10px] font-semibold text-zinc-500 uppercase tracking-widest hover:text-zinc-300 transition-colors py-1"
        >
          <span>Demo routes</span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`w-3.5 h-3.5 transition-transform ${presetsOpen ? "rotate-180" : ""}`}
          >
            <path strokeLinecap="round" d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {presetsOpen && (
          <div className="mt-2 space-y-1">
            {DEMO_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p)}
                className="flex items-center justify-between w-full rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-3 py-2 text-left transition-colors"
              >
                <span className="text-xs text-zinc-300 truncate pr-2">{p.label}</span>
                <span
                  className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                    p.kind === "mode"
                      ? "bg-blue-500/15 text-blue-400"
                      : "bg-green-500/15 text-green-400"
                  }`}
                >
                  {p.kind === "mode" ? "mode" : "risk"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
