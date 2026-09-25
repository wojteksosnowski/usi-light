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
import { getFastIntersectionTelemetry, resetFastIntersectionTelemetry } from '../../../utils/math2d/fastIntersect';
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

    console.log(`\n================================================================================`);
    console.log(`[POZ.JSON 600-MINUTE SCANNER] Loaded ${buildings.length} 3D buildings from poz.json`);
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

      const angles = getMasterplanSolarAngles(lat, lon, equinoxDate, hour, 0, 'raycasting');

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
          'raycasting',
          tier.polygon
        );

        const polys = shadowResult.samples.flatMap((s) => s.polys);
        const shadowArea = computePolysArea(polys);

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
