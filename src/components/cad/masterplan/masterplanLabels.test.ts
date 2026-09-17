import { describe, it, expect, vi } from 'vitest';
import {
  formatBuildingHeightLabel,
  getAreaLabelText,
  buildMasterplanLabelCandidates,
  checkLabelOverlap,
  resolveMasterplanLabelCollisions,
  getMasterplanLabelHitAtPoint,
  getMasterplanLabelScreenAnchor,
  renderMasterplanLabels,
  MasterplanLabelCandidate,
} from './masterplanLabels';
import { BuildingLoop } from '@/types/geometry';

describe('masterplanLabels', () => {
  describe('formatBuildingHeightLabel', () => {
    it('formats integer and fractional heights correctly', () => {
      expect(formatBuildingHeightLabel(12)).toBe('12m');
      expect(formatBuildingHeightLabel(15.5)).toBe('15.5m');
      expect(formatBuildingHeightLabel(0)).toBe('0m');
      expect(formatBuildingHeightLabel(20.0)).toBe('20m');
    });
  });

  describe('getAreaLabelText', () => {
    it('returns custom name, raw plot number or function fallback', () => {
      expect(getAreaLabelText({ id: '1', vertices: [], name: 'Skwer' })).toBe('Skwer');
      expect(getAreaLabelText({ id: '2', vertices: [], plotNumber: '102/3' })).toBe('102/3');
      expect(getAreaLabelText({ id: '3', vertices: [], plotNumber: '55' })).toBe('55');
      expect(getAreaLabelText({ id: '4', vertices: [], areaType: 'playground' })).toBe('Plac zabaw');
      expect(getAreaLabelText({ id: '5', vertices: [], areaType: 'paved' })).toBe('Utwardzenie');
      expect(getAreaLabelText({ id: '6', vertices: [] })).toBe('');
    });
  });

  describe('buildMasterplanLabelCandidates', () => {
    const mockWorldToScreen = (wx: number, wy: number) => ({ sx: wx * 5, sy: wy * 5 });

    it('culls label if building is too small on screen', () => {
      const smallBldg = {
        id: 'small-1',
        vertices: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
        defaultHeight: 12,
      } as unknown as BuildingLoop;

      const candidates = buildMasterplanLabelCandidates(
        [smallBldg],
        (wx, wy) => ({ sx: wx, sy: wy }),
        1.0
      );

      expect(candidates.length).toBe(0);
    });

    it('creates simple height label for building centered on geometry', () => {
      const bldg = {
        id: 'bldg-1',
        vertices: [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
          { x: 40, y: 20 },
          { x: 0, y: 20 },
        ],
        defaultHeight: 18,
      } as unknown as BuildingLoop;

      const candidates = buildMasterplanLabelCandidates(
        [bldg],
        mockWorldToScreen,
        5.0
      );

      expect(candidates.length).toBe(1);
      expect(candidates[0].category).toBe('building');
      expect(candidates[0].text).toBe('18m');
      expect(candidates[0].angleRad).toBe(0);
      expect(candidates[0].sx).toBeCloseTo(20 * 5, 0);
      expect(candidates[0].sy).toBeCloseTo(10 * 5, 0);
    });

    it('creates rotated name label for boundary area along dominant angle with correct screen sign', () => {
      // Działka obrócona o kąt 0 (poziomy prostokąt)
      const plot = {
        id: 'plot-1',
        category: 'boundary',
        plotNumber: '55',
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 30 },
          { x: 0, y: 30 },
        ],
      } as unknown as BuildingLoop;

      const candidates = buildMasterplanLabelCandidates(
        [plot],
        mockWorldToScreen,
        2.0
      );

      expect(candidates.length).toBe(1);
      expect(candidates[0].category).toBe('boundary');
      expect(candidates[0].text).toBe('55');
      expect(candidates[0].angleRad).toBeCloseTo(0, 1);
    });

    it('skips boundary area without name or plot number', () => {
      const emptyPlot = {
        id: 'empty-1',
        category: 'boundary',
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 30 },
          { x: 0, y: 30 },
        ],
      } as unknown as BuildingLoop;

      const candidates = buildMasterplanLabelCandidates(
        [emptyPlot],
        mockWorldToScreen,
        2.0
      );

      expect(candidates.length).toBe(0);
    });
  });

  describe('checkLabelOverlap', () => {
    it('returns true when two labels overlap', () => {
      const a: MasterplanLabelCandidate = {
        id: 'a',
        buildingIds: ['a'],
        category: 'building',
        text: '12m',
        sx: 100,
        sy: 100,
        angleRad: 0,
        cardW: 40,
        cardH: 16,
        priority: 50,
      };

      const b: MasterplanLabelCandidate = {
        id: 'b',
        buildingIds: ['b'],
        category: 'building',
        text: '15m',
        sx: 110,
        sy: 105,
        angleRad: 0,
        cardW: 40,
        cardH: 16,
        priority: 50,
      };

      expect(checkLabelOverlap(a, b)).toBe(true);
    });
  });

  describe('resolveMasterplanLabelCollisions', () => {
    it('keeps higher priority label and culls overlapping lower priority label', () => {
      const bldg: MasterplanLabelCandidate = {
        id: 'bldg-1',
        buildingIds: ['bldg-1'],
        category: 'building',
        text: '15m',
        sx: 100,
        sy: 100,
        angleRad: 0,
        cardW: 35,
        cardH: 16,
        priority: 80,
      };

      const boundary: MasterplanLabelCandidate = {
        id: 'boundary-1',
        buildingIds: ['boundary-1'],
        category: 'boundary',
        text: 'Dz. 101/1',
        sx: 102,
        sy: 101,
        angleRad: 0,
        cardW: 55,
        cardH: 14,
        priority: 40,
      };

      const resolved = resolveMasterplanLabelCollisions([bldg, boundary]);

      expect(resolved.length).toBe(1);
      expect(resolved[0].id).toBe('bldg-1');
      expect(resolved[0].text).toBe('15m');
    });
  });

  describe('getMasterplanLabelHitAtPoint', () => {
    it('detects click on building label', () => {
      const bldg = {
        id: 'bldg-click-test',
        vertices: [
          { x: 10, y: 10 },
          { x: 90, y: 10 },
          { x: 90, y: 50 },
          { x: 10, y: 50 },
        ],
        defaultHeight: 14,
      } as unknown as BuildingLoop;

      const worldToScreen = (wx: number, wy: number) => ({ sx: wx * 4, sy: wy * 4 });
      const hitId = getMasterplanLabelHitAtPoint(
        202,
        120,
        [bldg],
        worldToScreen,
        4.0
      );

      expect(hitId).toBe('bldg-click-test');
    });
  });

  describe('getMasterplanLabelScreenAnchor', () => {
    it('returns anchor position at bottom of label', () => {
      const bldg = {
        id: 'bldg-anchor',
        vertices: [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 20, y: 20 },
          { x: 0, y: 20 },
        ],
        defaultHeight: 15,
      } as unknown as BuildingLoop;

      const worldToScreen = (wx: number, wy: number) => ({ sx: wx * 10, sy: wy * 10 });
      const anchor = getMasterplanLabelScreenAnchor(
        bldg,
        [bldg],
        worldToScreen,
        10.0
      );

      expect(anchor).not.toBeNull();
      expect(anchor!.sx).toBe(100);
      expect(anchor!.bottomSy).toBeGreaterThan(100);
    });
  });

  describe('renderMasterplanLabels', () => {
    it('renders labels on canvas without error', () => {
      const mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        setTransform: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        beginPath: vi.fn(),
        roundRect: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        fillText: vi.fn(),
        strokeText: vi.fn(),
        font: '',
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        textAlign: '',
        textBaseline: '',
      } as unknown as CanvasRenderingContext2D;

      const labels: MasterplanLabelCandidate[] = [
        {
          id: 'test-1',
          buildingIds: ['test-1'],
          category: 'building',
          text: '15m',
          sx: 50,
          sy: 50,
          angleRad: 0,
          cardW: 30,
          cardH: 16,
          priority: 50,
        },
        {
          id: 'test-2',
          buildingIds: ['test-2'],
          category: 'boundary',
          text: 'Dz. 12',
          sx: 150,
          sy: 150,
          angleRad: 0.25,
          cardW: 40,
          cardH: 14,
          priority: 30,
        },
      ];

      expect(() => renderMasterplanLabels(mockCtx, labels)).not.toThrow();
      expect(mockCtx.fillText).toHaveBeenCalledWith('15m', 0, 0);
      expect(mockCtx.strokeText).toHaveBeenCalledWith('Dz. 12', 0, 0);
      expect(mockCtx.fillText).toHaveBeenCalledWith('Dz. 12', 0, 0);
    });
  });
});
