import { describe, it, expect } from 'vitest';
import { importBuildingsFromGeoJson, importParcelsFromGeoJson } from './geoJsonImporter';
import { GeoJsonFeatureCollection } from './wfsWarsawClient';

const projectCenter = { lat: 52.4064, lon: 16.9252 };
const localCrs = {
  crs: 'LOCAL' as const,
  description: 'lokalny',
  geodeticLabel: 'LOKALNY (CAD)',
  isGeodetic: false,
  isLocalReference: true,
};

// Kwadrat 20x20 m z otworem 4x4 m pośrodku (dziedziniec / enklawa).
const outerRing = [
  [0, 0],
  [20, 0],
  [20, 20],
  [0, 20],
  [0, 0],
];
const holeRing = [
  [8, 8],
  [12, 8],
  [12, 12],
  [8, 12],
  [8, 8],
];

describe('importBuildingsFromGeoJson z otworami', () => {
  it('zachowuje otwór jako BuildingLoop.holes zamiast tworzyć osobny obiekt', () => {
    const collection: GeoJsonFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [outerRing, holeRing] },
          properties: { ID_BUDYNKU: 'donut-1' },
        },
      ],
    };

    const { buildings, warnings } = importBuildingsFromGeoJson(collection, localCrs, localCrs, projectCenter);

    expect(warnings).toHaveLength(0);
    expect(buildings).toHaveLength(1);
    const bldg = buildings[0];
    expect(bldg.vertices.length).toBe(4);
    expect(bldg.holes).toBeDefined();
    expect(bldg.holes).toHaveLength(1);
    expect(bldg.holes![0]).toHaveLength(4);
    // Segmenty: obrys zewnętrzny + otwór
    expect(bldg.segments.length).toBe(bldg.vertices.length + bldg.holes![0].length);
    expect(bldg.segments.some((s) => s.ringIndex === 1)).toBe(true);
  });
});

describe('importParcelsFromGeoJson z otworami', () => {
  it('zachowuje otwór działki jako holes zamiast gubić go', () => {
    const collection: GeoJsonFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [outerRing, holeRing] },
          properties: { ID_DZIALKI: 'dzialka-1', NUMER_DZIALKI: '1/2' },
        },
      ],
    };

    const { parcels } = importParcelsFromGeoJson(collection, localCrs, localCrs, projectCenter);

    expect(parcels).toHaveLength(1);
    expect(parcels[0].holes).toHaveLength(1);
  });
});
