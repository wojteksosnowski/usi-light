import { describe, it, expect } from 'vitest';
import { importOvertureLines, importOverturePolygons, classifyOvertureFeature } from './geoJsonImporter';
import { GeoJsonFeatureCollection } from '../city/wfsWarsawClient';

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

describe('classifyOvertureFeature', () => {
  it('prawidłowo przypisuje kategorie zagospodarowania terenu', () => {
    expect(classifyOvertureFeature({ class: 'park' })).toBe('green');
    expect(classifyOvertureFeature({ class: 'forest' })).toBe('green');
    expect(classifyOvertureFeature({ class: 'residential' })).toBe('residential');
    expect(classifyOvertureFeature({ class: 'commercial' })).toBe('commercial');
    expect(classifyOvertureFeature({ class: 'industrial' })).toBe('industrial');
    expect(classifyOvertureFeature({ class: 'school' })).toBe('institutional');
    expect(classifyOvertureFeature({ class: 'hospital' })).toBe('institutional');
    expect(classifyOvertureFeature({ class: 'farmland' })).toBe('agricultural');
    expect(classifyOvertureFeature({ class: 'parking' })).toBe('infrastructure');
    expect(classifyOvertureFeature({ type: 'water' })).toBe('water');
    expect(classifyOvertureFeature({ subtype: 'water' })).toBe('water');
    expect(classifyOvertureFeature({ class: 'lake' })).toBe('water');
  });
});

describe('importOverturePolygons', () => {
  it('konwertuje Polygon (zieleń) na pierścienie CAD z poprawną kategorią', () => {
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
    expect(polygons[0].category).toBe('green');
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

  it('importuje i kategoryzuje różnorodne strefy zagospodarowania (np. residential, industrial, commercial)', () => {
    const collection: GeoJsonFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[[16.9252, 52.4064], [16.9262, 52.4064], [16.9262, 52.4074], [16.9252, 52.4064]]],
          },
          properties: { id: 'bldg-zone', class: 'residential', subtype: 'land_use' },
        },
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[[16.9252, 52.4064], [16.9262, 52.4064], [16.9262, 52.4074], [16.9252, 52.4064]]],
          },
          properties: { id: 'ind-zone', class: 'industrial', subtype: 'land_use' },
        },
      ],
    };

    const polygons = importOverturePolygons(collection, projectCrs, projectCenter);
    expect(polygons).toHaveLength(2);
    expect(polygons[0].category).toBe('residential');
    expect(polygons[1].category).toBe('industrial');
  });
});
