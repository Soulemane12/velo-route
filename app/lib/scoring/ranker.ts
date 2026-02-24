/**
 * Route ranker — reorders scored routes based on selected mode.
 */
import type { Route, RouteMode } from "@/app/types";

export function rankRoutes(routes: Route[], mode: RouteMode): Route[] {
  if (routes.length <= 1) return routes;

  // Normalize duration and risk within the candidate set
  const durations = routes.map((r) => r.durationSec);
  const minDur = Math.min(...durations);
  const maxDur = Math.max(...durations);
  const durRange = maxDur - minDur || 1;

  const ranked = routes
    .map((route) => {
      const t = (route.durationSec - minDur) / durRange; // 0..1
      const r = route.riskScore / 100; // 0..1

      let score: number;
      switch (mode) {
        case "fastest":
          score = 0.8 * t + 0.2 * r;
          break;
        case "safer":
          score = 0.2 * t + 0.8 * r;
          break;
        case "balanced":
        default:
          score = 0.5 * t + 0.5 * r;
          break;
      }

      return { route, score };
    })
    .sort((a, b) => a.score - b.score);

  // Re-assign IDs based on new order
  return ranked.map(({ route }, i) => ({
    ...route,
    id: `r${i + 1}`,
  }));
}
