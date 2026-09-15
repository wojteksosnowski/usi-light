# 🎬 System Rejestracji Działań na Żywo i Odtwarzania Sesji (USI Light 2.5D)

Niniejszy dokument opisuje architekturę, format danych, silnik przechwytywania wideo Canvas, rejestrację stanów pośrednich oraz silnik odtwarzania (Replay Engine) w aplikacji **USI Light 2.5D**.

> [!IMPORTANT]
> **Moduł lokalny (Dev-only)**: Cały kod narzędzia wykluczony jest z buildu produkcyjnego. Guard `import.meta.env.DEV` gwarantuje, że kod nie trafia do paczki produkcyjnej (tree-shaking Vite).

---

## 1. Architektura i Przepływ Danych

System oparty jest o 4 kluczowe moduły w `src/modules/action-recorder/`:
1. **Silnik Przechwytywania Canvas i Zdarzeń (`ActionRecorderEngine.ts`)**:
   - Wykorzystuje `HTMLCanvasElement.captureStream(60fps)` i `MediaRecorder` (VP9 / 8 Mbps).
   - Rejestruje ruchy kursora myszy, kliknięcia (LPM, PPM, drag) i wciśnięte klawisze modyfikatorów.
   - Subskrybuje zmiany w magazynach Zustand (`useSceneStore`, `useSolarAnalysisStore`, `useCadToolStore`) z precyzyjnymi znacznikami czasu `timestampMs`.
2. **Warstwa Wizualna Potoku Renderowania (`RecorderVisualsLayer.ts`)**:
   - Renderuje wirtualny kursor i rozchodzące się animowane fale kliknięć (Click Ripples) bezpośrednio na canvasie (dzięki czemu są widoczne w nagraniu wideo).
   - Wyświetla HUD wciśniętych skrótów klawiaturowych (`Shift`, `Del`, `Ctrl`, `Fit`).
   - Wyświetla wskaźnik nagrywania `● REC [00:04.2]`.
3. **Deterministyczny Silnik Odtwarzania (`ActionReplayer.ts`)**:
   - Wczytuje stan początkowy sesji i odtwarza strumień zdarzeń krok po kroku w aplikacji w zadanym tempie (0.5x, 1x, 1.5x, 2x).
   - Umożliwia suwakowanie czasu (scrubbing), pauzowanie i inspekcję geometrii.
4. **Katalog Nagrań i Sesji (`actionRecorderStorage.ts` & `SessionCatalogModal.tsx`)**:
   - Magazyn IndexedDB przechowujący pliki wideo WebM oraz pliki sesji JSON.
   - Umożliwia odtworzenie nagrania, pobranie wideo `.webm`, pobranie sesji `.json` oraz import zewnętrznych sesji JSON.

---

## 2. Metody Wyzwalania i Sterowania

### 2.1. Skrót Klawiaturowy
W dowolnym momencie w trybie deweloperskim wciśnij:
- **`~`** (klawisz tyldy / backquote) – uruchamia lub zatrzymuje nagrywanie (zabezpieczony przed wyzwalaniem w trakcie edycji w polach tekstowych).
- Po zatrzymaniu pliki wideo (`.webm`) i dziennik sesji (`.json`) są automatycznie pobierane oraz zapisywane w lokalnym katalogu IndexedDB.

### 2.2. Kafel „Narzędzia Deweloperskie” w Panelu Bocznym
W kafelku dostępne są:
- Przycisk **Nagraj akcje [~]** / **Zatrzymaj nagranie**.
- Przełącznik formatu kadru:
  - `1:1 Kwadrat` – optymalny do mediów społecznościowych i changelogów.
  - `16:9 Wideo` – format wideo/YouTube.
  - `Pełny` – pełny rozmiar rzutni.
- Przełącznik formatu wyjściowego pliku:
  - `MP4` – uniwersalny kodek H.264 / AVC z automatycznym fallbackiem przeglądarkowym.
  - `WEBM` – wysoka kompresja VP9.
  - `GIF` – lekka animacja poklatkowa (Pure TypeScript Canvas LZW encoder) do dokumentacji i czatów.
- Szybkie przełączniki:
  - `Kursor` – włącza/wyłącza wirtualny kursor i fale kliknięć.
  - `HUD` – włącza/wyłącza dymek wciśniętych skrótów klawiatury.
  - `3s` – włącza/wyłącza odliczanie 3-2-1 przed startem nagrywania.
  - `3D` – włącza/wyłącza pływające okno podglądu 3D bryły.
- Przycisk **Katalog Nagrań i Sesji** – otwiera pełny menedżer nagrań z możliwością pobierania wideo, sesji JSON oraz kompletnych paczek archiwalnych **ZIP** (Wideo + JSON + Raport `info.txt`).

---

## 3. Okno Podglądu 3D (Picture-in-Picture) w Polu Nagrywania

Podczas nagrywania lub pracy w trybie deweloperskim w rogu rzutni wyświetlane jest pływające okno 3D (`Recording3DPipWindow.tsx`):
- **Model 3D w czasie rzeczywistym**: Prezentuje bryłę aktywnego lub projektowanego budynku wraz z kondygnacjami, uskokami, tarasami i modyfikatorami 2.5D.
- **Pieczenie do strumienia wideo (60 FPS)**: Klatki z widoku 3D Three.js WebGL są w czasie rzeczywistym przenoszone na główny canvas CAD przez warstwę `RecorderVisualsLayer`, dzięki czemu wygenerowane wideo WebM/MP4/GIF zawiera wbudowane okno 3D.
- **Kontrolki**:
  - Obrót kamery (krok 45°: N, NE, E, SE, S, SW, W, NW).
  - Przełącznik widoku rentgenowskiego kondygnacji (X-Ray).
  - Zmiana rozmiaru (S, M, L).
  - Pozycjonowanie (Prawy dół, Prawa góra, Lewy dół).

---

## 3. Format Danych Sesji (`ActionSession`)

```typescript
export interface ActionSessionEvent {
  timestampMs: number;
  type:
    | 'pointer_move'
    | 'pointer_down'
    | 'pointer_up'
    | 'key_down'
    | 'key_up'
    | 'scene_state'
    | 'solar_state'
    | 'cad_state';
  payload: any;
}

export interface ActionSession {
  id: string;
  version: 1;
  title: string;
  createdAt: string;
  durationMs: number;
  aspectRatio: '1:1' | '16:9' | 'viewport';
  viewport: {
    width: number;
    height: number;
  };
  initialState: {
    scene: any;
    solar: any;
    cad: any;
  };
  events: ActionSessionEvent[];
}
```

---

## 4. Odtwarzacz Sesji (Replay Engine)

Po wybraniu sesji w katalogu lub zaimportowaniu pliku JSON:
1. Aplikacja przywraca stan początkowy sceny, analizy nasłonecznienia oraz kamery.
2. Na dole ekranu pojawia się pływający pasek sterowania:
   - **Play / Pause**
   - **Przewijanie od początku**
   - **Oś czasu / Suwak (Scrubber)**
   - **Przełącznik prędkości (0.5x, 1x, 1.5x, 2x)**
   - **Zamknij odtwarzacz**
