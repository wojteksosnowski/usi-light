import { describe, it, expect } from 'vitest';
import { GeometryCompiler } from './GeometryCompiler';
import { BuildingLoop, Point2D } from '../../types/geometry';
import { translateBuildingGeometry } from '../../store/useSceneStore';
import { getCachedGroundShadowSamples, clearMasterplanShadowCache } from '../../components/cad/masterplan/masterplanShadowCache';
import { extractBuildingStoryTiers } from '../../components/cad/masterplan/masterplanGeometry';

describe('GeometryCompiler & Shadow / Modifier Edit Synchronization', () => {
  it('updates geometryHash in transformCompiledGeometry upon translation and rotation', () => {
    const baseBuilding: BuildingLoop = {
      id: 'bldg-sync-1',
      name: 'Sync Building',
      category: 'building',
      layer: 'Bariery',
      isTested: true,
      isCityCentre: false,
      buildingType: 'residential',
      hWindowBottom: 0.85,
      segments: [],
      vertices: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 15 },
        { x: 0, y: 15 },
      ],
      defaultHeight: 12,
      elevation: 0,
      firstFloorHeight: 3.5,
      typicalFloorHeight: 3.0,
      storeysCount: 4,
      transform: { tx: 0, ty: 0, rotationDeg: 0 },
    };

    const baked = GeometryCompiler.bakeBuilding(baseBuilding);
    const initialHash = baked.geometryHash;
    expect(initialHash).toBeTruthy();

    // Translacja
    const translated = GeometryCompiler.transformCompiledGeometry(baked, 15, 25);
    expect(translated.geometryHash).not.toBe(initialHash);
    expect(translated.representation2D.bounds2D.min.x).toBeCloseTo(15);
    expect(translated.representation2D.bounds2D.min.y).toBeCloseTo(25);

    // Rotacja
    const rotated = GeometryCompiler.transformCompiledGeometry(baked, 0, 0, Math.PI / 2, { x: 10, y: 7.5 });
    expect(rotated.geometryHash).not.toBe(initialHash);
    expect(rotated.geometryHash).not.toBe(translated.geometryHash);
  });

  it('invalidates masterplan ground shadow cache upon moveBuilding translation', () => {
    clearMasterplanShadowCache();

    const building: BuildingLoop = {
      id: 'bldg-shadow-move',
      name: 'Shadow Move',
      category: 'building',
      layer: 'Bariery',
      isTested: true,
      isCityCentre: false,
      buildingType: 'residential',
      hWindowBottom: 0.85,
      segments: [],
      vertices: [
        { x: 10, y: 10 },
        { x: 30, y: 10 },
        { x: 30, y: 30 },
        { x: 10, y: 30 },
      ],
      defaultHeight: 15,
      elevation: 0,
      transform: { tx: 0, ty: 0, rotationDeg: 0 },
    };
    building.computed = GeometryCompiler.bakeBuilding(building);

    const initialTiers = extractBuildingStoryTiers(building);
    const initialSamples = getCachedGroundShadowSamples(
      initialTiers,
      [{ color: 'rgba(0,0,0,0.2)', offsetMin: 0 }],
      52.23,
      21.01,
      'spring',
      12.0,
      'raycasting'
    );
    expect(initialSamples.samples.length).toBeGreaterThan(0);
    const initialPoly0 = initialSamples.samples[0].polys[0].outer[0];

    // Przesuń budynek o dx=50, dy=50
    const movedBuilding = translateBuildingGeometry(building, 50, 50);
    const movedTiers = extractBuildingStoryTiers(movedBuilding);
    const movedSamples = getCachedGroundShadowSamples(
      movedTiers,
      [{ color: 'rgba(0,0,0,0.2)', offsetMin: 0 }],
      52.23,
      21.01,
      'spring',
      12.0,
      'raycasting'
    );
    expect(movedSamples.samples.length).toBeGreaterThan(0);
    const movedPoly0 = movedSamples.samples[0].polys[0].outer[0];

    // Cień musi natychmiast ulec przesunięciu o ~50m
    expect(movedPoly0.x).toBeCloseTo(initialPoly0.x + 50, 1);
    expect(movedPoly0.y).toBeCloseTo(initialPoly0.y + 50, 1);
  });

  it('correctly regenerates modifier storyPolygons and segments on vertex edit preview', () => {
    const buildingWithTerrace: BuildingLoop = {
      id: 'bldg-terrace-edit',
      name: 'Terrace Building',
      category: 'building',
      layer: 'Bariery',
      isTested: true,
      isCityCentre: false,
      buildingType: 'residential',
      hWindowBottom: 0.85,
      segments: [],
      vertices: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 },
      ],
      defaultHeight: 12,
      elevation: 0,
      firstFloorHeight: 3.0,
      typicalFloorHeight: 3.0,
      storeysCount: 4,
      transform: { tx: 0, ty: 0, rotationDeg: 0 },
      modifiers: [
        {
          id: 'mod-terrace-1',
          type: 'terrace',
          enabled: true,
          storiesCount: -1, // top story
          depth: -3.0,
          edgeIndex: 1, // odsuwa krawędź x=20
        },
      ],
    };

    // Przeciągamy wierzchołek 1 (z 20, 0 do 25, 0)
    const updatedVerts = [
      { x: 0, y: 0 },
      { x: 25, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
    ];

    const baked = GeometryCompiler.bakeBuilding({
      ...buildingWithTerrace,
      vertices: updatedVerts,
    });

    // Wypieczona geometria musi odzwierciedlać nowy wierzchołek
    expect(baked.representation2D.footprintBase.exterior[1].x).toBe(25);
    expect(baked.representation2D.storySlices.length).toBeGreaterThan(0);
    // Story slices muszą mieć dopasowany obrys z uskokiem tarasowym
    const topStory = baked.representation2D.storySlices[baked.representation2D.storySlices.length - 1];
    expect(topStory.footprint.exterior.length).toBeGreaterThan(0);
    expect(topStory.footprint.exterior[1].x).toBeLessThan(25);
    expect(topStory.footprint.exterior[1].x).toBeCloseTo(21.91, 1);
  });
});

