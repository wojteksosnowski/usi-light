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
- **`BuildingLoop`** — central entity: polygon (`vertices: Point2D[]`) + elevation metadata + `segments: FacadeSegment[]`. Key flags: `isTested` (object under analysis vs. obstacle), `isIncluded`, `isLocked`, `isGhosted`, `category` (`building` | `boundary`)
- **`FacadeSegment`** — wall edge with outward unit normal, `hTop`/`hWindowBottom`, and precomputed `lineEquation`
- **`PinnedFacadePoint`** — persistent measurement point: `{ buildingId, segmentId, offsetRatio }` (P1, P2, P3)

### Geo Module (`src/modules/wfs-import/`)
WMS/WFS overlays from Polish geodata services (GUGiK Geoportal). Layers are registered into the `CadRenderPipeline` singleton via `registerGeoLayers()` called once in `App.tsx`. Render repaint is triggered by dispatching `new Event('geo-render-needed')` on `window`.

Services: `uldkClient.ts` (ULDK parcel lookup), `geoJsonImporter.ts` (WFS import), `wcsGugikClient.ts`, `wfsWarsawClient.ts`.

### Math Utilities (`src/utils/math2d/`)
Zero-allocation geometric primitives: `raySegmentDistance2D`, `offsetPolygonEdge`, `computeFullShadowAnalysis`, `generateSweepPolygon`, polygon boolean operations (wrapping `polygon-clipping`), R-Tree spatial indexing (wrapping `rbush`).

### Sharing (`api/share.ts`)
Vercel serverless function storing compressed scene JSON in Upstash Redis with rate limiting. Dev server proxies `/api/share` via a Vite middleware.

## Key Conventions
- Analysis pre-filter cone: ±78° from facade normal (12° dead zone from wall surface); backface and AABB culling applied before raycasting.
- Tests (`*.test.ts`) live alongside source files in the same directory.
- Buildings from DXF: parsed via `src/utils/dxfParser.ts` with auto-detected unit scale.
- `rbush` R-Tree and `polygon-clipping` are in the `vendor-geo` build chunk; `three`/react-three in `vendor-three`; `jspdf` in `vendor-pdf`.
