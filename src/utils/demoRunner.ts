// src/utils/demoRunner.ts
// ⚠️ NARZĘDZIE MARKETINGOWE — TYLKO LOCAL DEV

import { useSceneStore } from '../store/useSceneStore';
import { useSolarAnalysisStore } from '../store/useSolarAnalysisStore';
import { useCadToolStore } from '../store/useCadToolStore';

export const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Animuje wartość 0→1 z easingiem easeInOutCubic.
 * Wywołuje `onStep(eased)` przy każdej klatce animacji (requestAnimationFrame).
 */
export async function animateValue(
  durationMs: number,
  onStep: (eased: number) => void
): Promise<void> {
  const start = performance.now();
  return new Promise((resolve) => {
    function frame(now: number) {
      const p = Math.min((now - start) / durationMs, 1);
      const eased =
        p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      onStep(eased);
      if (p < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}

// ---------------------------------------------------------------------------
// Scenariusz: Analiza nasłonecznienia z modyfikatorami 2.5D i edycją krawędzi
// ---------------------------------------------------------------------------
// Sekwencja:
//  1. Załadowanie sceny startowej (start.json) + wyłączenie warstw analiz
//  2. Dodanie budynku projektowanego ~50×70 m
//  3. triggerFit() — zoom do obiektu
//  4. Płynne przesunięcie dwóch krawędzi (ease-in/out)
//  5. Dodanie modyfikatora Donat (dziedziniec)
//  6. Dodanie modyfikatora Taras + płynna zmiana depth do -8
//  7. Włączenie analizy nasłonecznienia
// ---------------------------------------------------------------------------
export async function runSolarDemo(): Promise<void> {
  const scene = useSceneStore.getState();
  const solar = useSolarAnalysisStore.getState();
  const cadTool = useCadToolStore.getState();

  // ── 1. Załaduj scenę startową ze start.json ────────────────────────────
  // Import dynamiczny — Vite bundluje JSON jako moduł ES.
  // Cały blok jest dead code w PROD dzięki guardowi import.meta.env.DEV
  // w useDemoRecorder.ts (demoRunner nie jest importowany bezpośrednio w produkcji).
  const startScene = (await import('../../reference/start.json')).default;
  scene.loadSceneData(startScene as any);

  // Hydratacja ustawień solarnych z pliku (selectedCity, settings, itp.)
  if (startScene.selectedCity) {
    solar.setSelectedCity(startScene.selectedCity);
  }
  if (startScene.settings) {
    solar.updateSettings(startScene.settings as any);
  }

  // ── Wyłącz wszystkie warstwy analiz przed demonstracją ────────────────
  solar.setShowShadowingLines(false);
  solar.setShowSunlightLines(false);
  solar.setShowShadowRange(false);
  solar.setShowShadowFill(false);
  solar.setShowNormals(false);
  solar.setShowAnalysisPoints(false);

  await wait(800);

  // Cel wszystkich operacji: budynek projektowany z start.json (isTested: true)
  // Nie dodajemy nowego budynku — operujemy bezpośrednio na istniejącym
  const DEMO_ID = 'bldg-1788717474779';

  // ── 4. Zoom-to-fit — dopasowanie viewportu do budynku ─────────────────
  cadTool.triggerFit();
  await wait(350); // czekamy na re-render Reacta i przeliczenie viewportu

  // ── 5a. Płynne przesunięcie górnej krawędzi: +12 m w górę (dy=+12) ────
  // Górna krawędź budynku 50×70: edgeIndex=2 (v2=(50,70)→v3=(0,70))
  // offsetPolygonEdge przesuwa krawędź równolegle w kierunku normalnej
  await wait(600);

  // Animacja przez snapshot wierzchołków — precyzja bez akumulacji delt.
  {
    const bldgSnap = useSceneStore.getState().buildings.find((b) => b.id === DEMO_ID);
    const snapVerts = bldgSnap?.vertices.map((v) => ({ ...v })) ?? [];
    // Górna krawędź to wierzchołki v2=(50,70) i v3=(0,70) — indeksy 2 i 3
    const EDGE_SHIFT_Y = 12; // przesuniecie o +12m ku gorze

    await animateValue(1400, (t) => {
      const animated = snapVerts.map((v, i) =>
        i === 2 || i === 3 ? { x: v.x, y: v.y + t * EDGE_SHIFT_Y } : v
      );
      scene.updateBuildingVertices(DEMO_ID, animated);
    });
  }

  await wait(700);

  // ── 5b. Płynne przesunięcie prawej krawędzi: +10 m w prawo (dx=+10) ───
  // Prawa krawędź: v1=(50,0)→v2=(50,82) po poprzednim kroku — indeksy 1 i 2
  {
    const bldgSnap2 = useSceneStore.getState().buildings.find((b) => b.id === DEMO_ID);
    const snapVerts2 = bldgSnap2?.vertices.map((v) => ({ ...v })) ?? [];
    const EDGE_SHIFT_X = 10; // przesuniecie o +10m w prawo

    await animateValue(1400, (t) => {
      const animated = snapVerts2.map((v, i) =>
        i === 1 || i === 2 ? { x: v.x + t * EDGE_SHIFT_X, y: v.y } : v
      );
      scene.updateBuildingVertices(DEMO_ID, animated);
    });
  }

  await wait(900);

  // ── 6. Modyfikator Donat — dziedziniec wewnętrzny ─────────────────────
  scene.addBuildingModifier(DEMO_ID, {
    id: 'demo-mod-donut',
    type: 'donut',
    enabled: true,
    name: 'Dziedziniec (Donat)',
    offset: -10,      // odsunięcie otworu 10 m do wnętrza
    storiesCount: 0,  // cała wysokość
  });

  await wait(1800);

  // ── 7a. Modyfikator Taras (uskok startowy depth=-4) ───────────────────
  const TERRACE_ID = 'demo-mod-terrace';
  scene.addBuildingModifier(DEMO_ID, {
    id: TERRACE_ID,
    type: 'terrace',
    enabled: true,
    name: 'Taras',
    depth: -4,         // startowa głębokość uskoku
    storiesCount: -3,  // 3 kondygnacje od góry
    edgeIndex: 0,
  });

  await wait(1000);

  // ── 7b. Płynna zmiana depth Tarasu: -4 → -8 ──────────────────────────
  // updateBuildingModifier akceptuje Partial<Modifier>, przelicza modyfikatory po każdej zmianie
  await animateValue(1800, (t) => {
    const depth = -4 + t * (-4); // -4 → -8
    scene.updateBuildingModifier(DEMO_ID, TERRACE_ID, { depth });
  });

  await wait(1000);

  // ── 8. Włączenie analizy nasłonecznienia ──────────────────────────────
  solar.setShowSunlightLines(true);
  solar.setShowShadowRange(true);

  await wait(400);

}

// src/utils/demoRunner.ts

/**
 * Scenariusz 1: Eliminacja przesłaniania (§ 13 WT) uskokiem kondygnacji
 * Czas trwania: ~8 sekund
 */
export async function runShadowingComplianceDemo(): Promise<void> {
  const scene = useSceneStore.getState();
  const solar = useSolarAnalysisStore.getState();
  const cadTool = useCadToolStore.getState();

  // 1. Ładowanie sceny bazowej
  const startScene = (await import('../../reference/start.json')).default;
  scene.loadSceneData(startScene as any);

  // Włączamy linie przesłaniania i punkty analizy na elewacjach
  solar.setShowSunlightLines(false);
  solar.setShowShadowRange(false);
  solar.setShowShadowingLines(true);
  solar.setShowAnalysisPoints(true);
  solar.setShowNormals(false);

  await wait(600);
  cadTool.triggerFit();
  await wait(500);

  const DEMO_ID = 'bldg-1788717474779';
  const MOD_ID = 'compliance-terrace';

  // 2. Dodajemy startowy uskok na krawędzi kolidującej
  scene.addBuildingModifier(DEMO_ID, {
    id: MOD_ID,
    type: 'terrace',
    enabled: true,
    name: 'Wycofanie kondygnacji § 13',
    depth: -1,         // płytki uskok początkowy (jeszcze koliduje)
    storiesCount: -4,  // ostatnie 4 kondygnacje
    edgeIndex: 0,
  });

  await wait(800);

  // 3. Płynne pogłębianie uskoku bryły (linie przesłaniania dynamicznie ustępują)
  await animateValue(2200, (t) => {
    const depth = -1 + t * (-9); // od -1m do -10m
    scene.updateBuildingModifier(DEMO_ID, MOD_ID, { depth });
  });

  await wait(1200);

  // 4. Zaakcentowanie rezultatu: włączenie kątów nasłonecznienia dla pełnego obrazu
  solar.setShowSunlightLines(true);
  await wait(1500);
}

/**
 * Scenariusz 2: Dynamiczne przeliczanie koperty cienia w czasie rzeczywistym
 * Czas trwania: ~7 sekund
 */
export async function runRealtimeShadowEnvelopeDemo(): Promise<void> {
  const scene = useSceneStore.getState();
  const solar = useSolarAnalysisStore.getState();
  const cadTool = useCadToolStore.getState();

  const startScene = (await import('../../reference/start.json')).default;
  scene.loadSceneData(startScene as any);

  // Skupiamy się wyłącznie na bryle i rzucanym cieniu
  solar.setShowSunlightLines(false);
  solar.setShowShadowingLines(false);
  solar.setShowShadowRange(true);
  solar.setShowShadowFill(true);

  await wait(500);
  cadTool.triggerFit();
  await wait(400);

  const DEMO_ID = 'bldg-1788717474779';
  const bldg = scene.buildings.find((b) => b.id === DEMO_ID);
  if (!bldg) return;

  const baseVerts = bldg.vertices.map((v) => ({ ...v }));

  // Dynamiczne, elastyczne rozciągnięcie jednego narożnika budynku tam i z powrotem
  // Pokazuje, jak strefa cienia wiernie podąża za zmianą geometrii
  await animateValue(2000, (t) => {
    // Odchylenie narożnika o 25m w dół i 20m w prawo
    const animated = baseVerts.map((v, i) =>
      i === 2 ? { x: v.x + t * 20, y: v.y - t * 25 } : v
    );
    scene.updateBuildingVertices(DEMO_ID, animated);
  });

  await wait(300);

  // Powrót ze skręceniem w drugą stronę
  const currentVerts = scene.buildings.find((b) => b.id === DEMO_ID)!.vertices.map((v) => ({ ...v }));
  await animateValue(1800, (t) => {
    const animated = currentVerts.map((v, i) =>
      i === 2 ? { x: v.x - t * 30, y: v.y + t * 15 } : v
    );
    scene.updateBuildingVertices(DEMO_ID, animated);
  });

  await wait(1200);
}

/**
 * Scenariusz 3: Przekształcenie zwartej bryły w kwartał z doświetlonym patio
 * Czas trwania: ~9 sekund
 */
export async function runPatioSunlightDemo(): Promise<void> {
  const scene = useSceneStore.getState();
  const solar = useSolarAnalysisStore.getState();
  const cadTool = useCadToolStore.getState();

  const startScene = (await import('../../reference/start.json')).default;
  scene.loadSceneData(startScene as any);

  // Konfiguracja widoku pod geometrię i wektory
  solar.setShowShadowingLines(false);
  solar.setShowSunlightLines(true);
  solar.setShowShadowRange(false);
  solar.setShowNormals(true);
  solar.setShowAnalysisPoints(true);

  await wait(500);
  cadTool.triggerFit();
  await wait(500);

  const DEMO_ID = 'bldg-1788717474779';
  const DONUT_ID = 'demo-mod-donut';

  // 1. Wycięcie małego dziedzińca
  scene.addBuildingModifier(DEMO_ID, {
    id: DONUT_ID,
    type: 'donut',
    enabled: true,
    name: 'Dziedziniec wewnętrzny',
    offset: -4,
    storiesCount: 0,
  });

  await wait(600);

  // 2. Płynne powiększenie dziedzińca (drążenie światła w głąb działki)
  // Wewnętrzne elewacje automatycznie zyskują punkty pomiarowe i wektory
  await animateValue(2200, (t) => {
    const offset = -4 + t * (-10); // od -4m do -14m
    scene.updateBuildingModifier(DEMO_ID, DONUT_ID, { offset });
  });

  await wait(800);

  // 3. Włączenie rzutu cienia wewnątrz i na zewnątrz dziedzińca
  solar.setShowShadowRange(true);
  solar.setShowShadowFill(true);

  await wait(1400);
}

/**
 * Scenariusz 4: Zmiana parametrów geograficznych i obrót rzutni
 * Czas trwania: ~8 sekund
 */
export async function runGeoSolarComparisonDemo(): Promise<void> {
  const scene = useSceneStore.getState();
  const solar = useSolarAnalysisStore.getState();
  const cadTool = useCadToolStore.getState();

  const startScene = (await import('../../reference/start.json')).default;
  scene.loadSceneData(startScene as any);

  // Włączenie pełnej analizy nasłonecznienia (§ 60 WT)
  solar.setShowSunlightLines(true);
  solar.setShowShadowRange(true);
  solar.setShowShadowingLines(false);
  solar.setShowNormals(false);
  solar.setShowAnalysisPoints(true);

  await wait(500);
  cadTool.triggerFit();
  await wait(600);

  // 1. Zmiana lokalizacji: Gdańsk (północ, niższe słońce) -> Kraków (południe)
  solar.setSelectedCity('Gdańsk');
  await wait(1200);

  solar.setSelectedCity('Kraków');
  await wait(1200);

  // 2. Płynny obrót rzutni CAD (prezentacja projektu pod innym kątem)
  await animateValue(2000, (t) => {
    const angle = t * 45; // obrót o 45 stopni
    cadTool.setViewRotationDeg(angle);
  });

  await wait(800);

  // 3. Reset obrotu do północy z wycentrowaniem
  await animateValue(800, (t) => {
    cadTool.setViewRotationDeg(45 * (1 - t));
  });
  cadTool.triggerFit();

  await wait(1000);
}

// src/utils/demoRunner.ts

/**
 * Dynamiczny test zderzeniowy: najechanie dwóch brył na siebie,
 * zacienienie punktów fasady na żywo i rozładowanie kolizji tarasem.
 * Czas trwania: ~8.5 s (60 FPS)
 */
export async function runDynamicFacadeClashDemo(): Promise<void> {
  const scene = useSceneStore.getState();
  const solar = useSolarAnalysisStore.getState();
  const cadTool = useCadToolStore.getState();

  // 1. Ładowanie bazy i pełna wizualizacja analizy fasadowej
  const startScene = (await import('../../reference/start.json')).default;
  scene.loadSceneData(startScene as any);

  solar.setShowSunlightLines(true);
  solar.setShowShadowRange(true);
  solar.setShowShadowFill(true);
  solar.setShowAnalysisPoints(true);
  solar.setShowNormals(true);
  solar.setShowShadowingLines(false);

  // 2. Gwarancja obecności dwóch brył naprzeciwko siebie
  let bldg1 = scene.buildings.find((b) => b.id === 'bldg-1788717474779') || scene.buildings[0];
  let bldg2 = scene.buildings.find((b) => b.id !== bldg1?.id);

  if (!bldg2) {
    bldg2 = {
      id: 'demo-bldg-neighbor',
      name: 'Budynek Sąsiedni',
      vertices: [
        { x: 80, y: 15 },
        { x: 125, y: 15 },
        { x: 125, y: 65 },
        { x: 80, y: 65 },
      ],
      height: 24,
      isExisting: true,
    } as any;
    scene.addBuilding(bldg2!);
  }

  cadTool.triggerFit();
  await wait(600);

  const bldg1Id = bldg1.id;
  const bldg2Id = bldg2!.id;

  // Snapshoty pozycji wyjściowych
  const b1Init = scene.buildings.find((b) => b.id === bldg1Id)!.vertices.map((v) => ({ ...v }));
  const b2Init = scene.buildings.find((b) => b.id === bldg2Id)!.vertices.map((v) => ({ ...v }));

  // ── FAZA 1: Najechanie bryły projektowanej wprost na fasadę sąsiada ──
  // Widzimy, jak koperta cienia wchodzi na elewację i gasi punkty nasłonecznienia
  scene.setSelectedBuildingId(bldg1Id);

  await animateValue(1800, (t) => {
    // Budynek 1 przesuwa się dynamicznie w stronę budynku 2 (+24m w prawo, +8m w górę)
    const shiftedB1 = b1Init.map((v) => ({
      x: v.x + t * 24,
      y: v.y + t * 8,
    }));
    scene.updateBuildingVertices(bldg1Id, shiftedB1);
  });

  await wait(400);

  // ── FAZA 2: Jednoczesny manewr obu budynków (wymijanie i rotacja krawędzi) ──
  // Budynek 2 ucieka lekko w dół, podczas gdy Budynek 1 deformuje krawędź elewacji
  const b1Mid = scene.buildings.find((b) => b.id === bldg1Id)!.vertices.map((v) => ({ ...v }));
  const b2Mid = scene.buildings.find((b) => b.id === bldg2Id)!.vertices.map((v) => ({ ...v }));

  await animateValue(2200, (t) => {
    // Budynek 2 cofa się o 12m w prawo i 15m w dół
    const shiftedB2 = b2Mid.map((v) => ({
      x: v.x + t * 12,
      y: v.y - t * 15,
    }));
    scene.updateBuildingVertices(bldg2Id, shiftedB2);

    // Budynek 1 rozciąga krawędź fasady ku sąsiadowi
    const deformedB1 = b1Mid.map((v, idx) =>
      idx === 1 || idx === 2
        ? { x: v.x + t * 8, y: v.y - t * 6 }
        : { x: v.x - t * 4, y: v.y }
    );
    scene.updateBuildingVertices(bldg1Id, deformedB1);
  });

  await wait(500);

  // ── FAZA 3: Wycofanie kondygnacji tarasem – odzyskanie światła na fasadzie ──
  // Dodajemy uskok tarasowy na kolidującej krawędzi i animujemy jego głębokość
  const TERRACE_ID = 'clash-fix-terrace';
  scene.addBuildingModifier(bldg1Id, {
    id: TERRACE_ID,
    type: 'terrace',
    enabled: true,
    name: 'Kaskada doświetlająca',
    depth: -2,
    storiesCount: -4,
    edgeIndex: 1,
  });

  await animateValue(1600, (t) => {
    // Płynne pogłębienie uskoku z -2m do -12m
    const depth = -2 + t * -10;
    scene.updateBuildingModifier(bldg1Id, TERRACE_ID, { depth });
  });

  await wait(400);

  // ── FAZA 4: Finałowy obrót rzutni i odznaczenie bryły ──
  scene.setSelectedBuildingId(null);
  await animateValue(1200, (t) => {
    cadTool.setViewRotationDeg(t * 30);
  });

  await wait(1000);
}