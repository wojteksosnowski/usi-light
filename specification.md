Struktura modułów, algorytmów geometrycznych oraz architektury danych dla aplikacji webowej 2.5D do analizy przesłaniania (§ 12) i nasłonecznienia (§ 56).

---

### 1. Model danych i parsowanie CAD (DXF / DWG)

Architektura opiera się na spłaszczonej reprezentacji 2.5D: rzucie 2D wzbogaconym o metadane wysokościowe i poziomy odniesienia.

* **Izolacja warstw i topologia:**
* Import polilinii (`LWPOLYLINE`, `POLYLINE`, `LINE`) i grupowanie ich w zamknięte pętle (*Boundary Loops*).
* Klasyfikacja geometrii: obrys projektowany (badany), obrysy istniejące/sąsiednie (przesłaniające), osie okien/otworów (opcjonalnie).


* **Automatyczne wyznaczanie strony zewnętrznej (Wektor Normalny Fasady):**
* Sprawdzenie orientacji wierzchołków obrysu (CW vs CCW) metodą iloczynu wektorowego (Green’s Theorem / Shoelace Formula).
* Dla obrysu zewnętrznego zorientowanego CCW, wektor normalny skierowany na zewnątrz ściany $P_1 P_2$ wynosi:

$$\vec{n} = \left( \frac{y_2 - y_1}{L}, -\frac{x_2 - x_1}{L} \right), \quad L = \sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}$$


* Weryfikacja za pomocą promienia testowego (*Ray Casting*): promień poprowadzony wzdłuż wektora normalnego $\vec{n}$ nie może natychmiast przecinać wnętrza wielokąta macierzystego.
* Interfejs UI: Podgląd ze strzałkami zwrotu fasad oraz funkcja `Odwróć zwrot (Flip Normal)`.


* **Struktura atrybutów 2.5D segmentu fasady:**
* `H_top`: rzędna najwyższej krawędzi zacieniającej (m n.p.m. lub względna).
* `H_window_bottom`: rzędna dolnej krawędzi okna (domyślnie min. $+0.85\text{ m}$ od poziomu podłogi parteru / kondygnacji badanej).
* `is_city_centre`: flaga zabudowy śródmiejskiej (§ 12 ust. 5, § 56 ust. 3).
* `building_type`: typ (mieszkalny, przedszkole/szkoła wg § 56 ust. 2).



---

### 2. Algorytm analizy przesłaniania (§ 12)

Analiza wykonywana jest w punktach próbkowania $P_i$ rozmieszczonych gęsto (np. co $0.25\text{ m}$) wzdłuż odcinków fasady.

```
                  Wektor normalny fasady (n)
                             |
         Kąt odchylenia >=12°|
            \                |                /
             \   KĄT 60° (lub suma >= 75°)   /
              \              |              /
               \             |             /
                \            |            /
   ---[ Fasada ]---\---------P---------/---[ Fasada ]---
                    \                 /
                     Kąt skrajny >=12°

```

1. **Definicja stożka widoczności:**
* Wektor bazowy: normalna fasady $\vec{n}$ (kąt $0^\circ$).
* Kąt roboczy: strefa pomiędzy $+78^\circ$ a $-78^\circ$ względem normalnej (odcięcie minimum $12^\circ$ od lica ściany z każdej strony).


2. **Obliczenie odległości granicznej $D_{req}$ dla każdego przeszkadzającego obiektu $j$:**
* Wysokość przesłaniania: $\Delta H = H_{top, j} - H_{window\_bottom}$.
* Wymagana odległość bazowa:

$$D_{base} = \begin{cases} \Delta H & \text{dla } \Delta H \le 35\text{ m} \\ 35\text{ m} & \text{dla } \Delta H > 35\text{ m} \end{cases}$$


* Współczynnik śródmiejski: $D_{req} = 0.5 \cdot D_{base}$ (jeśli `is_city_centre = true`), w przeciwnym razie $D_{req} = D_{base}$.


3. **Filtry wyjątków geometrycznych:**
* Elementy drugorzędne (§ 12 ust. 6): obiekty wysunięte $\le 1.8\text{ m}$ z tej samej ściany są ignorowane.
* Obiekty smukłe (§ 12 ust. 4): szerokość rzutu równoległego do ściany $\le 3\text{ m}$ przy odległości $\ge 10\text{ m}$ nie stanowi przesłonięcia.


4. **Weryfikacja warunku kątowego (Ray Marching 2D):**
* Rzutowanie promieni od $-78^\circ$ do $+78^\circ$ (krok np. $0.5^\circ$).
* Promień jest *wolny*, jeśli najbliższa kolizja z przeszkodą $j$ zachodzi w odległości $d > D_{req}$.
* **Kryterium sukcesu:** Istnienie ciągłego wycinka kątowego $\ge 60^\circ$ wolnego od przesłaniania **LUB** suma rozproszonych wolnych wycinków kątowych $\ge 75^\circ$ (§ 12 ust. 2).



---

### 3. Algorytm analizy nasłonecznienia (§ 56)

Analiza opiera się na wyznaczaniu pozycji słońca (azymut $\alpha$, elewacja $\gamma$) w dniach równonocy (21 marca / 23 września) dla współrzędnych geograficznych inwestycji.

* **Przedziały czasowe badania:**
* Standardowy lokal mieszkalny: okno $T_{peak} \pm 5\text{ h}$ (10 godzin wokół górowania). Wymagany czas: $\ge 3\text{ h}$ (śródmieście: $\ge 1.5\text{ h}$).
* Placówki dla dzieci (§ 56 ust. 2): okno $T_{peak} \pm 4\text{ h}$ (8 godzin wokół górowania). Wymagany czas: $\ge 3\text{ h}$ (śródmieście: $\ge 1.5\text{ h}$).


* **Kroki obliczeniowe dla punktu $P_i$ w chwili $t_k$:**
1. Sprawdzenie kąta padania w rzucie: kąt między wektorem promienia słonecznego a płaszczyzną fasady musi wynosić $\ge 12^\circ$ (§ 56 ust. 5).
2. Sprawdzenie kąta elewacji słońca $\gamma(t_k) > 0^\circ$.
3. Wyznaczenie kolizji promienia z przeszkodami 2.5D:
* Odległość $d_j$ do punktu przecięcia z obrysem przeszkody $j$.
* Kąt przesłaniania przeszkody: $\beta_j = \arctan\left(\frac{H_{top, j} - H_{window\_bottom}}{d_j}\right)$.
* Warunek bezpośredniego nasłonecznienia: $\gamma(t_k) > \beta_j$ dla wszystkich przeszkód na trajektorii promienia.


4. Całkowanie czasu nasłonecznienia: $T_{sun}(P_i) = \sum \Delta t$ dla chwil spełniających warunki.



---

### 4. Wizualizacja wyników (Interfejs Canvas / WebGL)

Wyniki prezentowane są bezpośrednio na rzucie jako dwuwarstwowy obrys offsetowy wzdłuż krawędzi budynku:

| Warstwa | Położenie | Format danych | Kod kolorystyczny |
| --- | --- | --- | --- |
| **Nasłonecznienie (§ 56)** | Linia zewnętrzna (offset np. $+0.3\text{ m}$) | Skala ciągła gradientowa | • Czerwony: $< 1.5\text{ h}$<br>

<br>• Żółty: $1.5\text{ h} - 3.0\text{ h}$<br>

<br>• Zielony: $\ge 3.0\text{ h}$ |
| **Przesłanianie (§ 12)** | Linia wewnętrzna (offset np. $-0.3\text{ m}$) | Wartości binarne (Status) | • **Zielony:** Wymóg spełniony (sektor $\ge 60^\circ$ lub suma $\ge 75^\circ$ wolna)<br>

<br>• **Czerwony:** Przesłonięcie przekracza normę |

* **Interakcja:** Kliknięcie w dowolny punkt fasady wyświetla diagram kołowy (tzw. "słonko/wachlarz") z zaznaczonymi kątami wolnymi, promieniami kolizyjnymi oraz osią czasu nasłonecznienia minuta po minucie.

---

### 5. Architektura technologiczna

* **Frontend:** Vue.js / React + Three.js lub Pixi.js (renderowanie setek tysięcy wektorów i gradientów z akceleracją GPU).
* **Silnik obliczeniowy:** WebAssembly (Rust/C++) lub Web Workers w JavaScript (przetwarzanie równoległe segmentów fasad metodą BVH – *Bounding Volume Hierarchy* dla szybkiego testowania kolizji promieni 2.5D).
* **Eksport:** Raport PDF z tabelą bilansową, mapą rzutów oraz plik DXF z naniesionymi warstwami wyników analitycznych.

Architektura interaktywnej manipulacji obiektami (przesuwanie, obrót, modyfikacja parametrów w czasie rzeczywistym) oraz mechanizm natychmiastowego przeliczania analiz.

---

### 1. Model interakcji i transformacji 2D (Transform System)

Każdy zaimportowany obrys otrzymuje macierz transformacji affine ($3\times3$) lub strukturę współrzędnych bazowych ze składowymi wektora przesunięcia $\vec{T} = [\Delta x, \Delta y]$.

* **Stany i uchwyty manipulacyjne (Gizmo):**
* **Zaznaczenie (Selection):** Kliknięcie wewnątrz obrysu lub na jego krawędzi (detekcja kolizji punkt-wielokąt metodą *Ray Casting* lub buforem indeksowym GPU / *Color Picking*).
* **Uchwyt translacji (Pan / Drag Handle):** Środek ciężkości (centroid) obiektu lub cała powierzchnia obrysu jako obszar przeciągania (`drag & drop`).
* **Uchwyt obrotu (Rotation):** Dodatkowy punkt kontrolny odsunięty od centroidu.
* **Modyfikacja wierzchołkowa (opcjonalnie):** Przesuwanie pojedynczych narożników dla dopasowania bryły.


* **Wsparcie dla precyzji (Snapping & Constraints):**
* Przyciąganie do siatki modularnej (np. $0.1\text{ m}$, $0.5\text{ m}$, $1.0\text{ m}$).
* Przyciąganie do wierzchołków i krawędzi sąsiednich budynków (*Vertex / Edge Snapping*).
* Blokada osi ortogonalnych (klawisz `Shift` wymuszający ruch wyłącznie wzdłuż osi X lub Y).
* Wyświetlanie wymiarów dynamicznych (odległość od granicy działki lub sąsiednich obiektów w czasie rzeczywistym).



---

### 2. Architektura wydajnościowa (Reaktywne przeliczanie w czasie rzeczywistym)

Przesuwanie obiektu w środowisku 2.5D wymaga natychmiastowej aktualizacji linii nasłonecznienia i przesłaniania bez blokowania wątku głównego (płynność 60 FPS).

* **Struktura przestrzenna BVH / R-Tree:**
* Wierzchołki i segmenty budynków są indeksowane w dynamicznym drzewie przestrzennym (np. *Flatbush* lub *RBush* w JS / biblioteka BVH w WASM).
* Podczas przesuwania obiektu $A$, aktualizowana jest wyłącznie gałąź drzewa odpowiadająca obiektowi $A$.


* **Selektywna unieważnialność wyników (Dirty Checking & Spatial Caching):**
* **Obiekt przesuwany:** Wszystkie jego fasady otrzymują status `dirty` i są przeliczane w całości.
* **Obiekty statyczne:** Przeliczane są wyłącznie te segmenty fasad innych budynków, których strefy wpływu (AABB powiększone o maksymalny zasięg przesłaniania $35\text{ m}$ lub trajektorie promieni słonecznych) przecinają się z nową LUB starą pozycją obiektu przesuwanego.


* **Dwupoziomowy tryb kalkulacji (LOD Computation):**
* **Podczas przeciągania (`isDragging = true`):** Próbkowanie zgrubne (np. punkty na fasadzie co $1.0\text{ m}$, krok kątowy $2^\circ$, krok czasowy słońca co $10\text{ min}$) dla zachowania interaktywności w czasie rzeczywistym.
* **Po upuszczeniu (`onDragEnd`):** Błyskawiczne uruchomienie wątku Web Worker / WASM z pełną gęstością obliczeń (punkty co $0.25\text{ m}$, krok kątowy $0.5^\circ$, krok czasowy co $1\text{ min}$) i wyrenderowanie finalnych linii offsetowych.



---

### 3. Integracja z warstwą renderowania (Canvas / WebGL)

* **Separacja warstw renderowania (Multi-layer Architecture):**
* **Warstwa 0 (Tło):** Podkład mapowy, siatka, granice działek (bufor statyczny).
* **Warstwa 1 (Geometria budynków):** Obrysy z wypełnieniem, rzucane cienie w czasie rzeczywistym.
* **Warstwa 2 (Warstwa analityczna):** Dynamiczne linie offsetowe (kolorowe pasy gradientowe nasłonecznienia i statusu przesłaniania).
* **Warstwa 3 (Interakcja / UI Overlay):** Zaznaczony obiekt, punkty uchwytów (Gizmo), linie pomocnicze odległości, linie wymiarowe.


* **Historia operacji (Undo / Redo System):**
* Wzorzec *Command Pattern*: każda operacja przesunięcia zapisuje stan początkowy i końcowy wektora translacji $\vec{T}$, umożliwiając cofanie zmian (`Ctrl + Z` / `Ctrl + Y`).