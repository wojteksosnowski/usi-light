import { Point2D } from '../../../types/geometry';
import { calculateDirectionSnap, DirectionSnapResult } from '../../../utils/directionSnapping';
import { SnapContext, SnapResult, SnapStrategy } from '../types';

export class DirectionSnapStrategy implements SnapStrategy {
  readonly name = 'DirectionSnapStrategy';
  readonly priority = 60; // Działa na promieniach kątowych przy rysowaniu / edycji

  findSnap(point: Point2D, context: SnapContext): SnapResult | null {
    if (!context.isDirectionSnappingActive || !context.originPoint) {
      return null;
    }

    const dirSnap: DirectionSnapResult | null = calculateDirectionSnap({
      currentMouseWorld: point,
      originPoint: context.originPoint,
      buildings: context.buildings,
      dominantDirections: context.dominantDirections,
      polylineVertices: context.polylineVertices,
      worldToScreen: context.worldToScreen,
      hoveredBuildingId: context.hoveredBuildingId,
      selectedBuildingId: context.selectedBuildingId,
      excludeBuildingId: context.excludeBuildingId,
      excludeSegmentIndices: context.excludeSegmentIndices,
    });

    if (!dirSnap) return null;

    const label = dirSnap.sourceLabel || `${dirSnap.guideAngleDeg.toFixed(1)}°`;

    return {
      point: dirSnap.snappedPoint,
      snapped: true,
      type: 'direction',
      label,
      description: `Kierunek ${dirSnap.relationType} (${label})`,
      guideLines: [
        {
          p1: dirSnap.guideLine.p1,
          p2: dirSnap.guideLine.p2,
          type: dirSnap.relationType,
          isStatistical: dirSnap.isStatistical,
        },
      ],
      metadata: {
        rawDirection: dirSnap,
        guideAngleDeg: dirSnap.guideAngleDeg,
        relationType: dirSnap.relationType,
      },
    };
  }
}
