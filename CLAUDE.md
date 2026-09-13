# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Dev server on port 3000
npm run build        # TypeScript check + Vite production build
npm test             # Run all tests (vitest)
npx vitest run src/engine/benchmarks.test.ts          # Single file
npx vitest run src/utils/math2d.fast.test.ts          # Math equivalence tests
```

Path alias `@/` resolves to `src/`.

## Project Overview

USI-LIGHT is a 100% client-side 2.5D CAD browser app for Polish building regulation compliance:
- **§ 56** — sunlight duration analysis (nasłonecznienie)
- **§ 12** — shadowing angle analysis (przesłanianie)

Stack: React 19, TypeScript strict, Vite 8, Tailwind CSS 3.4, Zustand 5 + zundo (undo/redo), Canvas 2D API.

## Architecture

### Dual-Canvas Rendering
`CadCanvas.tsx` maintains two stacked canvases:
- **`canvasRef`** — base scene canvas: grid, buildings, shadows, analysis bands. Only redraws on scene/viewport changes.
- **`overlayCanvasRef`** — interactive overlay: cursor, OSNAP snapping markers, live drawing previews. Redraws at full 60/120 FPS.

Both are driven by a **`CadRenderPipeline`** (`src/components/cad/pipeline/CadRenderPipeline.ts`) — an ordered stack of `CadRenderLayer` instances sorted by `zIndex`. To add a render layer, implement `CadRenderLayer` and register it in the pipeline constructor or via `registerGeoLayers()` for geo overlays.

### State — Five Zustand Stores (`src/store/`)
- **`useSceneStore`** — buildings, layers, DXF import state, undo history (via zundo temporal)
- **`useCadToolStore`** — active drawing tool, OSNAP, dimensions, view rotation
- **`useSolarAnalysisStore`** — analysis settings, pinned facade points, analysis output
- **`useUiStore`** — share modal open state
- **`useLicenseStore`** — Pro license key/status, persisted to `localStorage` (`usi_license_key`)

Scene is persisted to `localStorage` under key `usi-light.scene.v1`.

### Analysis Engine (`src/engine/`)
- **`analysisEngine.ts`** — core § 12 / § 56 algorithms: `prefilterShadowingObstacles`, `analyzeShadowingAtPoint`, `analyzeSunlightAtPoint`, `analyzeSunlightAtPointSegments`
- **`analysis.worker.ts`** + **`useAnalysisWorker`** hook — offloads batch analysis to a Web Worker; automatically falls back to main thread
- **Progressive Accuracy**: during interaction (`isInteracting=true`) uses coarse parameters (`accuracyStage: 'live'`); 200 ms after interaction ends, upgrades to fine (`accuracyStage: 'final'`)
- **`modifiers/modifierPipeline.ts`** — non-destructive 2.5D modifier stack applied to `BuildingLoop`: `story_offset`, `zone_offset`, `bay_window`
- **`solar/`** — solar position engines: `LutSolarEngine` (LUT-based fast lookup), `AnalyticalSolarEngine` (precise)

### Core Data Model (`src/types/geometry.ts`)
- **`BuildingLoop`** — central entity: outer polygon (`vertices: Point2D[]`) + optional interior holes (`holes?: Point2D[][]`, e.g. courtyards from cadastral imports) + elevation metadata + `segments: FacadeSegment[]`. Key flags: `isTested` (object under analysis vs. obstacle), `isIncluded`, `isLocked`, `isGhosted`, `category` (`building` | `boundary`)
- **`FacadeSegment`** — wall edge with outward unit normal, `hTop`/`hWindowBottom`, precomputed `lineEquation`, and `ringIndex` (`0`/undefined = outer ring, `1+` = hole index + 1)
- **`PinnedFacadePoint`** — persistent measurement point: `{ buildingId, segmentId, offsetRatio }` (P1, P2, P3)
- Segment generation (including holes, opposite-winding correction, inward normals for hole boundaries) lives in `src/utils/ringSegments.ts` — a dependency-free module (imports only `math2d/vec2.ts`) shared by `src/utils/segmentStatistics.ts` (`rebuildBuildingSegments`) and `src/utils/math2d/polygons.ts` (`booleanUnionBuildings`) specifically to avoid a circular import through the `@/utils/math2d` barrel.

### Geo Module (`src/modules/wfs-import/`)
WMS/WFS overlays and vector imports from Polish geodata services (GUGiK Geoportal + city-specific WFS). Layers are registered into the `CadRenderPipeline` singleton via `registerGeoLayers()` called once in `App.tsx`; each layer/render-layer pair follows the same pattern (Zustand store slice → layer class implementing `CadRenderLayer` → renderer function drawing via `rc.worldToScreen()`). Render repaint is triggered by dispatching `new Event('geo-render-needed')` on `window`.

- **Parcels/buildings**: `uldkClient.ts` (nationwide ULDK parcel lookup, WKT), `citySources.ts` (per-city WFS building/parcel source registry — Warsaw, Kraków, national EGiB fallback), `geoJsonImporter.ts` (shared GeoJSON→`BuildingLoop`/feature conversion, incl. hole-preserving `extractPolygonStructures()`), `wfsGmlUtils.ts` (manual GML parsing for servers without JSON output; `parseWfsPolygonGmlWithHoles` also captures interior rings and `xlink:href` reference attributes).
- **Elevation**: `wcsGugikClient.ts` (WCS `GetCoverage` DSM/NMPT + DTM/NMT raster sampling) + `terrainAnalyzer.ts` (derives real building height from DSM−DTM).
- **Reference vector layers** (read-only, lazy-loaded on first toggle via `ensureGeoContextLoaded()` in `ProjectGroup.tsx`): MPZP zones (`wfsMpzpWarsawClient.ts`), land cover (`wfsLcvClient.ts`, WFS `lcv:LandCoverUnit`, holes-aware).
- Services on hosts without CORS headers (Kraków, national EGiB, `wfsLCV`) are routed through Vercel serverless proxies (`api/krakow-wfs.ts`, `api/egib-wfs.ts`, `api/lcv-wfs.ts`, all built on `api/_lib/wfsProxy.ts`) rather than fetched directly from the browser.

### Math Utilities (`src/utils/math2d/`)
Zero-allocation geometric primitives: `raySegmentDistance2D`, `offsetPolygonEdge`, `computeFullShadowAnalysis`, `generateSweepPolygon`, polygon boolean operations (wrapping `polygon-clipping`, hole-aware via `clippingResultToPolygonsWithHoles`), R-Tree spatial indexing (wrapping `rbush`).

### Licensing (Pro gating)
`useLicenseStore` (`src/store/useLicenseStore.ts`) holds `isPro`/license status, cached to `localStorage` (`usi_license_key`, `usi_license_cache`) and checked/activated via `api/license/{check,activate,trial}.ts`. Paid upgrade flow goes through `api/stripe/{checkout,webhook,verify-session}.ts`. UI gates Pro-only features by checking `isPro` before the action (e.g. see `ProjectGroup.tsx`).

### Serverless Functions (`api/`)
Vercel functions: `share.ts` (compressed scene JSON in Upstash Redis with rate limiting), `license/*`, `stripe/*`, and the WFS CORS proxies above. Locally, `npm run dev`'s Vite config has a generic middleware that maps any `/api/**` request to the matching `api/**.ts` file and invokes it with a `VercelRequest`/`VercelResponse` shim — no separate dev server needed.

## Key Conventions
- Analysis pre-filter cone: ±78° from facade normal (12° dead zone from wall surface); backface and AABB culling applied before raycasting.
- Most tests (`*.test.ts`) live alongside source files in the same directory; a legacy `test/` directory at the repo root also holds older suites (both are picked up by `npm test`).
- Buildings from DXF: parsed via `src/utils/dxfParser.ts` with auto-detected unit scale (no hole support — DXF `LWPOLYLINE` has no native hole concept).
- `rbush` R-Tree and `polygon-clipping` are in the `vendor-geo` build chunk; `three`/react-three in `vendor-three`; `jspdf` in `vendor-pdf`.
