import { describe, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  extractBuildingStoryTiers,
  MasterplanStoryTier,
  getMasterplanSolarAngles,
  computeShadowOffsetVector,
  computeStoryShadowPolygonWithHoles,
} from './masterplanGeometry';
import {
  getCachedGroundShadowSamples,
  getCachedRoofShadowSamples,
  getTiersArraySignature,
  MasterplanColorSample,
} from './masterplanShadowCache';
import {
  tierFootprintBounds,
  extendBoundsByOffset,
  boundsOverlap,
  clusterTiersByShadowOverlap,
  unionPolygonsWithHolesHierarchical,
} from './masterplanSpatial';
import { BuildingLoop } from '../../../types/geometry';
import { GeometryCompiler } from '../../../engine/compiler/GeometryCompiler';

describe('Masterplan Shadow Performance Benchmark on warszawa.json', () => {
  it('benchmarks A456 (single raw umbra) on real-world large scene', () => {
    const filePath = path.resolve(__dirname, '../../../../reference/warszawa.json');
    if (!fs.existsSync(filePath)) {
      console.log('File reference/warszawa.json not found, skipping benchmark.');
      return;
    }

    const rawData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const buildings: BuildingLoop[] = (rawData.buildings || []).filter(
      (b: any) => b.category !== 'boundary' && b.vertices && b.vertices.length >= 3 && (b.defaultHeight || 0) > 0
    );

    console.log(`[BENCHMARK] Loaded ${buildings.length} 3D buildings from warszawa.json`);

    const allTiers: MasterplanStoryTier[] = [];
    for (const bldg of buildings) {
      allTiers.push(...extractBuildingStoryTiers(bldg));
    }
    console.log(`[BENCHMARK] Extracted ${allTiers.length} story tiers`);

    const samples: MasterplanColorSample[] = [
      { color: 'rgba(30, 41, 59, 0.14)', offsetMin: 0 },
    ];

    // Warm-up
    getCachedGroundShadowSamples(allTiers, samples, 52.23, 21.01, 'spring', 12.0);

    // Test different hour angles (sun moving) - cache miss scenario per frame
    const hours = [10.0, 11.0, 12.0, 13.0, 14.0];

    // Benchmark A456 (Single Raw Umbra)
    const t0Soft = performance.now();
    for (const h of hours) {
      getCachedGroundShadowSamples(allTiers, samples, 52.23, 21.01, 'spring', h);
    }
    const softTime = (performance.now() - t0Soft) / hours.length;

    console.log(`[BENCHMARK_RESULT - warszawa.json] Average computation time per sun position frame:`);
    console.log(`  - Ground Umbra (A456):       ${softTime.toFixed(2)} ms (${(1000 / softTime).toFixed(1)} FPS)`);
  }, 30000);

  it('benchmarks MasterPlan ground and roof shadows on reference/speed/wro.json (405 buildings)', () => {
    const filePath = path.resolve(__dirname, '../../../../reference/speed/wro.json');
    if (!fs.existsSync(filePath)) {
      console.log('File reference/speed/wro.json not found, skipping.');
      return;
    }

    const rawData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const buildings: BuildingLoop[] = (rawData.buildings || []).filter(
      (b: any) => b.category !== 'boundary' && b.vertices && b.vertices.length >= 3 && (b.defaultHeight || 0) > 0
    );

    console.log(`\n[BENCHMARK] Loaded ${buildings.length} 3D buildings from wro.json`);

    const allTiers: MasterplanStoryTier[] = [];
    for (const bldg of buildings) {
      allTiers.push(...extractBuildingStoryTiers(bldg));
    }
    console.log(`[BENCHMARK] Extracted ${allTiers.length} story tiers`);

    const samples: MasterplanColorSample[] = [
      { color: 'rgba(30, 41, 59, 0.14)', offsetMin: 0 },
    ];

    const hours = [10.0, 11.0, 12.0, 13.0, 14.0];

    // Measure Ground Shadows
    const t0Ground = performance.now();
    for (const h of hours) {
      getCachedGroundShadowSamples(allTiers, samples, 51.10, 17.03, 'spring', h);
    }
    const groundTime = (performance.now() - t0Ground) / hours.length;

    console.log(`[BENCHMARK_RESULT - wro.json] Average computation time per sun position frame:`);
    console.log(`  - Ground Umbra (A456):       ${groundTime.toFixed(2)} ms (${(1000 / groundTime).toFixed(1)} FPS)`);
  }, 30000);

  it('drills down into MasterPlan sub-processes during sun-scrubbing on wro.json (405 buildings)', () => {
    const filePath = path.resolve(__dirname, '../../../../reference/speed/wro.json');
    if (!fs.existsSync(filePath)) return;

    const rawData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const buildings: BuildingLoop[] = (rawData.buildings || []).filter(
      (b: any) => b.category !== 'boundary' && b.vertices && b.vertices.length >= 3 && (b.defaultHeight || 0) > 0
    );

    const allTiers: MasterplanStoryTier[] = [];
    for (const bldg of buildings) {
      allTiers.push(...extractBuildingStoryTiers(bldg));
    }
    const sortedTiers = allTiers.sort((a, b) => a.hTop - b.hTop);

    const angles = getMasterplanSolarAngles(51.10, 17.03, 'spring', 12.0, 0, 'raycasting');
    const sortedTierBounds = sortedTiers.map(tierFootprintBounds);

    // 1. Measure Roof Hierarchy (higher tiers search)
    const t0Hierarchy = performance.now();
    const higherTiersPerTier: MasterplanStoryTier[][] = new Array(sortedTiers.length);
    for (let i = 0; i < sortedTiers.length; i++) {
      const currentH = sortedTiers[i].hTop;
      const currentTierBounds = sortedTierBounds[i];
      const higher = sortedTiers.slice(i + 1).filter((ht: any, offset: number) => {
        const deltaHTop = ht.hTop - currentH;
        if (deltaHTop <= 0.05) return false;
        const htOffset = computeShadowOffsetVector(deltaHTop, angles);
        const htReachBounds = extendBoundsByOffset(sortedTierBounds[i + 1 + offset], htOffset.dx * 1.05, htOffset.dy * 1.05);
        return boundsOverlap(currentTierBounds, htReachBounds);
      });
      higherTiersPerTier[i] = higher;
    }
    const hierarchyTime = performance.now() - t0Hierarchy;

    // 2. Measure Roof Shadows (ΔH shadows on all tiers)
    const t0Roofs = performance.now();
    let totalRoofShadowCalls = 0;
    for (let i = 0; i < sortedTiers.length; i++) {
      const tier = sortedTiers[i];
      const higherTiers = higherTiersPerTier[i];
      if (higherTiers && higherTiers.length > 0) {
        totalRoofShadowCalls++;
        const currentTierKey = `${tier.buildingId}:${tier.storyIndex}`;
        getCachedRoofShadowSamples(
          currentTierKey,
          tier.hTop,
          higherTiers,
          [{ color: 'rgba(30, 41, 59, 0.14)', offsetMin: 0 }],
          51.10,
          17.03,
          'spring',
          12.0,
          'raycasting',
          tier.polygon
        );
      }
    }
    const roofsTime = performance.now() - t0Roofs;

    // 3. Measure getTiersArraySignature overhead
    const t0Sig = performance.now();
    for (let i = 0; i < sortedTiers.length; i++) {
      const higherTiers = higherTiersPerTier[i];
      if (higherTiers && higherTiers.length > 0) {
        getTiersArraySignature(higherTiers);
      }
    }
    const sigTime = performance.now() - t0Sig;

    console.log(`\n================================================================================`);
    console.log(`[MASTERPLAN SUB-PROCESS DRILL-DOWN (wro.json, 405 buildings, 405 tiers)]`);
    console.log(`================================================================================`);
    console.log(`  1. Roof Hierarchy Construction (O(N^2) search):  ${hierarchyTime.toFixed(2)} ms`);
    console.log(`  2. Roof Shadows ΔH Calculation (${totalRoofShadowCalls} active tiers): ${roofsTime.toFixed(2)} ms`);
    console.log(`  3. Tier Fingerprint Signature String Hashing:    ${sigTime.toFixed(2)} ms`);
    console.log(`================================================================================\n`);
  }, 30000);

  it('benchmarks MasterPlan ground and roof shadows on reference/speed/poz-osm.json (375 buildings)', () => {
    const filePath = path.resolve(__dirname, '../../../../reference/speed/poz-osm.json');
    if (!fs.existsSync(filePath)) {
      console.log('File reference/speed/poz-osm.json not found, skipping.');
      return;
    }

    const rawData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const buildings: BuildingLoop[] = (rawData.buildings || []).filter(
      (b: any) => b.category !== 'boundary' && b.vertices && b.vertices.length >= 3 && (b.defaultHeight || 0) > 0
    );

    console.log(`\n[BENCHMARK] Loaded ${buildings.length} 3D buildings from poz-osm.json`);

    // 1. Measure tier extraction unbaked vs baked (Canonical Precomputed Geometry)
    const t0Unbaked = performance.now();
    for (let r = 0; r < 10; r++) {
      for (const bldg of buildings) {
        extractBuildingStoryTiers({ ...bldg, computed: undefined });
      }
    }
    const unbakedTime = (performance.now() - t0Unbaked) / 10;

    const bakedBuildings = buildings.map((b) => ({
      ...b,
      computed: (GeometryCompiler as any).bakeBuilding(b),
    }));

    const t0Baked = performance.now();
    for (let r = 0; r < 10; r++) {
      for (const bldg of bakedBuildings) {
        extractBuildingStoryTiers(bldg);
      }
    }
    const bakedTime = (performance.now() - t0Baked) / 10;

    const allTiers: MasterplanStoryTier[] = [];
    for (const bldg of bakedBuildings) {
      allTiers.push(...extractBuildingStoryTiers(bldg));
    }
    console.log(`[BENCHMARK] Extracted ${allTiers.length} story tiers`);
    console.log(`  - Tier extraction (Unbaked): ${unbakedTime.toFixed(2)} ms`);
    console.log(`  - Tier extraction (Baked - Canonical Precomputed Geometry): ${bakedTime.toFixed(2)} ms (speedup: ${(unbakedTime / Math.max(0.01, bakedTime)).toFixed(1)}x)`);

    const samples: MasterplanColorSample[] = [
      { color: 'rgba(30, 41, 59, 0.14)', offsetMin: 0 },
    ];

    const hours = [10.0, 11.0, 12.0, 13.0, 14.0];

    // Measure Ground Shadows
    const t0Ground = performance.now();
    for (const h of hours) {
      getCachedGroundShadowSamples(allTiers, samples, 52.40, 16.92, 'spring', h);
    }
    const groundTime = (performance.now() - t0Ground) / hours.length;

    console.log(`[BENCHMARK_RESULT - poz-osm.json] Average computation time per sun position frame:`);
    console.log(`  - Ground Umbra (A456):       ${groundTime.toFixed(2)} ms (${(1000 / groundTime).toFixed(1)} FPS)`);
  }, 30000);

  it('drills down into Ground Umbra bottlenecks for poz-osm.json', () => {
    const filePath = path.resolve(__dirname, '../../../../reference/speed/poz-osm.json');
    if (!fs.existsSync(filePath)) return;

    const rawData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const buildings: BuildingLoop[] = (rawData.buildings || []).filter(
      (b: any) => b.category !== 'boundary' && b.vertices && b.vertices.length >= 3 && (b.defaultHeight || 0) > 0
    );

    const bakedBuildings = buildings.map((b) => ({
      ...b,
      computed: (GeometryCompiler as any).bakeBuilding(b),
    }));

    const allTiers: MasterplanStoryTier[] = [];
    for (const bldg of bakedBuildings) {
      allTiers.push(...extractBuildingStoryTiers(bldg));
    }

    const angles = getMasterplanSolarAngles(52.40, 16.92, 'spring', 12.0, 0, 'raycasting');

    // Step 1: Clustering
    const t0Clustering = performance.now();
    const clusters = clusterTiersByShadowOverlap(allTiers, angles);
    const clusteringTime = performance.now() - t0Clustering;

    const clusterSizes = clusters.map((c) => c.length).sort((a, b) => b - a);

    // Step 2: Individual shadow projections
    const t0ShadowPolys = performance.now();
    const clusterPolys = clusters.map((cluster) => {
      return cluster.map((tier) => {
        return computeStoryShadowPolygonWithHoles(
          tier.polygon,
          tier.holes,
          angles,
          tier.hTop,
          tier.hBottom,
          tier.geomFingerprint,
          tier.isConvex
        );
      });
    });
    const shadowPolysTime = performance.now() - t0ShadowPolys;

    // Step 3: Hierarchical Union per cluster
    const t0Union = performance.now();
    let singleTierClusters = 0;
    let multiTierClusters = 0;
    for (const cList of clusterPolys) {
      const flat = cList.flat(1);
      if (flat.length <= 1) {
        singleTierClusters++;
      } else {
        multiTierClusters++;
        unionPolygonsWithHolesHierarchical(flat);
      }
    }
    const unionTime = performance.now() - t0Union;

    console.log(`\n================================================================================`);
    console.log(`[POZ-OSM GROUND UMBRA DRILL-DOWN (375 buildings, spring 12:00)]`);
    console.log(`================================================================================`);
    console.log(`  1. AABB Shadow Clustering:                 ${clusteringTime.toFixed(2)} ms (${clusters.length} clusters, max size: ${clusterSizes[0]})`);
    console.log(`  2. Individual Shadow Projections (375):    ${shadowPolysTime.toFixed(2)} ms`);
    console.log(`  3. Hierarchical Cluster Unions:            ${unionTime.toFixed(2)} ms (${singleTierClusters} single, ${multiTierClusters} merged)`);
    console.log(`  Top 5 cluster sizes:                      [${clusterSizes.slice(0, 5).join(', ')}]`);
    console.log(`================================================================================\n`);
  }, 30000);
});
