import { describe, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import polygonClipping from 'polygon-clipping';
import {
  computePointsBoundingBox,
  isPolygonCCW,
  polygonsWithHolesToClipping,
  clippingResultToPolygonsWithHoles,
  calculateSignedArea,
} from './polygons';
import { Point2D } from '../../types/geometry';
import { getGlobalSolarLUT } from '../solar';
import { computeFastShadowPolygon } from './shadowEnvelope';
import { fastUnionTwoSimpleLoops, getFastUnionTelemetry, resetFastUnionTelemetry } from './polygonBooleanTwo';

function ensureCCW(points: Point2D[]): Point2D[] {
  if (points.length < 3) return points;
  return isPolygonCCW(points) ? [...points] : [...points].reverse();
}

function toNormalizedClippingRing(poly: Point2D[], precision: number = 1000): [number, number][] | null {
  if (!poly || poly.length < 3) return null;
  const ring: [number, number][] = [];
  for (const pt of poly) {
    const x = Math.round(pt.x * precision) / precision;
    const y = Math.round(pt.y * precision) / precision;
    if (ring.length === 0 || ring[ring.length - 1][0] !== x || ring[ring.length - 1][1] !== y) {
      ring.push([x, y]);
    }
  }
  if (ring.length >= 2 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) {
    ring.pop();
  }
  if (ring.length < 3) return null;
  ring.push([ring[0][0], ring[0][1]]);
  return ring;
}

function clippingResultToLoops(unionResult: polygonClipping.MultiPolygon | polygonClipping.Polygon): Point2D[][] {
  const resultLoops: Point2D[][] = [];
  for (const poly of unionResult) {
    if (!Array.isArray(poly) || poly.length === 0) continue;
    if (typeof poly[0][0] === 'number') {
      const ring = poly as unknown as polygonClipping.Ring;
      if (ring.length >= 3) {
        const isClosed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
        const sliceEnd = isClosed && ring.length > 3 ? ring.length - 1 : ring.length;
        resultLoops.push(ring.slice(0, sliceEnd).map(([x, y]) => ({ x, y })));
      }
    } else {
      for (const ring of poly as polygonClipping.Polygon) {
        if (ring.length >= 3) {
          const isClosed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
          const sliceEnd = isClosed && ring.length > 3 ? ring.length - 1 : ring.length;
          resultLoops.push(ring.slice(0, sliceEnd).map(([x, y]) => ({ x, y })));
        }
      }
    }
  }
  return resultLoops;
}

/** Legacy Direct Union using pure polygonClipping */
function legacyUnionPolygonLoops(polygons: Point2D[][]): Point2D[][] {
  const valid = polygons.filter(p => p && p.length >= 3);
  if (valid.length <= 1) return valid;
  const clippingPolys: polygonClipping.Polygon[] = [];
  for (const poly of valid) {
    const ring = toNormalizedClippingRing(poly);
    if (ring) clippingPolys.push([ring]);
  }
  if (clippingPolys.length <= 1) return valid;
  try {
    const res = polygonClipping.union(clippingPolys[0], ...clippingPolys.slice(1));
    return clippingResultToLoops(res);
  } catch {
    return valid;
  }
}

/** New Engine Union using fastUnionTwoSimpleLoops + hierarchical reduction */
function newUnionPolygonLoops(polygons: Point2D[][]): Point2D[][] {
  const valid = polygons.filter(p => p && p.length >= 3);
  if (valid.length <= 1) return valid;
  if (valid.length === 2) {
    const fastRes = fastUnionTwoSimpleLoops(valid[0], valid[1]);
    if (fastRes && fastRes.outer && fastRes.outer.length >= 3) {
      return [fastRes.outer, ...(fastRes.holes || [])];
    }
  }
  return legacyUnionPolygonLoops(valid);
}

/** Hierarchical loop union */
function runHierarchicalUnion(batches: Point2D[][][], unionFn: (p: Point2D[][]) => Point2D[][]): Point2D[][] {
  if (batches.length === 0) return [];
  let current = batches;
  while (current.length > 1) {
    const next: Point2D[][][] = [];
    for (let i = 0; i < current.length; i += 2) {
      if (i + 1 < current.length) {
        next.push(unionFn([...current[i], ...current[i + 1]]));
      } else {
        next.push(current[i]);
      }
    }
    if (next.length === current.length) break;
    current = next;
  }
  return current[0] || [];
}

interface StepTimingReport {
  sceneName: string;
  numBuildings: number;
  numSteps: number;
  tSolar: number;
  tExtrude: number;
  tAABB: number;
  tDiff: number;
  tHourlyUnionNew: number;
  tHourlyUnionLegacy: number;
  tHierarchicalEnvelopeNew: number;
  tHierarchicalEnvelopeLegacy: number;
  tTotalNew: number;
  tTotalLegacy: number;
  envelopeAreaNew: number;
  envelopeAreaLegacy: number;
  envelopeVerticesNew: number;
  envelopeVerticesLegacy: number;
}

function profileScene(scenePath: string, sceneName: string, stepHours: number = 0.25): StepTimingReport {
  const rawData = fs.readFileSync(scenePath, 'utf-8');
  const sceneData = JSON.parse(rawData);
  const buildings: any[] = sceneData.buildings || [];

  const tested = buildings.filter((b) => b.isTested && b.category !== 'boundary' && b.vertices && b.vertices.length >= 3);
  const blocking = buildings.filter((b) => !b.isTested && b.category !== 'boundary' && b.vertices && b.vertices.length >= 3);

  // If no buildings marked tested, treat all as tested
  const activeTested = tested.length > 0 ? tested : buildings.filter(b => b.category !== 'boundary' && b.vertices && b.vertices.length >= 3);

  const solarLUT = getGlobalSolarLUT(52.23, 21.01, 'spring');
  const noonHour = solarLUT.astroSystem.solarNoonDecimal;
  const offsets: number[] = [];
  for (let o = -5; o <= 5 + 1e-6; o += stepHours) {
    offsets.push(o);
  }

  // 1. Measure T_solar
  const t0Solar = performance.now();
  const solarStepsData = offsets.map(o => {
    const sData = solarLUT.getMethodData(o, 'raycasting');
    return {
      offset: o,
      sData,
      azRad: sData.azimuthDeg * (Math.PI / 180),
      elevRad: sData.elevationDeg * (Math.PI / 180),
      uShadow: sData.unitShadowVec,
      valid: sData.elevationDeg > 0.5,
    };
  }).filter(s => s.valid);
  const tSolar = (performance.now() - t0Solar);

  // 2. Measure T_extrude
  const t0Extrude = performance.now();
  const rawHourlyPolysPerStep: Point2D[][][] = [];
  for (const step of solarStepsData) {
    const polys: Point2D[][] = [];
    for (const bldg of activeTested) {
      const bHBase = bldg.elevation ?? 0.0;
      const bHTop = bHBase + (bldg.defaultHeight || 15.0);
      const poly = computeFastShadowPolygon(bldg.vertices, step.azRad, step.elevRad, bHTop, bHBase);
      if (poly.length >= 3) polys.push(poly);
    }
    rawHourlyPolysPerStep.push(polys);
  }
  const tExtrude = (performance.now() - t0Extrude);

  // 3. Measure T_AABB
  const t0AABB = performance.now();
  const blockingWithAABB = blocking.map(bldg => {
    let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
    for (const v of bldg.vertices) {
      if (v.x < bMinX) bMinX = v.x;
      if (v.y < bMinY) bMinY = v.y;
      if (v.x > bMaxX) bMaxX = v.x;
      if (v.y > bMaxY) bMaxY = v.y;
    }
    return { bldg, bMinX, bMinY, bMaxX, bMaxY };
  });
  const tAABB = (performance.now() - t0AABB);

  // 4. Measure T_Diff
  let tDiff = 0;
  if (blocking.length > 0) {
    const t0Diff = performance.now();
    for (let i = 0; i < solarStepsData.length; i++) {
      const step = solarStepsData[i];
      const hourPolys = rawHourlyPolysPerStep[i];
      if (hourPolys.length === 0) continue;

      let hMinX = Infinity, hMinY = Infinity, hMaxX = -Infinity, hMaxY = -Infinity;
      for (const poly of hourPolys) {
        for (const pt of poly) {
          if (pt.x < hMinX) hMinX = pt.x;
          if (pt.y < hMinY) hMinY = pt.y;
          if (pt.x > hMaxX) hMaxX = pt.x;
          if (pt.y > hMaxY) hMaxY = pt.y;
        }
      }

      const blockingHourPolys: Point2D[][] = [];
      for (const item of blockingWithAABB) {
        const bldg = item.bldg;
        const bHTop = (bldg.elevation ?? 0.0) + bldg.defaultHeight;
        if (bHTop <= 0) continue;
        const offX = bHTop * step.uShadow.x;
        const offY = bHTop * step.uShadow.y;
        const sMinX = Math.min(item.bMinX, item.bMinX + offX);
        const sMaxX = Math.max(item.bMaxX, item.bMaxX + offX);
        const sMinY = Math.min(item.bMinY, item.bMinY + offY);
        const sMaxY = Math.max(item.bMaxY, item.bMaxY + offY);
        if (sMaxX < hMinX || sMinX > hMaxX || sMaxY < hMinY || sMinY > hMaxY) continue;

        const poly = computeFastShadowPolygon(bldg.vertices, step.azRad, step.elevRad, bHTop, bldg.elevation ?? 0.0);
        if (poly.length >= 3) blockingHourPolys.push(poly);
      }
    }
    tDiff = (performance.now() - t0Diff);
  }

  // 5. Measure Hourly Union: New vs Legacy
  // New
  const t0HourlyNew = performance.now();
  const hourlyMergedNew: Point2D[][][] = [];
  for (const polys of rawHourlyPolysPerStep) {
    hourlyMergedNew.push(newUnionPolygonLoops(polys));
  }
  const tHourlyUnionNew = performance.now() - t0HourlyNew;

  // Legacy
  const t0HourlyLegacy = performance.now();
  const hourlyMergedLegacy: Point2D[][][] = [];
  for (const polys of rawHourlyPolysPerStep) {
    hourlyMergedLegacy.push(legacyUnionPolygonLoops(polys));
  }
  const tHourlyUnionLegacy = performance.now() - t0HourlyLegacy;

  // 6. Measure Hierarchical Reduction of 41 steps: New vs Legacy
  // New
  const t0HierNew = performance.now();
  const envLoopsNew = runHierarchicalUnion(hourlyMergedNew, newUnionPolygonLoops);
  const tHierarchicalEnvelopeNew = performance.now() - t0HierNew;

  // Legacy
  const t0HierLegacy = performance.now();
  const envLoopsLegacy = runHierarchicalUnion(hourlyMergedLegacy, legacyUnionPolygonLoops);
  const tHierarchicalEnvelopeLegacy = performance.now() - t0HierLegacy;

  const totalNew = tSolar + tExtrude + tAABB + tDiff + tHourlyUnionNew + tHierarchicalEnvelopeNew;
  const totalLegacy = tSolar + tExtrude + tAABB + tDiff + tHourlyUnionLegacy + tHierarchicalEnvelopeLegacy;

  const areaNew = envLoopsNew.reduce((acc, loop) => acc + Math.abs(calculateSignedArea(loop)), 0);
  const areaLegacy = envLoopsLegacy.reduce((acc, loop) => acc + Math.abs(calculateSignedArea(loop)), 0);

  const vertsNew = envLoopsNew.reduce((acc, loop) => acc + loop.length, 0);
  const vertsLegacy = envLoopsLegacy.reduce((acc, loop) => acc + loop.length, 0);

  return {
    sceneName,
    numBuildings: activeTested.length + blocking.length,
    numSteps: solarStepsData.length,
    tSolar,
    tExtrude,
    tAABB,
    tDiff,
    tHourlyUnionNew,
    tHourlyUnionLegacy,
    tHierarchicalEnvelopeNew,
    tHierarchicalEnvelopeLegacy,
    tTotalNew: totalNew,
    tTotalLegacy: totalLegacy,
    envelopeAreaNew: areaNew,
    envelopeAreaLegacy: areaLegacy,
    envelopeVerticesNew: vertsNew,
    envelopeVerticesLegacy: vertsLegacy,
  };
}

describe('Granular Step-by-Step Profiler for Shadow Extent Pipeline', () => {
  const unionTest1Path = path.resolve(__dirname, '../../../reference/union-test1.json');
  const warszawaPath = path.resolve(__dirname, '../../../reference/warszawa.json');

  it('profiles union-test1.json and warszawa.json across all pipeline steps', () => {
    // Warmup
    profileScene(unionTest1Path, 'union-test1', 0.5);

    const iters = 5;
    const reportsUnionTest: StepTimingReport[] = [];
    const reportsWarszawa: StepTimingReport[] = [];

    for (let i = 0; i < iters; i++) {
      reportsUnionTest.push(profileScene(unionTest1Path, 'union-test1.json (41 steps)', 0.25));
      reportsWarszawa.push(profileScene(warszawaPath, 'warszawa.json (41 steps)', 0.25));
    }

    const avgReport = (reports: StepTimingReport[]): StepTimingReport => {
      const res = { ...reports[0] };
      const keys: (keyof StepTimingReport)[] = [
        'tSolar', 'tExtrude', 'tAABB', 'tDiff',
        'tHourlyUnionNew', 'tHourlyUnionLegacy',
        'tHierarchicalEnvelopeNew', 'tHierarchicalEnvelopeLegacy',
        'tTotalNew', 'tTotalLegacy'
      ];
      for (const k of keys) {
        (res as any)[k] = reports.reduce((acc, r) => acc + (r[k] as number), 0) / reports.length;
      }
      return res;
    };

    const repU = avgReport(reportsUnionTest);
    const repW = avgReport(reportsWarszawa);

    console.log('\n========================================================================================');
    console.log('                 GRANULAR SHADOW PIPELINE STEP-BY-STEP PROFILING REPORT                 ');
    console.log('========================================================================================\n');

    console.log(`SCENE 1: ${repU.sceneName} [${repU.numBuildings} building(s), ${repU.numSteps} time steps]`);
    console.log(`  - 1. Solar LUT & Ray Vectors:      ${repU.tSolar.toFixed(3)} ms`);
    console.log(`  - 2. Shadow Extrusions:            ${repU.tExtrude.toFixed(3)} ms`);
    console.log(`  - 3. AABB Spatial Pruning:         ${repU.tAABB.toFixed(3)} ms`);
    console.log(`  - 4. Blocking Difference:          ${repU.tDiff.toFixed(3)} ms`);
    console.log(`  - 5. Hourly Unions:                NEW: ${repU.tHourlyUnionNew.toFixed(3)} ms | LEGACY: ${repU.tHourlyUnionLegacy.toFixed(3)} ms`);
    console.log(`  - 6. Hierarchical Reduction:       NEW: ${repU.tHierarchicalEnvelopeNew.toFixed(3)} ms | LEGACY: ${repU.tHierarchicalEnvelopeLegacy.toFixed(3)} ms`);
    console.log(`  --------------------------------------------------------------------------------------`);
    console.log(`  * TOTAL TIME:                      NEW: ${repU.tTotalNew.toFixed(3)} ms | LEGACY: ${repU.tTotalLegacy.toFixed(3)} ms`);
    console.log(`  * Envelope Area (m²):              NEW: ${repU.envelopeAreaNew.toFixed(2)} | LEGACY: ${repU.envelopeAreaLegacy.toFixed(2)}`);
    console.log(`  * Envelope Vertices:               NEW: ${repU.envelopeVerticesNew} | LEGACY: ${repU.envelopeVerticesLegacy}`);

    console.log('\n----------------------------------------------------------------------------------------\n');

    console.log(`SCENE 2: ${repW.sceneName} [${repW.numBuildings} building(s), ${repW.numSteps} time steps]`);
    console.log(`  - 1. Solar LUT & Ray Vectors:      ${repW.tSolar.toFixed(3)} ms`);
    console.log(`  - 2. Shadow Extrusions:            ${repW.tExtrude.toFixed(3)} ms`);
    console.log(`  - 3. AABB Spatial Pruning:         ${repW.tAABB.toFixed(3)} ms`);
    console.log(`  - 4. Blocking Difference:          ${repW.tDiff.toFixed(3)} ms`);
    console.log(`  - 5. Hourly Unions:                NEW: ${repW.tHourlyUnionNew.toFixed(3)} ms | LEGACY: ${repW.tHourlyUnionLegacy.toFixed(3)} ms`);
    console.log(`  - 6. Hierarchical Reduction:       NEW: ${repW.tHierarchicalEnvelopeNew.toFixed(3)} ms | LEGACY: ${repW.tHierarchicalEnvelopeLegacy.toFixed(3)} ms`);
    console.log(`  --------------------------------------------------------------------------------------`);
    console.log(`  * TOTAL TIME:                      NEW: ${repW.tTotalNew.toFixed(3)} ms | LEGACY: ${repW.tTotalLegacy.toFixed(3)} ms`);
    console.log(`  * Envelope Area (m²):              NEW: ${repW.envelopeAreaNew.toFixed(2)} | LEGACY: ${repW.envelopeAreaLegacy.toFixed(2)}`);
    console.log(`  * Envelope Vertices:               NEW: ${repW.envelopeVerticesNew} | LEGACY: ${repW.envelopeVerticesLegacy}`);
    console.log('\n========================================================================================\n');
  }, 60000);

  it('measures fastUnionTwoSimpleLoops telemetry and fallback rate on union-test1 and warszawa', () => {
    // 1. Telemetry on union-test1.json
    resetFastUnionTelemetry();
    profileScene(unionTest1Path, 'union-test1.json (41 steps)', 0.25);
    const telU = getFastUnionTelemetry();

    // 2. Telemetry on warszawa.json
    resetFastUnionTelemetry();
    profileScene(warszawaPath, 'warszawa.json (41 steps)', 0.25);
    const telW = getFastUnionTelemetry();

    const formatTel = (t: typeof telU) => {
      const fbRate = t.totalCalls > 0 ? ((t.fallbackCalls / t.totalCalls) * 100).toFixed(1) : '0.0';
      const fastRate = t.totalCalls > 0 ? ((t.fastPathSuccess / t.totalCalls) * 100).toFixed(1) : '0.0';
      const earlyExits = t.disjointExits + t.containmentExits;
      const earlyRate = t.totalCalls > 0 ? ((earlyExits / t.totalCalls) * 100).toFixed(1) : '0.0';

      return {
        total: t.totalCalls,
        fastPath: `${t.fastPathSuccess} (${fastRate}%)`,
        earlyExits: `${earlyExits} (${earlyRate}%) [Disjoint: ${t.disjointExits}, Containment: ${t.containmentExits}]`,
        fallback: `${t.fallbackCalls} (${fbRate}%)`,
        fallbackReasons: `[Insufficient segments: ${t.insufficientSegmentsExits}, Multiple outer components: ${t.multipleOuterComponentsExits}, Empty loops: ${t.emptyLoopsExits}, Caught exceptions: ${t.caughtExceptionExits}]`,
      };
    };

    const fU = formatTel(telU);
    const fW = formatTel(telW);

    console.log('\n========================================================================================');
    console.log('              TELEMETRY & FALLBACK REPORT FOR fastUnionTwoSimpleLoops                   ');
    console.log('========================================================================================\n');

    console.log(`SCENE 1: union-test1.json`);
    console.log(`  - Total calls to fastUnionTwoSimpleLoops:  ${fU.total}`);
    console.log(`  - Fast Path Success (Topological Tracer):  ${fU.fastPath}`);
    console.log(`  - Fast Early Exits:                        ${fU.earlyExits}`);
    console.log(`  - FALLBACK CALLS (polygon-clipping):       ${fU.fallback}`);
    console.log(`  - Fallback reasons:                        ${fU.fallbackReasons}`);

    console.log('\n----------------------------------------------------------------------------------------\n');

    console.log(`SCENE 2: warszawa.json`);
    console.log(`  - Total calls to fastUnionTwoSimpleLoops:  ${fW.total}`);
    console.log(`  - Fast Path Success (Topological Tracer):  ${fW.fastPath}`);
    console.log(`  - Fast Early Exits:                        ${fW.earlyExits}`);
    console.log(`  - FALLBACK CALLS (polygon-clipping):       ${fW.fallback}`);
    console.log(`  - Fallback reasons:                        ${fW.fallbackReasons}`);

    console.log('\n========================================================================================\n');
  }, 60000);

  it('measures fastUnionTwoSimpleLoops fallback rate on adversarial (fallback-prone) geometry', () => {
    // Geometries known to previously stress the tolerance stack: shared edges, near-duplicate
    // vertices, near-collinear kinks, near-touching parallel edges, and a hole loop whose first
    // vertex sits near the outer boundary. Mirrors polygonBooleanTwo.fastUnion.test.ts's cases.
    resetFastUnionTelemetry();

    const pairs: [{ x: number; y: number }[], { x: number; y: number }[]][] = [
      [
        [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
        [{ x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 10, y: 10 }],
      ],
      [
        [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
        [{ x: 10.0005, y: 9.9997 }, { x: 20, y: 5 }, { x: 20, y: 15 }, { x: 10, y: 15 }],
      ],
      [
        [{ x: 0, y: 0 }, { x: 5, y: 1e-8 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
        [{ x: 5, y: 0 }, { x: 15, y: 0 }, { x: 15, y: 10 }, { x: 5, y: 10 }],
      ],
      [
        [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
        [{ x: 10.0000005, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 10.0000005, y: 10 }],
      ],
      [
        [{ x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 20 }, { x: 20, y: 20 }, { x: 20, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 30 }, { x: 0, y: 30 }],
        [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 20 }, { x: 20, y: 20 }, { x: 20, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 20 }, { x: 0, y: 20 }],
      ],
    ];

    for (const [a, b] of pairs) {
      fastUnionTwoSimpleLoops(a, b);
    }

    const tel = getFastUnionTelemetry();
    const fbRate = tel.totalCalls > 0 ? ((tel.fallbackCalls / tel.totalCalls) * 100).toFixed(1) : '0.0';

    console.log('\n========================================================================================');
    console.log('     ADVERSARIAL FALLBACK-TRIGGER GEOMETRY REPORT FOR fastUnionTwoSimpleLoops           ');
    console.log('========================================================================================\n');
    console.log(`  - Total calls:                              ${tel.totalCalls}`);
    console.log(`  - Fast Path Success:                        ${tel.fastPathSuccess}`);
    console.log(`  - FALLBACK CALLS:                           ${tel.fallbackCalls} (${fbRate}%)`);
    console.log(`  - Fallback reasons: [Insufficient segments: ${tel.insufficientSegmentsExits}, Multiple outer components: ${tel.multipleOuterComponentsExits}, Empty loops: ${tel.emptyLoopsExits}, Caught exceptions: ${tel.caughtExceptionExits}]`);
    console.log('\n========================================================================================\n');
  }, 60000);
});
