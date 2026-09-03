import { Point2D, BuildingLoop, CadLayerSettings } from '../../types/geometry';
import { CachedLineEquation } from '../lineBufferEngine';
import { AnchorPoint, OsnapSnapResult, evaluateOsnapSnap } from '../cadCursorSnapEngine';
import { calculateDirectionSnap, DirectionSnapResult } from '../directionSnapping';
import { DominantDirection } from '../segmentStatistics';

export type SnapType =
  | 'endpoint'
  | 'midpoint'
  | 'intersection'
  | 'perpendicular'
  | 'otrack_ray'
  | 'otrack_intersection'
  | 'ortho_parallel'
  | 'ortho_perpendicular'
  | 'dominant'
  | 'grid'
  | 'none';

export interface SnapGuideLine {
  p1: Point2D;
  p2: Point2D;
  type?: string;
  isStatistical?: boolean;
}

export interface SnapResult {
  point: Point2D;
  snapped: boolean;
  type: SnapType;
  guideLines?: SnapGuideLine[];
  label?: string;
  description?: string;
  screenDistancePx?: number;
  rawOsnap?: OsnapSnapResult | null;
  rawDirection?: DirectionSnapResult | null;
}

export interface SnapContext {
  mouseWorld: Point2D;
  mouseScreen: { sx: number; sy: number };
  worldToScreen: (wx: number, wy: number) => { sx: number; sy: number };
  screenToWorld: (sx: number, sy: number) => { wx: number; wy: number };
  buildings: BuildingLoop[];
  lineBuffer: CachedLineEquation[];
  acquiredAnchors: AnchorPoint[];
  dominantDirections?: DominantDirection[];
  originPoint?: Point2D | null;
  isOsnapActive: boolean;
  isDirectionSnappingActive: boolean;
  gridSnapEnabled?: boolean;
  gridSize?: number;
  excludeBuildingId?: string;
  hoveredBuildingId?: string;
  selectedBuildingId?: string;
}

export interface ISnapRule {
  name: string;
  priority: number; // 1 = highest, 10 = lowest
  evaluate(ctx: SnapContext): SnapResult | null;
}

/**
 * Reguła 1: Przyciąganie obiektowe (OSNAP i OTRACK)
 * Koniec odcinka, środek, prostopadłość, przecięcia linii śledzenia.
 */
export class ObjectSnapRule implements ISnapRule {
  name = 'ObjectSnapRule';
  priority = 1;

  evaluate(ctx: SnapContext): SnapResult | null {
    if (!ctx.isOsnapActive) return null;

    const osnap = evaluateOsnapSnap({
      mouseWorld: ctx.mouseWorld,
      lineBuffer: ctx.lineBuffer,
      acquiredPoints: ctx.acquiredAnchors,
      worldToScreen: ctx.worldToScreen,
      excludeBuildingId: ctx.excludeBuildingId,
    });

    if (!osnap) return null;

    const guideLines: SnapGuideLine[] = [];
    if (osnap.rayLine) {
      guideLines.push({
        p1: osnap.rayLine.p1,
        p2: osnap.rayLine.p2,
        type: osnap.type,
        isStatistical: osnap.isStatisticalGuide,
      });
    }

    let snapType: SnapType = 'none';
    switch (osnap.type) {
      case 'endpoint':
        snapType = 'endpoint';
        break;
      case 'midpoint':
        snapType = 'midpoint';
        break;
      case 'otrack_intersection':
        snapType = 'otrack_intersection';
        break;
      case 'perpendicular':
        snapType = 'perpendicular';
        break;
      case 'otrack_ray':
        snapType = 'otrack_ray';
        break;
      default:
        snapType = 'endpoint';
        break;
    }

    return {
      point: osnap.snappedPoint,
      snapped: true,
      type: snapType,
      guideLines,
      label: osnap.label,
      description: osnap.description,
      screenDistancePx: osnap.screenDistancePx,
      rawOsnap: osnap,
    };
  }
}

/**
 * Reguła 2: Przyciąganie kierunkowe / Ortho (0°, 90°, kąty dominujące z geometrii)
 */
export class DirectionSnapRule implements ISnapRule {
  name = 'DirectionSnapRule';
  priority = 2;

  evaluate(ctx: SnapContext): SnapResult | null {
    if (!ctx.isDirectionSnappingActive || !ctx.originPoint) return null;

    const dirSnap = calculateDirectionSnap({
      currentMouseWorld: ctx.mouseWorld,
      originPoint: ctx.originPoint,
      buildings: ctx.buildings,
      dominantDirections: ctx.dominantDirections,
      worldToScreen: ctx.worldToScreen,
      hoveredBuildingId: ctx.hoveredBuildingId,
      selectedBuildingId: ctx.selectedBuildingId,
      excludeBuildingId: ctx.excludeBuildingId,
    });

    if (!dirSnap) return null;

    const snapType: SnapType =
      dirSnap.relationType === 'parallel'
        ? 'ortho_parallel'
        : dirSnap.relationType === 'perpendicular'
        ? 'ortho_perpendicular'
        : 'dominant';

    return {
      point: dirSnap.snappedPoint,
      snapped: true,
      type: snapType,
      guideLines: [
        {
          p1: dirSnap.guideLine.p1,
          p2: dirSnap.guideLine.p2,
          type: dirSnap.relationType,
          isStatistical: dirSnap.isStatistical,
        },
      ],
      label: dirSnap.sourceLabel || `${dirSnap.guideAngleDeg.toFixed(1)}°`,
      rawDirection: dirSnap,
    };
  }
}

/**
 * Reguła 3: Grid Snap (kratka pomocnicza CAD)
 */
export class GridSnapRule implements ISnapRule {
  name = 'GridSnapRule';
  priority = 3;

  evaluate(ctx: SnapContext): SnapResult | null {
    if (!ctx.gridSnapEnabled || !ctx.gridSize || ctx.gridSize <= 0) return null;

    const s = ctx.gridSize;
    const gx = Math.round(ctx.mouseWorld.x / s) * s;
    const gy = Math.round(ctx.mouseWorld.y / s) * s;

    const sc = ctx.worldToScreen(gx, gy);
    const screenDist = Math.hypot(sc.sx - ctx.mouseScreen.sx, sc.sy - ctx.mouseScreen.sy);

    if (screenDist <= 12) {
      return {
        point: { x: gx, y: gy },
        snapped: true,
        type: 'grid',
        label: `Grid (${gx.toFixed(1)}, ${gy.toFixed(1)})`,
        screenDistancePx: screenDist,
      };
    }

    return null;
  }
}

/**
 * SnapCoordinator - Koordynator potoku przyciągania (Pipeline / Chain of Responsibility).
 * Przekazuje stan kursora przez zarejestrowane reguły według priorytetów:
 * 1. Object Snap
 * 2. Ortho / Direction Snap
 * 3. Grid Snap
 */
export class SnapCoordinator {
  private rules: ISnapRule[] = [];

  constructor() {
    this.registerRule(new ObjectSnapRule());
    this.registerRule(new DirectionSnapRule());
    this.registerRule(new GridSnapRule());
  }

  public registerRule(rule: ISnapRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => a.priority - b.priority);
  }

  public evaluate(ctx: SnapContext): SnapResult {
    for (const rule of this.rules) {
      const result = rule.evaluate(ctx);
      if (result && result.snapped) {
        return result;
      }
    }

    return {
      point: ctx.mouseWorld,
      snapped: false,
      type: 'none',
    };
  }
}
