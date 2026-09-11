import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fetchWarsawBuildings, fetchWarsawParcels } from '../src/modules/wfs-import/services/wfsWarsawClient';
import { importBuildingsFromGeoJson, importParcelsFromGeoJson } from '../src/modules/wfs-import/services/geoJsonImporter';
import { latLonToBbox } from '../src/modules/wfs-import/services/geocoding';
import { detectCoordinateSystem } from '../src/utils/geoTransform';

/**
 * Skrypt testu wydajności - pobiera realne dane WFS Warszawy (Plac Defilad, r=300m)
 * i zapisuje surowe GeoJSON jako fixture do powtarzalnych testów offline.
 *
 * Domyślnie POMIJANY (żeby nie hitować publicznego WFS UM Warszawa w normalnym `npm test`/CI).
 * Uruchomienie na żądanie:
 *   RUN_LIVE_FETCH=1 npx vitest run scripts/fetchWarsawPerfFixture.live.test.ts
 */
const shouldRun = process.env.RUN_LIVE_FETCH === '1';
const describeOrSkip = shouldRun ? describe : describe.skip;

// Plac Defilad (52.2319, 21.0067) daje >150 działek ale za mało budynków (park/plac) -
// zweryfikowano empirycznie: Rynek Starego Miasta spełnia próg 150+150 (357 budynków, 259 działek przy r=300m).
const CENTER = process.env.PERF_LAT && process.env.PERF_LON
  ? { lat: Number(process.env.PERF_LAT), lon: Number(process.env.PERF_LON) }
  : { lat: 52.2496, lon: 21.0122 }; // Rynek Starego Miasta
const RADIUS_METERS = 300;
const MIN_COUNT = 150;

describeOrSkip('Warsaw perf fixture (live fetch)', () => {
  it('fetches buildings + parcels near Plac Defilad and caches them to disk', async () => {
    const bbox = latLonToBbox(CENTER.lat, CENTER.lon, RADIUS_METERS);
    const projectCrs = detectCoordinateSystem([], CENTER);
    const sourceCrs = {
      crs: 'EPSG:2178' as const,
      description: 'PL-2000 strefa 7',
      geodeticLabel: 'ETRF2000-PL / CS2000 / 21',
      isGeodetic: true,
      zone: 7,
    };

    const [buildingsGeoJson, parcelsGeoJson] = await Promise.all([
      fetchWarsawBuildings(bbox),
      fetchWarsawParcels(bbox),
    ]);

    const buildingsResult = importBuildingsFromGeoJson(buildingsGeoJson, sourceCrs, projectCrs, CENTER);
    const parcelsResult = importParcelsFromGeoJson(parcelsGeoJson, sourceCrs, projectCrs, CENTER);

    console.log(
      `[fixture] buildings=${buildingsResult.buildings.length} parcels=${parcelsResult.parcels.length} (próg: ${MIN_COUNT})`
    );

    const fixtureDir = path.resolve(__dirname, 'fixtures');
    fs.mkdirSync(fixtureDir, { recursive: true });
    fs.writeFileSync(
      path.join(fixtureDir, 'warsaw-old-town-r300.json'),
      JSON.stringify(
        {
          center: CENTER,
          radiusMeters: RADIUS_METERS,
          bbox,
          fetchedAt: new Date().toISOString(),
          buildingsGeoJson,
          parcelsGeoJson,
          buildingsCount: buildingsResult.buildings.length,
          parcelsCount: parcelsResult.parcels.length,
        },
        null,
        2
      )
    );

    if (buildingsResult.buildings.length < MIN_COUNT || parcelsResult.parcels.length < MIN_COUNT) {
      console.warn(
        `[fixture] UWAGA: nie osiągnięto progu ${MIN_COUNT}+${MIN_COUNT} - rozważ inny punkt centralny (np. Rynek Starego Miasta).`
      );
    }

    expect(buildingsResult.buildings.length).toBeGreaterThan(0);
    expect(parcelsResult.parcels.length).toBeGreaterThan(0);
  }, 60000);
});
