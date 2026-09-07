# 🎬 System Nagrywania Demo i Makro Scenariuszy (USI Light 2.5D)

Niniejszy dokument opisuje architekturę, metodykę wyzwalania, sterowanie stanem Zustand oraz specyfikację wszystkich dostępnych funkcji i komend modułu automatycznego nagrywania demo (`DemoRecorder`).

> [!IMPORTANT]
> **Moduł lokalny (Dev-only)**: Cały kod narzędzia wykluczony jest z buildu produkcyjnego. Guard `import.meta.env.DEV` gwarantuje, że kod nie trafia do paczki `dist/` (tree-shaking Vite).

---

## 1. Architektura i Przepływ Danych

System składa się z 3 głównych warstw:
1. **Przechwytywanie strumienia Canvas (`src/utils/canvasRecorder.ts`)**: Używa `HTMLCanvasElement.captureStream(60fps)` i `MediaRecorder` (VP9 / 8 Mbps).
2. **Silnik Sekwencjonowania Stanu (`src/utils/demoRunner.ts`)**: Bezpośrednia manipulacja magazynami Zustand (`useSceneStore`, `useSolarAnalysisStore`, `useCadToolStore`) poza cyklem renderowania Reacta.
3. **Hook Wyzwalający (`src/hooks/useDemoRecorder.ts`)**: Odpowiada za detekcję URL/skrótów, dopasowanie proporcji (format 1:1) oraz zarządzanie cyklem życia nagrania.

---

## 2. Metody Wyzwalania Nagrywania

### 2.1. Wyzwalacz URL (URL Query Parameter)
Dodaj parametr `recordDemo=<nazwa_scenariusza>` do adresu URL w przeglądarce:
- `http://localhost:3000/?recordDemo=solar`

### 2.2. Skrót Klawiaturowy
W dowolnym momencie pracy w trybie deweloperskim wciśnij:
- `Ctrl + Shift + D` – uruchamia domyślny scenariusz (`solar`).

---

## 3. Format i Parametry Nagrania

- **Format pliku**: WebM (z priorytetem kodeka VP9: `video/webm; codecs=vp9`)
- **Klatkarz (FPS)**: 60 FPS
- **Bitrate**: 8,000,000 bps (8 Mbps – ostre linie wektorowe CAD)
- **Proporcje obrazu (1:1)**: Podczas nagrywania kontener Canvas automatycznie przyjmuje wymiar `min(window.innerWidth, window.innerHeight)px`, a po zakończeniu przywraca oryginalny układ responsive.

---

## 4. Pełna Specyfikacja API i Komend Sterujących

### 4.1. Sterowanie Czasem i Animacją (`demoRunner.ts`)

| Funkcja | Opis | Przykład użycia |
| :--- | :--- | :--- |
| `wait(ms: number)` | Wstrzymuje wykonanie scenariusza na podany czas w milisekundach. | `await wait(800);` |
| `animateValue(durationMs, onStep)` | Animuje wartość postępu od `0` do `1` przez czas `durationMs` z wygładzeniem `easeInOutCubic`. | `await animateValue(1400, (t) => { ... });` |

---

### 4.2. Operacje na Scenie (`useSceneStore.getState()`)

| Komenda / Metoda | Opis | Przykład użycia |
| :--- | :--- | :--- |
| `loadSceneData(data)` | Ładuje kompletną scenę z pliku JSON (np. `start.json`). | `scene.loadSceneData(startScene);` |
| `setBuildings(buildings)` | Czyści lub ustawia całą tablicę obiektów. | `scene.setBuildings([]);` |
| `setSelectedBuildingId(id)` | Zaznacza obiekt o danym ID (lub `null` aby odznaczyć). | `scene.setSelectedBuildingId('bldg-123');` |
| `addBuilding(building)` | Dodaje nowy obiekt do sceny. | `scene.addBuilding(newBldg);` |
| `updateBuildingVertices(id, verts)` | Płynnie podmienia wierzchołki obiektu (automatycznie przelicza segmenty i modyfikatory). | `scene.updateBuildingVertices(id, newVerts);` |
| `addBuildingModifier(id, modifier)` | Dodaje modyfikator geometryczny (`donut`, `terrace`, `bay_window`, `story_offset`). | *patrz sekcja Modyfikatory* |
| `updateBuildingModifier(id, modId, patch)` | Aktualizuje parametry istniejącego modyfikatora (np. `depth`, `storiesCount`). | `scene.updateBuildingModifier(id, modId, { depth: -8 });` |
| `removeBuildingModifier(id, modId)` | Usuwa modyfikator z budynku. | `scene.removeBuildingModifier(id, modId);` |

#### Przykłady konfiguracji modyfikatorów:

```typescript
// Dziedziniec (Donut)
scene.addBuildingModifier(BUILDING_ID, {
  id: 'demo-mod-donut',
  type: 'donut',
  enabled: true,
  name: 'Dziedziniec (Donat)',
  offset: -10,      // odsunięcie 10m do wnętrza
  storiesCount: 0,  // cała wysokość
});

// Taras / Uskok (Terrace)
scene.addBuildingModifier(BUILDING_ID, {
  id: 'demo-mod-terrace',
  type: 'terrace',
  enabled: true,
  name: 'Taras',
  depth: -4,         // uskok -4m do wnętrza
  storiesCount: -3,  // 3 kondygnacje od góry
  edgeIndex: 0,      // krawędź bazowa
});
```

---

### 4.3. Sterowanie Analizą Słoneczną (`useSolarAnalysisStore.getState()`)

| Komenda / Metoda | Opis | Przykład użycia |
| :--- | :--- | :--- |
| `setShowShadowingLines(show)` | Włącza/wyłącza linie i promienie przesłaniania § 13. | `solar.setShowShadowingLines(true);` |
| `setShowSunlightLines(show)` | Włącza/wyłącza widok linii nasłonecznienia § 60. | `solar.setShowSunlightLines(true);` |
| `setShowShadowRange(show)` | Włącza/wyłącza zakresy/koperty cienia. | `solar.setShowShadowRange(true);` |
| `setShowShadowFill(show)` | Włącza/wyłącza wypełnienie cienia. | `solar.setShowShadowFill(false);` |
| `setShowNormals(show)` | Włącza/wyłącza wektory normalne elewacji. | `solar.setShowNormals(false);` |
| `setShowAnalysisPoints(show)` | Włącza/wyłącza punkty pomiarowe na elewacji. | `solar.setShowAnalysisPoints(false);` |
| `setSelectedCity(cityName)` | Ustawia miasto (np. `'Warszawa'`, `'Gdańsk'`, `'Poznań'`). | `solar.setSelectedCity('Poznań');` |
| `updateSettings({ latitude, ... })` | Zmienia parametry geograficzne / datę równonocy. | `solar.updateSettings({ latitude: 54.35 });` |

---

### 4.4. Sterowanie Viewportem i Rzutnią (`useCadToolStore.getState()`)

| Komenda / Metoda | Opis | Przykład użycia |
| :--- | :--- | :--- |
| `triggerFit()` | Wyzwala automatyczne wycentrowanie i dopasowanie skali rzutni (Fit to Extents). | `cadTool.triggerFit();` |
| `setViewRotationDeg(deg)` | Ustawia kąt obrotu rzutni CAD. | `cadTool.setViewRotationDeg(45);` |

---

## 5. Przykładowy Kompletny Scenariusz Makro

Oto wzorcowa struktura scenariusza z wygładzonymi zmianami wierzchołków i parametrów:

```typescript
export async function runCustomDemo(): Promise<void> {
  const scene = useSceneStore.getState();
  const solar = useSolarAnalysisStore.getState();
  const cadTool = useCadToolStore.getState();

  // 1. Inicjalizacja sceny ze start.json & wyłączenie analiz
  const startScene = (await import('../../reference/start.json')).default;
  scene.loadSceneData(startScene as any);
  solar.setShowShadowingLines(false);
  solar.setShowSunlightLines(false);

  await wait(800);

  // 2. Zoom do obszaru sceny
  cadTool.triggerFit();
  await wait(350);

  const TARGET_ID = 'bldg-1788717474779';

  // 3. Płynne przesunięcie krawędzi (animacja wierzchołków)
  const snapVerts = scene.buildings.find(b => b.id === TARGET_ID)?.vertices.map(v => ({...v})) ?? [];
  await animateValue(1400, (t) => {
    const animated = snapVerts.map((v, i) =>
      i === 0 || i === 1 ? { x: v.x, y: v.y + t * 12 } : v
    );
    scene.updateBuildingVertices(TARGET_ID, animated);
  });

  // 4. Modyfikacja tarasu
  scene.addBuildingModifier(TARGET_ID, {
    id: 'demo-terrace',
    type: 'terrace',
    enabled: true,
    depth: -4,
    storiesCount: -3,
  });

  // Płynna zmiana głębokości uskoku
  await animateValue(1800, (t) => {
    scene.updateBuildingModifier(TARGET_ID, 'demo-terrace', { depth: -4 + t * (-4) });
  });

  // 5. Włączenie wyników analizy
  solar.setShowSunlightLines(true);
  solar.setShowShadowRange(true);
  await wait(1200);
}
```
