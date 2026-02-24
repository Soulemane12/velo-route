"use client";

interface Props {
  text: string;
  loading: boolean;
  concerns: string;
}

export default function RouteRecommendation({ text, loading, concerns }: Props) {
  if (!loading && !text) return null;

  return (
    <div className="mx-4 mt-4 mb-1">
      <div
        className={`rounded-xl border p-3 transition-all ${
          loading && !text
            ? "border-zinc-700/50 bg-zinc-900/60"
            : "border-green-500/25 bg-green-500/5"
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-1.5 mb-2">
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-3 h-3 text-green-400 shrink-0"
          >
            <path d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
          </svg>
          <span className="text-[10px] font-semibold text-green-400 uppercase tracking-widest">
            AI Pick
          </span>
          <span className="text-[10px] text-zinc-600 mx-0.5">·</span>
          <span className="text-[10px] text-zinc-500">Claude</span>
          {concerns.trim() && (
            <>
              <span className="text-[10px] text-zinc-600 mx-0.5">·</span>
              <span className="text-[10px] text-zinc-500 italic truncate max-w-[80px]">
                "{concerns.trim()}"
              </span>
            </>
          )}
          {loading && (
            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
          )}
        </div>

        {/* Text */}
        {loading && !text ? (
          <div className="space-y-1.5">
            <div className="h-2.5 bg-zinc-800 rounded-full animate-pulse w-full" />
            <div className="h-2.5 bg-zinc-800 rounded-full animate-pulse w-2/3" />
          </div>
        ) : (
          <p className="text-xs text-zinc-200 leading-relaxed">
            {text}
            {loading && (
              <span className="inline-block w-0.5 h-3 bg-green-400 animate-pulse ml-0.5 align-middle" />
            )}
          </p>
        )}
      </div>
    </div>
  );
}
