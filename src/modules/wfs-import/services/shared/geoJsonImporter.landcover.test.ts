// Plik testowy sprawdzający import pokrycia terenu i parsowanie współrzędnych
import { describe, it, expect } from 'vitest';
import { importLandCoverFromGeoJson } from './geoJsonImporter';
import { GeoJsonFeatureCollection } from '../city/wfsWarsawClient';
import { parseWktPolygonCoordinates } from './wfsGmlUtils';

const projectCenter = { lat: 52.4064, lon: 16.9252 };
const localCrs = {
  crs: 'LOCAL' as const,
  description: 'lokalny',
  geodeticLabel: 'LOKALNY (CAD)',
  isGeodetic: false,
  isLocalReference: true,
};

describe('importLandCoverFromGeoJson', () => {
  it('konwertuje jednostkę pokrycia terenu z klasyfikacją, bez otworu', () => {
    const collection: GeoJsonFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]]],
          },
          properties: { class: 'http://iip.gugik.gov.pl/cl/LC/LandCoverObservationClass/grass' },
        },
      ],
    };

    const result = importLandCoverFromGeoJson(collection, localCrs, localCrs, projectCenter);

    expect(result).toHaveLength(1);
    expect(result[0].outer.length).toBe(4);
    expect(result[0].holes).toBeUndefined();
    expect(result[0].landCoverClass).toBe('grass');
  });

  it('zachowuje otwór wewnętrzny jako holes', () => {
    const outer = [[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]];
    const hole = [[8, 8], [12, 8], [12, 12], [8, 12], [8, 8]];
    const collection: GeoJsonFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [outer, hole] },
          properties: { class: 'http://iip.gugik.gov.pl/cl/LC/LandCoverObservationClass/flowingWater' },
        },
      ],
    };

    const result = importLandCoverFromGeoJson(collection, localCrs, localCrs, projectCenter);

    expect(result).toHaveLength(1);
    expect(result[0].holes).toHaveLength(1);
    expect(result[0].holes![0]).toHaveLength(4);
    expect(result[0].landCoverClass).toBe('flowingWater');
  });

  it('zwraca pustą tablicę gdy klasa nie jest podana', () => {
    const collection: GeoJsonFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] },
          properties: {},
        },
      ],
    };

    const result = importLandCoverFromGeoJson(collection, localCrs, localCrs, projectCenter);
    expect(result).toHaveLength(1);
    expect(result[0].landCoverClass).toBeNull();
  });

  it('poprawnie parsuje geometrię WKT z usługi wfsLCV GUGiK (outer + holes) z zamianą osi na [easting, northing]', () => {
    const wkt = 'POLYGON ((506621.85 358405.46, 506621.79 358405.45, 506620.0 358400.0, 506621.85 358405.46), (506610.0 358402.0, 506612.0 358404.0, 506610.0 358402.0))';
    const rings = parseWktPolygonCoordinates(wkt);

    expect(rings).not.toBeNull();
    expect(rings).toHaveLength(2);
    expect(rings![0]).toHaveLength(4);
    // Pierwsza współrzędna w GeoJSON to easting (~358k), druga northing (~506k)
    expect(rings![0][0]).toEqual([358405.46, 506621.85]);
    expect(rings![1]).toHaveLength(3);
    expect(rings![1][0]).toEqual([358402.0, 506610.0]);
  });

  it('dokonuje poprawnej transformacji z EPSG:2180 (Poznań) do układu CAD, trafiając bezpośrednio w obszar projektu', () => {
    // Odpowiedź z WFS GUGiK w Poznaniu (współrzędne northing ~506621, easting ~358405)
    // Środek projektu w Poznaniu: lat 52.4064, lon 16.9252
    const rings = parseWktPolygonCoordinates('POLYGON ((506621.85 358405.46, 506621.79 358405.45, 506620.0 358400.0, 506621.85 358405.46))');
    expect(rings).not.toBeNull();

    const collection: GeoJsonFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: rings! },
          properties: { class: 'http://iip.gugik.gov.pl/cl/LC/LandCoverObservationClass/grass' },
        },
      ],
    };

    const epsg2180Crs = {
      crs: 'EPSG:2180' as const,
      description: 'Układ PL-1992 (EPSG:2180)',
      geodeticLabel: 'ETRF2000-PL / CS1992',
      isGeodetic: true,
    };

    const result = importLandCoverFromGeoJson(collection, epsg2180Crs, localCrs, projectCenter);

    expect(result).toHaveLength(1);
    const vertices = result[0].outer;
    expect(vertices.length).toBeGreaterThanOrEqual(3);

    // Weryfikacja dokładności geograficznej: punkty muszą leżeć w obrębie kilkuset metrów od centrum Poznania
    for (const pt of vertices) {
      expect(Math.abs(pt.x)).toBeLessThan(1000); // Promień CAD < 1000m
      expect(Math.abs(pt.y)).toBeLessThan(1000);
    }

    // Gdyby osie X/Y były zamienione, odległość wynosiłaby > 150 000 metrów!
    expect(Math.abs(vertices[0].x)).toBeLessThan(600);
    expect(Math.abs(vertices[0].y)).toBeLessThan(200);
  });
});
