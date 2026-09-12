import { describe, it, expect } from 'vitest';
import { importLandCoverFromGeoJson } from './geoJsonImporter';
import { GeoJsonFeatureCollection } from './wfsWarsawClient';

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
});
