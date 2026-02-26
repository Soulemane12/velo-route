"use client";

import { useState } from "react";
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
    label: "St. George Ferry → Chumenti Bldg",
    kind: "risk",
    originText: "St. George Ferry Terminal, Staten Island",
    destText: "1865 Clove Rd, Staten Island",
    origin: [-74.073076, 40.643649],
    destination: [-74.101580, 40.624800],
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

async function geocode(query: string): Promise<[number, number] | null> {
  if (!query.trim()) return null;
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=1`
  );
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
  const [presetsOpen, setPresetsOpen] = useState(false);

  async function handleGeocode(text: string, setter: (c: [number, number]) => void) {
    const coords = await geocode(text);
    if (coords) setter(coords);
  }

  function handleKeyDown(
    e: React.KeyboardEvent,
    text: string,
    setter: (c: [number, number]) => void
  ) {
    if (e.key === "Enter") handleGeocode(text, setter);
  }

  function applyPreset(p: DemoPreset) {
    setOriginText(p.originText);
    setDestText(p.destText);
    onOriginChange(p.origin);
    onDestinationChange(p.destination);
    setPresetsOpen(false);
  }

  const canSearch = origin !== null && destination !== null;

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
              onChange={(e) => setOriginText(e.target.value)}
              onBlur={() => handleGeocode(originText, onOriginChange)}
              onKeyDown={(e) => handleKeyDown(e, originText, onOriginChange)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-8 pr-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-green-500/60 transition-colors"
            />
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
              onChange={(e) => setDestText(e.target.value)}
              onBlur={() => handleGeocode(destText, onDestinationChange)}
              onKeyDown={(e) => handleKeyDown(e, destText, onDestinationChange)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-8 pr-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-green-500/60 transition-colors"
            />
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
