import Link from "next/link";

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 text-green-400">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
      </svg>
    ),
    title: "Real crash data",
    desc: "20,000+ NYPD-reported cycling incidents mapped into a risk grid covering all five boroughs.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 text-green-400">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
    title: "Up to 3 alternatives",
    desc: "Balanced, safest, and fastest routes — ranked by a weighted score of time and real risk.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 text-green-400">
        <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
      </svg>
    ),
    title: "Segment analysis",
    desc: "Every block scored individually. Color-coded on the map so you see exactly where the risk lies.",
  },
];

const MOCK_ROUTES = [
  { label: "Route 1", time: "14 min", dist: "2.3 km", risk: "low",    score: 18, bar: "bg-green-500",  badge: "bg-green-500/15 text-green-400"  },
  { label: "Route 2", time: "12 min", dist: "2.0 km", risk: "medium", score: 52, bar: "bg-yellow-500", badge: "bg-yellow-500/15 text-yellow-400" },
  { label: "Route 3", time: "10 min", dist: "1.8 km", risk: "high",   score: 74, bar: "bg-red-500",    badge: "bg-red-500/15 text-red-400"      },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white">

      {/* ── Nav ── */}
      <nav className="fixed inset-x-0 top-0 z-50 flex items-center justify-between px-6 md:px-10 py-4 bg-[#09090b]/80 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-green-500 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 text-black">
              <circle cx="5.5" cy="17.5" r="3" />
              <circle cx="18.5" cy="17.5" r="3" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.5 17.5 9 6h5l3 8-5.5 3.5" />
              <path strokeLinecap="round" d="M9 6h4" />
            </svg>
          </div>
          <span className="font-bold text-base tracking-tight">Velo</span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/Soulemane12/velo-route"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white text-sm font-medium px-4 py-2 rounded-full transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
            </svg>
            GitHub
          </a>
          <Link
            href="/map"
            className="flex items-center gap-1.5 bg-white hover:bg-zinc-100 text-black text-sm font-semibold px-4 py-2 rounded-full transition-colors"
          >
            Open App
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
            </svg>
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="flex flex-col items-center justify-center min-h-screen text-center px-6 pt-20 pb-16">
        <div className="inline-flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/10 px-4 py-1.5 text-sm text-green-400 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
          NYC crash data 
        </div>

        <h1 className="text-5xl sm:text-6xl md:text-8xl font-black leading-[0.92] tracking-tight mb-6">
          Cycle smarter.
          <br />
          <span className="text-green-400">Arrive safer.</span>
        </h1>

        <p className="text-zinc-400 text-lg md:text-xl max-w-md leading-relaxed mb-10">
          Real-time route alternatives scored against NYC cycling crash data.
          Know your risk before you ride.
        </p>

        <Link
          href="/map"
          className="bg-green-500 hover:bg-green-400 text-black text-base font-bold px-10 py-4 rounded-full transition-colors"
        >
          Plan Your Route →
        </Link>

        {/* Mock UI preview */}
        <div className="mt-16 w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden shadow-2xl shadow-black/60">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <span className="text-sm font-semibold">3 routes found</span>
            <span className="text-xs text-zinc-500">NYC · cycling</span>
          </div>
          {MOCK_ROUTES.map((r) => (
            <div key={r.label} className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-800 last:border-0">
              <div className={`w-1 h-10 rounded-full ${r.bar} shrink-0`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{r.label}</span>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${r.badge}`}>
                    {r.risk} · {r.score}
                  </span>
                </div>
                <div className="flex gap-3 mt-0.5 text-xs text-zinc-500">
                  <span>{r.time}</span>
                  <span>{r.dist}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="px-6 md:px-10 pb-28 max-w-4xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
              <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center mb-4">
                {f.icon}
              </div>
              <h3 className="font-semibold text-white mb-1.5">{f.title}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-zinc-800 px-6 md:px-10 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-green-500 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3 text-black">
              <circle cx="5.5" cy="17.5" r="3" />
              <circle cx="18.5" cy="17.5" r="3" />
              <path strokeLinecap="round" d="M5.5 17.5 9 6h5l3 8-5.5 3.5M9 6h4" />
            </svg>
          </div>
          <span className="text-sm font-semibold">Velo</span>
        </div>
        <a
          href="https://github.com/Soulemane12/velo-route"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
          </svg>
          Soulemane12/velo-route
        </a>
      </footer>

    </div>
  );
}
