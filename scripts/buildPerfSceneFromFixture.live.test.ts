import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { importBuildingsFromGeoJson, importParcelsFromGeoJson } from '../src/modules/wfs-import/services/geoJsonImporter';
import { detectCoordinateSystem } from '../src/utils/geoTransform';

/**
 * Konwertuje zcache'owany fixture GeoJSON (warsaw-old-town-r300.json) na plik sceny
 * w formacie SavedSceneData ({version:1, buildings: BuildingLoop[]}), który można
 * wstrzyknąć bezpośrednio do localStorage aplikacji (klucz "usi-light.scene.v1")
 * bez klikania przez UI importu i bez ponownego odpytywania serwerów WFS.
 *
 * Uruchomienie: BUILD_PERF_SCENE=1 npx vitest run scripts/buildPerfSceneFromFixture.live.test.ts
 */
const shouldRun = process.env.BUILD_PERF_SCENE === '1';
const describeOrSkip = shouldRun ? describe : describe.skip;

describeOrSkip('build perf scene from fixture', () => {
  it('converts cached GeoJSON fixture into a SavedSceneData JSON file', () => {
    const fixturePath = path.resolve(__dirname, 'fixtures/warsaw-old-town-r300.json');
    const outPath = path.resolve(__dirname, 'fixtures/warsaw-old-town-r300.scene.json');

    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const CENTER = fixture.center;

    const sourceCrs = {
      crs: 'EPSG:2178' as const,
      description: 'PL-2000 strefa 7',
      geodeticLabel: 'ETRF2000-PL / CS2000 / 21',
      isGeodetic: true,
      zone: 7,
    };
    const projectCrs = detectCoordinateSystem([], CENTER);

    const buildingsResult = importBuildingsFromGeoJson(fixture.buildingsGeoJson, sourceCrs, projectCrs, CENTER);
    const parcelsResult = importParcelsFromGeoJson(fixture.parcelsGeoJson, sourceCrs, projectCrs, CENTER);

    const scene = {
      version: 1,
      buildings: [...buildingsResult.buildings, ...parcelsResult.parcels],
    };

    fs.writeFileSync(outPath, JSON.stringify(scene));

    console.log(
      `[scene] zapisano ${outPath}: buildings=${buildingsResult.buildings.length} parcels=${parcelsResult.parcels.length} total=${scene.buildings.length}`
    );

    expect(scene.buildings.length).toBeGreaterThan(0);
  });
});
