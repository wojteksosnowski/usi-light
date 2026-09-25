import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useCadViewport } from './useCadViewport';
import { BuildingLoop } from '../../../types/geometry';
import { GeometryCompiler } from '../../../engine/compiler/GeometryCompiler';

describe('useCadViewport - Canonical Precomputed Geometry & fitToExtents', () => {
  const createMockContainer = (width = 1000, height = 800) => {
    const el = {
      clientWidth: width,
      clientHeight: height,
      getBoundingClientRect: () => ({
        width,
        height,
        top: 0,
        left: 0,
        bottom: height,
        right: width,
        x: 0,
        y: 0,
        toJSON: () => {},
      }),
    } as unknown as HTMLDivElement;
    return { current: el };
  };

  const sampleBuilding: BuildingLoop = {
    id: 'b1',
    name: 'Budynek A',
    category: 'building',
    buildingType: 'residential',
    layer: 'Domyślna (0)',
    defaultHeight: 15,
    elevation: 0,
    storeysCount: 5,
    firstFloorHeight: 3,
    typicalFloorHeight: 3,
    hWindowBottom: 0.85,
    isTested: true,
    isCityCentre: false,
    vertices: [
      { x: 10, y: 10 },
      { x: 30, y: 10 },
      { x: 30, y: 40 },
      { x: 10, y: 40 },
    ],
    holes: [
      [
        { x: 15, y: 15 },
        { x: 25, y: 15 },
        { x: 25, y: 25 },
        { x: 15, y: 25 },
      ],
    ],
    segments: [],
    storyPolygons: [],
    zonePolygons: [],
    transform: { tx: 0, ty: 0, rotationDeg: 0 },
    isIncluded: true,
  };

  it('oblicza rzutowanie extents bez otworów holes, bazując wyłącznie na zewnętrznej geometrii w GeometryCompiler', () => {
    const compiled = GeometryCompiler.bakeBuilding(sampleBuilding);
    const bldgWithComputed: BuildingLoop = {
      ...sampleBuilding,
      computed: compiled,
    };

    // Obiekt z otworem dziedzińca
    const bounds = GeometryCompiler.getBuildingBounds2D(bldgWithComputed);
    expect(bounds).not.toBeNull();
    expect(bounds!.min).toEqual({ x: 10, y: 10 });
    expect(bounds!.max).toEqual({ x: 30, y: 40 });
  });

  it('poprawnie wylicza parametry widoku w fitToExtents dla widoku standardowego (0°) oraz obróconego (45°)', () => {
    const compiled = GeometryCompiler.bakeBuilding(sampleBuilding);
    const bldgWithComputed: BuildingLoop = {
      ...sampleBuilding,
      computed: compiled,
    };

    let hookResult0: ReturnType<typeof useCadViewport> | null = null;
    let hookResult45: ReturnType<typeof useCadViewport> | null = null;
    const containerRef = createMockContainer(1000, 800);

    const Component0 = () => {
      hookResult0 = useCadViewport(containerRef, [bldgWithComputed], 0);
      return null;
    };

    const Component45 = () => {
      hookResult45 = useCadViewport(containerRef, [bldgWithComputed], 45);
      return null;
    };

    renderToStaticMarkup(<Component0 />);
    renderToStaticMarkup(<Component45 />);

    expect(hookResult0).not.toBeNull();
    expect(hookResult45).not.toBeNull();

    // Sprawdzamy czy fitToExtents wykonuje się bezbłędnie
    expect(() => hookResult0!.fitToExtents()).not.toThrow();
    expect(() => hookResult45!.fitToExtents()).not.toThrow();
  });

  it('ignoruje otwory dziedzińców przy rzutowaniu obwiedni w GeometryCompiler i nie rozszerza granic', () => {
    const buildingWithHoleExtendingOutward: BuildingLoop = {
      ...sampleBuilding,
      vertices: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      holes: [
        [
          { x: 20, y: 20 },
          { x: 80, y: 20 },
          { x: 80, y: 80 },
          { x: 20, y: 80 },
        ],
      ],
    };

    const compiled = GeometryCompiler.bakeBuilding(buildingWithHoleExtendingOutward);
    expect(compiled.representation2D.bounds2D.min).toEqual({ x: 0, y: 0 });
    expect(compiled.representation2D.bounds2D.max).toEqual({ x: 100, y: 100 });
  });
});
