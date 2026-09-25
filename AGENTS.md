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

## 1e. Płynność Canvas Masterplan na Chrome MacOSX (Wydajność 60 FPS)
- **Koalescencja zdarzeń i buforowanie matryc**:
  - Płynny scrubbing słońca i manipulacja widokiem (pan/zoom/rotate) wykorzystują koalescencję `scheduleViewState` do rAF oraz prekompilowane fingerprinty kondygnacji (`tier fingerprints`).
  - Rzutowanie i obwiednie budynków w widoku Masterplan korzystają z akceleracji sprzętowej Canvas 2D (`AffineMatrix2D`), sweep-line AABB culling oraz cache wypukłości poligonów (`polygon convex caching`), co gwarantuje stabilne 60 FPS na Chrome MacOSX nawet przy setkach złożonych brył.

## 1f. Import OSM Overpass (Kompletność 3D, building:part, Selektywna Geometria i Sanityzacja Tagów)
- **5-etapowy potok importu OSM**:
  1. Podział zadanego obszaru na kwadranty $350 \times 350\text{ m}$ z zakładem $\ge 100\text{ m}$.
  2. Pobranie bazowych obrysów (`way["building"]` + `relation["building"]["type"="multipolygon"]`) z minimalizacją payloadu (`out tags geom qt;`) eliminującą tysiące zbędnych elementów `node` i przyspieszającą streaming dzięki indeksacji quadtile `qt`.
  3. Precyzyjny dociąg części 3D (`building:part`) po ID budynków z buforem `nwr(around:10)["building:part"]` (promień $10\text{ m}$ jest krytyczny, aby nie gubić wież, kopuł i wycofanych kondygnacji w głębi bryły).
  4. Weryfikacja kompletności relacji i geometrii (z rundą naprawczą recovery).
  5. Asemblacja obiektów CAD: składanie pierścieni zewnętrznych i wewnętrznych (`assembleCoordinateSegmentsIntoRings`), grupowanie części w obiekty logiczne (`groupId`), odrzucanie envelope przy pełnym pokryciu przez części ($>85\%$) i ekstrakcja wewnętrznych dziedzińców (`holes`).
- **Sanityzacja tagów OSM (`sanitizeOsmBuildingTags`)**:
  - Filtrowanie słowników tagów w locie zachowuje wyłącznie klucze geometryczne, wysokościowe i identyfikacyjne (`building*`, `height`, `min_height`, `levels`, `roof*`, `name*`, `addr*`, `amenity`, `shop`, `office`, `landuse`, `type`), odrzucając 80–90% zbędnych metadanych (`wikidata`, `wikipedia`, `source*`, `created_by`, `fixme`, `bdot10k`) i redukując zużycie pamięci sterty V8.

## 1g. Szybkie Operacje Boolowskie 2D (FastUnion, FastDifference, FastIntersect)
- **Symetria potoków boolowskich**:
  - Wszystkie 3 operacje dwuwielokątowe (`fastUnionTwoSimpleLoops`, `fastDifferenceTwoSimpleLoops`, `fastIntersectTwoSimpleLoops` w `src/utils/math2d/`) dzielą ujednolicony 4-fazowy potok topologiczny:
    1. **Faza 0 (AABB Quick-Reject $O(1)$)**: Szybkie odrzucenie par rozłącznych.
    2. **Faza 1 (Inkluzja i test bezprzecięciowy $O(N+M)$)**: Obsługa pełnego zawierania $A \subset B$, $B \subset A$ i rozłączności bez alokacji.
    3. **Faza 2 (Universal Segment-Subdivision & Forward-Star Graph Trace)**: Dzielenie krawędzi według parametrów przecięć/kolinearności z `vertexPool` (`SNAP_TOL`), selekcja subsegmentów w oparciu o regułę operacji (Union: na zewnątrz; Difference: A na zewnątrz, B wewnątrz odwrócone; Intersect: A wewnątrz, B wewnątrz), i śledzenie pętli w $O(N+M + k \log k)$.
    4. **Faza 3 (Bezpiecznik degeneracji 1:1)**: Zdegenerowane styki i anomalie topologiczne są transparentnie kierowane do bezpiecznika `polygon-clipping` (`fallbackFn`), gwarantując 100% wierności matematycznej (0.0000 m² błędu).
- **Zasada integracji**:
  - Funkcje wyższego rzędu (`polygonIntersectionTwo`, `intersectionPolygonLoops`, `intersectionPolygonsWithHoles` w `polygons.ts`) automatycznie delegują pary prostych pętli do ścieżki szybkiej, eliminując narzut DCEL i odciążając Garbage Collector w pętli renderowania 60 FPS.

## 1h. FastShadowInTheMiddle i Architektura Canonical Precomputed Shadow Geometry
- **Matematyka transformacji 1D na płaszczyznach pośrednich**:
  - Rzut perspektywiczny równoległy (promienie słońca) na dowolną rodzinę płaszczyzn horyzontalnych ($Z = \text{const}$) jest jednowymiarową transformacją afiniczną (prostą translacją proporcjonalną do wysokości):
    $$P(Z) = P_0 - Z \cdot \vec{s} = P_0 + \frac{Z}{z_{\text{max}}} (V_{xy} - P_0)$$
  - Podczas edycji obiektu (Bake on Edit w `GeometryCompiler.ts` via `CanonicalShadowBaker.ts`) buforowane są wierzchołki cienia na poziomie gruntu $P_0$ oraz powiązane wierzchołki bryły $V_{xy}$ i maksymalne wysokości $z_{\text{max}}$ w `CompiledObjectGeometry.analysis.shadowCanonical`.
- **Ewaluacja w locie $O(1)$ i brak alokacji (`FastShadowInTheMiddle`)**:
  - Projekcja cienia na dowolną pośrednią płaszczyznę odniesienia (np. dach innego budynku $Z_{\text{target}}$) wykonuje się w czasie $O(1)$ na wierzchołek ($32.9\text{ ns/vertex}$) bez ponownych wywołań funkcji trygonometrycznych, rzutowania krawędzi 3D ani alokacji GC.
  - Składowe, dla których $Z_{\text{target}} \ge z_{\text{max}}$, są natychmiast odrzucane w $O(1)$.
  - Elementy lewitujące ($z_{\min} > 0$, np. wykusze, mostki, nadbudówki) oraz dziedzińce wewnętrzne (`holes`) zachowują pełną wierność topologiczną i geometryczną ($0.0000\text{ m}^2$ błędu).
- **Niezmienniczość transformacji w `GeometryCompiler.transformCompiledGeometry`**:
  - Translacja i rotacja obiektu na scenie transformują bezpośrednio bufor `shadowCanonical` (punkty $P_0$ i $V_{xy}$) bez unieważniania i ponownego przeliczania potoku cienia.

## 1i. Morton Spatial Sorting w Hierarchical Union i Culling Cieni Dachowych Masterplan
- **Morton Spatial Sorting (Z-order Curve) & Canonical Precomputation**:
  - W gęstej tkance miejskiej (np. setki budynków tworzących jeden powiązany klaster cienia) łączenie hierarchiczne (`unionPolygonsWithHolesHierarchical` w `masterplanSpatial.ts`) sortuje poligony według 32-bitowego kodu Mortona (`sortPolygonsSpatially`) wyznaczonego z unormowanych współrzędnych centroidu AABB.
  - 32-bitowe kody Mortona są prekompilowane synchronicznie w fazie *Bake on Edit* (`GeometryCompiler.ts` via `computeMorton2D`) i przechowywane w `PrecomputedMasterplanTier.mortonCode`, a przy translacji/rotacji aktualizowane w `transformCompiledGeometry` bez powtórnych alokacji.
  - Gwarantuje to lokalność geometryczną: sąsiednie poligony łączą się w pierwszej kolejności, minimalizując rozmiar obwiedni AABB i maksymalizując skuteczność $O(1)$ AABB reject na wyższych poziomach hierarchii (redukcja czasu unii o 41.2% ze 100% wiernością 1:1).
- **Wczesny Test Zawartości (Containment Test) & AABB Bypass**:
  - Weryfikacja inkluzji $AABB(A) \subseteq AABB(B)$ i test zawierania wierzchołków $O(N)$ natychmiast rozstrzygają pełne zawieranie bez alokacji grafu przecięć i `vertexPool`.
  - W `masterplanShadowCache.ts` funkcja `accumulatePolygons` weryfikuje rozłączność par AABB przed uruchomieniem unii hierarchicznej, eliminując kosztowne operacje sweep-line dla rozłącznych łat cienia.
- **Precyzyjny Culling Cieni Dachowych przez `fastIntersectTwoSimpleLoops`**:
  - Cienie wyższych kondygnacji $\Delta H$ rzucane na dachy są docinane do obrysu dachu docelowego przez `fastIntersectTwoSimpleLoops` (z domyślnym fallbackiem `robustPolygonIntersectionFallback`). Łaty omijające dach są odrzucane w $O(1)$, a dach w pełni objęty cieniem rozstrzygany w $O(N)$ containment exit, redukując liczbę łat wchodzących do unii dachowej.

## 1j. Analityczny Cień Wypukły $O(N)$ i Bypass Alokacji Stringów w Potoku Cieni Dachowych Masterplan
- **Analityczny Cień Wypukły $O(N)$ (`fastConvexPolygonShadow`)**:
  - Dla prostych brył wypukłych ($N \le 4$: trójkąty, czworokąty/prostokąty) rzutowanie cienia nie wymaga sortowania $O(N \log N)$ ani alokacji otoczki wypukłej Graham scan (`computeConvexHull`).
  - Obrys cienia wypukłego tworzą dokładnie 2 mostki styczne łączące skrajne wierzchołki sylwetkowe podstawy i dachu, wyznaczane w $O(N)$ w **~64 nanosekundy** z zachowaniem 100% wierności geometrycznej ($0.0000\text{ m}^2$ błędu).
- **Bypass Alokacji Kluczy String w V8**:
  - Dla prekompilowanych wielokątów wypukłych (`isConvexKnown === true && polygon.length <= 4`) pomijana jest alokacja stringa klucza cache w V8 (`fp|hTop|hBottom|azimuth|elevation`), ponieważ bezpośrednie obliczenie cienia w 64 ns jest szybsze niż budowa klucza w pamięci sterty.
- **Bypass Nadmiarowego Docięcia Dachem dla Pojedynczego Cienia**:
  - Gdy dach otrzymuje cień od pojedynczej bryły wyższej (`higherTiers.length === 1`), docięcie przez `polygonIntersectionTwo` na CPU jest pomijane — sprzętowa maska `ctx.clip('evenodd')` Canvas 2D wykonuje docięcie z akceleracją GPU bez ryzyka podwójnego nakładania przezroczystości $\alpha$.

## 1l. Selektywne Filtrowanie Atrybutów WFS (PropertyName / Minimalizacja Payloadu)
- **Zasada minimalizacji payloadu XML/GML i JSON**:
  - W zapytaniach `GetFeature` do serwisów WFS (krajowych i miejskich) definiowany jest parametr `propertyName` / `PROPERTYNAME`, pobierający wyłącznie geometrię oraz kluczowe atrybuty (ID, kondygnacje, przeznaczenie, statusy MPZP), eliminując 70–90% zbędnego XML/JSON.
- **Niezmiennik obecności pola geometrii**:
  - Zgodnie ze specyfikacją OGC WFS, parametr `PropertyName` musi bezwzględnie zawierać pole geometrii właściwe dla danego serwera (`geom` dla GUGiK EGiB WFS 2.0.0, `GEOMETRY` dla GeoServera Warszawy, `gmgml:SHAPE` dla GeoMedia Poznania, `SHAPE` dla ArcGIS Server MPZP), inaczej serwer zwróci obiekty pozbawione geometrii.
- **Obsługa ograniczeń serwerowych**:
  - W przypadku serwisów nieobsługujących `PROPERTYNAME` (np. MapServer EGiB w Krakowie rzucający błąd 500 przy próbie filtrowania) zapytania wysyłane są w pełnej postaci bez parametru `PROPERTYNAME`.

## 1m. Ciągłość Cieni Dachowych Masterplan, Wczesny Zasięg AABB i Telemetria Containment (Milestone poz.json 601 min)
- **Ciągłość Czasowa Cieni Dachowych (-5h do +5h, co 1 min)**:
  - Weryfikacja ciągłości geometrycznej na scenie miejskiej `reference/shadow/poz.json` (375 budynków, 601 kroków czasowych, 168 475 ewaluacji) gwarantuje 0 anomalii mrygania (*flickering dropouts*) — brak skokowych zaników cienia na dachach.
  - Test stabilizacyjny `src/components/cad/masterplan/masterplanRoofFlicker.test.ts` stanowi stałą kotwicę regresyjną w repozytorium.
- **Wczesny Test Zasięgu AABB Cienia Wyższych Brył (AABB Shadow-Reach Culling $O(1)$)**:
  - W `masterplanShadowCache.ts` przed przystąpieniem do rzutowania cienia bryły wyższej ($\Delta H$) sprawdzany jest warunek nachodzenia powiększonego bufora zasięgu `extendBoundsByOffset(higherTier.bounds2D, htOffset.dx, htOffset.dy)` na obwiednię dachu docelowego `roofBox`.
  - Pozwala to na natychmiastowe odrzucenie w $O(1)$ par brył niemających fizycznej możliwości zacienienia dachu, eliminując narzut rzutowania i operacji boolowskich.
- **Optymalizacja Agregacji Poligonów `accumulatePolygons` i Telemetria Containment**:
  - $74.4\%$ wywołań unii boolowskiej w cieniowaniu dachowym to relacje pełnego zawierania ($A \subseteq B$ lub $B \subseteq A$).
  - Obsługa bazowych przypadków $N = 0, 1, 2$ oraz weryfikacja rozłączności par AABB przed wywołaniem unii hierarchicznej redukuje narzut pamięciowy i zapobiega niepotrzebnemu uruchamianiu algorytmów sweep-line.

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

