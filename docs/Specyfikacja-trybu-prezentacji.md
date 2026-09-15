# **Specyfikacja trybu prezentacji aplikacji Światło**

[https://gemini.google.com/app/9f339bc413902c94](https://gemini.google.com/app/9f339bc413902c94)

&nbsp;

*User prompt: Opracuj szczegółową specyfikacje dla trybu prezentacji projektu. Prezentacja będzie trybem aplikacji "Swiatło". Po przelaczeniu w ten tryb program pokazuje odpowiednio spreparowany widok elementow obecnych w scenie. W tym trybie nie ma edycji \- widzimy izometryczny widok, z podzialem na projektowane i zastane. Mozemy zmienic godzine slonca. Widzimy podstawowe parametry i lokalizacje. Duzy nacisk na estetyke. Mozemy kliknac w wybranym miejscu i wywolac tooltip z pokazanym czasem naslonecznienia. Bez eksportu. Mozemy uzywac innego silnika. Prezentacja powinna byc mozliwie niezaleznym modulem z ktorego mozemy wyjsc do trybu edycji. Zadaj pytania jak czegos nie rozumiesz.*

# **Response: Specyfikacja Techniczna i Funkcjonalna: Tryb Prezentacji („Światło”)**

Moduł Prezentacji to niezależna, odizolowana warstwa widoku (Read-Only 3D Viewport) osadzona w aplikacji „Światło”. Zastępuje edytor CAD przestrzenną makietą architektoniczną w rzucie aksonometrycznym/izometrycznym, kładąc nacisk na plastykę światłocienia, czytelność relacji przestrzennych oraz bezproblemowy powrót do trybu projektowego.

### **Architektura i Separacja Modułu**

Moduł działa na zasadzie dedykowanego komponentu-kontenera (\<PresentationView/\>), renderowanego warunkowo na poziomie głównego widoku aplikacji.

> * **Izolacja stanu:** Moduł pobiera stan sceny w trybie tylko do odczytu (readonly) z useSceneStore (budynki, obrysy, parametry wysokościowe, typy obiektów) oraz useSolarAnalysisStore (geolokalizacja, data równonocy/analizy).  
> * **Własny cykl życia i silnik renderujący:** Wykorzystanie **Three.js** (rekomendowane opakowanie przez **React Three Fiber / @react-three/drei**). Silnik 2D CAD zostaje uśpiony (unmounted lub zamrożony w tle), redukując zużycie GPU/CPU.  
> * **Wyjście z trybu:** Przycisk Zakończ prezentację / Wróć do edycji (oraz klawisz Esc) niszczy kontekst WebGL modułu lub czyści zasoby i przywraca stan widoku 2D CAD bez utraty danych edycyjnych.

`[useSceneStore / useSolarAnalysisStore]`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`│ (Read-only Snapshot)`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`▼`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`[PresentationAdapter] ──> Konwersja 2D Polygons + H na Extruded Mesh 3D`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`│`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`▼`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`<PresentationView> (Three.js / Canvas 3D)`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`├── OrthographicCamera (Izometria)`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`├── DirectionalLight (Kalkulacja azymutu/elewacji ze słońca)`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`├── Post-processing (SSAO / Outline)`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`└── <PresentationHUD /> (Minimalistyczny UI nałożony w HTML)`

### **Estetyka i Rendering 3D**

Koncepcja wizualna nawiązuje do fizycznej makiety urbanistycznej i diagramów koncepcyjnych z miękkim, tonalnym światłocieniem.

**Kamera i perspektywa**

> * **Typ:** OrthographicCamera (rzut równoległy / izometryczny).  
> * **Kąt:** Kąt izometryczny (pitch \~35.264°, yaw 45° jako domyślny preset).  
> * **Nawigacja:** Możliwość swobodnego obrotu wokół osi pionowej (OrbitControls bez perspektywy) i przesuwania (Pan) oraz płynny zoom. Opcjonalny przycisk szybkiego powrotu do domyślnej osi izometrii.

**Stylistyka obiektów i materiały**

> * **Budynki projektowane:**  
  * Ciepły, terakotowy/ochrowy odcień na ścianach bocznych (inspirowany ciepłą gliną architektoniczną).  
  * Dachy w matowej, złamanej bieli lub neutralnym alabastrze dla kontrastu i czytelności bryły z góry.  
  * Delikatne podkreślenie krawędzi (kontur zewnętrzny w technice cel-shading/edge detection).  
> * **Budynki zastane (kontekst):**  
  * Monochromatyczny, chłodny mat (alabaster, jasny popiel / neutralny beton).  
  * Niższy kontrast fakturowy, pozwalający wybić projektowaną tkankę na pierwszy plan.  
> * **Teren i podłoże:**  
  * Minimalistyczna płaszczyzna w odcieniu neutralnego, ciepłego beżu / kości słoniowej.  
  * Subtelna, półprzezroczysta siatka urbanistyczna lub linie pomocnicze działki (jeśli zdefiniowano granice terenu).

**Oświetlenie i cienie**

> * **Słońce (DirectionalLight):** Pozycja wyliczana w czasie rzeczywistym na podstawie szerokości/długości geograficznej, zadanego dnia (domyślnie 21 marca – równonoc) oraz aktualnie ustawionej godziny.  
> * **Cienie:** Miękkie cienie kontaktowe (PCFSoftShadowMap o wysokiej rozdzielczości kaskad), rzucane na bryły i podłoże.  
> * **Światło otoczenia:** Delikatny ambient z lekkim zabarwieniem błękitno-fioletowym w cieniach, co daje kontrast z ciepłym, żółto-złocistym światłem bezpośrednim.  
> * **Ambient Occlusion:** Screen Space Ambient Occlusion (SSAO / GTAO) podkreślający styki ścian z ziemią i uskoki elewacji.

### **Funkcjonalności i Interakcje**

&nbsp;

| Funkcjonalność | Zachowanie w systemie |
| :---- | :---- |
| **Suwak czasu słońca** | Dolny lub górny minimalistyczny scrubber (zakres: od wschodu do zachodu lub 07:00–17:00). Płynna zmiana kąta światła, natychmiastowe przeliczenie pozycji słońca i animacja cieni. |
| **Próbkowanie nasłonecznienia (Inspector)** | Kliknięcie w dowolny punkt na terenie lub elewacji: rzucenie promienia (Raycaster), pobranie współrzędnych (*X*,*Y*,*Z*) i odpytanie silnika analitycznego o łączny czas nasłonecznienia w danym punkcie w dniu analizy. |
| **Prezentacyjny Tooltip** | Elegancki callout 3D zintegrowany z punktem kliknięcia: wskazuje czas w godzinach i minutach (np. 3h 45min nasłonecznienia), status zgodności z normą (np. spełnia WT \>3h) oraz dynamiczny wykres pasmowy godzin światła/cienia. |
| **Podgląd parametrów i lokalizacji** | Niewielki, nienachalny panel informacyjny (HUD): adres / współrzędne, data analizy, powierzchnia zabudowy, kubatura projektowana vs zastana, kąt elewacji słońca dla wybranej godziny. |
| **Przełącznik warstw / filtr** | Dyskretny toggle umożliwiający wygaszenie kontekstu (budynków zastanych) dla wyeksponowania samego projektu lub włączenie/wyłączenie obrysów granic działki. |

### **Interfejs Użytkownika (Minimalistyczny HUD)**

UI w trybie prezentacji jest całkowicie odchudzony z narzędzi CAD:

> * **Pasek górny (Top Bar):**  
  * Lewy róg: Nazwa projektu, lokalizacja (np. Wrocław, Krzyki | 51.1079° N, 17.0385° E) oraz data analizy (21 marca (Równonoc)).  
  * Prawy róg: Duży, wyraźny przycisk Wróć do edycji (ze skrótem ESC).  
> * **Pasek dolny (Solar Scrubber):**  
  * Pływający dock (glassmorphism/półprzezroczysty mat) z suwakiem osi czasu.  
  * Wyświetlacz aktualnej godziny (np. 11:45) oraz piktogram wysokości słońca nad horyzontem (Alt: 34.2° | Az: 168.1°).  
  * Przyciski skrótowe do kluczowych godzin kontrolnych: 07:00, Równonoc południe (12:00), 17:00.  
> * **Pływający znacznik próbkowania (Tooltip):**  
  * Minimalistyczna szpilka z miękkim cieniem i kartą:  
    * Czas bezpośredniego słońca: **np. 4h 10m**.  
    * Wizualny pasek od 07:00 do 17:00 pokazujący przedziały zacienienia i nasłonecznienia.  
    * Przycisk × do zamknięcia lub kliknięcie w inne miejsce przestawia wskaźnik.

### **Pipeline Danych i Połączenie z Silnikiem Analitycznym**

> 1. **Generowanie geometrii:**  
   * Pobranie wielokątów podstaw budynków z useSceneStore.  
   * Wyodrębnienie atrybutu wysokości height lub liczby kondygnacji.  
   * Ekstruzja 2D → 3D za pomocą THREE.ExtrudeGeometry.  
   * Rozdzielenie na dwie grupy materiałowe: ProposedMeshGroup i ContextMeshGroup.  
> 2. **Kalkulacja nasłonecznienia w punkcie:**  
   * Wykorzystanie istniejących funkcji z src/engine/analysisEngine.ts lub solar.ts.  
   * Dla klikniętego punktu (*x*,*y*,*z*) wyliczany jest profil horyzontu (przeszkody terenowe tworzone przez bryły) i całkowity czas w oknie normowym (7:00–17:00).  
   * Jeśli aplikacja generuje bitmapę/LUT zbuforowanej analizy nasłonecznienia, odczyt odbywa się bezpośrednio z bufora tekstury (odpytanie *O*(1) bez ponownego raytracingu).

### **Pytania doprecyzowujące**

> 1. **Format/źródło kalkulacji nasłonecznienia:** Czy czas nasłonecznienia dla tooltipa ma być czytany z wcześniej wyliczonej siatki analitycznej (tekstura/macierz 2D z rzutu CAD), czy wymaga pełnego przeliczenia promieni w 3D (uwzględniając np. nasłonecznienie konkretnego punktu na pionowej fasadzie budynku)?  
> 2. **Stopień swobody kamery:** Czy widok izometryczny ma mieć całkowicie zablokowany kąt pochylenia (czysty rzut ortogonalny z obrotem o 90° lub płynnym wokół osi Z), czy dopuszczasz swobodne obracanie i pochylanie modelu jak w klasycznym widoku 3D?

---

*User prompt: Przygotuj specyfikację na tym samym silniku do prezentowania w oknie modyfikatory podgladu izometrycznego wybranego obiektu (kwadrat 1:1)*

# **Response: Specyfikacja Techniczna i Funkcjonalna: Okno Podglądu Izometrycznego Obiektu (Kwadrat 1:1)**

Moduł dedykowanego podglądu (ang. *Object Inspector / Quick Viewport*) to osadzone w aplikacji, pływające lub dokowalne okno o stałych proporcjach boków **1:1 (format kwadratowy)**. Umożliwia szczegółową inspekcję wybranego obiektu (projektowanego lub zastanego) w rzucie izometrycznym z zestawem modyfikatorów wizualnych, analitycznych i geometrycznych.

Moduł bazuje na tym samym silniku renderującym (**Three.js / WebGL**), działając na wyizolowanej miniscenie lub zoptymalizowanym widoku pomocniczym.

### **1\. Architektura Renderera i Sceny**

Aby zachować pełną niezależność i wysoką wydajność, okno podglądu działa jako odrębny komponent renderujący (\<ObjectIsometricPreview/\>).

> * **Płótno (Viewport):** Element Canvas z wymuszonym CSS aspect-ratio: 1 / 1 (np. stały rozmiar 420×420 px lub responsywne okno modalne/pływające).  
> * **Kamera:** THREE.OrthographicCamera  
  * Standardowy kąt izometryczny: elewacja \~35.264° (arcsin(tan(30°))), azymut domyślny 45°.  
  * **Auto-Framing (BBox Fit):** Przy wyborze obiektu skrypt oblicza jego THREE.Box3. Rozmiar widoku kamery (left, right, top, bottom) dobierany jest automatycznie z buforem bezpieczeństwa (padding 15–20%), dzięki czemu obiekt o dowolnych gabarytach zawsze idealnie wypełnia kwadratowy kadr.  
> * **Targeting i pivot:** Punkt centralny obrotu kamery (controls.target) jest zawsze przypięty do geometrycznego środka obiektu (*Xc*​,*Yc*​,*Zc*​/2).

### **2\. Modyfikatory Podglądu (Preview Modifiers)**

Wokół lub wewnątrz kwadratowego widoku umieszczony jest zestaw przełączników i suwaków wpływających w czasie rzeczywistym na sposób wyświetlania bryły:

`┌────────────────────────────────────────────────────────┐`  
`│ [Mod: Makieta ▼]   [Azymut: SE ▼]   [HUD: On/Off]  [✕] │`  
`├────────────────────────────────────────────────────────┤`  
`│                                                        │`  
`│                     ┌───────────┐                      │`  
`│                    /           /│                      │`  
`│                   /   DACH    / │                      │`  
`│                  ┌───────────┐  │                      │`  
`│                  │           │  │                      │`  
`│                  │  FASADA   │  │                      │`  
`│                  │           │ /                       │`  
`│                  │           │/                        │`  
`│                  └───────────┘                         │`  
`│                                                        │`  
`├────────────────────────────────────────────────────────┤`  
`│ ☀️ Słońce: [───────●───────] 11:30 | Cienie: [Aktywne] │`  
`│ Kontekst: [Wycięty / Cienie duchowe] | Wymiary: [✓]    │`  
`└────────────────────────────────────────────────────────┘`

#### **A. Modyfikatory Stylu Renderowania (Render Styles)**

> 1. **Makieta / Clay (Domyślny):**  
   * Ciepły terakotowy/ochrowy materiał na ścianach dla obiektów projektowanych, złamana biel na dachu, chłodny szary alabaster dla obiektów zastanych.  
   * Czarne, cienkie krawędzie konturowe (THREE.EdgesGeometry lub shader krawędziowy).  
> 2. **Heatmapa Nasłonecznienia (Solar Exposure Map):**  
   * Fasady i dach pokrywane są gradientem barwnym (od ciemnoniebieskiego przez żółty do czerwieni), reprezentującym sumaryczny czas ekspozycji słonecznej w dniu analizy (np. 0–8h).  
> 3. **Rentgen / X-Ray (Translucent):**  
   * Półprzezroczysty obrys bryły z widoczną wewnętrzną strukturą kondygnacji i wektorami uderzenia promieni słonecznych.  
> 4. **Czysta Geometria / Wireframe:**  
   * Minimalistyczna siatka techniczna (kontur CAD) do weryfikacji geometrii i punktów załamań.

#### **B. Modyfikatory Orientacji i Kadrowania (Camera & Angles)**

> 1. **Presety 4 Stron Świata:**  
   * Przyciski szybkiego obrotu izometrii: SW, SE, NW, NE (płynna animacja przejścia kamery wokół osi Z/Y).  
> 2. **Rzut Aksonometryczny vs. Rzut z Góry (Top-Down):**  
   * Przełącznik między kątem 3D a płaskim rzutem aksonometrycznym dachu (przydatne do weryfikacji powierzchni zabudowy).  
> 3. **Obrót Ręczny:**  
   * Ograniczony OrbitControls – obrót horyzontalny 360°, zablokowany stały kąt pionowy izometrii lub możliwość swobodnego tiltu w zakresie 15°–85°.

#### **C. Modyfikatory Otoczenia i Cieniowania (Context & Shadow Modifiers)**

> 1. **Tryb „Solo” (Czysty Obiekt):**  
   * Na scenie renderowany jest wyłącznie wybrany budynek oraz minipodstawa (cokół w rzucie 1:1). Cienie rzuca wyłącznie badany obiekt sam na siebie i na ziemię.  
> 2. **Tryb „Cienie Kontekstu” (Ghost Casters):**  
   * Sąsiednie budynki są **niewidoczne dla oka** (ukryte siatki), ale włączone w bufor cieni (castShadow \= true, material.colorWrite \= false / shadow-only).  
   * Pozwala to zobaczyć na wyizolowanej bryle dokładnie te plamy cienia, które kładą na nią sąsiednie budynki.  
> 3. **Scrubber Solarny 1:1:**  
   * Niezależny suwak godziny (07:00 – 17:00), pozwalający analizować dynamikę światłocienia na elewacjach wybranego budynku w wyizolowanym kadrze.

#### **D. Modyfikatory Informacyjne (Overlays & Dimensions)**

> 1. **Wymiary Gabarytowe 3D:**  
   * Dynamiczne linie wymiarowe z etykietami: długość, szerokość, wysokość attyki / kalenicy (*H*).  
> 2. **Kompas Elewacji:**  
   * Wskaźnik orientacji ścian (północ, południe, wschód, zachód) bezpośrednio na krawędziach podstawy obiektu.

### **3\. Zestawienie Parametrów Wyświetlanych w Oknie (HUD)**

W dolnej lub bocznej części kwadratu (jako półprzezroczysta nakładka UI) widoczne są kluczowe metryki wybranego obiektu:

&nbsp;

| Parametr | Opis | Jednostka |
| :---- | :---- | :---- |
| **Typ / Status** | Projektowany (Nowy) / Zastany (Kontekst) | Status |
| **Wysokość (*H*)** | Wysokość całkowita obiektu od poziomu terenu | m |
| **Powierzchnia zabudowy (*Pz*​)** | Pole powierzchni footprintu budynku | m2 |
| **Kubatura brutto (*V*)** | Orientacyjna objętość bryły (*Pz*​×*H*) | m3 |
| **Średnie nasłonecznienie ścian** | Średni czas oświetlenia elewacji w oknie 07:00–17:00 | h / min |
| **Elewacja krytyczna** | Fasada o najniższym bilansie nasłonecznienia | np. Północna (0h 15m) |

### **4\. Specyfikacja Techniczna Implementacji**

#### **Generowanie Bryły do Okna**

`interface IsometricPreviewConfig {`  
&nbsp;&nbsp;`objectId: string;`  
&nbsp;&nbsp;`renderStyle: 'clay' | 'insolation_heatmap' | 'xray' | 'wireframe';`  
&nbsp;&nbsp;`isometricPreset: 'NE' | 'SE' | 'SW' | 'NW';`  
&nbsp;&nbsp;`sunTimeMinutes: number; // np. 720 = 12:00`  
&nbsp;&nbsp;`showGhostShadows: boolean;`  
&nbsp;&nbsp;`showDimensions: boolean;`  
&nbsp;&nbsp;`aspectRatio: 1; // Wymuszone 1:1`  
`}`

> 1. **Pobranie danych:** Obiekt jest pobierany z useSceneStore.getState().buildings.find(b \=\> b.id \=== objectId).  
> 2. **Wyodrębnienie geometrii:** W oparciu o tablicę wierzchołków 2D (points) tworzony jest THREE.Shape, a następnie THREE.ExtrudeGeometry o zadanej wysokości height.  
> 3. **Klonowanie cieniujące otoczenia (gdy showGhostShadows \= true):**  
   * Budynki sąsiadujące (w promieniu np. 3×*H* badanego obiektu) są dodawane do podsceny jako Mesh z materiałem:

   `new THREE.MeshBasicMaterial({`  
     &nbsp;&nbsp;`colorWrite: false, // Całkowicie niewidoczny`  
     &nbsp;&nbsp;`depthWrite: true`  
     `});`  
     `mesh.castShadow = true;`

   * Dzięki temu rzucają one rzeczywisty cień na badany obiekt, nie zasłaniając widoku w małym kadrze 1:1.

### **5\. Ergonomia i UI Okna**

> * **Pojawienie się okna:** Okno otwiera się po kliknięciu obiektu w widoku głównym lub z listy obiektów w panelu bocznym.  
> * **Płynne wejście:** Animacja fade-in \+ subtelne przeskalowanie (scale up z 0.95 do 1.0).  
> * **Format:** Stały kwadrat (np. w-96 h-96 lub 480x480 px), z zaokrąglonymi narożnikami (rounded-2xl), delikatnym obrysem i cieniem (shadow-2xl backdrop-blur-md).  
> * **Niezależność:** Ruch w głównym oknie CAD/prezentacji nie wpływa na podgląd w oknie 1:1; okno posiada własną pętlę renderowania (on-demand: render tylko przy zmianie parametrów/obrocie, co oszczędza GPU).

### **Pytania doprecyzowujące**

> 1. **Umiejscowienie okna:** Czy podgląd 1:1 ma być pływającym oknem (Picture-in-Picture) nad głównym widokiem sceny z możliwością przesuwania go po ekranie, czy dedykowanym panelem dokowanym z boku (np. w wysuwanym prawym sidebarze)?  
> 2. **Kondygnacje / Piętra:** Czy bryły budynków posiadają w danych podział na poszczególne kondygnacje i czy modyfikator powinien umożliwiać ich rozsuwanie (tzw. widok eksplodowany / *exploded view*) lub cięcie poziome suwakiem wysokości?  
> 3. **Pomiary na elewacjach:** Czy w trybie podglądu 1:1 przewidujesz możliwość klikania bezpośrednio na ściany obiektu, aby sprawdzać nasłonecznienie konkretnych otworów okiennych/punktów na elewacji?

---

*User prompt: podglad ma być ułatwieniem w uzywaniu modyfikatorów, a więc powinien pojawiać się razem z panalem informacyjnym modyfikatorów. oczywiście ze jest informacja o kondygnacjach, jest przypisana do obiektu, sprawdź codebase USI-Light. Nie przewiduje klikalności podlągu.*

# **Response: Specyfikacja Techniczna: Moduł Podglądu Izometrycznego Obiektu (Kwadrat 1:1)**

Moduł podglądu stanowi wizualne wsparcie dla panelu modyfikatorów i właściwości obiektu (Object Properties / Inspector) w aplikacji **„Światło” (USI-Light)**.

Okno podglądu ma stałe proporcje **1:1** i renderuje wybrany budynek w wyizolowanej miniscenie 3D (Three.js/WebGL). Każda zmiana atrybutu w panelu (kondygnacje, wysokość, funkcja, kategoria) znajduje natychmiastowe odzwierciedlenie w bryle. Widok jest **całkowicie pasywny (brak klikalności)** – cała interakcja odbywa się za pośrednictwem kontrolek panelu.

### **1\. Integracja UI i Umiejscowienie w Systemie**

> * **Lokalizacja:** Górna sekcja panelu modyfikatorów obiektu (zintegrowana w panelu bocznym AppSidebar / drawerze inspekcji obiektu po zaznaczeniu budynku na rzucie CAD).  
> * **Format:** Responsywny kontener o sztywnym stosunku boków aspect-square (np. 280×280 px lub 320×320 px, dopasowany do szerokości bocznego paska).  
> * **Pasywność interakcji:** Element \<canvas\> posiada klasę pointer-events-none (lub wyłączony raycasting). Użytkownik nie klika w bryłę ani nie manipuluje punktami na siatce 3D. Sterowanie perspektywą i modyfikatorami odbywa się wyłącznie za pomocą przycisków i selektorów w panelu.  
> * **Cykl życia:**  
  * **Zaznaczenie pojedynczego obiektu:** Panel właściwości otwiera się wraz z oknem 1:1; inicjalizacja geometrii i auto-kadrowanie.  
  * **Odznaczenie obiektu / Zaznaczenie wielu:** Okno 1:1 jest zwijane lub unmountowane, a zasoby geometrii i materiałów niszczone (dispose()).

### **2\. Mapowanie Modelu Danych USI-Light → Bryła 3D**

Widok 1:1 bezpośrednio subskrybuje stan zaznaczonego budynku z useSceneStore. Wykorzystuje pełną strukturę danych obiektu:

&nbsp;

| Pole z useSceneStore | Reprezentacja w oknie 1:1 |
| :---- | :---- |
| points (\[*x*,*y*\]\[\]) | Kształt podstawy (THREE.Shape) ekstrudowany w osi pionowej. |
| height (m) | Całkowita wysokość bryły (*Zmax*​). |
| storeys / kondygnacje | Fizyczny podział bryły na poziomy. Na ścianach bocznych generowane są horyzontalne fugi/linie stropowe (story bands). |
| storeyHeight (m) | Wysokość pojedynczego piętra (stosunek wysokości kondygnacji parteru vs kondygnacji powtarzalnych). |
| category / type | **Projektowany (proposed):** Ciepła terakota / ochra, wyraziste krawędzie konturu. **Zastany (existing):** Chłodny alabaster / neutralny jasnoszary, matowy. |
| baseElevation / *Z*0​ | Rzędna posadowienia budynku względem lokalnego cokołu terenu w kadrze. |

### **3\. Wizualizacja Kondygnacji (Story-Aware Extrusion)**

Bryła w oknie podglądu nie jest monolitycznym klockiem – uwzględnia strukturę pięter przypisaną do obiektu:

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`┌──────────────┐`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`/              /│  ◄── Dach (złamana biel)`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`├──────────────┤ │`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`│ Kondygnacja 3│ │  ◄── Piętro powtarzalne`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`├──────────────┤ │`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`│ Kondygnacja 2│ │  ◄── Piętro powtarzalne`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`├──────────────┤ │`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`│ Kondygnacja 1│ │  ◄── Piętro powtarzalne`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`├──────────────┤/`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`│    PARTER    │    ◄── Kondygnacja wejściowa / usługowa`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`└──────────────┘`  
&nbsp;&nbsp;&nbsp;&nbsp;`════════════════════════  ◄── Płytka cokołowa 1:1`

> 1. **Linie podziału stropów:** Cienkie, estetyczne linie krawędziowe (akcentowane ciemniejszym tonem lub fugą o głębokości 2–5 cm w geometrii) wyznaczające każdą kondygnację naziemną.  
> 2. **Akcentowanie parteru:** Możliwość wyróżnienia kondygnacji przyziemia (np. wyższa wysokość kondygnacji parterowej, zdefiniowana w parametrach obiektu).  
> 3. **Wskaźniki poziomów:** Delikatna podziałka pionowa z boku kadru z etykietami kondygnacji (P, \+1, \+2, \+3 ... Att. \+12.50m).

### **4\. Kontrolki Modyfikatorów Podglądu w Panelu**

Tuż pod kwadratowym oknem podglądu znajduje się minipasek narzędziowy obsługujący modyfikatory widoku:

> * **Selektor orientacji izometrycznej:**  
  * Kompaktowa grupa przycisków: \[SW\] \[SE\] \[NW\] \[NE\].  
  * Kliknięcie obraca kamerę wokół obiektu z płynną animacją sferyczną (tweening \~250ms), zachowując stały kąt pionowy izometrii (35.264°).  
> * **Przełącznik stylu makiety:**  
  * Makieta (Clay) – standardowa plastyczna makieta z miękkim cieniowaniem.  
  * Kondygnacje (Floors) – naprzemienne, subtelne cieniowanie pasmowe kolejnych pięter (ułatwia liczenie i weryfikację kondygnacji).  
  * Krawędzie (Wire/Edges) – uwypuklenie geometrii i linii podziału stropów.  
> * **Cienie słoneczne:**  
  * Toggle Cień \[Wł/Wył\] oraz sprzężenie z godziną zdefiniowaną na osi czasu projektu lub szybki suwak kąta oświetlenia pomocniczego, eksponującego uskok fasad i kondygnacji.

### **5\. Architektura Renderera i Optymalizacja (Three.js)**

Ponieważ okno towarzyszy pracy w edytorze i panelu modyfikatorów, kluczowa jest zerowa strata wydajności aplikacji głównej:

> * **Render On-Demand (Brak ciągłej pętli RAF):**  
  * Klatka renderowana jest **wyłącznie wtedy**, gdy:  
    1. Zmienią się dane w store (height, storeys, points, category).  
    2. Użytkownik kliknie zmianę kąta widoku (SW/SE/NW/NE).  
    3. Zmieni się godzina oświetlenia słonecznego.  
  * Przy braku zmian zużycie GPU wynosi 0%.  
> * **Auto-Framing (BBox Centering):**  
  * Po każdej zmianie wysokości lub kształtu rzutu wyliczany jest THREE.Box3.  
  * Target kamery jest zawsze w punkcie:  
    *Pcenter*​\=(2*Xmin*​\+*Xmax*​​,2*Ymin*​\+*Ymax*​​,2*H*​)  
  * Rozpiętość rzutowania OrthographicCamera dopasowuje się tak, by budynek zawsze wypełniał \~80% szerokości i wysokości kwadratu 1:1, niezależnie od tego, czy ma 1 czy 15 kondygnacji.

### **Pytania doprecyzowujące**

> 1. **Podział kondygnacji w danych obiektu:** Czy w Twoim modelu danych storeyHeight jest stałą wartością dla całego budynku (np. *H*/storeys), czy obiekt dopuszcza inną wysokość dla parteru (np. parter usługowy 4.0m, wyższe kondygnacje 3.0m)?  
> 2. **Zachowanie przy edycji wierzchołków na rzucie 2D:** Gdy użytkownik przeciąga krawędź lub wierzchołek budynku na głównym rzucie CAD, czy podgląd 1:1 w panelu ma odświeżać się w czasie rzeczywistym (*live preview* podczas przeciągania), czy dopiero po puszczeniu myszki (*on drop / commit*)?

---

*User prompt: Opracuj specyfikację alternatywnego widoku do widoku CAD, typu top-view. Widok biały, typu czarne linie na białym arkuszu. Wykorzystanie danych z zasobów geodezyjnych aby pokazać obszary zielone, wodne i inne typy zagospodarowania aby uzyskać ładne płaskie plamy kolorów. Używamy cieni z kierunku słońca zgodnego z użytym algorytmem wyznaczania pozycji słońca. Aby dodać semi realizmu możemy cień wygenerować dodatkowo minutę wcześniej i później (miękki cień dalej krawędzi rzucającej cień). AO wokół budynków. Uproszczone etykiety lub ich brak. Kolor światła.*

# **Response: Specyfikacja Techniczna: Widok Top-View „Masterplan White”**

Widok „Masterplan White” to alternatywny, diagramowy tryb rzutu z góry (Top-Down 2D), imitujący elegancki, techniczny rysunek architektoniczny na białym arkuszu papieru (czarny tusz, pastelowe plamy barwne, miękkie cieniowanie i kontaktowe AO).

Zastępuje surowy edytor wektorowy CAD wyczyszczoną z pomocniczych siatek, gotową do prezentacji i publikacji grafiką planu zagospodarowania terenu (PZT).

### **Paleta Graficzna i Warstwy Geodezyjne**

Tło sceny stanowi neutralny arkusz (łamana biel \#FAFAF9 lub czysta biel \#FFFFFF). Dane przestrzenne z zasobów geodezyjnych (BDOT500, EGiB, pliki DXF/SHP/GeoJSON) renderowane są jako płaskie plamy barwne o niskim nasyceniu, rozgraniczone cienką linią techniczną:

&nbsp;

| Warstwa geodezyjna | Wypełnienie (Fill) | Obrys (Stroke) | Styl / Zastosowanie |
| :---- | :---- | :---- | :---- |
| **Wody (rzeki, zbiorniki)** | \#DDE7EE (chłodny błękitno-szary) | \#B8C8D4 (0.5 px) | Płaska tafla bez gradientów |
| **Zieleń wysoka / Lasy** | \#D8E2DC (szałwiowa zieleń) | \#BAC7BE (0.75 px) | Zwarta plama koron drzew |
| **Zieleń niska / Trawniki** | \#E8EFE9 (bardzo jasna mięta) | Brak lub \#D2DDD4 | Tło biologicznie czynne |
| **Drogi i place jezdne** | \#ECECEE (bardzo jasny asfalt) | \#D1D1D6 (0.5 px) | Ciągi komunikacyjne |
| **Chodniki / Utwardzenia** | \#F3F3F4 (ciepły jasny popiel) | Brak | Nawierzchnie piesze |
| **Działki / Granice (EGiB)** | Przezroczyste | \#9CA3AF (0.75 px, dash 4 2\) | Subtelne linie podziału prawnego |

### **Geometria Budynków (Rysunek Tuszem)**

Obrysy budynków dominują nad podkładem geodezyjnym poprzez kontrast czerni i bieli:

> * **Wypełnienie dachu:** Czysta biel (\#FFFFFF) w 100% kryjąca podkład.  
> * **Obrys zewnętrzny (kontur główny):** Czysta czerń (\#111827), grubości **1.5 px – 2.0 px** dla obiektów projektowanych; **1.0 px** dla obiektów zastanych.  
> * **Krawędzie wewnętrzne (załamania dachów, uskoki brył):** Cieńsza linia techniczna **0.75 px** (\#374151).  
> * **Wyróżnienie projektowane vs zastane:** Obiekty projektowane otrzymują mocniejszy obrys oraz delikatną, minimalistyczną teksturę dachu (np. regularna mikro-fuga 0.25 px) lub są pozostawione w śnieżnej bieli, podczas gdy budynki zastane mają wypełnienie w tonie bardzo jasnego alabastru (\#F5F5F7).

### **Model Cieniowania i Miękki Półcień (±1 min)**

Kierunek i długość cienia wyliczane są ściśle według algorytmu pozycji słońca (wektor azymutu i elewacji z solar.ts dla zadanej lokalizacji i czasu).

&nbsp;&nbsp;&nbsp;&nbsp;`[Promień t-1 min]  \`  
&nbsp;&nbsp;&nbsp;&nbsp;`[Promień t]        ──► [Obszar rozmycia krawędzi - Penumbra]`  
&nbsp;&nbsp;&nbsp;&nbsp;`[Promień t+1 min]  /`  
&nbsp;&nbsp;&nbsp;&nbsp;`═══════════════════════`  
&nbsp;&nbsp;&nbsp;&nbsp;`[Budynek] ──► [Okluzja AO] ──► [Pełny cień - Umbra]`

> * **Wielopróbkowy półcień (Penumbra):**  
  * Słońce przesuwa się po nieboskłonie o ∼0.25∘ w ciągu minuty.  
  * Wyznaczane są **3 wielokąty cienia** rzucanego przez wierzchołki budynku na rzędną terenu: dla czasu *t*−1 min, *t* oraz *t*\+1 min.  
  * Wielokąty są nakładane w buforze z kryciem 33% każdy (lub wagi 25% / 50% / 25%).  
  * **Efekt:** Bezpośrednio przy ścianie budynku cień jest ostry i głęboki (wszystkie 3 wielokąty się pokrywają). Im dalej cień pada od obiektu, tym bardziej wektory się rozchodzą, tworząc naturalną, zbieżną gradację miękkiego cienia bez kosztownego ray tracingu.  
> * **Kolor światła i tonacja cienia:**  
  * **Poranek / Popołudnie (niska elewacja słońca):** Światło nabiera ciepłego, słomkowego tonu (podkład otrzymuje delikatny tint rgba(255, 248, 235, 0.05)), natomiast cień przyjmuje odcień chłodnego, grafitowego indygo rgba(45, 52, 70, 0.22).  
  * **Południe (wysoka elewacja słońca):** Światło neutralne białe, cień neutralnie grafitowy rgba(30, 32, 38, 0.18).

### **Ambient Occlusion 2D (Uziemienie Obiektów)**

Dla nadania głębi wokół rzutów budynków generowana jest kontaktowa okluzja otoczenia (Contact Shadow):

> * **Algorytm generowania:**  
  1. Obrys budynku jest rysowany na offscreen-canvas w kolorze czarnym.  
  2. Nałożenie filtru filter \= blur(4px).  
  3. Wycięcie wnętrza budynku operacją kompozycji globalCompositeOperation \= 'destination-out'.  
  4. Nałożenie zewnętrznego halo z kryciem **12–15%** pod wielokątem budynku, a nad warstwą geodezyjną.  
> * **Efekt wizualny:** Delikatna, 3–5 pikselowa ciemniejsza mgiełka wokół fundamentu, która wizualnie „stawia” bryłę na papierze i zapobiega wrażeniu lewitowania na płaskich plamach zieleni.

### **Typografia i Etykiety**

Domyślnie widok stawia na maksymalną czystość kompozycji i całkowity brak zbędnych etykiet CAD (brak wymiarów, numerów wierzchołków czy snap-markerów).

> * **Tryb Czysty (Default):** Brak napisów; wyłącznie geometria, cienie i plamy barwne.  
> * **Tryb Informacyjny (Przełącznik w HUD):**  
  * Wyświetlane wyłącznie kluczowe wskaźniki: wysokość budynku (np. H=15.5m) lub liczba kondygnacji (np. 4K).  
  * Krój pisma: Techniczny bezszeryfowy (*Inter*, *Roboto Mono* lub systemowy *sans-serif*), wielkość 9–10 px, barwa szara (\#6B7280), wyrównanie w geometrycznym środku dachu z delikatnym halo wygaszającym pod spodem.

### **Potok Kompozycji Renderera (Kolejność Warstw)**

> 1. **Warstwa 0 (Baza):** Biały arkusz papieru (\#FAFAF9).  
> 2. **Warstwa 1 (GIS / Geodezja):** Plamy wód, ciągi komunikacyjne, nawierzchnie utwardzone, zieleń niska i wysoka z cienkim obrysem.  
> 3. **Warstwa 2 (Cienie kontaktowe AO):** Rozmyta okluzja zewnętrzna 2D wokół footprintów.  
> 4. **Warstwa 3 (Cienie słoneczne z półcieniem):** Złożenie 3 wielokątów rzutu cienia (*t*−1m, *t*, *t*\+1m) z blendingiem multiply.  
> 5. **Warstwa 4 (Bryły budynków):** Wypełnienie białe/alabastrowe dachów (zasłaniające rzucone na ziemię cienie sąsiadów).  
> 6. **Warstwa 5 (Tusz techniczny):** Wektory konturów budynków (1.5 px czarny tusz) oraz ewentualne minimalistyczne etykiety *H*.

Czy cienie rzucane przez budynki wyższe mają kłaść się również na dachach budynków niższych (wymaga prostej kalkulacji różnicy wysokości Δ*H* na rzucie 2D), czy dopuszczasz uproszczenie, w którym cienie padają wyłącznie na płaszczyznę terenu?

---

*User prompt: Tak, cienie mają być rzucane ten na niższe budynki i ich części. Mechanizm wykrywania różnic wysokości jest już częściowo zaimplementowany w celu wyrywania krawędzi zaslanianych w widoku CAD.*

### **Response: Specyfikacja Techniczna: Rzutowanie Cieni na Niższe Budynki i Uskoki Brył (Top-View)**

Rozszerzenie specyfikacji widoku „Masterplan White” o wielopoziomowe cieniowanie powierzchni dachowych, tarasów oraz uskoków bryłowych w oparciu o różnicę wysokości Δ*H*.

### **1\. Model Analityczny Rzutowania Cienia (Δ*H*)**

Mechanizm bazuje na istniejącej logice relacji wysokościowych w aplikacji (wykorzystywanej przy wykrywaniu przesłaniania krawędzi). Zamiast traktować dachy jako nieprzeniknione białe maski odcinające wszystkie cienie, każdy budynek lub jego wydzielona część otrzymuje bufor przyjmujący cień od obiektów wyższych.

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Budynek A (H = 24m)`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`┌───────────┐`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`│           │`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`│           │ ──► Promień słońca (elewacja α)`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`│           │    \`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`│           │     \  Cień dachowy (ΔH = 12m)`  
`───────┴───────────┴──────\─────────────────────────`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`│ \`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`│  ▼ [ Cień na dachu B ]`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`│ ┌──────────────────────┐`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`│ │                      │`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`│ │ Budynek B (H = 12m)  │`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`│ │                      │`  
`──────────────────────────┴─┴──────────────────────┴── [ Cień gruntowy (H = 12m) ] ──`

#### **Matematyka Wektora Cienia Dachowego**

Dla obiektu rzucającego *A* o wysokości *HA*​ oraz obiektu odbierającego *B* o wysokości *HB*​:

> * **Warunek rzutowania:** *HA*​\>*HB*​ (gdy *HA*​≤*HB*​, budynek *A* nie rzuca cienia na dach *B*).  
> * **Wysokość efektywna:**  
>   Δ*H*\=*HA*​−*HB*​  
> * **Długość wektora cienia na płaszczyźnie dachu *B*:**  
>   *Lroof*​\=tan(*α*)Δ*H*​  
>   *(gdzie α to kąt elewacji słońca wyliczony z algorytmu dla zadanego czasu)*.  
> * **Wektor translacji wierzchołków:**  
>   *Vroof*​\=*Lroof*​⋅\[−sin(*θ*)−cos(*θ*)​\]  
>   *(gdzie θ to kąt azymutu słońca)*.  
> * **Geometria plamy na dachu:**  
>   ShadowPolygon*roof*​(*A*→*B*)=SweepPolygon(Roof*A*​,*Vroof*​)∩Polygon*B*​  
>   Operacja przecięcia wielokątów (Boolean AND) ogranicza cień ściśle do obrysu dachu obiektu niższego.

### **2\. Rozmycie Penumbry (±1 min) na Różnych Poziomach**

Metoda trzech próbek czasowych (*t*−1 min, *t*, *t*\+1 min) działa adaptacyjnie na każdej płaszczyźnie:

> * **Fizyczna szerokość półcienia:** Rozmycie krawędzi cienia zależy wprost od odległości rzutowania. Ponieważ odległość od krawędzi attyki wyższego budynku do dachu niższego jest mniejsza niż do gruntu (Δ*H*\<*HA*​), kątowe rozbieżności próbek ±1 min dadzą na dachu **węższy, ostrzejszy półcień**, a na gruncie **szerszy i bardziej miękki**.  
> * **Złożenie próbek na dachu:** Wewnątrz obrysu dachu *B* renderowane są 3 wielokąty rzutu Δ*H*:  
  * Wielokąt *t*−1 min (wypełnienie: rgba(45, 52, 70, 0.07))  
  * Wielokąt *t* (wypełnienie: rgba(45, 52, 70, 0.12))  
  * Wielokąt *t*\+1 min (wypełnienie: rgba(45, 52, 70, 0.07))  
> * **Wynik:** Spójne przejście tonalne – cień w pobliżu styku ścian z niższym dachem jest głęboki i precyzyjny, rozmywając się delikatnie w miarę oddalania się od krawędzi wyższej bryły.

### **3\. Ambient Occlusion (AO) na Uskokach i Tarasach**

W miejscach, gdzie wyższa część budynku bezpośrednio wyrasta z niższego dachu (np. wieża wyrastająca z parterowego podium lub styk sąsiednich kamienic o różnej wysokości):

> * Generowane jest **wewnętrzne pasmo AO dachu** (kontaktowe):  
  * Wąskie pasmo cienia kontaktowego (promień 2–3 px, krycie 10–12%) wzdłuż krawędzi styku ściany wyższej z płaszczyzną niższego dachu.  
  * Eliminuje to wrażenie „oderwania” pionowej ściany od leżącej poniżej płaszczyzny stropodachu.

### **4\. Zoptymalizowany Potok Renderowania (Z-Index i Maskowanie Canvas 2D)**

Wykorzystanie maskowania kontekstu graficznego (ctx.clip()) zapobiega konieczności kosztownego przeliczania wielokątów metodami wektorowymi dla każdego piksela:

`[KROK 1: Podkład i grunt]`  
`│ Rysowanie podkładu geodezyjnego (plamy zieleni, wód, ciągów komunikacyjnych)`  
`│ Rysowanie pełnych cieni gruntowych wszystkich budynków (H) z próbkowaniem ±1 min`  
`│ Nałożenie kontaktowego AO gruntowego`  
`▼`  
`[KROK 2: Sortowanie obiektów]`  
`│ Posortowanie budynków rosnąco wg wysokości: H_1 <= H_2 <= ... <= H_n`  
`▼`  
`[KROK 3: Pętla po budynkach (od najniższego do najwyższego)]`  
`Dla każdego budynku B_i:`  
&nbsp;&nbsp;`1. ctx.save()`  
&nbsp;&nbsp;`2. Zdefiniuj ścieżkę dachu Polygon(B_i) i wywołaj ctx.clip()`  
&nbsp;&nbsp;`3. Wypełnij dach bazowym kolorem (biel / jasny alabaster)`  
&nbsp;&nbsp;`4. Pobierz wszystkie budynki wyższe B_k (gdzie H_k > H_i), których cienie mogą sięgnąć dachu B_i:`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`- Oblicz wektor rzutu dla ΔH = H_k - H_i`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`- Narysuj 3 wielokąty rzutu (t-1, t, t+1) w trybie mnożenia ('multiply')`  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`- Jeśli ściana B_k styka się z dachem B_i: dodaj pasmo AO wzdłuż krawędzi styku`  
&nbsp;&nbsp;`5. ctx.restore() // Zwolnienie clipa`  
&nbsp;&nbsp;`6. Rysuj czarny kontur tuszu obrysu dachu B_i (1.0 - 2.0 px)`  
`▼`  
`[KROK 4: Warstwa etykiet]`  
`│ Wyświetlenie minimalistycznych oznaczeń H / kondygnacji na wierzchu`

### **Korzyści Architektoniczne Rozwiązania**

> * **Wydajność 60 FPS:** Wykorzystanie wbudowanego mechanizmu ctx.clip() w Canvas 2D eliminuje konieczność używania ciężkich bibliotek do operacji boolowskich na wielokątach w czasie rzeczywistym.  
> * **Czystość kompozycji:** Cień na dachu jest automatycznie przycinany do geometrii budynku niższego, nie wylewając się na zewnątrz w sposób niespójny z rzutem pionowym.  
> * **Czytelność uskoków:** Schodkowe bryły tarasowe i wieże zyskują natychmiastową czytelność plastyczną, charakterystyczną dla aksonometrii i plansz konkursowych.

Czy obiekty na scenie mogą posiadać dachy skośne/spadowe, czy na tym etapie specyfikacji przyjmujemy wyłącznie dachy płaskie (stropodachy o stałej rzędnej *H*)?

---

*User prompt: Funkcjonalność skosów i spadków nie została jeszcze wprowadzona ale jest przewidziana w planie.*

Response: Architektura modułu „Masterplan White” zostaje oparta na jednolitych rzędnych *H* (stropodachy płaskie), z zachowaniem warstwy abstrakcji geometrycznej przygotowanej pod przyszłe płaszczyzny ze spadkiem.

### **1\. Abstrakcja Modelu Danych (Future-Proofing)**

Aby wprowadzenie dachów skośnych nie wymagało przebudowy całego silnika cieniowania, geometria dachu zostaje odseparowana od obrysu gruntu (footprintu):

`// Struktura przygotowana na rozbudowę o skosy`  
`export interface BuildingRoofDefinition {`  
&nbsp;&nbsp;`type: 'flat' | 'pitched'; // Na ten moment wspierane wyłącznie 'flat'`  
&nbsp;&nbsp;`baseElevation: number;     // Rzędna posadowienia (Z0)`  
&nbsp;&nbsp;`height: number;            // Wysokość attyki / kalenicy (Z_max)`  
&nbsp;&nbsp;  
&nbsp;&nbsp;`// Pola rezerwowe pod planowane spadki:`  
&nbsp;&nbsp;`slopeDeg?: number;         // Kąt nachylenia połaci`  
&nbsp;&nbsp;`ridgeAxis?: [number, number][]; // Linia kalenicy`  
&nbsp;&nbsp;`eaveHeight?: number;       // Wysokość okapu (Z_min dachu)`  
`}`

> * **Podejście bieżące (Dachy Płaskie):** Każdy budynek traktowany jest jako pryzma o stałym *H*. Różnica wysokości Δ*H* na całej powierzchni styku jest stałą skalarną:  
>   Δ*H*\=*HA*​−*HB*​\=const  
> * **Ścieżka rozszerzenia (Dachy Skośne):** W momencie wdrożenia spadków dach przestanie być pojedynczym wielokątem, a stanie się zbiorem faset (połaci). Algorytm Δ*H* zamiast jednej stałej przyjmie interpolację wysokości płaszczyzny *Z*(*x*,*y*) dla każdego wierzchołka krawędzi rzucającej i odbierającej.

### **2\. Krawędzie Rzucające Cień (Silhouette Extraction)**

Cień na płaskich dachach rzucają wyłącznie najwyższe krawędzie zewnętrzne bryły (attyki):

> * Dla każdego budynku *A* wyznaczany jest wektor obrysu 2D wierzchołków zorientowanych przeciwsłonecznie.  
> * Wektor przesunięcia cienia na dachu niższego obiektu *B* wynosi:  
>   *Vroof*​(*A*→*B*)=tan(*α*)*HA*​−*HB*​​⋅\[−sin(*θ*)−cos(*θ*)​\]  
>   *(gdzie α to elewacja, a θ azymut słońca)*.  
> * Krawędzie nie generują artefaktów само-zacienienia (self-shadowing), ponieważ płaski dach obiektu *A* znajduje się na tej samej rzędnej co jego krawędzie rzucające cień.

### **3\. Matryca Interakcji Pomiędzy Budynkami**

Przeliczanie relacji wysokościowych odbywa się w oparciu o prostą macierz sąsiedztwa i bufor kolizji (Bounding Box / Envelope):

&nbsp;

| Relacja wysokości | Rzut na grunt (*Z*\=0) | Rzut na dach sąsiada (*Z*\=*HB*​) |
| :---- | :---- | :---- |
| ***HA*****​\>*HB*​** | Budynek *A* rzuca pełny cień *HA*​ | Budynek *A* rzuca cień zredukowany Δ*H*\=*HA*​−*HB*​ przycięty maską (clip) do obrysu dachu *B* |
| ***HA*****​\=*HB*​** | Obie bryły rzucają cień na grunt | Brak cienia wzajemnego na dachach |
| ***HA*****​\<*HB*​** | Budynek *A* rzuca pełny cień *HA*​ | Budynek *A* nie rzuca cienia na *B*; ściana *B* rzuca cień na dach *A* |

### **4\. Optymalizacja Graficzna: Kolejka Renderowania Dachów**

Dla zapewnienia płynnego działania przy zmianie godziny słońca (60 FPS na Canvas 2D) obiekty grupowane są w warstwy wysokościowe:

> 1. **Ekstrakcja brył wyższych:** Budynki sortowane są jednorazowo wg wysokości *H* rosnąco.  
> 2. **Jednoprzebiegowy bufor cieni dachowych:**  
   * Podczas renderowania dachu budynku o wysokości *Hi*​, odpytywane są wyłącznie te budynki wyższe (*Hk*​\>*Hi*​), których maksymalny promień cienia *Lmax*​\=tan(*αmin*​)*Hk*​−*Hi*​​ przecina prostokąt otaczający (AABB) badanego dachu.  
> 3. **Rysunek tuszem na zakończenie:** Obrysy dachów (kreska tuszowa 1.5 px) nakładane są po wyrenderowaniu wszystkich cieni dachowych, co gwarantuje ostre, czytelne krawędzie bez zamazywania czarnych linii przez cień.

Czy w widoku „Masterplan White” przełączanie między nim a standardowym widokiem CAD ma odbywać się za pomocą dedykowanego przycisku na górnym pasku HUD, czy jako niezależna zakładka widoku roboczego?

---

*User prompt: Na pasku górnym.*

Response: Przełącznik widoku zostanie zintegrowany w centralno-prawej części górnego paska CadTopHud jako segmentowy selektor trybów widoku 2D.

### **1\. Umiejscowienie i Wygląd w CadTopHud**

Przełącznik przyjmuje formę minimalistycznego, dwupozycyjnego przełącznika kapsułkowego (segmented pill control), spójnego z estetyką interfejsu.

`┌─────────────────────────────────────────────────────────────────────────────────────────┐`  
`│ [Logo / Projekt ▼]           [ 📐 CAD | 📄 Plan ]              [ ☀️ 11:30 ] [Prezentacja 3D] │`  
`└─────────────────────────────────────────────────────────────────────────────────────────┘`

> * **Lokalizacja:** Pasek CadTopHud, bezpośrednio obok kontrolek skali/zoomu lub po lewej stronie zegara słonecznego.  
> * **Segmenty:**  
  * 📐 CAD – widok techniczny (ciemny/roboczy, aktywne narzędzia rysowania, siatka, snapy, kolorowe obrysy).  
  * 📄 Plan (Masterplan White) – widok prezentacyjny 2D (biały arkusz tuszowy, plamy geodezyjne, cienie Δ*H*, AO).  
> * **Stylowanie (Tailwind CSS):**  
  * Kontener: bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center.  
  * Aktywny segment: bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm font-medium px-3 py-1 rounded-md text-xs transition-all.  
  * Nieaktywny segment: text-slate-500 hover:text-slate-700 dark:text-slate-400 px-3 py-1 text-xs transition-all.

### **2\. Stan Aplikacji (useUiStore)**

W store interfejsu (src/store/useUiStore.ts) dodawana jest flaga kontrolująca bieżący tryb renderowania rzutu:

`export type ViewportMode2D = 'cad' | 'masterplan_white';`

`interface UiState {`  
&nbsp;&nbsp;`// ... dotychczasowe stany`  
&nbsp;&nbsp;`viewMode2D: ViewportMode2D;`  
&nbsp;&nbsp;`setViewMode2D: (mode: ViewportMode2D) => void;`  
&nbsp;&nbsp;`toggleViewMode2D: () => void;`  
`}`

> * **Skrót klawiszowy:** Klawisz V lub kombinacja Space \+ Tab – szybki toggle pomiędzy widokiem edycyjnym a tuszowym bez odrywania rąk od myszy.

### **3\. Zachowanie Viewportu i Współdzielenie Kamery**

Przełączenie widoku nie resetuje kadru:

> * **Ciągłość współrzędnych:** Macierz transformacji (przesunięcie pan (*X*,*Y*) oraz powiększenie zoom) jest współdzielona. Przełączenie w tryb 📄 Plan zachowuje dokładnie ten sam wycinek terenu, który użytkownik oglądał w trybie CAD.  
> * **Płynne przejście:** Opcjonalny cross-fade (\~150 ms) pomiędzy buforami wygasza techniczne wektory CAD na rzecz plam barwnych i cieni.

### **4\. Adaptacja Pasków Narzędziowych w Trybie „Masterplan White”**

Gdy aktywny jest widok 📄 Plan, elementy interfejsu automatycznie dostosowują się do charakteru prezentacyjnego:

&nbsp;

| Komponent UI | Stan w trybie CAD | Stan w trybie Plan (Masterplan White) |
| :---- | :---- | :---- |
| **Boczny pasek narzędzi (CadToolBar)** | Aktywne narzędzia rysowania, edycja wierzchołków | Automatycznie zwinięty lub ograniczony wyłącznie do rączki (Pan) i lupy |
| **Dolna legenda (CadLegendBottom)** | Klasyfikacja budynków, warstwy CAD | Uproszczona legenda urbanistyczna (Zieleń, Woda, Projekt, Zastany) |
| **Punkty przyciągania (Snapping)** | Włączone, widoczne znaczniki | Całkowicie ukryte |
| **Słońce i czas** | Wskaźnik kąta / scrubber | Pełny dostęp do suwaka czasu (animacja cieni na żywo) |

Czy w trybie „Masterplan White” użytkownik powinien mieć możliwość zaznaczania budynków w celu podglądu ich parametrów w panelu bocznym, czy widok ten ma być całkowicie zablokowany przed jakimkolwiek zaznaczaniem obiektów?

---

*User prompt: Tak, to jest inny tryb wyświetlania do tej samej pracy.*

### **Response: Specyfikacja Interakcji i Zaznaczania w Widoku „Masterplan White”**

Widok „Masterplan White” funkcjonuje jako estetyczna, alternatywna warstwa renderująca (skórka roboczo-prezentacyjna) operująca bezpośrednio na useSceneStore. Użytkownik zachowuje pełną ciągłość pracy nad modelem – może wskazywać obiekty, weryfikować ich parametry oraz korzystać z panelu modyfikatorów wraz z oknem podglądu izometrycznego 1:1.

### **1\. Stylizacja Zaznaczenia w Estetyce Tuszowej**

Tradycyjne markery CAD (neonowe obwódki, agresywne bounding-boxy, jaskrawe wierzchołki) zostają zastąpione minimalistycznymi akcentami graficznymi, spójnymi z charakterem planszy architektonicznej:

> * **Stan najechania (Hover):**  
  * Wypełnienie dachu zmienia ton z czystej bieli na bardzo subtelny, ciepły odcień kości słoniowej (\#F3F4F6 lub \#FEF3C7 z przezroczystością 20%).  
  * Kursor przyjmuje standardowy stan pointer.  
> * **Stan zaznaczenia (Selection):**  
  * **Podwójny kontur tuszowy:** Wokół obrysu dachu pojawia się zewnętrzny, równoległy kontur o grubości 1.0 px odsunięty o 3 px na zewnątrz (tzw. techniczny podwójny obrys kreskowy).  
  * **Subtelny akcent barwny:** Alternatywnie obrys budynku zmienia kolor z czerni na głęboki grafitowy błękit (\#1E3A8A) lub elegancki kobalt (\#2563EB) o grubości 2.5 px.  
  * **Ukrycie wierzchołków (Vertex Nodes):** Punkty załamania krawędzi pozostają niewidoczne, aby nie zaburzać czytelności rysunku. Punkty kontrolne pojawiają się dopiero w momencie jawnego przejścia do edycji geometrii.

`Zwykły budynek:           Zaznaczony w trybie "Masterplan White":`  
`┌──────────────┐         ╔══════════════╗ ◄── Podwójny obrys techniczny`  
`│              │         ║ ┌──────────┐ ║     lub akcent kobaltowy`  
`│     Dach     │   ──►   ║ │   Dach   │ ║`  
`│              │         ║ └──────────┘ ║`  
`└──────────────┘         ╚══════════════╝`

### **2\. Sprzężenie z Panelem Właściwości i Podglądem 1:1**

Kliknięcie budynku w widoku Masterplan natychmiast synchronizuje interfejs boczny:

> * **Otwarcie panelu obiektu:** Wysunięcie panelu bocznego z parametrami zaznaczonego budynku (height, storeys, kategoria, rzędna posadowienia).  
> * **Aktywacja okna podglądu 1:1:**  
  * W panelu natychmiast pojawia się kwadratowy widok izometryczny wybranego obiektu.  
  * Zmieniając wysokość budynku *H* lub liczbę kondygnacji w panelu, użytkownik widzi **jednoczesną, płynną aktualizację w obu miejscach**:  
    1. W kwadracie 1:1 rośnie przestrzenna bryła 3D i przybywa linii stropów.  
    2. Na rzucie głównym Masterplan White natychmiast wydłuża się cień gruntowy oraz cień rzucany na dachy niższych budynków sąsiednich (Δ*H*).

### **3\. Narzędzia Manipulacji i Transformacji**

Dla zachowania czystości wizualnej planszy edycja przestrzenna podlega regułom kontekstowym:

&nbsp;

| Operacja | Zachowanie w CAD | Zachowanie w Masterplan White |
| :---- | :---- | :---- |
| **Przesuwanie obiektu (Drag & Drop)** | Widoczny pełny wektor przemieszczenia i linie snapowania | Płynne przesuwanie bryły wraz z dynamicznie śledzącym ją cieniem; linie snapowania rysowane wyłącznie jako ultra-cienkie szare linie pomocnicze (0.5 px) |
| **Obrót (Rotation)** | Okrągły gizmo obrotu z kątomierzem | Dyskretny uchwyt obrotu w jednym z narożników lub rotacja numeryczna w panelu bocznym |
| **Edycja wierzchołków** | Zawsze aktywne węzły edycyjne na krawędziach | Węzły aktywowane dopiero po dwukliku (Double Click) w obrys budynku |
| **Zaznaczenie wielokrotne** | Ramka selekcji z jaskrawym wypełnieniem | Ramka selekcji w formie cienkiej linii przerywanej z delikatnym szarym tłem (rgba(0,0,0,0.03)) |

### **4\. Wydajność Renderera przy Zaznaczaniu**

> * **Oddzielny bufor selekcji:** Geometria podkładu geodezyjnego, cienie i AO są buforowane na warstwie podkładowej (offscreen canvas).  
> * **Warstwa wierzchnia (Interaction Layer):** Podświetlenie selekcji, hover oraz przesuwane obiekty są rysowane na transparentnej warstwie wierzchniej. Dzięki temu klikanie i przesuwanie budynku nie wymaga ponownego rastrowania całej mapy geodezyjnej ani przeliczania cieni obiektów statycznych.

Czy w przypadku zaznaczenia budynku rzucającego cień, sam cień tego obiektu ma również otrzymywać subtelne wyróżnienie (np. akcent krawędzi cienia), ułatwiające ocenę zasięgu jego oddziaływania na otoczenie?

---

