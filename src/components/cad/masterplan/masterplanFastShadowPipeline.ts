import type { Point2D, BuildingLoop } from '@/types/geometry';
import type { CanonicalBuildingShadow } from '@/types/canonicalShadow';
import { FastShadowInTheMiddle } from '@/engine/solar/FastShadowInTheMiddle';
import {
  polygonIntersectionTwo,
  fastIntersectTwoSimpleLoops,
} from '@/utils/math2d/polygonBooleanTwo';
import { unionPolygonLoops, differencePolygonLoops } from '@/utils/math2d/polygons';

export interface RoofTargetPlane {
  readonly buildingId: string;
  readonly roofHeight: number;
  readonly roofPolygon: Point2D[];
  readonly holes?: Point2D[][];
}

export class MasterplanFastShadowPipeline {
  /**
   * Oblicza finalny cień padający na dach innego obiektu przy użyciu algorytmu FastShadowInTheMiddle.
   * Używane zarówno w Masterplan Canvas, jak i w analizie Zakresu Cienia.
   *
   * @param casterShadows Kanoniczne cienie budynków rzucających cień
   * @param targetRoof Płaszczyzna docelowa dachu (wysokość, obrys dachu)
   */
  public static calculateShadowOnRoof(
    casterShadows: readonly CanonicalBuildingShadow[],
    targetRoof: RoofTargetPlane
  ): Point2D[][] {
    const shadowPatchesOnRoofLevel: Point2D[][] = [];

    const zTarget = targetRoof.roofHeight;
    const roofPoly = targetRoof.roofPolygon;
    if (!roofPoly || roofPoly.length < 3) return [];

    for (let b = 0; b < casterShadows.length; b++) {
      const buildingShadow = casterShadows[b];

      // Budynek nie rzuca cienia sam na siebie na poziomie swojego dachu
      if (buildingShadow.buildingId === targetRoof.buildingId) {
        continue;
      }

      const comps = buildingShadow.components;
      for (let c = 0; c < comps.length; c++) {
        const comp = comps[c];

        // 1. Projekcja w locie na płaszczyznę Z = targetRoof.roofHeight
        const projected = FastShadowInTheMiddle.projectComponentToPlane(comp, zTarget);
        if (projected && projected.outer.length >= 3) {
          // 2. Szybkie przycięcie cienia do obrysu dachu docelowego (Cień ∩ Dach)
          const clippedToRoof = polygonIntersectionTwo(projected.outer, roofPoly);
          if (clippedToRoof && clippedToRoof.length > 0) {
            for (let k = 0; k < clippedToRoof.length; k++) {
              if (clippedToRoof[k].length >= 3) {
                shadowPatchesOnRoofLevel.push(clippedToRoof[k]);
              }
            }
          }
        }
      }
    }

    if (shadowPatchesOnRoofLevel.length === 0) {
      return [];
    }

    if (shadowPatchesOnRoofLevel.length === 1) {
      return shadowPatchesOnRoofLevel;
    }

    // 3. Połączenie nakładających się łat cienia na powierzchni dachu (Union)
    return unionPolygonLoops(shadowPatchesOnRoofLevel);
  }
}
