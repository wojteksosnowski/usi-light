import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { computeFullShadowAnalysis, computeHourlyShadowsLive } from './shadowEnvelope';
import { isPointInPolygon, isPointInPolygonWithHoles } from './polygons';
import { Point2D, BuildingLoop, HourlyShadowLoop } from '../../types/geometry';

// Reprodukcja zgłoszenia: cień budynku testowanego `bldg-1790018467979-csp4b` w scenie
// `reference/shadow-bug1.json` wizualnie "przenika" przez footprinty kilku sąsiednich
// budynków WFS na canvasie. Ten test woła BEZPOŚREDNIO produkcyjne funkcje
// (`computeFullShadowAnalysis` — pełna dokładność / spoczynek, oraz `computeHourlyShadowsLive` —
// dokładność 'live' używana podczas przeciągania) na całej, nieprzefiltrowanej scenie, dokładnie
// tak jak robi to `CadCanvas.tsx` (patrz `computeCombinedShadowEnvelope`/`computeHourlyShadowsLive`
// wywołania w CadCanvas.tsx), i sprawdza czy wynikowe poligony cienia zawierają punkty leżące
// wewnątrz footprintu (outer minus holes) zgłoszonych sąsiednich budynków WFS.

const AFFECTED_BUILDING_IDS = [
  '146508_8.1505.19_BUD',
  '146508_8.1508.44_BUD',
  '146508_8.1505.27_BUD',
  '146508_8.1505.25_BUD',
];

function loadShadowBug1(): { buildings: BuildingLoop[]; latitude: number; longitude: number; equinoxDate: 'spring' | 'autumn' } | null {
  const filePath = path.resolve(__dirname, '../../../reference/shadow-bug1.json');
  if (!fs.existsSync(filePath)) return null;
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return {
    buildings: raw.buildings || [],
    latitude: raw.settings?.latitude ?? 52.23,
    longitude: raw.settings?.longitude ?? 21.01,
    equinoxDate: raw.settings?.equinoxDate ?? 'spring',
  };
}

function footprintProbes(bldg: BuildingLoop): Point2D[] {
  const outer = bldg.vertices;
  const cx = outer.reduce((s, p) => s + p.x, 0) / outer.length;
  const cy = outer.reduce((s, p) => s + p.y, 0) / outer.length;
  const probes: Point2D[] = [{ x: cx, y: cy }];
  for (const v of outer) probes.push({ x: v.x + (cx - v.x) * 0.15, y: v.y + (cy - v.y) * 0.15 });
  return probes;
}

function findFootprintLeaks(hourlyShadows: HourlyShadowLoop[], affected: BuildingLoop[]): string[] {
  const violations: string[] = [];
  for (const bldg of affected) {
    const holes = bldg.holes ?? [];
    for (const probe of footprintProbes(bldg)) {
      if (!isPointInPolygonWithHoles(probe, [{ outer: bldg.vertices, holes }])) continue;
      for (const hour of hourlyShadows) {
        for (const poly of hour.polygons) {
          if (isPointInPolygon(probe, poly)) {
            violations.push(
              `${bldg.id}: probe (${probe.x.toFixed(2)}, ${probe.y.toFixed(2)}) inside tested shadow @ offset=${hour.hourOffset}`
            );
            break;
          }
        }
      }
    }
  }
  return violations;
}

// The rendered "shadow range" band on canvas is the UNION across all hours (`envelopeLoops`),
// not any single hour's polygon. It's possible for every individual hourly shadow to correctly
// avoid a neighbour's footprint while the multi-hour UNION of the leftover slivers still
// geometrically covers/encloses that footprint (each hour excludes it for a different reason/angle) —
// this was the actual root cause of the reported leak, so it needs its own check.
function findEnvelopeFootprintLeaks(envelopeLoops: Point2D[][], affected: BuildingLoop[]): string[] {
  const violations: string[] = [];
  for (const bldg of affected) {
    const holes = bldg.holes ?? [];
    for (const probe of footprintProbes(bldg)) {
      if (!isPointInPolygonWithHoles(probe, [{ outer: bldg.vertices, holes }])) continue;
      for (const poly of envelopeLoops) {
        if (isPointInPolygon(probe, poly)) {
          violations.push(`${bldg.id}: probe (${probe.x.toFixed(2)}, ${probe.y.toFixed(2)}) inside envelope union`);
          break;
        }
      }
    }
  }
  return violations;
}

describe('shadow-bug1.json regression: production shadow functions must not leak into neighbour footprints', () => {
  const scene = loadShadowBug1();

  it('computeFullShadowAnalysis (final accuracy / at rest)', { timeout: 60000 }, () => {
    if (!scene) return;
    const affected = scene.buildings.filter((b) => AFFECTED_BUILDING_IDS.includes(b.id));
    expect(affected.length).toBe(AFFECTED_BUILDING_IDS.length);

    const result = computeFullShadowAnalysis(scene.buildings, scene.latitude, scene.longitude, scene.equinoxDate, 0.25, 'raycasting');
    expect(result.hourlyShadows.length).toBeGreaterThan(0);

    const violations = findFootprintLeaks(result.hourlyShadows, affected);
    if (violations.length > 0) console.log(`[shadow-bug1 regression / final, per-hour] leaks:\n${violations.join('\n')}`);
    expect(violations).toEqual([]);

    const envelopeViolations = findEnvelopeFootprintLeaks(result.envelopeLoops, affected);
    if (envelopeViolations.length > 0) {
      console.log(`[shadow-bug1 regression / final, ENVELOPE UNION] leaks:\n${envelopeViolations.join('\n')}`);
    }
    expect(envelopeViolations).toEqual([]);
  });

  it('computeHourlyShadowsLive (coarse accuracy / dragging)', { timeout: 60000 }, () => {
    if (!scene) return;
    const affected = scene.buildings.filter((b) => AFFECTED_BUILDING_IDS.includes(b.id));

    const result = computeHourlyShadowsLive(scene.buildings, scene.latitude, scene.longitude, scene.equinoxDate, 0.5, 'raycasting');
    expect(result.hourlyShadows.length).toBeGreaterThan(0);

    const violations = findFootprintLeaks(result.hourlyShadows, affected);
    if (violations.length > 0) console.log(`[shadow-bug1 regression / live] leaks:\n${violations.join('\n')}`);
    expect(violations).toEqual([]);

    const envelopeViolations = findEnvelopeFootprintLeaks(result.envelopeLoops, affected);
    if (envelopeViolations.length > 0) {
      console.log(`[shadow-bug1 regression / live, ENVELOPE UNION] leaks:\n${envelopeViolations.join('\n')}`);
    }
    expect(envelopeViolations).toEqual([]);
  });
});

// Prostszy, ręcznie zbudowany przypadek (4 budynki: 1 testowany prostokąt + 2 wklęsłe
// "wstęgi" (concave ribbon-shaped buildings, 6-8 wierzchołków) + 1 dodatkowy prostokąt) —
// user wskazał tę scenę jako wyraźnie pokazującą błędy silnika cienia. Test-stabilizator:
// weryfikuje TO SAMO kryterium co powyżej (cień budynku testowanego nie może wchodzić w
// rzeczywisty footprint budynków blokujących), tym razem generycznie dla WSZYSTKICH budynków
// nietestowanych w scenie, nie tylko wybranych ID.
function loadSimpleShadowTest1(): { buildings: BuildingLoop[]; latitude: number; longitude: number; equinoxDate: 'spring' | 'autumn' } | null {
  const filePath = path.resolve(__dirname, '../../../reference/simple-shadow-test1.json');
  if (!fs.existsSync(filePath)) return null;
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return {
    buildings: raw.buildings || [],
    latitude: raw.settings?.latitude ?? 52.23,
    longitude: raw.settings?.longitude ?? 21.01,
    equinoxDate: raw.settings?.equinoxDate ?? 'spring',
  };
}

describe('simple-shadow-test1.json regression: production shadow functions must not leak into neighbour footprints', () => {
  const scene = loadSimpleShadowTest1();

  it('computeFullShadowAnalysis (final accuracy / at rest)', { timeout: 60000 }, () => {
    if (!scene) return;
    const blocking = scene.buildings.filter((b) => !b.isTested);
    expect(blocking.length).toBeGreaterThan(0);

    const result = computeFullShadowAnalysis(scene.buildings, scene.latitude, scene.longitude, scene.equinoxDate, 0.25, 'raycasting');
    expect(result.hourlyShadows.length).toBeGreaterThan(0);

    const violations = findFootprintLeaks(result.hourlyShadows, blocking);
    if (violations.length > 0) console.log(`[simple-shadow-test1 regression / final, per-hour] leaks:\n${violations.join('\n')}`);
    expect(violations).toEqual([]);

    const envelopeViolations = findEnvelopeFootprintLeaks(result.envelopeLoops, blocking);
    if (envelopeViolations.length > 0) {
      console.log(`[simple-shadow-test1 regression / final, ENVELOPE UNION] leaks:\n${envelopeViolations.join('\n')}`);
    }
    expect(envelopeViolations).toEqual([]);
  });

  it('computeHourlyShadowsLive (coarse accuracy / dragging)', { timeout: 60000 }, () => {
    if (!scene) return;
    const blocking = scene.buildings.filter((b) => !b.isTested);

    const result = computeHourlyShadowsLive(scene.buildings, scene.latitude, scene.longitude, scene.equinoxDate, 0.5, 'raycasting');
    expect(result.hourlyShadows.length).toBeGreaterThan(0);

    const violations = findFootprintLeaks(result.hourlyShadows, blocking);
    if (violations.length > 0) console.log(`[simple-shadow-test1 regression / live] leaks:\n${violations.join('\n')}`);
    expect(violations).toEqual([]);

    const envelopeViolations = findEnvelopeFootprintLeaks(result.envelopeLoops, blocking);
    if (envelopeViolations.length > 0) {
      console.log(`[simple-shadow-test1 regression / live, ENVELOPE UNION] leaks:\n${envelopeViolations.join('\n')}`);
    }
    expect(envelopeViolations).toEqual([]);
  });
});
