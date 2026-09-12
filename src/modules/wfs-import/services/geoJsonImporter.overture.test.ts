import { describe, it, expect } from 'vitest';
import { importOvertureLines, importOverturePolygons } from './geoJsonImporter';
import { GeoJsonFeatureCollection } from './wfsWarsawClient';

// Środek projektu w Poznaniu (ten sam punkt co reference/topoexport) — CRS lokalny CAD.
const projectCenter = { lat: 52.4064, lon: 16.9252 };
const projectCrs = {
  crs: 'LOCAL' as const,
  description: 'lokalny',
  geodeticLabel: 'LOKALNY (CAD)',
  isGeodetic: false,
  isLocalReference: true,
};

describe('importOvertureLines', () => {
  it('konwertuje LineString (drogi/koleje) na punkty CAD względem środka projektu', () => {
    const collection: GeoJsonFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[16.9252, 52.4064], [16.9262, 52.4064]] },
          properties: { id: 'road-1', class: 'residential' },
        },
      ],
    };

    const lines = importOvertureLines(collection, projectCrs, projectCenter);

    expect(lines).toHaveLength(1);
    expect(lines[0].id).toBe('road-1');
    expect(lines[0].className).toBe('residential');
    expect(lines[0].points).toHaveLength(2);
    // Pierwszy punkt to środek projektu -> (0,0) lokalnie
    expect(lines[0].points[0].x).toBeCloseTo(0, 3);
    expect(lines[0].points[0].y).toBeCloseTo(0, 3);
    // Drugi punkt przesunięty na wschód (dodatnie x)
    expect(lines[0].points[1].x).toBeGreaterThan(0);
  });

  it('ignoruje cechy z geometrią inną niż LineString/MultiLineString', () => {
    const collection: GeoJsonFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [16.9252, 52.4064] }, properties: null },
      ],
    };

    expect(importOvertureLines(collection, projectCrs, projectCenter)).toHaveLength(0);
  });
});

describe('importOverturePolygons', () => {
  it('konwertuje Polygon (zieleń) na pierścienie CAD', () => {
    const collection: GeoJsonFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [16.9252, 52.4064],
              [16.9262, 52.4064],
              [16.9262, 52.4074],
              [16.9252, 52.4064],
            ]],
          },
          properties: { id: 'park-1', class: 'park' },
        },
      ],
    };

    const polygons = importOverturePolygons(collection, projectCrs, projectCenter);

    expect(polygons).toHaveLength(1);
    expect(polygons[0].id).toBe('park-1');
    expect(polygons[0].className).toBe('park');
    expect(polygons[0].rings).toHaveLength(1);
    expect(polygons[0].rings[0]).toHaveLength(4);
  });

  it('odrzuca pierścienie z mniej niż 3 punktami', () => {
    const collection: GeoJsonFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[16.9252, 52.4064], [16.9262, 52.4064]]] },
          properties: null,
        },
      ],
    };

    expect(importOverturePolygons(collection, projectCrs, projectCenter)).toHaveLength(0);
  });
});
