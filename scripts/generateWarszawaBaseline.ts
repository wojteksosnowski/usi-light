import fs from 'fs';
import path from 'path';
import { extractBuildingStoryTiers, MasterplanStoryTier, getMasterplanSolarAngles, computeStoryShadowPolygonWithHoles } from '../src/components/cad/masterplan/masterplanGeometry';
import { clusterTiersByShadowOverlap, unionPolygonsWithHolesHierarchical, Bounds, polygonsWithHolesBounds } from '../src/components/cad/masterplan/masterplanSpatial';
import { PolygonWithHoles, calculateSignedArea } from '../src/utils/math2d/polygons';
import { BuildingLoop } from '../src/types/geometry';

function round6(val: number): number {
  return Math.round(val * 1e6) / 1e6;
}

function computeUmbraForScene(
  tiers: MasterplanStoryTier[],
  latitude: number,
  longitude: number,
  equinoxDate: 'spring' | 'autumn',
  hourFraction: number,
  minuteOffset: number = 0,
  method: 'raycasting' | 'segments' | 'astro' | 'linijka' = 'raycasting'
): PolygonWithHoles[] {
  const angles = getMasterplanSolarAngles(latitude, longitude, equinoxDate, hourFraction, minuteOffset, method);
  const validTiers = tiers.filter((t) => t.polygon && t.polygon.length >= 3 && t.hTop > 0);
  const clusters = clusterTiersByShadowOverlap(validTiers, angles);

  const umbraPolysAll: PolygonWithHoles[] = [];

  for (const cluster of clusters) {
    const cUmbra: PolygonWithHoles[] = [];
    for (const tier of cluster) {
      const polys = computeStoryShadowPolygonWithHoles(tier.polygon, tier.holes, angles, tier.hTop, tier.hBottom);
      cUmbra.push(...polys);
    }
    if (cUmbra.length === 1) {
      umbraPolysAll.push(cUmbra[0]);
    } else if (cUmbra.length > 1) {
      umbraPolysAll.push(...unionPolygonsWithHolesHierarchical(cUmbra));
    }
  }

  return umbraPolysAll;
}

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function generateBaseline() {
  const warszawaPath = path.resolve(__dirname, '../reference/warszawa.json');
  const rawData = JSON.parse(fs.readFileSync(warszawaPath, 'utf-8'));
  const buildings: BuildingLoop[] = (rawData.buildings || []).filter(
    (b: any) => b.category !== 'boundary' && b.vertices && b.vertices.length >= 3 && (b.defaultHeight || 0) > 0
  );

  const allTiers: MasterplanStoryTier[] = [];
  for (const bldg of buildings) {
    allTiers.push(...extractBuildingStoryTiers(bldg));
  }

  const hoursToTest = [11.0, 12.0, 13.0];
  const offsetsToTest = [-1, 0, 1]; // -1 min, 0 min (exact umbra), +1 min
  const latitude = 52.23;
  const longitude = 21.01;
  const equinox = 'spring';

  const baselineData: Record<string, any> = {
    buildingsCount: buildings.length,
    tiersCount: allTiers.length,
    latitude,
    longitude,
    equinox,
    hours: {},
  };

  for (const hour of hoursToTest) {
    baselineData.hours[hour] = {};
    for (const offset of offsetsToTest) {
      const polys = computeUmbraForScene(allTiers, latitude, longitude, equinox, hour, offset);
      
      let totalArea = 0;
      let totalSegments = 0;
      const serializablePolys = polys.map((p) => {
        const outerArea = calculateSignedArea(p.outer);
        let holeAreaSum = 0;
        const holes = (p.holes || []).map((h) => {
          const a = calculateSignedArea(h);
          holeAreaSum += Math.abs(a);
          totalSegments += h.length;
          return h.map((pt) => ({ x: round6(pt.x), y: round6(pt.y) }));
        });
        const netArea = Math.abs(outerArea) - holeAreaSum;
        totalArea += netArea;
        totalSegments += p.outer.length;

        return {
          outer: p.outer.map((pt) => ({ x: round6(pt.x), y: round6(pt.y) })),
          holes,
          netArea: round6(netArea),
          outerLength: p.outer.length,
          holesCount: holes.length,
        };
      });

      const bounds = polygonsWithHolesBounds(polys);

      baselineData.hours[hour][`offset_${offset}`] = {
        polygonsCount: polys.length,
        totalSegments,
        totalNetArea: round6(totalArea),
        bounds: bounds ? {
          minX: round6(bounds.minX),
          minY: round6(bounds.minY),
          maxX: round6(bounds.maxX),
          maxY: round6(bounds.maxY),
        } : null,
        polygons: serializablePolys,
      };
    }
  }

  const outPath = path.resolve(__dirname, '../src/utils/math2d/warszawa-baseline-full.json');
  fs.writeFileSync(outPath, JSON.stringify(baselineData, null, 2), 'utf-8');
  console.log(`Saved baseline to ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);
}

generateBaseline();
