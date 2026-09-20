# USI Light — Przewodnik Architektury, Geometrii, Silnika i UI

Kompleksowa dokumentacja architektury, definicji obiektów, modułów obliczeniowych, zarządzania stanem oraz komponentów interfejsu użytkownika w aplikacji **USI Light**.

---

## Spis Treści
1. [Zasady Architektoniczne i Reguły Systemowe](#1-zasady-architektoniczne-i-reguły-systemowe)
2. [Główne Typy i Definicje Danych (`src/types`)](#2-główne-typy-i-definicje-danych-srctypes)
3. [Zarządzanie Stanem (`src/store`)](#3-zarządzanie-stanem-srcstore)
4. [Silnik Analityczny i Geometria (`src/engine` i `src/utils/math2d`)](#4-silnik-analityczny-i-geometria-srcengine-i-srcutilsmath2d)
5. [Struktura Komponentów UI i Canvas (`src/components`)](#5-struktura-komponentów-ui-i-canvas-srccomponents)
6. [Import/Export, Dane Geograficzne i Moduły Dodatkowe](#6-importexport-dane-geograficzne-i-moduły-dodatkowe)
7. [Struktura Katalogów (Indeks Szybkiego Wyszukiwania)](#7-struktura-katalogów-indeks-szybkiego-wyszukiwania)

---

## 1. Zasady Architektoniczne i Reguły Systemowe

Zgodnie z [`AGENTS.md`](file:///Volumes/Samsam/py/usi-light/AGENTS.md) oraz wytycznymi projektowymi:

1. **Bufor Geometrii Obiektów i Niezmienniczość Modyfikatorów**:
   - Każdy obiekt (`BuildingLoop`) przechowuje wynikowy bufor swojej geometrii (`vertices`, `storyPolygons`, `zonePolygons`, `segments`, `flatVertices`).
   - Translacja (`moveBuilding`, `moveBuildings`) i obrót (`rotateBuilding`, `rotateBuildingGeometry`) **nie przeliczają** potoku modyfikatorów (`applyBuildingModifiers`). Zamiast tego transformują bezpośrednio bufor wierzchołków i aktualizują metadane transformacji (`transform.tx`, `transform.ty`, `transform.rotationDeg`).
   - Potok modyfikatorów przeliczany jest **wyłącznie** przy edycji geometrii bazowej (dodanie/usunięcie wierzchołków, zmiana wysokości, parametrów kondygnacji).
2. **Macierze Transformacji Afinicznych (Render & Viewport)**:
   - Całość transformacji widoku (pan, zoom, rotacja) łączy się w macierz afiniczną $3 \times 3$ ([`AffineMatrix2D`](file:///Volumes/Samsam/py/usi-light/src/utils/math2d/affineMatrix.ts)).
   - Do renderowania Canvas 2D przekazywana jest skumulowana macierz `ctx.setTransform(a, b, c, d, e, f)` do przyspieszenia sprzętowego GPU.
3. **Matryce Cieni i Wysokości (Raster Shadow Mapping)**:
   - Dyskretna matryca wysokości terenu i budynków ([`HeightmapGrid`](file:///Volumes/Samsam/py/usi-light/src/types/geometry.ts)) w [`HeightmapShadowEngine`](file:///Volumes/Samsam/py/usi-light/src/engine/raster/HeightmapShadowEngine.ts) umożliwia próbkowanie i DDA raymarching w czasie $O(1)$ / $O(\text{steps})$.
4. **Matryce LUT (Lookup Table Matrix)**:
   - Wektory pozycji słońca i rzutów cienia stablicowane w [`FlatSolarLUT`](file:///Volumes/Samsam/py/usi-light/src/engine/solar/FlatSolarLUT.ts) dla każdej minuty/godziny roku eliminują powtarzalne obliczenia trygonometryczne.
5. **Hierarchia Obiektów Logicznych (Group Hierarchy)**:
   - **Level 0 (Grupa)**: Pojedyncze kliknięcie w obiekt z `groupId` zaznacza całą grupę (`selectedBuildingIds`). Obrót wykonuje się wokół wspólnego centroidu grupy.
   - **Level 1 (Wnętrze grupy)**: Podwójne kliknięcie wchodzi do wnętrza (`openGroupId = groupId`), izolując grupę i umożliwiając selekcję pojedynczych obiektów składowych.
   - **Level 2 (Edycja wierzchołków)**: Podwójne kliknięcie na pojedynczy obiekt wewnątrz otwartej grupy aktywuje tryb `vertexEdit`.
   - **Przygaszanie (Dimming)**: Gdy grupa jest aktywna / otwarta, wszystkie obiekty zewnętrzne renderowane są z `globalAlpha = 0.28`.

---

## 2. Główne Typy i Definicje Danych (`src/types`)

### 2.1. [`src/types/geometry.ts`](file:///Volumes/Samsam/py/usi-light/src/types/geometry.ts)
- `Point2D`: `{ x: number, y: number }` — punkt 2D w układzie metrycznym.
- `Vector2D`: `{ x: number, y: number }` — wektor kierunkowy.
- `ObjectCategory`: `'building' | 'boundary' | 'balcony' | 'compound'` — kategoria obiektu CAD.
- `AreaType`: `'plot' | 'playground' | 'paved'` — typ obszaru (dla `category: 'boundary'`).
- `BuildingType`: `'residential' | 'service' | 'garage'` — przeznaczenie budynku.
- `BuildingLoop`: Główny model danych obiektu na scenie:
  - `id`: unikalny identyfikator,
  - `name`: nazwa / etykieta,
  - `category`: kategoria (domyślnie `'building'`),
  - `vertices`: lista wierzchołków poligonu bazowego,
  - `flatVertices`: płaski bufor `Float32Array` [x0, y0, x1, y1, ...],
  - `holes`: opcjonalne pierścienie wewnętrzne (dziedzińce / otwory),
  - `segments`: tablica segmentów fasad (`FacadeSegment[]`),
  - `defaultHeight`: wysokość obiektu w metrach,
  - `elevation`: rzędna posadowienia / dolna krawędź (m),
  - `firstFloorHeight`, `typicalFloorHeight`, `storeysCount`: parametry kondygnacji,
  - `modifiers`: stos modyfikatorów (`Modifier[]`),
  - `storyPolygons`, `zonePolygons`: wyliczone obrysy 2.5D z modyfikatorów,
  - `groupId`: opcjonalne ID grupy (obiekt logiczny łączący wiele budynków),
  - `transform`: `{ tx: number, ty: number, rotationDeg: number }`,
  - `isTested`, `isIncluded`, `isLocked`, `isGhosted`, `isCityCentre`.
- `FacadeSegment`: Reprezentacja pojedynczej ściany / krawędzi budynku (punkty `p1`, `p2`, normalna, `hTop`, `hBase`, `hWindowBottom`, `lineEquation`).
- `AnalysisPointResult`: Wynik analizy nasłonecznienia dla pojedynczego punktu pomiarowego.
- `PlaygroundSunlightResult`: Wynik analizy nasłonecznienia placu zabaw (komórki próbkowania, zgodność z normą $\ge 50\%$, czas $\ge 2.0\text{h}$ lub $1.0\text{h}$).

### 2.2. [`src/types/modifiers.ts`](file:///Volumes/Samsam/py/usi-light/src/types/modifiers.ts)
- `ModifierType`: `'story_offset' | 'zone_offset' | 'bay_window' | 'terrace' | 'donut' | 'corner_cut' | 'gate' | 'sztyca' | 'pila' | 'zone_function'`
- `Modifier`: Interfejs pojedynczego modyfikatora geometrycznego w stosie obiektu (rozszerza `BaseModifier: { id, type, enabled, name? }`).
- `StoryFootprint`: Obrys kondygnacji po zaaplikowaniu modyfikatorów.
- `ZoneFootprint`: Obrys strefy buforowej / przesłaniania.
- Dyspatcz modyfikatorów odbywa się przez rejestr (`src/engine/modifiers/modifierRegistry.ts`) wywoływany z `applyBuildingModifiers` w [`modifierPipeline.ts`](file:///Volumes/Samsam/py/usi-light/src/engine/modifiers/modifierPipeline.ts) — patrz też skill `modifier-architecture-guide`.

### 2.3. [`src/types/license.ts`](file:///Volumes/Samsam/py/usi-light/src/types/license.ts) i [`src/types/sharing.ts`](file:///Volumes/Samsam/py/usi-light/src/types/sharing.ts)
- Definicje poziomów licencji (`free`, `pro`, `enterprise`), tokenów JWT i mechanizmów szyfrowanego udostępniania scen przez URL.

---

## 3. Zarządzanie Stanem (`src/store`)

### 3.1. [`useSceneStore`](file:///Volumes/Samsam/py/usi-light/src/store/useSceneStore.ts)
Główny magazyn stanu sceny CAD:
- **Stan:**
  - `buildings: BuildingLoop[]` — wszystkie obiekty na scenie.
  - `selectedBuildingId: string | null` — ID pojedynczego zaznaczonego obiektu.
  - `selectedBuildingIds: string[]` — ID wszystkich zaznaczonych obiektów (multiselekcja / grupa).
  - `openGroupId: string | null` — ID aktualnie otwartej grupy (tryb wnętrza Level 1).
  - `activeBuildingCategory: ObjectCategory` — aktualnie wybrana kategoria narzędzia tworzenia.
  - `history / future` — stosy Undo/Redo historii operacji geometrycznych.
- **Akcje:**
  - `setBuildings`, `addBuilding`, `updateBuilding`, `removeBuilding`, `removeBuildings`.
  - `setSelectedBuildingId`, `selectBuilding`, `toggleBuildingSelection`, `clearSelection`.
  - `setOpenGroupId(groupId)` — wejście/wyjście z edycji wnętrza grupy.
  - `moveBuilding(id, dx, dy)`, `moveBuildings(ids, dx, dy)` — szybka translacja bufora (bez przeliczania modyfikatorów, patrz `AGENTS.md`).
  - `rotateBuilding(id, pivot, deltaAngleRad)` — obrót bufora wokół pivotu (wewnętrznie woła prywatną `rotateBuildingGeometry`).
  - `undo`, `redo` (przez `zundo` temporal middleware).

### 3.2. [`useCadToolStore`](file:///Volumes/Samsam/py/usi-light/src/store/useCadToolStore.ts)
Stan narzędzi kreślarskich i modalnych trybów interakcji (nie ma pojedynczego `activeTool` — aktywne narzędzie sterowane jest przez klasy `CadTool` w `src/components/cad/tools/`, ten store trzyma tryb rysowania i ustawienia snapów):
- **Rysowanie:** `drawingMode: 'none' | 'rectangle' | 'polyline' | 'sweep' | 'vertexEdit' | 'align'`, `drawingCategory: ObjectCategory`, `drawingVerticesCount`.
- **Wstęga (Sweep):** `sweepWidth`, `sweepAlignment: SweepAlignment`.
- **Edycja krawędzi / punktów fasad:** `isEditMode`, `facadePointMode`, `showModifiersPanel`.
- **OSNAP** (`osnapModes: { vertex, midpoint, intersection, perpendicular, edge, extension }`) i **OTRACK** (`otrackModes: { ortho, dominant, relative, dualIntersection }`) — dwa niezależne systemy przyciągania/śledzenia, plus `isOsnapActive`, `isDirectionSnappingActive`, `snapRadiusPx`, `noisePercentileCutoff`.
- **Wymiarowanie:** `dimensions: DimensionItem[]`, `isDimensionToolActive`, `dimensionType`, `dimensionPendingRef`.
- **Project Brush ("W projekcie")**: `isProjectBrushActive`.

### 3.3. [`useSolarAnalysisStore`](file:///Volumes/Samsam/py/usi-light/src/store/useSolarAnalysisStore.ts)
Parametry projektu, astronomiczne i wyniki analiz (znacznie szerszy niż tylko nasłonecznienie — obejmuje ustawienia widoczności warstw i cały pipeline obliczeń):
- `settings: ProjectSettings` — parametry projektu (data, lokalizacja itd., patrz `ProjectSettings` w `geometry.ts`), `selectedCity`, `projectName`, `currentProjectId`.
- **Widoczność warstw analitycznych:** `showNormals`, `showShadowingLines`, `showSunlightLines`, `showAnalysisPoints`, `showShadowRange`, `showShadowFill`, `showSatelliteLayer` (+ `satelliteOpacity`, `satelliteProvider: 'google' | 'here' | 'orthophoto'`).
- **Silnik obliczeń:** `sunlightMethod: 'raycasting' | 'segments'`, `masterplanHourFraction`, `accuracyStage: AccuracyStage` (`'live' | 'final'`), `analysisOutput: AnalysisBatchOutput`, `isCalculating`.
- **Punkty pomiarowe fasad:** `pinnedPoints: PinnedFacadePoint[]`, `activePinnedPointId`, `activePointMode: 'shadowing' | 'sunlight'`, `selectedPointResult: AnalysisPointResult | null`.

### 3.4. [`useUiStore`](file:///Volumes/Samsam/py/usi-light/src/store/useUiStore.ts)
Stan globalnych elementów UI/modali (nie warstw sceny — te są w `useSolarAnalysisStore` i `useSceneStore`):
`isSidebarOpen`, `isShareModalOpen`, `isPricingModalOpen`, `isLicenseModalOpen`, `isPaymentSuccessModalOpen`, `isConfirmDeleteModalOpen`.

### 3.5. [`useLicenseStore`](file:///Volumes/Samsam/py/usi-light/src/store/useLicenseStore.ts)
Status licencji Pro: `isPro: boolean`, `status`, `daysLeft`, `expiresAt`, cache w `localStorage` (`usi_license_key`, `usi_license_cache`); metody `check`/`activate`/`startTrial` komunikują się z `api/license/{check,activate,trial}.ts`. UI gate'uje funkcje Pro sprawdzając `isPro` przed akcją (np. `ProjectGroup.tsx`).

---

## 4. Silnik Analityczny i Geometria (`src/engine` i `src/utils/math2d`)

### 4.1. Silnik Obliczeń Nasłonecznienia (`src/engine/`)
- [`analysisEngine.ts`](file:///Volumes/Samsam/py/usi-light/src/engine/analysisEngine.ts) — algorytmy § 12/§ 56: `prefilterShadowingObstacles`, `analyzeShadowingAtPoint`, `analyzeSunlightAtPoint`, `analyzeSunlightAtPointSegments`.
- [`analysis.worker.ts`](file:///Volumes/Samsam/py/usi-light/src/engine/analysis.worker.ts) + `useAnalysisWorker` hook — Web Worker realizujący analizy w osobnym wątku; automatyczny fallback do main threadu.
- `buildingGeometryCache.ts` — cache geometrii budynków między klatkami/analizami.
- `shadowRangeBuilder.ts` / `shadowRangeLut.ts` — budowa zakresu/LUT cieni na potrzeby `ShadowRangeLayer`.
- `regulationEvaluator.ts` — weryfikacja zgodności z przepisami (WT2024 / PN-EN 17037).
- `modifiers/` — nieniszczący stos modyfikatorów 2.5D: `modifierPipeline.ts` (`applyBuildingModifiers`), `modifierRegistry.ts` (rejestr dispatch per `ModifierType`), `modifierIndexTarget.ts`.
- `raster/HeightmapShadowEngine.ts` — rastrowy silnik cieniowania DDA dla gęstych siatek próbkowania (mapa wysokości `HeightmapGrid`).
- `solar/` — silniki pozycji słońca: `LutSolarEngine.ts` (LUT, szybki lookup), `AnalyticalSolarEngine.ts` (precyzyjny), `SolarAnalysisEngine.ts`, `types.ts`.
- `buffers/geometryBufferSerializer.ts` — serializacja geometrii do `ArrayBuffer`/`Transferable Objects` dla Web Workera.
- `preview/buildingIsoGeometry.ts` — geometria izometryczna do podglądu 2.5D/3D.
- `perf/PerfMonitor.ts` — pomiar wydajności silnika w runtime.

### 4.2. Snapping (Przyciąganie CAD) (`src/engine/snapping/`)
Modułowy system przyciągania z hierarchią strategii (`SnapCoordinator.ts` koordynuje strategie, `objectDragSnap.ts` obsługuje snapping przy przeciąganiu obiektów):
- Strategie w `src/engine/snapping/strategies/`: `VertexSnapStrategy.ts`, `MidpointSnapStrategy.ts`, `IntersectionSnapStrategy.ts`, `PerpendicularSnapStrategy.ts`, `EdgeSnapStrategy.ts`, `DirectionSnapStrategy.ts` (OTRACK — kierunki ortogonalne/dominant/relative), `GridSnapStrategy.ts`.
- `snapExclusionUtils.ts` — ignorowanie snapów do elementów aktualnie edytowanych/przesuwanych.
- Culling obiektów poza viewportem przed próbą snapowania (world bounds).

### 4.3. Matematyka 2D (`src/utils/math2d/`)
- `polygons.ts` — operacje geometryczne na wielokątach (pole, obwód, centroid, punkt-w-wielokącie, `rotatePointAroundPivot`, uchwyt obrotu).
- `affineMatrix.ts` (`AffineMatrix2D`) — macierze afiniczne 2D $3 \times 3$, transformacje Screen $\leftrightarrow$ World.
- `vec2.ts` — prymitywy wektorowe 2D bez alokacji, zależność bazowa dla `segments.ts`.
- `segments.ts` (dawniej `ringSegments.ts`) — generowanie `FacadeSegment[]` z pierścieni (obsługa `holes`, korekta odwrotnego nawijania, normalne skierowane do wewnątrz dla otworów); moduł bez zależności poza `vec2.ts`, współdzielony przez `segmentStatistics.ts` (`rebuildBuildingSegments`) i `polygons.ts` (`booleanUnionBuildings`), by uniknąć cyklicznego importu przez barrel `@/utils/math2d`.
- `polygonBooleanTwo.ts` — operacje boolowskie (Union/Difference/Intersection), opakowuje `polygon-clipping`, hole-aware.
- `shadowEnvelope.ts` — analityczne wyznaczanie obwiedni rzutu cienia dla zadanej godziny/wektora słońca.
- `groupEnvelope.ts` — obwiednia buforowa dla grupy budynków (`computeGroupEnvelope`).
- `miterOffset.ts` — buforowanie/odsuwanie krawędzi (offset).
- `sweep.ts` — generowanie geometrii wstęgi (Sweep) z polilinii i szerokości.
- `voronoi.ts` — diagramy Voronoi do próbkowania placów zabaw.
- `boundaryIntersection.ts` / `boundaryMerging.ts` — przecinanie i scalanie granic/działek.
- `gateGeometry.ts` — geometria modyfikatora bramy (`gate`).
- `labelPlacement.ts` — pozycjonowanie etykiet na scenie.
- `dimensions.ts` — geometria kotowania/wymiarowania.
- `transforms.ts` — pomocnicze transformacje punktów/poligonów.
- R-Tree (`rbush`) do indeksacji przestrzennej wykorzystywane w prefiltrze przesłaniania.

---

## 5. Struktura Komponentów UI i Canvas (`src/components`)

### 5.1. Główny Obszar Roboczy i Rysowanie
- [`CadCanvas.tsx`](file:///Volumes/Samsam/py/usi-light/src/components/CadCanvas.tsx) — nadrzędny komponent Canvas CAD:
  - Inicjalizuje podwójny bufor Canvas (główny i nakładka overlay).
  - Integruje pipeline renderujący [`CadRenderPipeline`](file:///Volumes/Samsam/py/usi-light/src/components/cad/pipeline/CadRenderPipeline.ts).
  - Obsługuje hooki interakcji: [`useCadViewport`](file:///Volumes/Samsam/py/usi-light/src/components/cad/hooks/useCadViewport.ts), [`useCanvasInteraction`](file:///Volumes/Samsam/py/usi-light/src/components/cad/hooks/useCanvasInteraction.ts), [`useCadHotkeys`](file:///Volumes/Samsam/py/usi-light/src/components/cad/hooks/useCadHotkeys.ts).
  - Integruje kafelki podkładów satelitarnych ([`GoogleTileManager`](file:///Volumes/Samsam/py/usi-light/src/utils/googleTileManager.ts), [`HereTileManager`](file:///Volumes/Samsam/py/usi-light/src/utils/hereTileManager.ts)).

### 5.2. Pipeline Renderujący CAD (`src/components/cad/pipeline/`)
`CadRenderPipeline.ts` — orkiestrator: dwie posortowane po `zIndex` listy warstw `CadRenderLayer` (`mainLayers` → `canvasRef`, `overlayLayers` → `overlayCanvasRef`). Domyślny stos warstw głównych (`src/components/cad/pipeline/layers/`):
  1. `SatelliteMapLayer.ts` (zIndex 0) — kafelki podkładu satelitarnego/ortofoto.
  2. `GridLayer.ts` (zIndex 10) — siatka konstrukcyjna i osie.
  3. `ShadowRangeLayer.ts` (zIndex 20) — zakres/obwiednia cieni w czasie (LUT).
  4. `ShadowingLayer.ts` (zIndex 30) — cienie analityczne § 12.
  5. `AnalysisBandsLayer.ts` (zIndex 40) — pasy/strefy analizy nasłonecznienia § 56.
  6. `PlaygroundLayer.ts` (zIndex 50) — komórki Voronoi i wyniki dla placów zabaw.
  7. `BuildingsLayer.ts` (zIndex 60) — rzuty 2D/2.5D budynków, ścian, stref i obwiedni grup z przygaszaniem (`globalAlpha = 0.28`).
  8. `SunlightLayer.ts` (zIndex 70) — wektory promieni słonecznych, punkty pomiarowe § 56.
  9. `DimensionsLayer.ts` (zIndex 80) — koty wymiarowe i linie pomiarowe.
  10. `RecorderVisualsLayer.ts` (zIndex 999) — nakładki `action-recorder` (najwyżej).

Warstwa overlay (`overlayLayers`, redraw 60/120 FPS, `overlayCanvasRef`):
  - `DrawingToolLayer.ts` (zIndex 90) — podgląd rysowanego obiektu, uchwyty edycji wierzchołków/obrotu, wskaźniki OSNAP.

Nowe warstwy rejestruje się przez implementację `CadRenderLayer` i `pipeline.registerMainLayer()` / `registerOverlayLayer()` (lub `registerGeoLayers()` dla nakładek geo).

### 5.3. Renderery Pomocnicze (`src/components/cad/renderers/`)
Funkcje rysujące per warstwa (jedna renderer-funkcja na layer): `buildingsRenderer.ts`, `shadowingRenderer.ts`, `shadowRangeRenderer.ts`, `sunlightRenderer.ts`, `analysisBandsRenderer.ts`, `playgroundRenderer.ts`, `dimensionsRenderer.ts`, `drawingToolRenderer.ts`, `gridRenderer.ts`, `satelliteMapRenderer.ts`.

### 5.4. Paski Narzędzi i Layout (`src/components/layout/`)
- [`CadTopHud.tsx`](file:///Volumes/Samsam/py/usi-light/src/components/layout/CadTopHud.tsx) — górny pasek HUD: data analizy, suwak godziny nasłonecznienia, przełącznik 2D/3D, linijka słońca.
- [`CadToolBar.tsx`](file:///Volumes/Samsam/py/usi-light/src/components/layout/CadToolBar.tsx) — lewy główny pasek narzędzi CAD (Wybór, Rysowanie Poligonu, Prostokąt, Wstęga, Wymiarowanie, Miarka, Snapping).
- [`AppSidebar.tsx`](file:///Volumes/Samsam/py/usi-light/src/components/layout/AppSidebar.tsx) — prawy panel boczny z zakładkami:
  - [`ToolsGroup.tsx`](file:///Volumes/Samsam/py/usi-light/src/components/layout/ToolsGroup.tsx) — właściwości zaznaczonego obiektu / grupy, modyfikatory, wejście/wyjście z grupy logicznej, parametry kondygnacji.
  - [`AnalysesGroup.tsx`](file:///Volumes/Samsam/py/usi-light/src/components/layout/AnalysesGroup.tsx) — uruchamianie analiz, statystyki nasłonecznienia fasad i placów zabaw, raporty zgodności.
  - [`LayersAndObjectsGroup.tsx`](file:///Volumes/Samsam/py/usi-light/src/components/layout/LayersAndObjectsGroup.tsx) — drzewo obiektów na scenie, widoczność warstw, blokady (lock/ghost).
  - [`ProjectGroup.tsx`](file:///Volumes/Samsam/py/usi-light/src/components/layout/ProjectGroup.tsx) — parametry projektu, ustawienia lokalizacji, import/eksport DXF/GeoJSON.
- [`CadLegendBottom.tsx`](file:///Volumes/Samsam/py/usi-light/src/components/layout/CadLegendBottom.tsx) — dolna belka statusu: współrzędne kursora, skala, status licencji, skróty klawiszowe.

---

## 6. Import/Export, Dane Geograficzne i Moduły Dodatkowe

### 6.1. Wymiana Danych i Parsery (`src/utils/`)
- [`dxfParser.ts`](file:///Volumes/Samsam/py/usi-light/src/utils/dxfParser.ts) — import plików AutoCAD DXF (odczyt polilinii, warstw, automatyczne domykanie pętli i tworzenie `BuildingLoop`).
- [`dxfExport.ts`](file:///Volumes/Samsam/py/usi-light/src/utils/dxfExport.ts) — eksport sceny CAD i cieni do formatu DXF R12/2000.
- [`geoParser.ts`](file:///Volumes/Samsam/py/usi-light/src/utils/geoParser.ts) / [`geoTransform.ts`](file:///Volumes/Samsam/py/usi-light/src/utils/geoTransform.ts) — obsługa polskich układów współrzędnych (PL-1992 EPSG:2180, PL-2000 strefy 5-8 EPSG:2176-2179) oraz WGS84 (EPSG:4326).
- [`projectStorage.ts`](file:///Volumes/Samsam/py/usi-light/src/utils/projectStorage.ts) — zapis i odczyt projektu w `localStorage` oraz plikach `.usi`.

### 6.2. Moduły Dodatkowe (`src/modules/`)
- `wfs-import/` — integracja z Geoportalem (Krajowa Integracja Miejscowych Planów Zagospodarowania Przestrzennego, EGiB działki ewidencyjne, NMT).
- `action-recorder/` — rejestrator sesji użytkownika do generowania interaktywnych prezentacji i testów regresyjnych.

---

## 7. Struktura Katalogów (Indeks Szybkiego Wyszukiwania)

```
usi-light/
├── AGENTS.md                          # Reguły architektoniczne (niezmienniczość buforów, macierze, LUT)
├── GEMINI.md                          # Niniejszy przewodnik architektoniczny i indeks komponentów
├── src/
│   ├── types/                         # Definicje typów TypeScript
│   │   ├── geometry.ts                # BuildingLoop, FacadeSegment, Point2D, Matrix2D
│   │   ├── modifiers.ts               # Modifier, StoryFootprint, ZoneFootprint
│   │   └── license.ts / sharing.ts    # Licencje i udostępnianie scen
│   ├── store/                         # Magazyny stanu Zustand (5 store'ów)
│   │   ├── useSceneStore.ts           # Obiekty sceny, selekcja, grupy, historia Undo/Redo (zundo)
│   │   ├── useCadToolStore.ts         # Tryb rysowania, OSNAP/OTRACK, wymiarowanie
│   │   ├── useSolarAnalysisStore.ts   # Ustawienia projektu, widoczność warstw, wyniki analiz
│   │   ├── useUiStore.ts              # Stan modali (share/pricing/license/confirm)
│   │   └── useLicenseStore.ts         # Status licencji Pro (persist do localStorage)
│   ├── engine/                        # Silnik obliczeniowy i matematyczny
│   │   ├── analysisEngine.ts          # Algorytmy § 12 / § 56
│   │   ├── analysis.worker.ts         # Web Worker do analiz w tle
│   │   ├── modifiers/                 # Nieniszczący stos modyfikatorów 2.5D (registry + pipeline)
│   │   ├── snapping/                  # SnapCoordinator + strategie (Vertex, Edge, Midpoint, Direction/OTRACK, Grid...)
│   │   ├── raster/                    # HeightmapShadowEngine (rastrowe cienie DDA)
│   │   ├── solar/                     # LutSolarEngine, AnalyticalSolarEngine
│   │   ├── buffers/                   # Serializacja geometrii do ArrayBuffer (Transferable)
│   │   └── preview/                   # Geometria izometryczna podglądu 2.5D/3D
│   ├── utils/
│   │   ├── math2d/                    # Matematyka wielokątów, macierze afiniczne, obwiednie
│   │   │   ├── polygons.ts            # Pole, centroid, obrót, uchwyt obrotu
│   │   │   ├── affineMatrix.ts        # AffineMatrix2D, transformacje Canvas
│   │   │   ├── segments.ts            # Generowanie FacadeSegment[] z pierścieni (holes-aware)
│   │   │   ├── polygonBooleanTwo.ts   # Operacje boolowskie (Union, Diff, Intersect)
│   │   │   ├── shadowEnvelope.ts      # Analityczny rzut cieni
│   │   │   └── groupEnvelope.ts       # Obwiednia grupy obiektów logicznych
│   │   ├── dxfParser.ts / dxfExport.ts# Import/Eksport DXF
│   │   ├── geoTransform.ts            # Transformacje PL-1992 / PL-2000 / WGS84
│   │   └── projectStorage.ts          # Zapis/odczyt projektów
│   ├── components/
│   │   ├── CadCanvas.tsx              # Dwuwarstwowy Canvas CAD (canvasRef + overlayCanvasRef)
│   │   ├── cad/
│   │   │   ├── pipeline/              # CadRenderPipeline + layers/ (Buildings, Shadowing, Sunlight, DrawingTool...)
│   │   │   ├── renderers/             # Funkcje rysujące per warstwa
│   │   │   ├── tools/                 # Klasy CadTool (aktywne narzędzie rysowania/edycji)
│   │   │   └── hooks/                 # Interakcje (useCanvasInteraction, useCadViewport, useCadHotkeys)
│   │   ├── layout/                    # Interfejs użytkownika
│   │   │   ├── CadTopHud.tsx          # Górny pasek czasu i widoku
│   │   │   ├── CadToolBar.tsx         # Lewy pasek narzędzi kreślarskich
│   │   │   ├── AppSidebar.tsx         # Prawy panel właściwości i analiz
│   │   │   └── CadLegendBottom.tsx    # Dolny pasek statusu
│   │   └── preview/                   # Podgląd 3D sceny (Three.js)
│   └── modules/
│       ├── wfs-import/                # Warstwy geo: parcels/buildings (ULDK, WFS), elevation (WCS), MPZP, land cover
│       └── action-recorder/           # Rejestrator sesji użytkownika (prezentacje, testy regresyjne)
├── api/                                # Funkcje serverless Vercel (share, license, stripe, proxy WFS)
└── test/                              # Zestawy testów jednostkowych i integracyjnych (starsza lokalizacja)
```
