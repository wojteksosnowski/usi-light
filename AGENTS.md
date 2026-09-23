# Reguły Architektury Projektu USI Light

## 1. Bufor Geometrii Obiektów i Niezmienniczość Modyfikatorów (Geometry Buffer & Local Object Space)
- **Każdy obiekt (budynek/obszar) jest buforem własnej geometrii wynikowej** pochodzącej z modyfikatorów (`storyPolygons`, `zonePolygons`, `segments`).
- **Niezmienniczość przy translacji i rotacji**:
  - Przesuwanie (`moveBuilding`, `moveBuildings`) i obracanie (`rotateBuilding`) obiektu na scenie **NIE PRZELICZA** potoku modyfikatorów (`applyBuildingModifiers`) od zera.
  - Zamiast tego, translacja i rotacja bezpośrednio transformują istniejący bufor wierzchołków (`vertices`, `storyPolygons`, `zonePolygons`, `segments`) oraz aktualizują metadane transformacji (`transform.tx`, `transform.ty`, `transform.rotationDeg`).
- **Warunek ponownego przeliczenia modyfikatorów**:
  - Potok `applyBuildingModifiers` wywoływany jest **WYŁĄCZNIE** w chwili rzeczywistej zmiany geometrii bazowej (edycja/dodanie/usunięcie wierzchołków, odsunięcie pojedynczej krawędzi, zmiana wysokości kondygnacji lub parametrów modyfikatorów).
- **Lokalny układ współrzędnych**:
  - Wszystkie operacje modyfikatorów (podcienia bram, wykusze, tarasy, donaty, strefy) operują w relacji do układu geometrii obiektu, gwarantując identyczne wyniki niezależnie od bezwzględnych współrzędnych w scenie.

## 1a. Punkty Fasady (`PinnedFacadePoint`) — Zawsze Na Żywo (pozycja I wynik analizy)
- `PinnedFacadePoint` przechowuje wyłącznie `{buildingId, segmentId, offsetRatio}` — **żadnych zbuforowanych współrzędnych**. Pozycja świata (`point`) MUSI być wyliczana na nowo w każdym renderze z aktualnych `buildings[].segments` (patrz `rawPinnedPointResults` w `src/app/AppLayout.tsx`).
- **Historia:** wcześniej `shadowing`/`sunlight` (wynik `analyzeShadowingAtPoint`/`analyzeSunlightAtPoint*`) był zamrażany na czas `isInteracting` przez `useStableWhileInteracting`, żeby uniknąć przeliczania kosztownego raycastingu co klatkę podczas przeciągania/obrotu (commit `b48711bd`). Świadomie z tego zrezygnowano — użytkownik oczekuje, że wyświetlana liczba (godziny nasłonecznienia / kąt przesłaniania) przy P1/P2/P3 aktualizuje się na żywo w trakcie przeciągania, nie dopiero po puszczeniu myszy. `pinnedPointResults` w `src/app/AppLayout.tsx` jest teraz po prostu aliasem `rawPinnedPointResults` (bez żadnego zamrożenia) — **nie przywracaj `useStableWhileInteracting` dla tego wyniku** bez wyraźnej prośby użytkownika o odwrotny kompromis wydajność/świeżość.
- Jeśli przeciąganie z wieloma przypiętymi punktami / złożoną sceną okaże się zbyt wolne, właściwym rozwiązaniem jest obniżenie dokładności podczas `isInteracting` (analogicznie do `accuracyStage: 'live'` głównej analizy), NIE ponowne zamrażanie całego wyniku.
- `CadCanvas.tsx` nie powinien bezwarunkowo preferować wyniku przekazanego z propsów nad własnym przeliczeniem live — jeśli prop jest zamrożony, marker będzie stary niezależnie od poprawności logiki w `CadCanvas`.
- **Przeciąganie pojedynczego wierzchołka (vertex edit):** `buildings` w store pozostaje nieruszony do `mouseup` (commit geometrii odroczony celowo, patrz §1). Warstwa HUD `BuildingsDragPreviewLayer.ts` rysuje podgląd budynku z podmienionym wierzchołkiem i musi sama przeliczać `point`/`normal` przypiętych punktów należących do przeciąganego budynku względem segmentów preview (`rebuildBuildingSegments`) — `pinnedPointResults` z kontekstu renderowania niesie wartości liczone względem starych segmentów.

## 1b. `viewState` (pan/zoom) — Wysokoczęstotliwościowe Aktualizacje MUSZĄ być Koalescowane do rAF
- **Problem (nawracający, zdiagnozowany wielokrotnie z trace'ów DevTools Performance):** `viewState` (`panX`, `panY`, `scale` z `useCadViewport.ts`) to React state konsumowany bezpośrednio w `CadCanvas.tsx`. Jeśli którykolwiek handler zdarzeń DOM (`wheel`, `mousemove` podczas panningu, gesty trackpada) woła bezpośrednio `setViewState(...)` **na każde surowe zdarzenie**, to React re-renderuje `CadCanvas` (i przelicza `viewportMatrix`) synchronicznie z częstotliwością zdarzeń — która potrafi przekroczyć budżet klatki (~16ms). Objawia się to w trace jako seria `Update Blocked` / `Cascading Update` (React Scheduler marks) atrybutowanych do `{"Component name":"CadCanvas","Method name":"setState()"}`, oraz nieproporcjonalnie dużym czasem w `v8.callFunction`/`FunctionCall` (`react-dom_client.js`, reconciliation) względem faktycznej pracy rysującej.
- **Mylący trop:** samo rysowanie na canvasie (Loop A/B, `CadCanvas.tsx` ok. linii 571-690) już JEST poprawnie koalescowane do `requestAnimationFrame` — problem NIE jest w warstwie Canvas 2D. Winny jest sam `setState()` Reacta wywołany poza rAF, niezależnie od tego, jak sprytnie zbuforowany jest rysunek.
- **Rozwiązanie (wdrożone):** `useCadViewport.ts` eksportuje obok `setViewState` (dla rzadkich, jednorazowych aktualizacji: `fitToExtents`, korekta obrotu) także `scheduleViewState(updater)` — zapisuje najnowszy `updater` do refa (nadpisując poprzedni, więc na klatkę commitowany jest tylko ostatni stan) i planuje **jeden** `requestAnimationFrame` na klatkę, który wywołuje faktyczny `setViewState`. Każdy handler wysokoczęstotliwościowy (`wheel` w `CadCanvas.tsx`, `handleMouseMove`/pan w `useCanvasInteraction.ts`) musi używać `scheduleViewState`, nigdy `setViewState` bezpośrednio.
- **Przy dodawaniu nowej interakcji zmieniającej `viewState`** (nowy gest, nowy sposób panningu/zoomu) zawsze pytaj: czy ten handler odpala się częściej niż raz na klatkę? Jeśli tak — `scheduleViewState`, nie `setViewState`.

## 1c. Podgląd 3D (`BuildingIsoPreview` / `BuildingPreviewPanel` / `Recording3DPipWindow`) — ZAWSZE NA ŻYWO (Ścisły Zakaz Zamrażania przez `useStableWhileInteracting`)
- **Niezmiennik:** Podgląd 3D aktywnego/edytowanego budynku **MUSI** aktualizować się natychmiast na żywo (60 FPS) podczas **KAŻDEJ** formy edycji obiektu:
  - Przeciąganie wierzchołka poligonu lub wstęgi (`liveVertexPreview` w `useCadToolStore`),
  - Obrót obiektu na scenie (`rotateBuilding`),
  - Przeciąganie krawędzi (`moveBuildingEdge` / `onUpdateBuildingVertices`),
  - Zmiana parametrów w panelu bocznym (kondygnacje, wysokości, modyfikatory 2.5D).
- **ŚCISŁY ZAKAZ UŻYWANIA `useStableWhileInteracting` W PODGLĄDZIE 3D:**
  - Pod żadnym pozorem nie wolno opakowywać `effectiveBuilding` ani `localizedGroupBuildings` w `useStableWhileInteracting`. Był to wielokrotnie powracający błąd, który całkowicie wyłączał podgląd zmian 3D podczas interakcji myszą.
- **Wydajność translacji a edycja geometrii:**
  - Podgląd 3D operuje w lokalnym układzie obiektu wycentrowanym na centroidzie (`useLocalizedBuilding`).
  - Sygnatura geometrii `getBuildingGeometrySignature` **WYKLUCZA** translację `tx` i `ty` (`b.transform.rotationDeg` pozostaje, `tx`/`ty` usunięte). Dzięki temu przesuwanie całego budynku po rzucie 2D nie inwaliduje siatek Three.js i nie powoduje janku, natomiast każda rzeczywista zmiana kształtu natychmiast inwaliduje sygnaturę i odświeża scenę 3D.
- **Obsługa Modyfikatorów podczas Live Dragging:**
  - W `BuildingPreviewPanel` i `Recording3DPipWindow` podczas edycji wierzchołka (`liveVertexPreview`) na obiekcie tymczasowym wywoływane jest `applyBuildingModifiers(candidate)`, dzięki czemu bryły `storyPolygons` natychmiast odzwierciedlają nowy kształt w `getBuildingSolids`.

## 1d. Canonical Precomputed Geometry (`bldg.computed`) i Izolacja Zdarzeń UI
- **Canonical Precomputed Geometry (`GeometryCompiler` / `bldg.computed`)**:
  - Model `CompiledObjectGeometry` dostarcza zbuforowane metryki (`metrics.footprintArea`, `volume`, `grossFloorArea`), AABB (`bounds2D`), siatki 3D (`representation3D.faces`) i krawędzie cienia (`analysis.castingEdges`).
  - Komponenty 2D (`buildingsRenderer.ts`), 3D (`BuildingIsoPreview.tsx`) i analityczne powinny pobierać te wartości bezpośrednio z `bldg.computed` ($O(1)$) zamiast powtarzać obliczenia shoelace, skanowania AABB czy podziału kondygnacji w pętli renderowania.
- **Izolacja Drzewa Obiektów UI (`useSceneObjectsList`)**:
  - Drzewo `objectTree` w panelu bocznym jest memoizowane na podstawie strukturalnej sygnatury (`treeSig`: ID, nazwy, wysokości, rzędne, kategorie, flagi `isTested`/`isLocked`/`isGhosted`/`isVisible`). Dzięki temu przesuwanie i obrót obiektów na scenie nie wywołują kosztownej przebudowy drzewa komponentów Reacta i ikon `lucide-react`.
- **Izolacja Cache Granic (`getBoundarySignature`)**:
  - Scalanie granic `boundaryMergeGroups` w `buildingsRenderer.ts` jest kluczowane sygnaturą samych obiektów `boundary`, dzięki czemu manipulacje budynkami kubaturowymi nie inwalidują unii wielokątów działek i placów zabaw.
- **Throttling Listenerów Aktywności (`useIdleGlint`)**:
  - Globalne listenery nasłuchujące wysokoczęstotliwościowych zdarzeń myszy (`mousemove`/`pointermove`) na `window` nie mogą alokować timerów ani wywoływać `clearTimeout`/`setTimeout` na każde surowe zdarzenie — resetowanie timerów bezczynności musi być sthrottlowane do co najwyżej 1 wywołania na sekundę.

## 2. Obliczenia Macierzowe, Rastrowe Mapowanie i Ciągłe Struktury Pamięci (Matrix & TypedArray Architecture)
- **Macierze transformacji afinicznych (Render i Viewport):**
  - Wszystkie transformacje widoku (pan, zoom, rotacja) oraz rzutowania obiektów łączą się w ujednoliconą macierz afiniczną $3 \times 3$ (`AffineMatrix2D` w standardzie `[a, b, c, d, e, f]`).
  - Przekazanie skumulowanej macierzy bezpośrednio do Canvas 2D (`ctx.setTransform(a, b, c, d, e, f)`) zdejmuje konieczność ręcznego mnożenia współrzędnych każdego wierzchołka w JavaScript — operacja wykonywana jest sprzętowo przez procesor graficzny.
- **Matryce cieni i wysokości (Raster Shadow Mapping):**
  - W operacjach gęstego próbkowania i analizy nasłonecznienia obszarów (place zabaw, tereny otwarte, mapy wysokości) geometria rzutowana jest do dyskretnej matrycy wysokości (`HeightmapShadowEngine`), umożliwiając test cienia i wysokości w czasie $O(1)$ lub $O(\text{steps})$ zamiast wielokąt–wielokąt $O(N \cdot M)$.
- **Matryce przeglądowe LUT (Lookup Table Matrix):**
  - Pozycje słońca (azymut, elewacja, wektory promienia i jednostkowe wektory rzutu cienia) są stablicowane w ciągłych buforach `FlatSolarLUT` indeksowanych czasem (minuta/godzina) i datą.
  - Eliminuje to powtarzalne wywołania funkcji trygonometrycznych (`Math.sin`, `Math.cos`, `Math.tan`) podczas animacji suwaka czasu i analizy linijki słońca.
- **Płaskie bufory pamięci (TypedArray & Zero-Copy Web Workers):**
  - Złożone struktury geometryczne i segmenty fasad podlegają reprezentacji w płaskich buforach pamięci (`Float32Array` w układzie $[x_0, y_0, x_1, y_1, \dots]$) zapewniających maksymalną lokalność pamięci podręcznej (cache locality).
  - Transfer geometrii do Web Workera realizowany jest w postaci bufora binarnego (`ArrayBuffer`) z mechanizmem *Transferable Objects*, eliminując narzut serializacji JSON.
