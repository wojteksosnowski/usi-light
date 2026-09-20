/**
 * Skrypt regenerujący warszawa-baseline-full.json na podstawie aktualnego algorytmu.
 * Uruchamia pełny potok UMBRA A456 i zapisuje wyniki jako nowy baseline.
 *
 * Użycie: npx tsx scripts/regenerate-baseline.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Dynamiczny import modułów ESM projektu
async function main() {
  const { extractBuildingStoryTiers, getMasterplanSolarAngles, computeStoryShadowPolygonWithHoles } = await import(
    '../src/components/cad/masterplan/masterplanGeometry.ts'
  );
  const { clusterTiersByShadowOverlap, unionPolygonsWithHolesHierarchical, polygonsWithHolesBounds } = await import(
    '../src/components/cad/masterplan/masterplanSpatial.ts'
  );
  const { calculateSignedArea } = await import('../src/utils/math2d/polygons.ts');

  const warszawaPath = path.resolve(__dirname, '../reference/warszawa.json');
  const outputPath = path.resolve(__dirname, '../src/utils/math2d/warszawa-baseline-full.json');

  if (!fs.existsSync(warszawaPath)) {
    console.error('ERROR: reference/warszawa.json nie istnieje.');
    process.exit(1);
  }

  const rawScene = JSON.parse(fs.readFileSync(warszawaPath, 'utf-8'));
  const buildings = (rawScene.buildings || []).filter(
    (b: any) => b.category !== 'boundary' && b.vertices && b.vertices.length >= 3 && (b.defaultHeight || 0) > 0
  );

  const allTiers: any[] = [];
  for (const bldg of buildings) {
    allTiers.push(...extractBuildingStoryTiers(bldg));
  }

  const latitude = 52.23;
  const longitude = 21.01;
  const equinox: 'spring' | 'autumn' = 'spring';

  console.log(`Załadowano ${buildings.length} budynków, ${allTiers.length} tierów.`);

  function computeUmbraPolygons(tiers: any[], hour: number, minuteOffset: number) {
    const angles = getMasterplanSolarAngles(latitude, longitude, equinox, hour, minuteOffset, 'raycasting');
    const validTiers = tiers.filter((t: any) => t.polygon && t.polygon.length >= 3 && t.hTop > 0);
    const clusters = clusterTiersByShadowOverlap(validTiers, angles);

    const umbraPolysAll: any[] = [];
    for (const cluster of clusters) {
      const cUmbra: any[] = [];
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

  const testHours = [11.0, 12.0, 13.0];
  const testOffsets = [-1, 0, 1];

  const hoursData: Record<string, Record<string, any>> = {};

  for (const hour of testHours) {
    hoursData[String(hour)] = {};
    for (const offset of testOffsets) {
      const polys = computeUmbraPolygons(allTiers, hour, offset);

      let totalNetArea = 0;
      let totalSegments = 0;
      const polygonDetails: any[] = [];

      for (const poly of polys) {
        const outerArea = Math.abs(calculateSignedArea(poly.outer));
        let holeAreaSum = 0;
        for (const hole of poly.holes || []) {
          holeAreaSum += Math.abs(calculateSignedArea(hole));
          totalSegments += hole.length;
        }
        totalSegments += poly.outer.length;
        totalNetArea += outerArea - holeAreaSum;

        polygonDetails.push({
          outer: poly.outer,
          holes: poly.holes || [],
        });
      }

      const bounds = polygonsWithHolesBounds(polys);

      const key = `offset_${offset}`;
      hoursData[String(hour)][key] = {
        polygonsCount: polys.length,
        totalNetArea,
        totalSegments,
        bounds,
        polygons: polygonDetails,
      };

      console.log(
        `  Hour ${hour}:00, offset ${offset >= 0 ? '+' : ''}${offset}min → ${polys.length} polys, area=${totalNetArea.toFixed(1)}m²`
      );
    }
  }

  const baseline = {
    buildingsCount: buildings.length,
    tiersCount: allTiers.length,
    latitude,
    longitude,
    equinox,
    generatedAt: new Date().toISOString(),
    hours: hoursData,
  };

  fs.writeFileSync(outputPath, JSON.stringify(baseline, null, 2), 'utf-8');
  console.log(`\n✓ Baseline zapisany do: ${outputPath}`);
  console.log(`  ${buildings.length} budynków, ${allTiers.length} tierów`);
  console.log(`  Godziny: ${testHours.join(', ')} h | Offsety: ${testOffsets.map((o) => (o >= 0 ? '+' : '') + o).join(', ')} min`);
}

main().catch((err) => {
  console.error('Błąd:', err);
  process.exit(1);
});
