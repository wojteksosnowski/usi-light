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
