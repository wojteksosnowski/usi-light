import { Point2D } from '../../../types/geometry';
import { SnapContext, SnapResult, SnapStrategy } from '../types';

export class GridSnapStrategy implements SnapStrategy {
  readonly name = 'GridSnapStrategy';
  readonly priority = 100; // Niski priorytet - siatka jako ostateczny fallback

  findSnap(point: Point2D, context: SnapContext): SnapResult | null {
    if (!context.gridSnapEnabled || !context.gridSize || context.gridSize <= 0) {
      return null;
    }

    const s = context.gridSize;
    const gx = Math.round(point.x / s) * s;
    const gy = Math.round(point.y / s) * s;

    const sc = context.worldToScreen(gx, gy);
    const screenDist = Math.hypot(sc.sx - context.mouseScreen.sx, sc.sy - context.mouseScreen.sy);
    const threshold = context.thresholdPx ?? 12;

    if (screenDist <= threshold) {
      return {
        point: { x: gx, y: gy },
        snapped: true,
        type: 'grid',
        label: `Siatka (${gx.toFixed(2)}, ${gy.toFixed(2)})`,
        description: `Węzeł siatki ${s}m`,
        screenDistancePx: screenDist,
      };
    }

    return null;
  }
}
