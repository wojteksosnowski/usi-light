# Słownik i Wykaz Elementów Interfejsu: HUD, Paski Narzędzi i Silnik Canvas 2.5D (USI Light)

Niniejszy dokument stanowi oficjalny, precyzyjny spis wszystkich elementów graficznych, przycisków, indykatorów, paneli pływających oraz warstw renderera Canvas aplikacji **USI Light 2.5D**. Służy jako wspólne źródło odniesienia przy ustalaniu modyfikacji, zgłaszaniu uwag i planowaniu rozwoju interfejsu.

---

## 1. Architektura Przestrzeni CAD (Layout Ogólny)

Główny widok aplikacji podzielony jest na:
1. **Lewy Panel Boczny** ([`AppSidebar.tsx`](file:///C:/py/usi-light/src/components/layout/AppSidebar.tsx)) – parametry globalne, lista warstw, bilanse, import DXF/WFS.
2. **Główny Obszar CAD (100% viewportu)** ([`CadCanvas.tsx`](file:///C:/py/usi-light/src/components/CadCanvas.tsx)) – interaktywne płótno renderowane na Canvas 2D / WebGL z pływającymi nakładkami HUD.

```
+------------------------------------------------------------------------------------------------------------------+
| [ LEWY PANEL - AppSidebar ] | [ OBSZAR ROBOCZY CAD - CadCanvas ]                                                 |
|                             |                                                                                    |
|                             |  +------------------------------------------------------------------------------+  |
|                             |  | GÓRNY HUD (CadTopHud): [Miasto] [§12] [§56] [Punkty] [Cień] [Satelita] [UCS] |  |
|                             |  +------------------------------------------------------------------------------+  |
|                             |  | PASEK NARZĘDZI (cad-toolbar-row):                                             |  |
|                             |  | [Punkt kontrolny] | [Rysuj] | [Modyfikatory] | [Wymiary] | [Edycja/Historia] |  |
|                             |  +------------------------------------------------------------------------------+  |
|                             |                                                                                    |
|                             |                                                        +------------------------+  |
|                             |                                                        | PŁYWAJĄCY AKORDEON     |  |
|                             |                                                        | (FloatingInspector):   |  |
|                             |                     [ PŁÓTNO CANVAS 2.5D ]             | - Podgląd 3D Three.js  |  |
|                             |                   - Siatka modularna co 1m/5m          | - Inspektor punktu     |  |
|                             |                   - Geometria brył, pasma analiz       | - Panel modyfikatorów  |  |
|                             |                   - Obwiednia cienia, linie OSNAP      | - Parametry projektu   |  |
|                             |                                                        +------------------------+  |
|                             |                                                                                    |
|                             |  +---------------------------------------------------------------+  +-----------+  |
|                             |  | DOLNY PAS STATUSU (CadLegendBottom):                          |  | KOMPAS    |  |
|                             |  | [Legenda §12/§56] | [Układ 2000] | [Zoom] | [Dokładność] | [ms] |  | (Compass) |  |
|                             |  +---------------------------------------------------------------+  +-----------+  |
+------------------------------------------------------------------------------------------------------------------+
```

---

## 2. Górny Pasek Kontrolny: CadTopHud & Toolbar

Komponenty: [`CadTopHud.tsx`](file:///C:/py/usi-light/src/components/layout/CadTopHud.tsx), [`ControlPointButton.tsx`](file:///C:/py/usi-light/src/components/layout/ControlPointButton.tsx), [`CadToolBar.tsx`](file:///C:/py/usi-light/src/components/layout/CadToolBar.tsx).

### 2.1. Pasek Górny – CadTopHud

| Nazwa elementu / Etykieta | Ikona / Symbol | Klasa / Selektor | Rola i Funkcja |
| :--- | :--- | :--- | :--- |
| **Przycisk Rozwinięcia Panelu** | `ChevronRight` | `cad-hud-top button` | Przywraca widoczność lewego panelu bocznego, gdy jest zwinięty. |
| **Badge Lokalizacji Projektu** | `MapPin` (bursztynowy) | `var(--bg-badge)` | Wskazuje wybraną miejscowość (np. Warszawa) oraz współrzędne geograficzne szer./dł. |
| **Przełącznik § 12** | Tekst `§ 12` | Szmaragdowy active | Włącza/wyłącza pasmo przesłaniania wewnątrz lica ścian. |
| **Przełącznik § 56** | Tekst `§ 56` | Bursztynowy active | Włącza/wyłącza kolorowe pasmo nasłonecznienia na zewnątrz ścian. |
| **Przełącznik Punkty** | Tekst `Punkty` | Cyjanowy active | Przełącza widoczność punktów kontrolnych fasad i analizy placu zabaw. |
| **Przełącznik Cień** | Tekst `Cień` | Indygo active | Wyświetla obwiednię maksymalnego zasięgu cienia w równonoc. |
| **Przełącznik Satelita** | `Globe` + `Satelita` | Cyjanowy active | Aktywuje kafelkowy podkład ortofotomapy / mapy satelitarnej (Google Maps / HERE). |
| **Przełącznik Parametry** | `FileSpreadsheet` + `Parametry` | Szmaragdowy active | Otwiera boczny panel parametrów urbanistycznych i bilansu powierzchni. |
| **Przełącznik Podkład (PRO)** | `Layers` + `Podkład` | Indygo active | Włącza podkłady wektorowe geodezyjne (GESUT / BDOT10k) przez protokół WFS. |
| **Przełącznik Plany (PRO)** | `Map` + `Plany` | Cyjanowy active | Włącza warstwy MPZP, NMT (numeryczny model terenu) i pokrycia terenu. |
| **Przycisk Centruj** | `Maximize2` + `Centruj` | `.hud-btn-label` | Dopasowuje widok CAD do zaznaczonego obiektu lub całej sceny (*Zoom Extents*). |
| **Przycisk Obrót (UCS)** | `RotateCw` + `Obrót` | Niebieski active | Włącza interaktywny tryb obrotu widoku CAD względem wskazanej krawędzi ściany. |
| **Przycisk Przełącz (UCS)** | `Move` (rotacja 45°) + `Przełącz` | Cyjanowy active | Szybkie przełączanie pomiędzy obrotem 0° (Północ u góry) a zapisanym kątem UCS. |
| **Przycisk Przyciąganie (OSNAP)** | `Magnet` + `Przyciąganie` | Szmaragdowy active | Włącza/wyłącza przyciąganie geometryczne OSNAP (`Klawisz S` / `F3`) oraz Polar Tracking. |
| **Przycisk Udostępnij (Share)** | `Share2` + `Udostępnij` | `.cad-publish-btn.glinting` | Otwiera modal generowania publicznego linku online (Upstash Redis 14 dni). Posiada animację *glint*. |

---

### 2.2. Dedykowany Przycisk Punktu Kontrolnego

| Nazwa elementu | Ikona | Klasa / Identyfikator | Opis zachowania |
| :--- | :--- | :--- | :--- |
| **Przycisk Dodaj Punkt** | `MapPin` | `.cad-control-point-btn` | Uruchamia tryb wstawiania nowego punktu badania fasady. Posiada subtelną animację uwagi (*idle-glint*). |

---

### 2.3. Pływający Pasek Narzędzi – CadToolBar

#### A. Grupa Narzędzi Rysowania
- **Prostokąt (`rectangle`)**: Ikona prostokąta – kreślenie prostopadłościennych brył metodą 2-punktową lub 3-punktową (z obrotem).
- **Polilinia (`polyline`)**: Ikona łamanej – kreślenie dowolnego wielokąta wierzchołek po wierzchołku.
- **Wstęga / Budynek Pasmowy (`sweep`)**: Ikona wstęgi – rysowanie budynku o stałej szerokości wzdłuż ścieżki osiowej.
  - *Sub-pasek opcji wstęgi*: pole numeryczne szerokości (np. `12.0m`), przyciski pozycjonowania ścieżki: **Oś (`center`)**, **Lewo (`left`)**, **Prawo (`right`)**.

#### B. Grupa Modyfikatorów Bryły 2.5D
- **Uskok kondygnacji (`setback`)**: Ikona schodków – cofnięcie wyższych pięter od lica.
- **Taras (`terrace`)**: Ikona tarasu – wycięcie kubatury pod taras na zadanej kondygnacji.
- **Donat / Dziedziniec (`courtyard` / `donut`)**: Ikona otworu – wycięcie wewnętrznego patio/dziedzińca.
- **Wykusz (`overhang`)**: Ikona nawisu – nadwieszenie wyższych kondygnacji poza obrys parteru.
- **Ścięcie narożnika (`corner_chamfer`)**: Ikona ścięcia – ścięcie narożnika parteru lub wybranych pięter.

#### C. Grupa Buforów i Stref
- **Bufor granicy (`zone_offset`)**: Ikona strefy buforowej – generowanie pasów odległościowych (np. 3m / 4m od granicy).
- **Strefa funkcji (`functional_zone`)**: Ikona podziału funkcjonalnego w rzucie.

#### D. Grupa Wymiarowania (Miarka)
- **Narzędzie Wymiarowania (`dimension`)**: Ikona linijki `Ruler` – dodawanie wymiarów liniowych krawędzi, odległości między budynkami oraz kątów.

#### E. Grupa Operacji na Obiektach
- **Wyrównaj krawędź (`align`)**: Ikona wyrównania – dosunięcie lub obrót obiektu równolegle do innej ściany.
- **Połącz obiekty (`link`)**: Ikona łańcucha `Link2` – powiązanie logiczne lub operacja sumy boolowskiej brył.
- **Duplikuj (`duplicate`)**: Ikona `Copy` – szybkie sklonowanie zaznaczonego budynku ze wszystkimi parametrami.
- **Usuń (`delete`)**: Ikona kosza `Trash2` – usunięcie zaznaczonych brył (`Klawisz Del / Backspace`).

#### F. Grupa Historii (Undo / Redo)
- **Cofnij (`Undo2`)**: `Ctrl+Z` / `Cmd+Z`.
- **Ponów (`Redo2`)**: `Ctrl+Y` / `Ctrl+Shift+Z`.

---

## 3. Pływające Panele Boczne: FloatingPanelsHost & Accordion

Komponenty: [`FloatingPanelsHost.tsx`](file:///C:/py/usi-light/src/app/FloatingPanelsHost.tsx), [`FloatingInspectorAccordion.tsx`](file:///C:/py/usi-light/src/components/common/FloatingInspectorAccordion.tsx).

Znajdują się po prawej stronie ekranu w pływającym kontenerze akordeonowym:

1. **Panel Podglądu 3D Bryły (`BuildingPreviewPanel`)**:
   - Bezramkowy widok aksonometryczny 4:3 oparty o WebGL/Three.js.
   - Dynamicznie generuje bryłę zaznaczonego budynku 3D wraz z uskokami i kolorami nasłonecznienia.
2. **Inspektor Punktu Fasady (`PointInspectorModal`)**:
   - Wykres minutowy nasłonecznienia w osi czasu (9:00 - 17:00).
   - Wykres przesłaniania kątowego § 12 (kąty wolne i przeszkody).
   - Przełącznik aktywnej kondygnacji badanego punktu.
3. **Panel Modyfikatorów 2.5D (`BuildingModifiersPanel`)**:
   - Lista nałożonych modyfikatorów na aktywną bryłę (uskoki, tarasy, wykusze).
   - Suwaki wysokości, głębokości i zakresu kondygnacji.
4. **Parametry Projektu i Bilans Powierzchni (`ProjectParametersPanel`)**:
   - Zestawienie powierzchni zabudowy (PZ), intensywności zabudowy, powierzchni biologicznie czynnej (PBC).
   - Bilans miejsc postojowych i wskaźników chłonności działki.
5. **Toast Projektu Współdzielonego**:
   - Pływające powiadomienie na górze ekranu informujące o stanie wczytywania projektu z chmury (Loading / Success / Error).

---

## 4. Dolny Pasek Statusu i Metryk: CadLegendBottom

Komponent: [`CadLegendBottom.tsx`](file:///C:/py/usi-light/src/components/layout/CadLegendBottom.tsx).

Pasek umieszczony przy dolnej krawędzi ekranu CAD:

| Sekcja | Wyświetlana zawartość | Znaczenie / Opis |
| :--- | :--- | :--- |
| **Legenda § 12** | `✓` (zielony) / `✗` (czerwony) | Spełnienie warunku przesłaniania (kąt 60°/35m lub 30m/17.5m w śródmieściu). |
| **Legenda § 56** | Pasek gradientowy 0h &rarr; 4h+ | Skala nasłonecznienia: ciemny fiolet (0h) &rarr; magenta &rarr; pomarańcz (3h - norma) &rarr; żółty (4h+). |
| **Układ Geodezyjny (CRS)** | np. `PL-2000 strefa 7` / `EPSG:2178` | Automatycznie wykryty państwowy układ współrzędnych geodezyjnych na podstawie współrzędnych wierzchołków. |
| **Wskaźnik Zoomu / Skali** | `Z19 (19.42) · 12.5px/m` | Dokładny poziom zoomu kafelków mapy Web Mercator oraz przelicznik pikseli ekranu na metry w terenie. |
| **Wskaźnik Dokładności (Refinement)** | `Live: 2.0m` &rarr; `Siatka: 1.0m` &rarr; `Dokładność: 0.25m` | Etap adaptacyjnego zagęszczania siatki obliczeniowej silnika Raycasting w tle. |
| **Metryki Wydajności (Performance)** | `12.4k pkt \| §12: 1.2ms \| §56: 3.4ms \| Cykl: 6.1ms` | Liczba zbadanych punktów, czasy cząstkowe algorytmów i sumaryczny czas cyklu obliczeniowego w milisekundach. |
| **Link Autorski** | `www.warstadt.com` | Odnośnik do strony twórcy oprogramowania. |

---

## 5. Kompas CAD i Nawigacja Kątowa: CompassRose

Komponent: [`CompassRose.tsx`](file:///C:/py/usi-light/src/components/cad/CompassRose.tsx).

- **Pozycja**: Prawy dolny róg rzutu CAD.
- **Elementy**:
  - **Czerwony grot i litera N**: kierunek Północy geograficznej.
  - **Niebieski znacznik**: orientacja lokalnego układu współrzędnych projektu (UCS).
  - **Kliknięcie**: resetuje obrót widoku do 0° lub przywraca zapisaną orientację projektu.

---

## 6. Mini-panel Etykiety Obiektu: BuildingLabelMiniPanel

Komponent: [`BuildingLabelMiniPanel.tsx`](file:///C:/py/usi-light/src/components/cad/BuildingLabelMiniPanel.tsx).

Wyskakujące menu szybkiej edycji, pojawiające się po kliknięciu etykiety tekstowej budynku na rzucie:

1. **Nagłówek**: Nazwa budynku, wysokość bazowa (`defaultHeight` w metrach), źródło wysokości (Ręczna, WFS, LiDAR NMT).
2. **Kondygnacje**: Liczba kondygnacji nadziemnych (zapisana cyfrą rzymską, np. `V`).
3. **Rzędna posadowienia**: Wysokość dolnej krawędzi / terenu w metrach (`elevation`).
4. **Szybkie przełączniki (TAK/NIE)**:
   - `Dodaj do analiz`: uwzględnianie obiektu jako przeszkody zacieniającej/przesłaniającej.
   - `W projekcie`: oznaczenie jako projektowany obiekt badany (wlicza się do bilansów i cienia).
   - `Zabudowa śródmiejska`: ulgowe normy odległościowe wg § 12 ust. 5.
   - `Zablokuj`: blokada edycji pozycji i geometrii w rzucie.
   - `Duch`: tryb pomijania kliknięć (przenikanie selekcji).

---

## 7. Warstwy Płótna Renderera CAD 2.5D (Render Pipeline)

Katalog warstw: [`src/components/cad/pipeline/layers/`](file:///C:/py/usi-light/src/components/cad/pipeline/layers/).

Silnik CAD rysuje scenę w ściśle zdefiniowanej kolejności warstw (od spodu do wierzchu):

```
+-------------------------------------------------------------------------+
| [Wierzch] 11. Warstwa Wizualizacji Demo (RecorderVisualsLayer)          |
|           10. Warstwa Rysowania i OSNAP (DrawingToolLayer)              |
|            9. Warstwa Wymiarowania (DimensionsLayer)                    |
|            8. Warstwa Wektorów Słońca (SunlightLayer)                   |
|            7. Warstwa Budynków i Etykiet (BuildingsLayer)               |
|            6. Warstwa Placów Zabaw (PlaygroundLayer)                    |
|            5. Warstwa Pasem Fasadowych § 12 / § 56 (AnalysisBandsLayer) |
|            4. Warstwa Cienia i Przesłaniania (ShadowingLayer)           |
|            3. Warstwa Zasięgu Cienia (ShadowRangeLayer)                 |
|            2. Warstwa Siatki CAD (GridLayer)                            |
| [Spód]     1. Warstwa Mapy Satelitarnej (SatelliteMapLayer)             |
+-------------------------------------------------------------------------+
```

### Szczegółowy opis warstw:

1. **`SatelliteMapLayer`**:
   - Pobiera i renderuje kafelki map satelitarnych Google Maps / HERE w układzie Web Mercator, transformując je na współrzędne lokalne CAD.
2. **`GridLayer`**:
   - Rysuje siatkę modularną (główne linie co 5m, linie pomocnicze co 1m) adaptującą się do poziomu zoomu.
3. **`ShadowRangeLayer`**:
   - Rysuje półprzezroczystą obwiednię maksymalnego zasięgu cienia rzucanego przez obiekty w równonoc (od 7:00 do 17:00).
4. **`ShadowingLayer`**:
   - Rysuje promienie badania przesłaniania § 12 i kąty wolne wokół aktywnych punktów.
5. **`AnalysisBandsLayer`**:
   - Rysuje ciągłe wstęgi barwne na fasadach:
     - **Wewnątrz ścian**: pasmo § 12 (szmaragdowy = spełnione, karminowy = przesłonięte).
     - **Na zewnątrz ścian**: pasmo § 56 (gradient godzinowy nasłonecznienia). Narożniki ścian są automatycznie docinane wzdłuż dwusiecznych kątów (miter joints).
6. **`PlaygroundLayer`**:
   - Rysuje kolorową siatkę punktów badania nasłonecznienia placu zabaw (min. 4h nasłonecznienia w równonoc).
7. **`BuildingsLayer`**:
   - Wypełnienia i obrysy budynków:
     - Obiekt badany (`isTested = true`): wyraźny błękitny kontur i wypełnienie.
     - Obiekt istniejący/przeszkoda: stonowany szary kontur.
     - Obiekty geodezyjne (działki = czerwony, utwardzenia = grafitowy).
     - Etykiety parametrów w środku ciężkości brył.
8. **`SunlightLayer`**:
   - Rzutowane wektory padania promieni słonecznych dla wybranych godzin w równonoc.
9. **`DimensionsLayer`**:
   - Linie wymiarowe, koty odległościowe i oznaczenia kątowe.
10. **`DrawingToolLayer`**:
    - Linie pomocnicze podczas aktywnego kreślenia, punkty magnetyczne OSNAP (narożnik, środek ściany, rzut prostopadły) oraz linie polarne OTRACK (żółte linie osiowe).
11. **`RecorderVisualsLayer`**:
    - Wizualizacja wskaźnika kursora i podświetleń podczas odtwarzania sesji demo / samouczka.

---

## 8. Szybka Ściągawka Skrótów Klawiszowych CAD

- `S` lub `F3` – Przełącznik przyciągania magnetycznego (OSNAP).
- `Shift` (przytrzymanie) – Blokada kątów kardynalnych (0°, 90°, 45°) i osi dominujących.
- `Spacja` / `Środkowy przycisk myszy` / `Przeciąganie tła` – Przesuwanie widoku (*Pan*).
- `Kółko myszy` – Płynny zoom w punkcie kursora.
- `Del` / `Backspace` – Usunięcie zaznaczonych brył lub punktów kontrolnych.
- `Ctrl + Z` / `Cmd + Z` – Cofnij ostatnią operację.
- `Ctrl + Y` / `Ctrl + Shift + Z` – Ponów cofniętą operację.
- `Esc` – Anulowanie aktywnego narzędzia rysowania / zamknięcie okna inspektora.
