import { describe, it, expect } from 'vitest';
import { buildDxfLines } from './dxfExport';
import { parseDxfWithMetadata } from './dxfParser';
import { BuildingLoop, Point2D } from '../types/geometry';

describe('Geodetic DXF export', () => {
  it('exports geodetic coordinates and enforces meter units ($INSUNITS = 6)', () => {
    // Geodetic building in EPSG:2180 (Kraków)
    const geodeticVertices: Point2D[] = [
      { x: 573200, y: 246200 },
      { x: 573240, y: 246200 },
      { x: 573240, y: 246230 },
      { x: 573200, y: 246230 },
    ];

    const testBuilding: BuildingLoop = {
      id: 'bldg-geod-1',
      name: 'Budynek Geodezyjny',
      layer: 'BUDYNKI',
      category: 'building',
      isTested: true,
      defaultHeight: 18.0,
      vertices: geodeticVertices,
      segments: [],
      firstFloorHeight: 3,
      typicalFloorHeight: 3,
      storeysCount: 6,
      hWindowBottom: 0.85,
      isCityCentre: false,
      buildingType: 'residential',
      transform: { tx: 0, ty: 0, rotationDeg: 0 },
    };

    const lines = buildDxfLines({
      buildings: [testBuilding],
      pinnedPoints: [],
    });

    const dxfContent = lines.join('\n');

    // 1. Sprawdź obecność $INSUNITS 6
    expect(dxfContent).toContain('$INSUNITS');
    expect(dxfContent).toMatch(/\$INSUNITS\r?\n\s*70\r?\n\s*6/);

    // 2. Sprawdź czy eksportowane współrzędne zawierają dokładne wartości geodezyjne
    expect(dxfContent).toContain('573200');
    expect(dxfContent).toContain('246200');

    // 3. Round-trip: wczytaj wyeksportowany DXF przez nasz parser i zweryfikuj zgodność
    const parsed = parseDxfWithMetadata(dxfContent);
    expect(parsed.buildings.length).toBe(1);
    expect(parsed.crs?.crs).toBe('EPSG:2180');
    expect(parsed.unitInfo.scale).toBe(1.0);
    expect(parsed.buildings[0].vertices[0].x).toBeCloseTo(573200, 2);
    expect(parsed.buildings[0].vertices[0].y).toBeCloseTo(246200, 2);
  });

  it('exports boundary objects to GRANICE_DZIALEK layer', () => {
    const boundaryVertices: Point2D[] = [
      { x: 573100, y: 246100 },
      { x: 573300, y: 246100 },
      { x: 573300, y: 246300 },
      { x: 573100, y: 246300 },
    ];

    const boundaryObj: BuildingLoop = {
      id: 'boundary-1',
      name: 'Działka 123/4',
      layer: 'DZIALKI',
      isTested: false,
      category: 'boundary',
      defaultHeight: 0,
      vertices: boundaryVertices,
      segments: [],
      firstFloorHeight: 0,
      typicalFloorHeight: 0,
      storeysCount: 0,
      hWindowBottom: 0,
      isCityCentre: false,
      buildingType: 'residential',
      transform: { tx: 0, ty: 0, rotationDeg: 0 },
    };

    const lines = buildDxfLines({
      buildings: [boundaryObj],
      pinnedPoints: [],
    });

    const dxfContent = lines.join('\n');
    expect(dxfContent).toContain('GRANICE_DZIALEK');

    const parsed = parseDxfWithMetadata(dxfContent);
    expect(parsed.buildings.length).toBe(1);
    expect(parsed.buildings[0].category).toBe('boundary');
  });
});
