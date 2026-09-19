import { describe, it, expect } from 'vitest';
import { BuildingLoop, Point2D } from '../../../types/geometry';
import {
  getBuildingBBox,
  doBBoxesOverlap,
  computeBBoxIoU,
  computeBuildingMatchScore,
  reconcileBuildingsWithOsm,
} from './buildingGeometryMatcher';

function createMockBuilding(
  id: string,
  vertices: Point2D[],
  holes?: Point2D[][],
  height: number = 15,
  storeys: number = 5
): BuildingLoop {
  return {
    id,
    name: `Building ${id}`,
    layer: 'WFS_BUDYNKI',
    category: 'building',
    isTested: false,
    isIncluded: true,
    isCityCentre: false,
    buildingType: 'residential',
    defaultHeight: height,
    hWindowBottom: 0.85,
    elevation: 0,
    firstFloorHeight: 3.5,
    typicalFloorHeight: 3.0,
    storeysCount: storeys,
    vertices,
    holes,
    segments: [],
    transform: { tx: 0, ty: 0, rotationDeg: 0 },
  };
}

describe('buildingGeometryMatcher', () => {
  describe('BBox operations', () => {
    it('computes correct Bounding Box for polygon vertices', () => {
      const bld = createMockBuilding('b1', [
        { x: 10, y: 20 },
        { x: 30, y: 20 },
        { x: 30, y: 50 },
        { x: 10, y: 50 },
      ]);
      const bbox = getBuildingBBox(bld);
      expect(bbox).toEqual({ minX: 10, maxX: 30, minY: 20, maxY: 50 });
    });

    it('checks overlap between bboxes correctly', () => {
      const b1 = { minX: 0, maxX: 10, minY: 0, maxY: 10 };
      const b2 = { minX: 8, maxX: 20, minY: 5, maxY: 15 };
      const b3 = { minX: 50, maxX: 60, minY: 50, maxY: 60 };

      expect(doBBoxesOverlap(b1, b2)).toBe(true);
      expect(doBBoxesOverlap(b1, b3)).toBe(false);
    });

    it('calculates IoU for overlapping BBoxes', () => {
      const b1 = { minX: 0, maxX: 10, minY: 0, maxY: 10 }; // Area = 100
      const b2 = { minX: 5, maxX: 15, minY: 0, maxY: 10 }; // Area = 100, Inter = 50, Union = 150
      const iou = computeBBoxIoU(b1, b2);
      expect(iou).toBeCloseTo(50 / 150, 2);
    });
  });

  describe('computeBuildingMatchScore', () => {
    it('returns high match score for almost identical building footprints', () => {
      const wfs = createMockBuilding('wfs1', [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 },
      ]);
      const osm = createMockBuilding('osm1', [
        { x: 0.5, y: 0.5 },
        { x: 19.5, y: 0.5 },
        { x: 19.5, y: 19.5 },
        { x: 0.5, y: 19.5 },
      ]);

      const score = computeBuildingMatchScore(wfs, [osm]);
      expect(score.bboxOverlapRatio).toBeGreaterThan(0.85);
      expect(score.wfsCoverageRatio).toBeGreaterThan(0.85);
      expect(score.iouRatio).toBeGreaterThan(0.85);
    });

    it('returns 0 for disjoint buildings', () => {
      const wfs = createMockBuilding('wfs1', [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ]);
      const osm = createMockBuilding('osm1', [
        { x: 100, y: 100 },
        { x: 110, y: 100 },
        { x: 110, y: 110 },
        { x: 100, y: 110 },
      ]);

      const score = computeBuildingMatchScore(wfs, [osm]);
      expect(score.bboxOverlapRatio).toBe(0);
      expect(score.wfsCoverageRatio).toBe(0);
      expect(score.iouRatio).toBe(0);
    });
  });

  describe('reconcileBuildingsWithOsm', () => {
    it('replaces a WFS building without courtyard when OSM has a courtyard (holes)', () => {
      // WFS solid building 30x30
      const wfs = createMockBuilding('wfs-solid', [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 30 },
        { x: 0, y: 30 },
      ]);

      // OSM building with 10x10 hole inside
      const osmHole = [
        { x: 10, y: 10 },
        { x: 20, y: 10 },
        { x: 20, y: 20 },
        { x: 10, y: 20 },
      ];
      const osmWithCourtyard = createMockBuilding(
        'osm-courtyard',
        [
          { x: 0, y: 0 },
          { x: 30, y: 0 },
          { x: 30, y: 30 },
          { x: 0, y: 30 },
        ],
        [osmHole]
      );

      const result = reconcileBuildingsWithOsm([wfs], [osmWithCourtyard]);
      expect(result.stats.replacedWithHoles).toBe(1);
      expect(result.stats.keptWfs).toBe(0);
      expect(result.buildings.length).toBe(1);
      expect(result.buildings[0].holes).toBeDefined();
      expect(result.buildings[0].holes?.length).toBe(1);
    });

    it('replaces a single WFS footprint with multiple OSM parts', () => {
      // WFS single building 40x20
      const wfs = createMockBuilding('wfs-complex', [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 20 },
        { x: 0, y: 20 },
      ]);

      // OSM split into two parts: tower (part 1: 20x20, 30m high) and low podium (part 2: 20x20, 10m high)
      const osmPart1 = createMockBuilding(
        'osm-part-1',
        [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 20, y: 20 },
          { x: 0, y: 20 },
        ],
        undefined,
        30,
        10
      );
      const osmPart2 = createMockBuilding(
        'osm-part-2',
        [
          { x: 20, y: 0 },
          { x: 40, y: 0 },
          { x: 40, y: 20 },
          { x: 20, y: 20 },
        ],
        undefined,
        10,
        3
      );

      const result = reconcileBuildingsWithOsm([wfs], [osmPart1, osmPart2]);
      expect(result.stats.replacedWithMoreParts).toBe(1);
      expect(result.stats.keptWfs).toBe(0);
      expect(result.buildings.length).toBe(2);
      expect(result.buildings[0].defaultHeight).toBe(30);
      expect(result.buildings[1].defaultHeight).toBe(10);
    });

    it('keeps WFS geometry when OSM is not more detailed', () => {
      const wfs = createMockBuilding('wfs-exact', [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 },
      ]);

      const osm = createMockBuilding('osm-simple', [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 },
      ]);

      const result = reconcileBuildingsWithOsm([wfs], [osm]);
      expect(result.stats.replacedWithHoles).toBe(0);
      expect(result.stats.replacedWithMoreParts).toBe(0);
      expect(result.stats.keptWfs).toBe(1);
      expect(result.buildings[0].id).toBe('wfs-exact');
    });
  });
});
