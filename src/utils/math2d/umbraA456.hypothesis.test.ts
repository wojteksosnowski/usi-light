import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  extractBuildingStoryTiers,
  MasterplanStoryTier,
  getMasterplanSolarAngles,
  computeStoryShadowPolygonWithHoles,
} from '../../components/cad/masterplan/masterplanGeometry';
import {
  clusterTiersByShadowOverlap,
  unionPolygonsWithHolesHierarchical,
  polygonsWithHolesBounds,
  boundsOverlap,
  Bounds,
} from '../../components/cad/masterplan/masterplanSpatial';
import {
  calculateSignedArea,
  computePointsBoundingBox,
  PolygonWithHoles,
  unionPolygonsWithHoles,
} from './polygons';
import {
  fastUnionTwoSimpleLoops,
} from './polygonBooleanTwo';
import { BuildingLoop, Point2D } from '../../types/geometry';

/**
 * Zoptymalizowana wersja scalania hierarchicznego z Fast-Path, AABB Bypass i Sortowaniem Przestrzennym.
 */
function fastUnionPair(p1: PolygonWithHoles, p2: PolygonWithHoles): PolygonWithHoles[] {
  if ((!p1.holes || p1.holes.length === 0) && (!p2.holes || p2.holes.length === 0)) {
    const box1 = computePointsBoundingBox(p1.outer);
    const box2 = computePointsBoundingBox(p2.outer);
    if (!boundsOverlap(box1, box2)) {
      return [p1, p2];
    }
    const fastRes = fastUnionTwoSimpleLoops(p1.outer, p2.outer);
    if (fastRes) {
      return [{ outer: fastRes.outer, holes: fastRes.holes }];
    }
  }
  return unionPolygonsWithHoles([p1, p2]);
}

function optimizedUnionPolygonsWithHolesHierarchical(polys: PolygonWithHoles[]): PolygonWithHoles[] {
  if (polys.length === 0) return [];
  if (polys.length === 1) return polys;
  if (polys.length === 2) return fastUnionPair(polys[0], polys[1]);

  let current = polys.map((p) => [p]);
  while (current.length > 1) {
    const next: PolygonWithHoles[][] = [];
    for (let i = 0; i < current.length; i += 2) {
      if (i + 1 < current.length) {
        const g1 = current[i];
        const g2 = current[i + 1];
        if (g1.length === 1 && g2.length === 1) {
          next.push(fastUnionPair(g1[0], g2[0]));
        } else {
          const b1 = polygonsWithHolesBounds(g1);
          const b2 = polygonsWithHolesBounds(g2);
          if (b1 && b2 && !boundsOverlap(b1, b2)) {
            next.push([...g1, ...g2]);
          } else {
            next.push(unionPolygonsWithHoles([...g1, ...g2]));
          }
        }
      } else {
        next.push(current[i]);
      }
    }
    if (next.length === current.length) break;
    current = next;
  }
  return current[0] || [];
}

describe('UMBRA A456 - Hypothesis Testing & Optimization Benchmarks', () => {
  const warszawaPath = path.resolve(__dirname, '../../../reference/warszawa.json');
  const baselinePath = path.resolve(__dirname, './warszawa-baseline-full.json');

  let buildings: BuildingLoop[] = [];
  let allTiers: MasterplanStoryTier[] = [];
  let baseline: any = null;

  if (fs.existsSync(warszawaPath) && fs.existsSync(baselinePath)) {
    const rawScene = JSON.parse(fs.readFileSync(warszawaPath, 'utf-8'));
    buildings = (rawScene.buildings || []).filter(
      (b: any) => b.category !== 'boundary' && b.vertices && b.vertices.length >= 3 && (b.defaultHeight || 0) > 0
    );
    for (const bldg of buildings) {
      allTiers.push(...extractBuildingStoryTiers(bldg));
    }
    baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
  }

  it('tests Hypothesis 1 & 2: Optimized Fast-Path Hierarchical Union vs Baseline', () => {
    const latitude = 52.23;
    const longitude = 21.01;
    const equinox = 'spring';
    const hour = 12.0;

    const solarAngles = getMasterplanSolarAngles(latitude, longitude, equinox, hour, 0, 'raycasting');
    const validTiers = allTiers.filter((t) => t.polygon && t.polygon.length >= 3 && t.hTop > 0);
    const clusters = clusterTiersByShadowOverlap(validTiers, solarAngles);

    // Przygotuj surowe rzuty cienia dla wszystkich klastrów
    const clusterPolys: PolygonWithHoles[][] = [];
    for (const cluster of clusters) {
      const cList: PolygonWithHoles[] = [];
      for (const tier of cluster) {
        const polys = computeStoryShadowPolygonWithHoles(tier.polygon, tier.holes, solarAngles, tier.hTop, tier.hBottom);
        cList.push(...polys);
      }
      clusterPolys.push(cList);
    }

    // 1. Weryfikacja geometryczna 1:1
    const baselineResults: PolygonWithHoles[] = [];
    for (const cList of clusterPolys) {
      baselineResults.push(...unionPolygonsWithHolesHierarchical(cList));
    }

    const optimizedResults: PolygonWithHoles[] = [];
    for (const cList of clusterPolys) {
      optimizedResults.push(...optimizedUnionPolygonsWithHolesHierarchical(cList));
    }

    expect(optimizedResults.length).toBe(baselineResults.length);

    let baselineArea = 0;
    for (const p of baselineResults) {
      let a = Math.abs(calculateSignedArea(p.outer));
      for (const h of p.holes || []) a -= Math.abs(calculateSignedArea(h));
      baselineArea += a;
    }

    let optArea = 0;
    for (const p of optimizedResults) {
      let a = Math.abs(calculateSignedArea(p.outer));
      for (const h of p.holes || []) a -= Math.abs(calculateSignedArea(h));
      optArea += a;
    }

    expect(optArea).toBeCloseTo(baselineArea, 1);
    expect(optArea).toBeCloseTo(baseline.hours['12']['offset_0'].totalNetArea, 1);

    // 2. Porównanie wydajnościowe A/B (15 iteracji)
    const runs = 15;

    // Warm-up
    for (const cList of clusterPolys) {
      unionPolygonsWithHolesHierarchical(cList);
      optimizedUnionPolygonsWithHolesHierarchical(cList);
    }

    const t0Baseline = performance.now();
    for (let r = 0; r < runs; r++) {
      for (const cList of clusterPolys) {
        unionPolygonsWithHolesHierarchical(cList);
      }
    }
    const timeBaselineMs = (performance.now() - t0Baseline) / runs;

    const t0Opt = performance.now();
    for (let r = 0; r < runs; r++) {
      for (const cList of clusterPolys) {
        optimizedUnionPolygonsWithHolesHierarchical(cList);
      }
    }
    const timeOptMs = (performance.now() - t0Opt) / runs;

    const speedup = (timeBaselineMs / timeOptMs).toFixed(2);

    console.log(`\n================================================================================`);
    console.log(`[A/B HYPOTHESIS EXPERIMENT: HIERARCHICAL CLUSTER UNION ON warszawa.json]`);
    console.log(`================================================================================`);
    console.log(`  - Baseline Hierarchical Union (polygon-clipping): ${timeBaselineMs.toFixed(2)} ms/frame`);
    console.log(`  - Optimized Hierarchical Union (Fast-Path & AABB): ${timeOptMs.toFixed(2)} ms/frame`);
    console.log(`  - Speedup Factor:                                 ${speedup}x (${(((timeBaselineMs - timeOptMs) / timeBaselineMs) * 100).toFixed(1)}% time reduction)`);
    console.log(`  - Geometric Parity (1:1 Total Area):              MATCH (${optArea.toFixed(2)} m²)`);
    console.log(`================================================================================\n`);

    expect(timeOptMs).toBeLessThan(timeBaselineMs);
  }, 40000);
});
