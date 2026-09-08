# Plan Wdrożenia: Moduł WFS Import

> Branch: `geo`
> Podejście: samodzielny moduł, nie przebudowa aplikacji
> Data: 2026-09-07

---

## 1. Architektura modułu

```
src/modules/wfs-import/
├── index.ts                         ← publiczny interfejs modułu
│
├── store/
│   └── useWfsStore.ts               ← Zustand: stan WFS (drzewa, flagi, status)
│
├── services/
│   ├── geocoding.ts                 ← Nominatim OSM
│   ├── wfsWarsawClient.ts           ← WFS Warszawa (budynki, działki, drzewa)
│   ├── wmsGugikClient.ts            ← WMS GUGiK (EGiB)
│   ├── wcsGugikClient.ts            ← WCS NMPT (wysokości)
│   └── geoJsonImporter.ts           ← GeoJSON → BuildingLoop[]
│
├── renderers/
│   ├── wmsOverlayRenderer.ts        ← renderer kafelków WMS
│   └── wfsTreesRenderer.ts          ← renderer punktów drzew
│
├── layers/
│   ├── TerrainShadingLayer.ts       ← NMT ShadedRelief (z: -5)
│   ├── EgibOverlayLayer.ts          ← EGiB budynki+działki (z: 1)
│   └── WfsTreesLayer.ts             ← drzewa (z: 5)
│
├── ui/
│   ├── WfsImportPanel.tsx            ← panel sidebaru
│   ├── AddressSearch.tsx             ← input z autouzupełnianiem
│   └── ImportStatus.tsx              ← status i wyniki
│
└── utils/
    └── terrainAnalyzer.ts           ← DSM − DTM = wysokość
```

---

## 2. Integracja z aplikacją

### Minimalne zmiany w istniejących plikach

| Plik | Zmiana | Linie |
|---|---|---|
| `src/store/useUiStore.ts` | Rozszerzenie union type | ~1 |
| `src/components/layout/AppSidebar.tsx` | 4. grupa "Dane mapowe" | ~15 |
| `src/components/cad/pipeline/CadRenderPipeline.ts` | `registerMainLayer()` w hooku | ~3 |

### Reużywalne istniejące moduły

| Moduł | Plik | Użycie |
|---|---|---|
| `geoTransform` | `src/utils/geoTransform.ts` | EPSG:2178/2180 → CAD |
| `sanitizePolygon` | `src/utils/importers/geometrySanitizer.ts` | Sanityzacja poligonów |
| `GoogleTileManager` | `src/utils/googleTileManager.ts` | Wzorzec tile managera |
| `geoParser` | `src/utils/geoParser.ts` | Fallback geocoding |
| `useSceneStore` | `src/store/useSceneStore.ts` | `addBuilding()` |
| `CadRenderLayer` | `src/components/cad/pipeline/types.ts` | Interfejs warstw |

### Diagram integracji

```
┌──────────────────────────────────────────────────────────┐
│                     USI Light App                         │
│                                                          │
│  AppSidebar ──→ WfsImportPanel (nowa grupa "Dane mapowe")│
│                       │                                  │
│                       ▼                                  │
│              useWfsStore (moduł)                         │
│                  │    │    │                             │
│           ┌──────┘    │    └──────┐                      │
│           ▼           ▼           ▼                      │
│    geocoding.ts  wfsWarsaw   geoJsonImporter             │
│    (Nominatim)   Client.ts   ──→ useSceneStore           │
│                   │               .addBuilding()         │
│                   ▼                                      │
│         CadRenderPipeline                                │
│         .registerMainLayer()                             │
│           │         │         │                          │
│           ▼         ▼         ▼                          │
│      Terrain    Egib      WfsTrees                      │
│      Shading    Overlay   Layer                         │
│      Layer      Layer                                  │
└──────────────────────────────────────────────────────────┘
```

---

## 3. Fazy implementacji

### Faza 1: Fundament

**Pliki:** `services/geocoding.ts`, `services/wfsWarsawClient.ts`, `services/geoJsonImporter.ts`

- `geocodeAddress(query)` → Nominatim → `{lat, lon, displayName}`
- `fetchWarsawBuildings(bbox)` → WFS 2.0 GeoJSON
- `fetchWarsawParcels(bbox)` → WFS 2.0 GeoJSON
- `fetchWarsawTrees(bbox)` → WFS 1.1.0 GML → parsowanie
- `importBuildings(geoJson)` → `sanitizePolygon()` → `BuildingLoop[]`
- Konwersja EPSG:2178 → CAD via `wgs84ToCadPoint()`

### Faza 2: Store + UI

**Pliki:** `store/useWfsStore.ts`, `ui/WfsImportPanel.tsx`, `ui/AddressSearch.tsx`, `ui/ImportStatus.tsx`

- Zustand store: `trees`, `showTerrain`, `showTrees`, `showEgib`, `status`
- Panel: input adresu, dropdown promienia (100/200/500m), checkboxy
- Przycisk "Pobierz" → append do sceny (nie replace)
- Integracja w sidebar (4. grupa "Dane mapowe")

### Faza 3: Warstwy renderujące

**Pliki:** `renderers/wmsOverlayRenderer.ts`, `layers/TerrainShadingLayer.ts`, `layers/EgibOverlayLayer.ts`, `renderers/wfsTreesRenderer.ts`, `layers/WfsTreesLayer.ts`

- `WmsTileManager` (wzorzec: `GoogleTileManager`) — uniwersalny WMS
- `TerrainShadingLayer` (z-index: -5) — NMT ShadedRelief
- `EgibOverlayLayer` (z-index: 1) — EGiB budynki+działki
- `WfsTreesLayer` (z-index: 5) — punkty drzew z tooltipami
- Dynamiczna rejestracja: `CadRenderPipeline.getDefault().registerMainLayer()`

### Faza 4: NMPT + Wysokości

**Pliki:** `services/wcsGugikClient.ts`, `utils/terrainAnalyzer.ts`

- `fetchDsmBbox(bbox)` → WCS GetCoverage → aaigrid → Float32Array
- `computeBuildingHeights(buildings, dsm, dtm)` → nadpisanie `defaultHeight`
- Opcjonalne — przycisk "Oblicz wysokości z NMPT"

### Faza 5: Ekstensybilność

- `registerCity(name, config)` w osobnym `cityRegistry.ts`
- Konfiguracja: URL WFS, warstwy, CRS, mapping atrybutów
- Warszawa = pierwsza, inne miasta = dodanie wpisu

---

## 4. Kluczowe decyzje techniczne

| Decyzja | Wybrana opcja | Uzasadnienie |
|---|---|---|
| Import budynków | **Append** (nie replace DXF) | Użytkownik może mieć swoje budynki + otoczenie z WFS |
| Budynki WFS | `isTested=false`, `isLocked=true` | Otoczenie / przeszkody, nie edytowalne domyślnie |
| Wysokość budynków | Kondygnacje × 3m (domyślnie) | Szybkie, wystarczające. NMPT opcjonalnie. |
| Tile manager | Nowy `WmsTileManager` (kopia wzorca) | Niezależny od `GoogleTileManager`, konfigurowalny URL |
| Drzewa | Warstwa wizualna (nie przeszkody) | Punktowe dane bez obrysu — brak geometrii do analizy |
| Rejestracja warstw | `registerMainLayer()` dynamicznie | Nie rusza domyślnej listy warstw |
| Store | Osobny `useWfsStore` | Nie zaśmieca głównego `useSceneStore` |

---

## 5. Weryfikacja end-to-end

1. `npm run build` → brak błędów TypeScript
2. Sidebar → pojawia się 4. grupa "Dane mapowe" z ikoną mapy
3. Input adresu: "Marszałkowska 1, Warszawa" → autouzupełnianie
4. Promień 200m → bbox obliczony poprawnie
5. ☑ Budynki → "Pobierz" → budynki na scenie jako BuildingLoops (isLocked)
6. ☑ Działki → granice jako boundary z `plotNumber`
7. ☑ Drzewa → kolorowe punkty, hover → tooltip z gatunkiem
8. ☑ NMT → cieniowanie terenu pod satelitą
9. ☑ EGiB → krajowy overlay działek/budynków
10. "Oblicz wysokości z NMPT" → budynki dostają rzeczywiste wysokości
11. Analiza nasłonecznienia → budynki WFS blokują światło
12. Adres poza Warszawą (Kraków) → fallback na EGiB + NMT
13. `npm run lint` → brak warningów

---

## 6. Zasady kodowania

- **Max ~200-300 linii na plik** — dzielić na małe moduły
- **Każdy plik = jedna odpowiedzialność**
- **TypeScript strict** — bez `any` (chyba że niezbędne)
- **Nazewnictwo po polsku** w UI, po angielsku w kodzie
- **Brak komentarzy** tłumaczących obvious rzeczy
- **Testy** dla: `geoJsonImporter`, `terrainAnalyzer`, `geocoding`
