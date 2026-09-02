# USI-LIGHT

> Lekki, bezkompromisowo szybki system 2.5D CAD do certyfikacji i symulacji nasłonecznienia (§ 56) oraz przesłaniania (§ 12) zgodnie z polskimi Warunkami Technicznymi (Rozporządzenie Ministra Infrastruktury).

Działa w 100% po stronie przeglądarki (Client-Side Only), oferując płynność 60/120 FPS przy pełnej precyzji obliczeniowej.

---

## 🚀 Architektura i Wydajność (Wydanie zoptymalizowane)

Aplikacja została zaprojektowana z myślą o natychmiastowej interakcji bez zewnętrznych zależności natywnych (WebGPU/Wasm), wykorzystując pełen potencjał współczesnego silnika JavaScript oraz Canvas 2D:

1. **Architektura Dual-Canvas (Podwójny bufor widoku):**
   * **Baza sceny (`canvasRef`):** renderuje siatkę CAD, budynki, cienie rzucane i pasma analityczne tylko przy rzeczywistej zmianie sceny lub transformacji widoku.
   * **Interaktywna nakładka (`overlayCanvasRef`):** ultralekki bufor renderujący kursor, punkty przyciągania OSNAP/OTRACK, linie pomocnicze i podglądy edycji z pełną częstotliwością odświeżania bez przerysowywania geometrii budynków.
2. **Cachowanie geometrii `Path2D` i Viewport Culling:**
   * Wektory budynków są kompilowane do obiektów `Path2D` w pamięci podręcznej `WeakMap`. Rysowanie poligonów odbywa się pojedynczym wywołaniem `ctx.fill(geo.path)` z użyciem macierzy afinicznej `setTransform`.
   * Obiekty, wymiary i etykiety znajdujące się poza granicami widocznego ekranu (AABB Culling) są natychmiast pomijane.
3. **Bezalokacyjna matematyka promieniowa (`Zero-Allocation Raycasting`):**
   * Obliczenia przecięcia promienia słońca z segmentami fasad (`raySegmentDistance2D`) operują wyłącznie na zmiennych prymitywnych na stosie, eliminując alokację obiektów `{ hit, distance, point }` oraz zmniejszając narzut Garbage Collectora do zera podczas ciągłego przeciągania obiektów.
4. **Indeksacja przestrzenna i szybki pre-filtr przeszkód:**
   * Wyznaczenie brył przesłaniających korzysta z buforowanych granic AABB oraz kątowego stożka widzenia $\pm 78^\circ$ od normalnej lica fasady wraz z odrzucaniem ścian tylnych (*Backface Culling*).
5. **Wielowątkowość Web Worker:**
   * Zadania wsadowe o wysokiej gęstości próbkowania wykonywane są w tle w dedykowanym workerze (`analysis.worker.ts`), gwarantując całkowity brak blokowania głównego wątku UI.

---

## 🛠️ Funkcjonalności

* **§ 56 — Analiza Czasu Nasłonecznienia (Astro / Linijka Słońca):**
  * Obsługa równonocy wiosennej (21 marca) i jesiennej (23 września).
  * Automatyczne rozróżnienie lokali mieszkalnych (min. 3h / min. 1.5h w śródmieściu) oraz przedszkoli/żłobków (min. 3h w godz. 8:00–16:00).
  * Graficzna reprezentacja linijki słońca, godzinowych wektorów azymutalnych i kątów elewacji $\ge 12^\circ$.
* **§ 12 — Analiza Kątowa Przesłaniania:**
  * Weryfikacja wymaganego kąta $60^\circ$ (ciągłego) lub łączonego $75^\circ$ z dopuszczalną przerwą $\le 15^\circ$.
  * Rzutowanie odległości normowej $D_{req} = H$ (lub $0.5 \cdot H$ w śródmieściu, max. 35m).
* **Narzędzia CAD i Precyzyjne Rysowanie:**
  * Rysowanie prostokątów (**R**), polilinii (**P**), edycja wierzchołków (**V**), równoległe przesuwanie krawędzi (**E**), obrót (**O**), wymiary (**D**).
  * Inteligentne przyciąganie OSNAP (wierzchołki, środki krawędzi, rzuty prostopadłe) oraz śledzenie ortogonalne OTRACK.
* **Import / Eksport:**
  * Odczyt i interpretacja plików DXF/DWG z autodetekcją skali.
  * Eksport raportu technicznego PDF oraz geometrii sceny do AutoCAD DXF R12.

---

## 🧪 Testy i Weryfikacja Jakości

Projekt posiada kompletny zestaw testów automatycznych w oparciu o framework `vitest`:

```bash
# Uruchomienie wszystkich 29 zestawów testów (138 testów jednostkowych i integracyjnych)
npm test

# Uruchomienie dedykowanego benchmarku wydajnościowego
npx vitest run src/engine/benchmarks.test.ts

# Weryfikacja testu równoważności promieniowej (100 000 losowych promieni)
npx vitest run src/utils/math2d.fast.test.ts

# Kompilacja produkcyjna (TypeScript strict mode + Vite bundler)
npm run build
```

---

## 💻 Uruchomienie Lokalne

```bash
# Instalacja zależności
npm install

# Uruchomienie serwera deweloperskiego
npm run dev
```

---

## 📖 Dokumentacja Techniczna

Szczegółowe specyfikacje i dokumenty normatywne znajdują się w repozytorium:
* [`specification.md`](specification.md) — pełna specyfikacja architektury, modułów i skrótów klawiszowych.
* [`przepisy.md`](przepisy.md) — interpretacja i podstawa prawna Warunków Technicznych (§ 12 i § 56).
* [`layout_specification.md`](layout_specification.md) — specyfikacja interfejsu graficznego i układu paneli CAD.
