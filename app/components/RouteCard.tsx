"use client";

import type { Route } from "@/app/types";

const RISK_STYLES = {
  low:    { bar: "bg-green-500",  badge: "bg-green-500/15 text-green-400"   },
  medium: { bar: "bg-yellow-500", badge: "bg-yellow-500/15 text-yellow-400"  },
  high:   { bar: "bg-red-500",    badge: "bg-red-500/15 text-red-400"        },
};

const SEG_DOT = {
  low:    "bg-green-500",
  medium: "bg-yellow-500",
  high:   "bg-red-500",
};

function fmtDuration(sec: number) {
  return `${Math.round(sec / 60)} min`;
}
function fmtDistance(m: number) {
  return `${(m / 1000).toFixed(1)} km`;
}

interface Props {
  route: Route;
  index: number;
  selected: boolean;
  onSelect: () => void;
  briefingText: string;
  briefingLoading: boolean;
}

export default function RouteCard({
  route,
  index,
  selected,
  onSelect,
  briefingText,
  briefingLoading,
}: Props) {
  const styles = RISK_STYLES[route.riskLevel];

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left transition-colors border-b border-zinc-800 last:border-0 ${
        selected ? "bg-zinc-800/60" : "hover:bg-zinc-900/60"
      }`}
    >
      <div className="flex items-stretch gap-3 px-4 py-4">
        {/* Left risk bar */}
        <div className={`w-0.5 rounded-full shrink-0 ${styles.bar}`} />

        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-white">Route {index + 1}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs text-zinc-500">{route.riskScore}</span>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${styles.badge}`}>
                {route.riskLevel}
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-3 mt-1 text-xs text-zinc-500">
            <span>{fmtDuration(route.durationSec)}</span>
            <span>·</span>
            <span>{fmtDistance(route.distanceM)}</span>
          </div>

          {/* Reasons */}
          {route.reasons.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {route.reasons.slice(0, 3).map((r, i) => (
                <li key={i} className="text-xs text-zinc-500 flex items-start gap-1.5">
                  <span className="mt-[3px] shrink-0 w-1 h-1 rounded-full bg-zinc-600" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          )}

          {/* ── AI Briefing (selected only) ── */}
          {selected && (briefingLoading || briefingText) && (
            <div className="mt-3 rounded-xl bg-zinc-900 border border-zinc-700/50 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">
                  AI Briefing
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 font-medium">
                  Claude
                </span>
                {briefingLoading && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse ml-auto" />
                )}
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                {briefingText}
                {briefingLoading && (
                  <span className="inline-block w-0.5 h-3 bg-green-400 animate-pulse ml-0.5 align-middle" />
                )}
              </p>
            </div>
          )}

          {/* Segment breakdown when selected */}
          {selected && route.segments.length > 0 && (
            <div className="mt-3 pt-3 border-t border-zinc-700/50">
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">
                Segments
              </p>
              <div className="space-y-1.5">
                {route.segments.map((seg) => (
                  <div key={seg.segmentId} className="flex items-start gap-2">
                    <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${SEG_DOT[seg.riskLevel]}`} />
                    <div className="text-xs text-zinc-400 leading-snug">
                      <span className="font-medium text-zinc-300">{seg.segmentId}</span>
                      <span className="text-zinc-600 mx-1">·</span>
                      <span>{seg.reasons.join(", ")}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
