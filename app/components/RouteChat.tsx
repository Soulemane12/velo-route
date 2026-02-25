"use client";

import { useState, useRef, useEffect } from "react";

interface Props {
  onSend: (message: string) => void;
  lastMessage: string;
  loading: boolean;
  waypointLoading?: boolean;
}

export default function RouteChat({ onSend, lastMessage, loading, waypointLoading }: Props) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when routes first load
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSend() {
    const msg = input.trim();
    if (!msg || loading) return;
    onSend(msg);
    setInput("");
  }

  function clearMessage() {
    onSend("");
  }

  return (
    <div className="shrink-0 border-t border-zinc-800 bg-zinc-950 p-3 space-y-2">
      {/* Label */}
      <div className="flex items-center gap-1.5">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="w-3.5 h-3.5 text-zinc-500"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
        </svg>
        <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">
          Refine with AI
        </span>
      </div>

      {/* Waypoint building status */}
      {waypointLoading && (
        <div className="flex items-center gap-2 rounded-lg bg-violet-500/10 border border-violet-500/20 px-2.5 py-1.5">
          <svg className="w-3 h-3 text-violet-400 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span className="text-xs text-violet-400">Building new route…</span>
        </div>
      )}

      {/* Last sent message */}
      {lastMessage && !waypointLoading && (
        <div className="flex items-center gap-2 rounded-lg bg-zinc-800/60 border border-zinc-700/50 px-2.5 py-1.5">
          <span className="flex-1 text-xs text-zinc-300 italic truncate">
            &ldquo;{lastMessage}&rdquo;
          </span>
          <button
            onClick={clearMessage}
            className="shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Clear instruction"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3">
              <path strokeLinecap="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Input row */}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          placeholder="Avoid busy streets, want bike lanes…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          className="flex-1 min-w-0 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-green-500/60 transition-colors"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          className="shrink-0 w-9 h-9 rounded-xl bg-green-500 hover:bg-green-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
        >
          {loading ? (
            <svg className="w-3.5 h-3.5 text-black animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5 text-black">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
