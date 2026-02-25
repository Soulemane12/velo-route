# Velo — NYC Cycling Safety Navigator

> Real-time route alternatives scored against NYC crash data and felony crime data. Know your risk before you ride.

---

## Overview

Velo is a full-stack cycling route planning app built for New York City. It fetches up to three Mapbox cycling route alternatives and scores each one against a composite risk grid derived from two NYC Open Data sources — NYPD cyclist crash records and NYPD felony complaint data — combined with road class, bike infrastructure quality, intersection complexity, and lane continuity.

The result is a 0–100 risk score per route with block-level color coding on the map, AI-generated safety briefings, and a conversational interface for requesting custom waypoint routes.

---

## Features

### Route Scoring
- Fetches up to 3 real Mapbox Directions cycling routes (balanced, safer, fastest)
- Scores each route against a precomputed spatial risk grid covering all five boroughs
- Risk score (0–100) derived from 6 factors: crash density, crime density, road class, bike infrastructure, intersection complexity, and lane continuity breaks

### Segment-Level Map
- Each block along the selected route is color-coded green / yellow / red
- Per-segment reasons shown (e.g. "high crash density", "elevated crime area", "poor bike infrastructure")

### AI Briefings (Claude Haiku)
- Streams a 1–2 sentence safety brief per route card
- Surfaces the most relevant risk factors: crash %, crime %, road exposure
- Via-routes (user-requested detours) use an encouraging guide tone instead of the blunt analyst tone used for standard routes

### AI Recommendation (Claude Haiku)
- Cross-route analysis picks the best option given stated rider preferences
- Location-aware: geocodes any mentioned places to reason about proximity
- Auto-selects the recommended route on the map

### Conversational Waypoint Routing
- Type a natural language request: *"I want to pass by Symphony Space"*
- Claude extracts the place name, a 3-tier geocoder resolves it (Mapbox Search Box v6 → Mapbox Geocoding v5 → OpenStreetMap Nominatim), and a new Mapbox route is generated through that waypoint
- New route appears live on map and sidebar with a purple "via [place]" tag

### Demo Presets
- **Chick-fil-A → Columbia University** — UES to Morningside Heights cross-borough risk demo
- **Bushwick → East Queens** — mode comparison demo

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Map | Mapbox GL JS 3 |
| Styling | Tailwind CSS 4 |
| AI | Claude Haiku via Anthropic SDK |
| Geocoding | Mapbox Search Box v6, Mapbox Geocoding v5, OpenStreetMap Nominatim |
| Data pipeline | Python 3, GeoPandas, NumPy, pandas |
| Runtime | Node.js (Vercel serverless) |

---

## Project Structure

```
app/
  api/
    routes/         → Fetches Mapbox routes + runs scoring pipeline
    explain/        → Streams AI safety brief for a single route (Claude Haiku)
    recommend/      → Streams cross-route AI recommendation (Claude Haiku)
    waypoint/       → Builds new route via geocoded waypoint
    health/         → Artifact load status check
  components/
    Map.tsx                  → Mapbox GL map, segment layer rendering
    SearchPanel.tsx          → Origin/destination inputs + demo presets
    RouteList.tsx            → Scrollable list of scored route cards
    RouteCard.tsx            → Individual route: score, reasons, AI brief, via tag
    RouteChat.tsx            → Conversational input with waypoint loading state
    RouteRecommendation.tsx  → Streaming AI pick banner
  lib/
    scoring/
      scorer.ts       → Core scoring engine: grid lookup, segment risk, route score
      segmentizer.ts  → Groups samples into color-coded map segments
      explainer.ts    → Converts metrics to RouteRiskReason objects
      ranker.ts       → Sorts and selects routes by score
  map/
    page.tsx        → Main app page: state, route orchestration, recommendation logic
  page.tsx          → Landing page
  types.ts          → Shared TypeScript interfaces

scripts/
  risk/
    00_download_crashes.py    → Download NYPD Motor Vehicle Collisions dataset (~400 MB)
    00b_download_crimes.py    → Download NYPD Complaint Data (felony, ~50-100 MB)
    01_build_osm_network.py   → Build OSM road network for NYC
    02_build_grid_features.py → Build 200m spatial risk grid with crash + crime density
    03_build_intersections.py → Compute intersection complexity scores
    04_export_artifacts.py    → Export risk_grid.json, intersections.json, scoring_config.json

data/
  raw/           → Downloaded source CSVs (gitignored)
  processed/     → Intermediate parquet files (gitignored)
  artifacts/     → Exported JSON artifacts loaded at runtime
    risk_grid.json
    intersections.json
    scoring_config.json
```

---

## Scoring Model

### Risk Grid
- 200m × 200m cells covering all five NYC boroughs
- Each cell stores: `crashDensity`, `crimeDensity`, `roadClassPenalty`, `bikeLanePenalty`, `bikeCoverage`

### Per-Segment Risk Formula
```
segmentRisk = w_crash × crashDensity
            + w_crime × crimeDensity
            + w_road  × roadClassPenalty
            + w_bike  × bikeLanePenalty
```

### Route Score Weights
| Factor | Weight |
|---|---|
| Crash density | 0.35 |
| Crime density | 0.15 |
| Road class penalty | 0.22 |
| Bike lane penalty | 0.22 |
| Continuity breaks | 0.06 |
| Intersection penalty | 0.08 (lambda) |

### Crime Severity Weights
| Offense | Weight |
|---|---|
| Robbery | 2.5× |
| Felony assault | 2.0× |
| Assault 3 & related | 1.5× |
| Grand larceny | 1.0× |
| Burglary / GLA motor vehicle | 0.8× |

### Normalization
Scores are linearly normalized to 0–100 using fixed calibration bounds (`routeRawMin: 0.05`, `routeRawMax: 2.50`). Risk levels: `low` < 40, `medium` 40–70, `high` > 70.

---

## Data Sources

| Dataset | Source | Size |
|---|---|---|
| NYPD Motor Vehicle Collisions | [NYC Open Data h9gi-nx95](https://data.cityofnewyork.us/Public-Safety/Motor-Vehicle-Collisions-Crashes/h9gi-nx95) | ~400 MB |
| NYPD Complaint Data Historic | [NYC Open Data qgea-i56i](https://data.cityofnewyork.us/Public-Safety/NYPD-Complaint-Data-Historic/qgea-i56i) | ~50-100 MB (filtered) |
| OpenStreetMap NYC | Via OSMnx | varies |

---

## Setup

### Prerequisites
- Node.js 18+
- Python 3.10+
- Mapbox account (free tier works)
- Anthropic API key

### Environment Variables

Create `.env.local`:
```env
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token
ANTHROPIC_API_KEY=your_anthropic_key
```

### Install Dependencies

```bash
# Node
npm install

# Python (for data pipeline)
pip install geopandas pandas numpy requests osmnx pyarrow
```

### Build the Risk Grid (one-time)

```bash
# 1. Download crash data (~400 MB)
python scripts/risk/00_download_crashes.py

# 2. Download felony crime data (~50-100 MB)
python scripts/risk/00b_download_crimes.py

# 3. Build OSM road network
python scripts/risk/01_build_osm_network.py

# 4. Build grid features (crash + crime density, road/bike penalties)
python scripts/risk/02_build_grid_features.py

# 5. Build intersection scores
python scripts/risk/03_build_intersections.py

# 6. Export JSON artifacts for runtime scorer
python scripts/risk/04_export_artifacts.py
```

Artifacts are written to `data/artifacts/` and loaded by the Next.js scorer at startup.

### Run the App

```bash
npm run dev
# → http://localhost:3000
```

---

## API Routes

| Route | Method | Description |
|---|---|---|
| `/api/routes` | POST | Fetch + score up to 3 Mapbox cycling routes |
| `/api/explain` | POST | Stream AI safety brief for a single route |
| `/api/recommend` | POST | Stream AI cross-route recommendation |
| `/api/waypoint` | POST | Build new route via geocoded waypoint |
| `/api/health` | GET | Check artifact load status |

### Example: `/api/routes`
```json
// Request
{ "origin": [-73.9519, 40.7775], "destination": [-73.9607, 40.8075] }

// Response
{
  "ok": true,
  "routes": [{
    "id": "route-0",
    "riskScore": 42,
    "riskLevel": "medium",
    "durationSec": 840,
    "distanceM": 3200,
    "reasons": ["31% on major roads", "2 complex intersections"],
    "segments": [...],
    "metrics": {
      "pctHighCrashCells": 0.18,
      "pctHighCrimeCells": 0.12,
      "pctMajorRoadCells": 0.31,
      "pctPoorBikeInfraCells": 0.44,
      "complexIntersectionCount": 2,
      "continuityBreakCount": 3
    }
  }]
}
```

### Example: `/api/waypoint`
```json
// Request
{
  "origin": [-73.95, 40.77],
  "destination": [-73.96, 40.80],
  "message": "I want to pass by Whole Foods on 97th"
}

// Response
{ "ok": true, "route": { "id": "via-whole-foods", "via": "Whole Foods", ... } }
```

---

## Geocoding Chain

Waypoint and recommendation APIs resolve natural language place requests through a multi-step chain:

1. **Claude Haiku** — Extracts the clean place name from the full message
   `"I want to pass by Symphony Space like right through it"` → `"Symphony Space"`
2. **Mapbox Search Box v6** — Best coverage for businesses and POIs
3. **Mapbox Geocoding v5** — Landmarks and addresses
4. **OpenStreetMap Nominatim** — Final fallback, best coverage for NYC venues and cultural institutions

---

## License

MIT
