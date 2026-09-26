import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  extractBuildingStoryTiers,
  MasterplanStoryTier,
  getMasterplanSolarAngles,
  computeShadowOffsetVector,
} from './masterplanGeometry';
import {
  getCachedRoofShadowSamples,
  clearMasterplanShadowCache,
  MasterplanColorSample,
} from './masterplanShadowCache';
import {
  tierFootprintBounds,
  extendBoundsByOffset,
  boundsOverlap,
  Bounds,
} from './masterplanSpatial';
import { BuildingLoop, Point2D } from '../../../types/geometry';
import { calculateSignedArea } from '../../../utils/math2d/polygons';
import { getFastIntersectionTelemetry, resetFastIntersectionTelemetry, fastIntersectTwoSimpleLoops } from '../../../utils/math2d/fastIntersect';
import {
  getFastUnionTelemetry,
  resetFastUnionTelemetry,
  getFastDifferenceTelemetry,
  resetFastDifferenceTelemetry,
} from '../../../utils/math2d/polygonBooleanTwo';

function computePolysArea(polys: { outer: Point2D[]; holes?: Point2D[][] }[]): number {
  let total = 0;
  for (const poly of polys) {
    if (!poly.outer || poly.outer.length < 3) continue;
    const outerArea = Math.abs(calculateSignedArea(poly.outer));
    let holesArea = 0;
    if (poly.holes) {
      for (const h of poly.holes) {
        if (h && h.length >= 3) {
          holesArea += Math.abs(calculateSignedArea(h));
        }
      }
    }
    total += Math.max(0, outerArea - holesArea);
  }
  return total;
}

/**
 * Area of `polys` CLIPPED to `roofPolygon`, not just their raw area.
 *
 * `getCachedRoofShadowSamples` (masterplanShadowCache.ts) has a "singleShadow" fast path: when a
 * roof has exactly ONE shadow-casting higher tier, it skips the CPU-side
 * `fastIntersectTwoSimpleLoops(sp.outer, roofPoly)` clip and pushes the occluder's raw, UNCLIPPED
 * shadow silhouette straight into the result — correct for rendering (the canvas renderer applies
 * `ctx.clip('evenodd')` to the roof outline right before drawing, in both
 * `masterplanRoofsRenderer.ts:172` and its per-tier draw call), but WRONG for any code that reads
 * `.polys` and computes area directly without re-clipping, exactly as `computePolysArea` above does.
 * That silent contract mismatch made the original 601-minute poz.json scan below measure areas up
 * to ~400x the roof's own footprint whenever a roof had exactly one occluder — this helper restores
 * a correct, renderer-equivalent area by clipping every poly to the roof outline before summing.
 */
function computeClippedPolysArea(polys: { outer: Point2D[]; holes?: Point2D[][] }[], roofPolygon: Point2D[]): number {
  if (!roofPolygon || roofPolygon.length < 3) return computePolysArea(polys);
  let total = 0;
  for (const poly of polys) {
    if (!poly.outer || poly.outer.length < 3) continue;
    for (const clipped of fastIntersectTwoSimpleLoops(poly.outer, roofPolygon)) {
      if (clipped.length >= 3) total += Math.abs(calculateSignedArea(clipped));
    }
  }
  return total;
}

describe('Masterplan Roof Shadow Flicker & 600-Minute Continuity on poz.json', () => {
  it('scans all 601 minutes (-5h to +5h) for roof shadow flickering and boolean fallbacks on poz.json', () => {
    const filePath = path.resolve(__dirname, '../../../../reference/shadow/poz.json');
    if (!fs.existsSync(filePath)) {
      console.log('File reference/shadow/poz.json not found, skipping.');
      return;
    }

    const rawData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const allObjects: any[] = rawData.buildings || rawData;
    const buildings: BuildingLoop[] = allObjects.filter(
      (b: any) => b.category !== 'boundary' && b.vertices && b.vertices.length >= 3 && (b.defaultHeight || 0) > 0
    );

    // CRITICAL: use the scene's own sunlightMethod (production always does — see
    // masterplanRoofsRenderer.ts:108, masterplanGroundRenderer.ts:53), not a hardcoded value.
    // poz.json declares sunlightMethod: "segments" (Linijka), so this scan must use that too —
    // an earlier version of this test hardcoded 'raycasting', silently testing the wrong solar
    // model and (combined with the unclipped-area bug fixed below) potentially masking real
    // flicker in this locked-in regression anchor.
    const solarMethod: 'raycasting' | 'segments' = rawData.sunlightMethod === 'segments' ? 'segments' : 'raycasting';

    console.log(`\n================================================================================`);
    console.log(`[POZ.JSON 600-MINUTE SCANNER] Loaded ${buildings.length} 3D buildings from poz.json, solarMethod: ${solarMethod}`);
    console.log(`================================================================================`);

    const allTiers: MasterplanStoryTier[] = [];
    for (const bldg of buildings) {
      allTiers.push(...extractBuildingStoryTiers(bldg));
    }
    const sortedTiers = allTiers.sort((a, b) => a.hTop - b.hTop);
    const sortedTierBounds = sortedTiers.map(tierFootprintBounds);
    console.log(`[POZ.JSON] Extracted ${sortedTiers.length} total story tiers across scene.`);

    const samples: MasterplanColorSample[] = [
      { color: 'rgba(30, 41, 59, 0.14)', offsetMin: 0 },
    ];

    const lat = 52.4064; // Poznań
    const lon = 16.9252;
    const equinoxDate = 'spring';

    // 601 minutes: from 7:00 to 17:00 (step = 1/60 hour = 1 minute)
    const startHour = 7.0;
    const endHour = 17.0;
    const stepHour = 1 / 60; // 1 minute
    const totalMinutes = Math.round((endHour - startHour) / stepHour) + 1;

    // Reset telemetries
    resetFastIntersectionTelemetry();
    resetFastUnionTelemetry();
    resetFastDifferenceTelemetry();
    clearMasterplanShadowCache();

    // Data structures for anomaly detection: tierId -> array of { minuteIdx, hourFraction, shadowArea, roofArea }
    const tierShadowHistory: Map<string, { minuteIdx: number; hour: number; shadowArea: number; roofArea: number }[]> = new Map();
    for (const tier of sortedTiers) {
      const tierKey = `${tier.buildingId}:${tier.storyIndex}`;
      tierShadowHistory.set(tierKey, []);
    }

    const minuteTimings: number[] = [];
    let totalRoofShadowEvals = 0;
    let totalHigherTierPairs = 0;

    const tScanStart = performance.now();

    for (let m = 0; m < totalMinutes; m++) {
      const hour = startHour + m * stepHour;
      const tMinStart = performance.now();

      const angles = getMasterplanSolarAngles(lat, lon, equinoxDate, hour, 0, solarMethod);

      // 1. Build higher tiers per tier for this sun angle
      const higherTiersPerTier: MasterplanStoryTier[][] = new Array(sortedTiers.length);
      const n = sortedTiers.length;
      for (let i = 0; i < n; i++) {
        const currentH = sortedTiers[i].hTop;
        const currentTierBounds = sortedTierBounds[i];
        const higher: MasterplanStoryTier[] = [];
        for (let j = i + 1; j < n; j++) {
          const ht = sortedTiers[j];
          const deltaHTop = ht.hTop - currentH;
          if (deltaHTop <= 0.05) continue;
          const htOffset = computeShadowOffsetVector(deltaHTop, angles);
          const htReachBounds = extendBoundsByOffset(sortedTierBounds[j], htOffset.dx * 1.05, htOffset.dy * 1.05);
          if (boundsOverlap(currentTierBounds, htReachBounds)) {
            higher.push(ht);
          }
        }
        higherTiersPerTier[i] = higher;
        totalHigherTierPairs += higher.length;
      }

      // 2. Evaluate roof shadows for all tiers
      for (let i = 0; i < n; i++) {
        const tier = sortedTiers[i];
        const higherTiers = higherTiersPerTier[i];
        const tierKey = `${tier.buildingId}:${tier.storyIndex}`;
        const roofArea = Math.abs(calculateSignedArea(tier.polygon));

        if (!higherTiers || higherTiers.length === 0) {
          tierShadowHistory.get(tierKey)!.push({ minuteIdx: m, hour, shadowArea: 0, roofArea });
          continue;
        }

        totalRoofShadowEvals++;
        const shadowResult = getCachedRoofShadowSamples(
          tierKey,
          tier.hTop,
          higherTiers,
          samples,
          lat,
          lon,
          equinoxDate,
          hour,
          solarMethod,
          tier.polygon
        );

        const polys = shadowResult.samples.flatMap((s) => s.polys);
        const shadowArea = computeClippedPolysArea(polys, tier.polygon);

        tierShadowHistory.get(tierKey)!.push({ minuteIdx: m, hour, shadowArea, roofArea });
      }

      const tMinEnd = performance.now();
      minuteTimings.push(tMinEnd - tMinStart);
    }

    const totalScanTime = performance.now() - tScanStart;
    const avgMinTime = minuteTimings.reduce((a, b) => a + b, 0) / minuteTimings.length;
    const maxMinTime = Math.max(...minuteTimings);
    const minMinTime = Math.min(...minuteTimings);

    console.log(`\n--------------------------------------------------------------------------------`);
    console.log(`[SCAN COMPLETED] 601 minutes processed in ${totalScanTime.toFixed(1)} ms`);
    console.log(`  - Average time per minute frame: ${avgMinTime.toFixed(2)} ms (${(1000 / avgMinTime).toFixed(1)} FPS)`);
    console.log(`  - Fastest minute:               ${minMinTime.toFixed(2)} ms`);
    console.log(`  - Slowest minute:               ${maxMinTime.toFixed(2)} ms`);
    console.log(`  - Total roof shadow evaluations:${totalRoofShadowEvals}`);
    console.log(`  - Total active higher tier pairs:${totalHigherTierPairs}`);
    console.log(`--------------------------------------------------------------------------------`);

    // 3. Telemetry of boolean operations
    const intersectTelem = getFastIntersectionTelemetry();
    const unionTelem = getFastUnionTelemetry();
    const diffTelem = getFastDifferenceTelemetry();

    console.log(`\n================================================================================`);
    console.log(`[BOOLEAN OPERATIONS & FALLBACK TELEMETRY OVER 601 MINUTES]`);
    console.log(`================================================================================`);
    console.log(`fastIntersectTwoSimpleLoops:`);
    console.log(`  - Total Calls:        ${intersectTelem.totalCalls}`);
    console.log(`  - Fast Path Success:  ${intersectTelem.fastPathSuccess} (${((intersectTelem.fastPathSuccess / (intersectTelem.totalCalls || 1)) * 100).toFixed(2)}%)`);
    console.log(`  - Fallback Calls:     ${intersectTelem.fallbackCalls} (${((intersectTelem.fallbackCalls / (intersectTelem.totalCalls || 1)) * 100).toFixed(2)}%)`);
    console.log(`  - Disjoint Exits:     ${intersectTelem.disjointExits}`);
    console.log(`  - Containment A/B:    A=${intersectTelem.containmentAExits}, B=${intersectTelem.containmentBExits}`);
    console.log(`\nfastUnionTwoSimpleLoops:`);
    console.log(`  - Total Calls:        ${unionTelem.totalCalls}`);
    console.log(`  - Fast Path Success:  ${unionTelem.fastPathSuccess} (${((unionTelem.fastPathSuccess / (unionTelem.totalCalls || 1)) * 100).toFixed(2)}%)`);
    console.log(`  - Fallback Calls:     ${unionTelem.fallbackCalls} (${((unionTelem.fallbackCalls / (unionTelem.totalCalls || 1)) * 100).toFixed(2)}%)`);
    console.log(`  - Disjoint Exits:     ${unionTelem.disjointExits}`);
    console.log(`  - Containment Exits:  ${unionTelem.containmentExits}`);
    console.log(`================================================================================`);

    // 4. Anomaly Detection: Flickering / Dropouts
    // Detect where shadow area at t-1 > 0.4*roof, at t drops by > 50%, and at t+1 recovers to > 0.4*roof
    interface FlickerAnomaly {
      tierKey: string;
      minute: number;
      hourStr: string;
      prevArea: number;
      currArea: number;
      nextArea: number;
      roofArea: number;
      dropPercent: number;
    }

    const anomalies: FlickerAnomaly[] = [];

    for (const [tierKey, history] of tierShadowHistory.entries()) {
      for (let i = 1; i < history.length - 1; i++) {
        const prev = history[i - 1];
        const curr = history[i];
        const next = history[i + 1];

        if (curr.roofArea < 1.0) continue; // Skip tiny roofs (< 1 m²)

        const prevRatio = prev.shadowArea / curr.roofArea;
        const currRatio = curr.shadowArea / curr.roofArea;
        const nextRatio = next.shadowArea / curr.roofArea;

        // Pattern 1: Sudden drop (valley) - covered -> unshaded -> covered
        if (prevRatio > 0.3 && nextRatio > 0.3 && currRatio < prevRatio * 0.5 && currRatio < nextRatio * 0.5) {
          const drop = Math.min(prevRatio - currRatio, nextRatio - currRatio);
          if (drop > 0.15) {
            const h = Math.floor(curr.hour);
            const m = Math.round((curr.hour - h) * 60);
            anomalies.push({
              tierKey,
              minute: curr.minuteIdx,
              hourStr: `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`,
              prevArea: prev.shadowArea,
              currArea: curr.shadowArea,
              nextArea: next.shadowArea,
              roofArea: curr.roofArea,
              dropPercent: Number(((1 - currRatio / Math.max(prevRatio, nextRatio)) * 100).toFixed(1)),
            });
          }
        }

        // Pattern 2: Sudden spike (peak) - unshaded -> fully shaded -> unshaded
        if (prevRatio < 0.1 && nextRatio < 0.1 && currRatio > 0.5) {
          const h = Math.floor(curr.hour);
          const m = Math.round((curr.hour - h) * 60);
          anomalies.push({
            tierKey,
            minute: curr.minuteIdx,
            hourStr: `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`,
            prevArea: prev.shadowArea,
            currArea: curr.shadowArea,
            nextArea: next.shadowArea,
            roofArea: curr.roofArea,
            dropPercent: Number((-currRatio * 100).toFixed(1)), // negative means spike
          });
        }
      }
    }

    console.log(`\n================================================================================`);
    console.log(`[ANOMALY DETECTION RESULT] Flickering / Dropout Events Found: ${anomalies.length}`);
    console.log(`================================================================================`);
    if (anomalies.length > 0) {
      console.log(`Detected Anomalies (first 10):`);
      for (const a of anomalies.slice(0, 10)) {
        console.log(
          `  - Tier: ${a.tierKey} at ${a.hourStr} (min ${a.minute}): prevArea=${a.prevArea.toFixed(1)}m², currArea=${a.currArea.toFixed(1)}m², nextArea=${a.nextArea.toFixed(1)}m², roof=${a.roofArea.toFixed(1)}m² (drop/spike: ${a.dropPercent}%)`
        );
      }
    } else {
      console.log(`✓ 0 flickering / dropout events detected across all 601 minutes!`);
    }

    expect(anomalies.length).toBe(0);
  }, 120000);
});

describe('Masterplan Roof Shadow Flicker — targeted repro on 146510_8.0501.115_BUD (war-geo.json)', () => {
  it('scans 601 minutes and drills into the reported flicker on building 146510_8.0501.115_BUD', () => {
    const filePath = path.resolve(__dirname, '../../../../reference/speed/war-geo.json');
    if (!fs.existsSync(filePath)) {
      console.log('File reference/speed/war-geo.json not found, skipping.');
      return;
    }

    const rawData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const allObjects: any[] = rawData.buildings || rawData;
    const buildings: BuildingLoop[] = allObjects.filter(
      (b: any) => b.category !== 'boundary' && b.vertices && b.vertices.length >= 3 && (b.defaultHeight || 0) > 0
    );

    const TARGET_ID = '146510_8.0501.115_BUD';
    const targetBuilding = buildings.find((b) => b.id === TARGET_ID);
    expect(targetBuilding).toBeDefined();

    // CRITICAL: use the scene's own sunlightMethod, exactly like production
    // (masterplanRoofsRenderer.ts:108, masterplanGroundRenderer.ts:53 both do
    // `sunlightMethod ?? 'raycasting'`) — an earlier version of this test hardcoded
    // 'raycasting', silently testing a different solar model (astronomical raycasting)
    // than what war-geo.json (sunlightMethod: "segments" / Linijka) actually renders,
    // which is why it initially found 0 anomalies despite a real user-visible flicker.
    const solarMethod: 'raycasting' | 'segments' = rawData.sunlightMethod === 'segments' ? 'segments' : 'raycasting';

    console.log(`\n================================================================================`);
    console.log(`[WAR-GEO.JSON 600-MINUTE SCANNER] Loaded ${buildings.length} 3D buildings, target: ${TARGET_ID}, solarMethod: ${solarMethod}`);
    console.log(`================================================================================`);

    // Sanity check on the reported hypothesis: is the target footprint's convexity classification
    // stable (as expected — it's static input geometry, not re-derived per sun-angle) or borderline
    // (near-zero cross product at any vertex, which would make it float-precision-sensitive)?
    const targetVerts = targetBuilding!.vertices;
    const n = targetVerts.length;
    const crosses: number[] = [];
    for (let i = 0; i < n; i++) {
      const p1 = targetVerts[i];
      const p2 = targetVerts[(i + 1) % n];
      const p3 = targetVerts[(i + 2) % n];
      const dx1 = p2.x - p1.x, dy1 = p2.y - p1.y;
      const dx2 = p3.x - p2.x, dy2 = p3.y - p2.y;
      crosses.push(dx1 * dy2 - dy1 * dx2);
    }
    console.log(`[TARGET GEOMETRY] ${n} vertices, per-vertex turn cross-products: [${crosses.map((c) => c.toFixed(3)).join(', ')}]`);
    const minAbsCross = Math.min(...crosses.map(Math.abs));
    console.log(`[TARGET GEOMETRY] smallest |cross| = ${minAbsCross.toFixed(4)} (near-degenerate/near-collinear vertex if << others)`);

    const allTiers: MasterplanStoryTier[] = [];
    for (const bldg of buildings) {
      allTiers.push(...extractBuildingStoryTiers(bldg));
    }
    const sortedTiers = allTiers.sort((a, b) => a.hTop - b.hTop);
    const sortedTierBounds = sortedTiers.map(tierFootprintBounds);
    const targetTierKeys = new Set(sortedTiers.filter((t) => t.buildingId === TARGET_ID).map((t) => `${t.buildingId}:${t.storyIndex}`));
    console.log(`[WAR-GEO.JSON] Extracted ${sortedTiers.length} total story tiers, ${targetTierKeys.size} belong to target.`);

    const samples: MasterplanColorSample[] = [{ color: 'rgba(30, 41, 59, 0.14)', offsetMin: 0 }];

    // war-geo.json is a Warsaw dataset (see reference/warszawa-geo.json convention)
    const lat = 52.23;
    const lon = 21.01;
    const equinoxDate = 'spring';

    const startHour = 7.0;
    const endHour = 17.0;
    const stepHour = 1 / 60;
    const totalMinutes = Math.round((endHour - startHour) / stepHour) + 1;

    resetFastIntersectionTelemetry();
    resetFastUnionTelemetry();
    resetFastDifferenceTelemetry();
    clearMasterplanShadowCache();

    const tierShadowHistory: Map<string, { minuteIdx: number; hour: number; shadowArea: number; roofArea: number; higherTierIds: string }[]> = new Map();
    for (const tier of sortedTiers) {
      tierShadowHistory.set(`${tier.buildingId}:${tier.storyIndex}`, []);
    }

    for (let m = 0; m < totalMinutes; m++) {
      const hour = startHour + m * stepHour;
      const angles = getMasterplanSolarAngles(lat, lon, equinoxDate, hour, 0, solarMethod);

      const higherTiersPerTier: MasterplanStoryTier[][] = new Array(sortedTiers.length);
      const nt = sortedTiers.length;
      for (let i = 0; i < nt; i++) {
        const currentH = sortedTiers[i].hTop;
        const currentTierBounds = sortedTierBounds[i];
        const higher: MasterplanStoryTier[] = [];
        for (let j = i + 1; j < nt; j++) {
          const ht = sortedTiers[j];
          const deltaHTop = ht.hTop - currentH;
          if (deltaHTop <= 0.05) continue;
          const htOffset = computeShadowOffsetVector(deltaHTop, angles);
          const htReachBounds = extendBoundsByOffset(sortedTierBounds[j], htOffset.dx * 1.05, htOffset.dy * 1.05);
          if (boundsOverlap(currentTierBounds, htReachBounds)) {
            higher.push(ht);
          }
        }
        higherTiersPerTier[i] = higher;
      }

      for (let i = 0; i < nt; i++) {
        const tier = sortedTiers[i];
        const tierKey = `${tier.buildingId}:${tier.storyIndex}`;
        if (!targetTierKeys.has(tierKey)) continue; // only track the target building's tiers

        const higherTiers = higherTiersPerTier[i];
        const roofArea = Math.abs(calculateSignedArea(tier.polygon));
        const higherTierIds = (higherTiers || []).map((t) => `${t.buildingId}:${t.storyIndex}`).sort().join(',');

        if (!higherTiers || higherTiers.length === 0) {
          tierShadowHistory.get(tierKey)!.push({ minuteIdx: m, hour, shadowArea: 0, roofArea, higherTierIds });
          continue;
        }

        const shadowResult = getCachedRoofShadowSamples(
          tierKey, tier.hTop, higherTiers, samples, lat, lon, equinoxDate, hour, solarMethod, tier.polygon
        );
        const polys = shadowResult.samples.flatMap((s) => s.polys);
        const shadowArea = computeClippedPolysArea(polys, tier.polygon);
        tierShadowHistory.get(tierKey)!.push({ minuteIdx: m, hour, shadowArea, roofArea, higherTierIds });
      }
    }

    const intersectTelem = getFastIntersectionTelemetry();
    const unionTelem = getFastUnionTelemetry();
    const diffTelem = getFastDifferenceTelemetry();
    console.log(`\n[BOOLEAN TELEMETRY OVER 601 MINUTES] intersect: ${intersectTelem.totalCalls} calls, ${intersectTelem.fallbackCalls} fallback | union: ${unionTelem.totalCalls} calls, ${unionTelem.fallbackCalls} fallback | diff: ${diffTelem.totalCalls} calls, ${diffTelem.fallbackCalls} fallback`);

    interface FlickerAnomaly {
      tierKey: string; minute: number; hourStr: string;
      prevArea: number; currArea: number; nextArea: number; roofArea: number;
      prevHigher: string; currHigher: string; nextHigher: string;
      dropPercent: number;
    }
    const anomalies: FlickerAnomaly[] = [];

    for (const [tierKey, history] of tierShadowHistory.entries()) {
      for (let i = 1; i < history.length - 1; i++) {
        const prev = history[i - 1];
        const curr = history[i];
        const next = history[i + 1];
        if (curr.roofArea < 1.0) continue;

        const prevRatio = prev.shadowArea / curr.roofArea;
        const currRatio = curr.shadowArea / curr.roofArea;
        const nextRatio = next.shadowArea / curr.roofArea;

        const fmtTime = (hour: number) => {
          const h = Math.floor(hour);
          const mi = Math.round((hour - h) * 60);
          return `${h.toString().padStart(2, '0')}:${mi.toString().padStart(2, '0')}`;
        };

        const pushAnomaly = (dropPercent: number) => {
          anomalies.push({
            tierKey, minute: curr.minuteIdx, hourStr: fmtTime(curr.hour),
            prevArea: prev.shadowArea, currArea: curr.shadowArea, nextArea: next.shadowArea, roofArea: curr.roofArea,
            prevHigher: prev.higherTierIds, currHigher: curr.higherTierIds, nextHigher: next.higherTierIds,
            dropPercent,
          });
        };

        // Pattern 1: valley (covered -> unshaded -> covered)
        if (prevRatio > 0.3 && nextRatio > 0.3 && currRatio < prevRatio * 0.5 && currRatio < nextRatio * 0.5) {
          const drop = Math.min(prevRatio - currRatio, nextRatio - currRatio);
          if (drop > 0.15) pushAnomaly(Number(((1 - currRatio / Math.max(prevRatio, nextRatio)) * 100).toFixed(1)));
        }
        // Pattern 2: spike (unshaded -> fully shaded -> unshaded)
        if (prevRatio < 0.1 && nextRatio < 0.1 && currRatio > 0.5) {
          pushAnomaly(Number((-currRatio * 100).toFixed(1)));
        }
      }
    }

    console.log(`\n================================================================================`);
    console.log(`[TARGET ANOMALY DETECTION] Flickering / dropout events on ${TARGET_ID}: ${anomalies.length}`);
    console.log(`================================================================================`);
    for (const a of anomalies) {
      console.log(
        `  - Tier ${a.tierKey} @ ${a.hourStr} (min ${a.minute}): prev=${a.prevArea.toFixed(2)}m² curr=${a.currArea.toFixed(2)}m² next=${a.nextArea.toFixed(2)}m² roof=${a.roofArea.toFixed(2)}m² (${a.dropPercent}%)`
      );
      console.log(`      higherTiers  prev=[${a.prevHigher}]  curr=[${a.currHigher}]  next=[${a.nextHigher}]`);
      if (a.prevHigher !== a.currHigher || a.currHigher !== a.nextHigher) {
        console.log(`      ⚠ higher-tier occlusion set CHANGES at this minute — likely AABB-reach threshold flip, not a boolean-op bug`);
      }
    }

    // ── ROOT-CAUSE-CORRECT anomaly detector ──────────────────────────────────────────────────
    // The valley/spike detector above compares MINUTE-adjacent samples, but the real production
    // shadow is quantized to 5-minute cache buckets (`makeSunBucketKey`, buildingGeometryCache.ts:56
    // — `Math.round(hourFraction * 12) / 12`, matching the hour slider's own 5-minute step,
    // MasterplanShadowAlgorithmCard.tsx:65). Every consecutive minute *within* a bucket is
    // therefore identical by construction — the minute-level detector can never see the real
    // discontinuity, which only happens BETWEEN adjacent buckets. This is why the original scan
    // (before this fix) reported 0 anomalies for a building the user could see flickering live.
    // This detector instead groups samples by their actual cache bucket and flags large coverage
    // jumps between CONSECUTIVE buckets — what a user dragging the slider one step actually sees.
    interface BucketJump {
      tierKey: string; bucketA: number; bucketB: number;
      areaA: number; areaB: number; roofArea: number; jumpPct: number;
      higherA: string; higherB: string;
    }
    const bucketJumps: BucketJump[] = [];
    const BUCKET_JUMP_THRESHOLD_PCT = 25; // percentage points of roof coverage — a visually obvious pop

    for (const [tierKey, history] of tierShadowHistory.entries()) {
      // Collapse consecutive identical-bucket samples down to one entry per bucket.
      const buckets: { bucket: number; area: number; roofArea: number; higher: string }[] = [];
      for (const h of history) {
        const bucket = Math.round(h.hour * 12) / 12;
        const last = buckets[buckets.length - 1];
        if (last && last.bucket === bucket) continue;
        buckets.push({ bucket, area: h.shadowArea, roofArea: h.roofArea, higher: h.higherTierIds });
      }
      for (let i = 1; i < buckets.length; i++) {
        const a = buckets[i - 1];
        const b = buckets[i];
        if (b.roofArea < 1.0) continue;
        const jumpPct = (Math.abs(b.area - a.area) / b.roofArea) * 100;
        if (jumpPct > BUCKET_JUMP_THRESHOLD_PCT) {
          bucketJumps.push({
            tierKey, bucketA: a.bucket, bucketB: b.bucket,
            areaA: a.area, areaB: b.area, roofArea: b.roofArea, jumpPct,
            higherA: a.higher, higherB: b.higher,
          });
        }
      }
    }

    const fmtBucketTime = (hour: number) => {
      const h = Math.floor(hour), mi = Math.round((hour - h) * 60);
      return `${h.toString().padStart(2, '0')}:${mi.toString().padStart(2, '0')}`;
    };

    console.log(`\n================================================================================`);
    console.log(`[BUCKET-TO-BUCKET JUMP DETECTION] 5-minute cache-bucket transitions on ${TARGET_ID}`);
    console.log(`Threshold: >${BUCKET_JUMP_THRESHOLD_PCT}pp roof-coverage change between adjacent 5-min buckets`);
    console.log(`================================================================================`);
    if (bucketJumps.length > 0) {
      for (const j of bucketJumps) {
        console.log(
          `  ⚠ Tier ${j.tierKey}: ${fmtBucketTime(j.bucketA)} → ${fmtBucketTime(j.bucketB)}: ${j.areaA.toFixed(1)}m² → ${j.areaB.toFixed(1)}m² (roof=${j.roofArea.toFixed(1)}m²) = ${j.jumpPct.toFixed(1)}pp jump`
        );
        if (j.higherA !== j.higherB) {
          console.log(`      occluder set changed: [${j.higherA}] → [${j.higherB}]`);
        }
      }
      console.log(`\nThis reproduces the reported live-Canvas flicker: dragging the sun-hour slider by ONE 5-minute`);
      console.log(`step at these times causes a visually large, discrete jump in roof shadow coverage — this is a`);
      console.log(`genuine gap between the cache's 5-minute quantization granularity and this building's shadow-edge`);
      console.log(`sensitivity, NOT a boolean-op/geometry-fidelity bug (per-bucket geometry is internally consistent`);
      console.log(`and fallback-free — see BOOLEAN TELEMETRY above).`);
    } else {
      console.log(`✓ No bucket-to-bucket jump exceeds ${BUCKET_JUMP_THRESHOLD_PCT}pp.`);
    }

    // This is now a REAL regression guard, not a diagnostic-only probe: the reported live-Canvas
    // flicker on 146510_8.0501.115_BUD is confirmed reproducible (bucket-to-bucket coverage jumps
    // up to ~50 percentage points at the exact user-reported times, e.g. +3:05 → +3:10 goes from
    // 93% to 43% roof coverage). This SHOULD currently fail — that failure is the correct, honest
    // signal that the underlying 5-minute cache-bucket granularity (buildingGeometryCache.ts:56)
    // produces a visible discontinuity for this building. Fixing the cache granularity/interpolation
    // (not this test) is what should turn this green.
    expect(bucketJumps.length).toBe(0);
  }, 120000);
});
