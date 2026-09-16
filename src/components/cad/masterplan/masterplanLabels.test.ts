import { describe, it, expect, vi } from 'vitest';
import {
  formatBuildingHeightLabel,
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

  describe('buildMasterplanLabelCandidates (Geometry fit & elongated shapes)', () => {
    const mockWorldToScreen = (wx: number, wy: number) => ({ sx: wx * 5, sy: wy * 5 });

    it('culls label if building is too small on screen (scale zoomed out)', () => {
      // Budynek 1m x 1m przy skali 1.0 -> screenW = 1px, etykieta potrzebuje ~25px
      const smallBldg: BuildingLoop = {
        id: 'small-1',
        vertices: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
        defaultHeight: 12,
      };

      const candidates = buildMasterplanLabelCandidates(
        [smallBldg],
        (wx, wy) => ({ sx: wx, sy: wy }),
        1.0
      );

      expect(candidates.length).toBe(0);
    });

    it('retains and positions label correctly for very elongated buildings', () => {
      // Budynek 80m długości i 4m szerokości (np. pawilon / skrzydło)
      const elongatedBldg: BuildingLoop = {
        id: 'elongated-1',
        vertices: [
          { x: 0, y: 0 },
          { x: 80, y: 0 },
          { x: 80, y: 4 },
          { x: 0, y: 4 },
        ],
        defaultHeight: 12,
      };

      const candidates = buildMasterplanLabelCandidates(
        [elongatedBldg],
        mockWorldToScreen,
        5.0
      );

      expect(candidates.length).toBe(1);
      expect(candidates[0].id).toBe('elongated-1');
      expect(candidates[0].lines[0].text).toBe('12m');
      // Punkt wewnętrzny dla 80x4 powinien być w okolicach środka długości
      expect(candidates[0].sx).toBeCloseTo(40 * 5, 0);
      expect(candidates[0].sy).toBeCloseTo(2 * 5, 0);
    });
  });

  describe('checkLabelOverlap', () => {
    it('returns true when two label bounding boxes overlap', () => {
      const a: MasterplanLabelCandidate = {
        id: 'a',
        buildingIds: ['a'],
        category: 'building',
        sx: 100,
        sy: 100,
        cardW: 40,
        cardH: 16,
        lines: [{ text: '12m', font: '10px Inter', color: '#000' }],
        shapeBoundsScreen: { minSx: 50, maxSx: 150, minSy: 50, maxSy: 150 },
        priority: 50,
      };

      const b: MasterplanLabelCandidate = {
        id: 'b',
        buildingIds: ['b'],
        category: 'building',
        sx: 110,
        sy: 105,
        cardW: 40,
        cardH: 16,
        lines: [{ text: '15m', font: '10px Inter', color: '#000' }],
        shapeBoundsScreen: { minSx: 50, maxSx: 150, minSy: 50, maxSy: 150 },
        priority: 50,
      };

      expect(checkLabelOverlap(a, b)).toBe(true);
    });

    it('returns false when labels are well separated', () => {
      const a: MasterplanLabelCandidate = {
        id: 'a',
        buildingIds: ['a'],
        category: 'building',
        sx: 100,
        sy: 100,
        cardW: 40,
        cardH: 16,
        lines: [{ text: '12m', font: '10px Inter', color: '#000' }],
        shapeBoundsScreen: { minSx: 50, maxSx: 150, minSy: 50, maxSy: 150 },
        priority: 50,
      };

      const b: MasterplanLabelCandidate = {
        id: 'b',
        buildingIds: ['b'],
        category: 'building',
        sx: 250,
        sy: 300,
        cardW: 40,
        cardH: 16,
        lines: [{ text: '15m', font: '10px Inter', color: '#000' }],
        shapeBoundsScreen: { minSx: 200, maxSx: 300, minSy: 250, maxSy: 350 },
        priority: 50,
      };

      expect(checkLabelOverlap(a, b)).toBe(false);
    });
  });

  describe('resolveMasterplanLabelCollisions', () => {
    it('merges building label and boundary label into a single multi-line composite badge', () => {
      const bldgCandidate: MasterplanLabelCandidate = {
        id: 'bldg-1',
        buildingIds: ['bldg-1'],
        category: 'building',
        sx: 100,
        sy: 100,
        cardW: 35,
        cardH: 16,
        lines: [{ text: '15m', font: 'bold 11px Inter', color: '#334155' }],
        shapeBoundsScreen: { minSx: 20, maxSx: 180, minSy: 20, maxSy: 180 },
        priority: 80,
      };

      const boundaryCandidate: MasterplanLabelCandidate = {
        id: 'boundary-1',
        buildingIds: ['boundary-1'],
        category: 'boundary',
        sx: 102,
        sy: 101,
        cardW: 55,
        cardH: 14,
        lines: [{ text: 'Dz. 101/1', font: '9px Inter', color: '#64748b' }],
        shapeBoundsScreen: { minSx: 0, maxSx: 200, minSy: 0, maxSy: 200 },
        priority: 40,
      };

      const resolved = resolveMasterplanLabelCollisions([bldgCandidate, boundaryCandidate]);

      expect(resolved.length).toBe(1);
      expect(resolved[0].category).toBe('composite');
      expect(resolved[0].lines.length).toBe(2);
      expect(resolved[0].lines[0].text).toBe('Dz. 101/1');
      expect(resolved[0].lines[1].text).toBe('15m');
    });

    it('maintains higher priority label position without jitter when two labels overlap', () => {
      const bldg1: MasterplanLabelCandidate = {
        id: 'bldg-1',
        buildingIds: ['bldg-1'],
        category: 'building',
        sx: 100,
        sy: 100,
        cardW: 30,
        cardH: 16,
        lines: [{ text: '12m', font: '10px Inter', color: '#334155' }],
        shapeBoundsScreen: { minSx: 70, maxSx: 130, minSy: 50, maxSy: 150 },
        priority: 60,
      };

      const bldg2: MasterplanLabelCandidate = {
        id: 'bldg-2',
        buildingIds: ['bldg-2'],
        category: 'building',
        sx: 100,
        sy: 112, // lekki overlap
        cardW: 30,
        cardH: 16,
        lines: [{ text: '20m', font: '10px Inter', color: '#334155' }],
        shapeBoundsScreen: { minSx: 70, maxSx: 130, minSy: 60, maxSy: 160 },
        priority: 50,
      };

      const resolved = resolveMasterplanLabelCollisions([bldg1, bldg2]);

      // Wyższy priorytet zostaje na stałej pozycji, nie ma dryftu pozycji
      expect(resolved.length).toBe(1);
      expect(resolved[0].id).toBe('bldg-1');
      expect(resolved[0].sy).toBe(100);
    });
  });


  describe('getMasterplanLabelHitAtPoint', () => {
    it('accurately hits label of elongated building at click coordinates', () => {
      const elongatedBldg: BuildingLoop = {
        id: 'elongated-test',
        vertices: [
          { x: 10, y: 10 },
          { x: 90, y: 10 },
          { x: 90, y: 15 },
          { x: 10, y: 15 },
        ],
        defaultHeight: 14,
      };

      const worldToScreen = (wx: number, wy: number) => ({ sx: wx * 4, sy: wy * 4 });
      // Interior point is around (50, 12.5) -> screen (200, 50)
      const hitId = getMasterplanLabelHitAtPoint(
        202, // Kliknięcie lekko obok środka etykiety
        51,
        [elongatedBldg],
        worldToScreen,
        4.0
      );

      expect(hitId).toBe('elongated-test');
    });

    it('returns null when clicking away from label', () => {
      const bldg: BuildingLoop = {
        id: 'bldg-test',
        vertices: [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 20, y: 20 },
          { x: 0, y: 20 },
        ],
        defaultHeight: 15,
      };

      const worldToScreen = (wx: number, wy: number) => ({ sx: wx * 5, sy: wy * 5 });
      const hitId = getMasterplanLabelHitAtPoint(
        500, // daleko poza etykietą
        500,
        [bldg],
        worldToScreen,
        5.0
      );

      expect(hitId).toBeNull();
    });
  });

  describe('getMasterplanLabelScreenAnchor', () => {
    it('returns anchor at bottom of label card', () => {
      const bldg: BuildingLoop = {
        id: 'bldg-anchor',
        vertices: [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 20, y: 20 },
          { x: 0, y: 20 },
        ],
        defaultHeight: 15,
      };

      const worldToScreen = (wx: number, wy: number) => ({ sx: wx * 10, sy: wy * 10 });
      const anchor = getMasterplanLabelScreenAnchor(
        bldg,
        [bldg],
        worldToScreen,
        10.0
      );

      expect(anchor).not.toBeNull();
      expect(anchor!.sx).toBe(100);
      expect(anchor!.bottomSy).toBeGreaterThan(100); // poniżej środka
    });
  });

  describe('renderMasterplanLabels', () => {
    it('executes canvas draw calls without throwing', () => {
      const mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        setTransform: vi.fn(),
        beginPath: vi.fn(),
        roundRect: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        fillText: vi.fn(),
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
          sx: 50,
          sy: 50,
          cardW: 40,
          cardH: 16,
          lines: [{ text: '15m', font: '11px Inter', color: '#334155' }],
          shapeBoundsScreen: { minSx: 0, maxSx: 100, minSy: 0, maxSy: 100 },
          priority: 50,
        },
      ];

      expect(() => renderMasterplanLabels(mockCtx, labels)).not.toThrow();
      expect(mockCtx.fillText).toHaveBeenCalledWith('15m', 50, 50);
    });
  });
});
