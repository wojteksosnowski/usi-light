import type { Point2D } from '@/types/geometry';
import type {
  CanonicalBuildingShadow,
  CanonicalShadowComponent,
  CanonicalShadowRing,
  FastShadowVertex,
} from '@/types/canonicalShadow';
import type { StorySlice } from '@/types/compiledGeometry';

export class CanonicalShadowBaker {
  /**
   * Wypieka składową cienia dla danego komponentu/kondygnacji bryły przy zadanym wektorze cienia na jednostkę wysokości.
   *
   * @param componentId Identyfikator elementu (np. bldg1_s0, bldg1_bay)
   * @param sourceBuildingId Identyfikator budynku źródłowego
   * @param zMin Dolna rzędna wysokościowa elementu [m]
   * @param zMax Górna rzędna wysokościowa elementu [m]
   * @param exterior Wierzchołki konturu zewnętrznego podstawy
   * @param holes Tablica otworów (patio / dziedzińce)
   * @param shadowVector Wektor cienia s = (dx/dz, dy/dz) = (-Lx/Lz, -Ly/Lz)
   */
  public static bakeComponent(
    componentId: string,
    sourceBuildingId: string,
    zMin: number,
    zMax: number,
    exterior: readonly Point2D[],
    holes: readonly (readonly Point2D[])[] | undefined,
    shadowVector: Point2D
  ): CanonicalShadowComponent {
    const rings: CanonicalShadowRing[] = [];

    if (exterior && exterior.length >= 3) {
      const outerRing = this.bakeRing(exterior, zMax, shadowVector, false);
      rings.push(outerRing);
    }

    if (holes && holes.length > 0) {
      for (let h = 0; h < holes.length; h++) {
        const holePts = holes[h];
        if (holePts && holePts.length >= 3) {
          const holeRing = this.bakeRing(holePts, zMax, shadowVector, true);
          rings.push(holeRing);
        }
      }
    }

    return {
      componentId,
      sourceBuildingId,
      zMin,
      zMax,
      rings,
    };
  }

  /**
   * Wypieka pojedynczy pierścień wierzchołków cienia.
   */
  public static bakeRing(
    points: readonly Point2D[],
    zMax: number,
    shadowVector: Point2D,
    isHole: boolean
  ): CanonicalShadowRing {
    const n = points.length;
    const vertices: FastShadowVertex[] = new Array(n);

    const sX = shadowVector.x;
    const sY = shadowVector.y;

    for (let i = 0; i < n; i++) {
      const p = points[i];
      const vx = p.x;
      const vy = p.y;
      const x0 = vx + zMax * sX;
      const y0 = vy + zMax * sY;

      vertices[i] = {
        x0,
        y0,
        vx,
        vy,
        zMax,
      };
    }

    return {
      vertices,
      isHole,
    };
  }

  /**
   * Wypieka kanoniczny cień całego budynku dla zadanych kondygnacji i wektora słońca.
   */
  public static bakeBuildingShadow(
    buildingId: string,
    storySlices: readonly StorySlice[],
    baseExterior: readonly Point2D[],
    baseHoles: readonly (readonly Point2D[])[] | undefined,
    defaultHeight: number,
    baseElevation: number,
    sunAngleHash: string,
    shadowVector: Point2D
  ): CanonicalBuildingShadow {
    const components: CanonicalShadowComponent[] = [];

    if (storySlices && storySlices.length > 0) {
      for (let i = 0; i < storySlices.length; i++) {
        const slice = storySlices[i];
        const comp = this.bakeComponent(
          `${buildingId}_s${slice.storyIndex}`,
          buildingId,
          slice.elevationBottom,
          slice.elevationTop,
          slice.footprint.exterior,
          slice.footprint.holes,
          shadowVector
        );
        components.push(comp);
      }
    } else if (baseExterior && baseExterior.length >= 3) {
      const zMin = baseElevation;
      const zMax = baseElevation + defaultHeight;
      const comp = this.bakeComponent(
        `${buildingId}_base`,
        buildingId,
        zMin,
        zMax,
        baseExterior,
        baseHoles,
        shadowVector
      );
      components.push(comp);
    }

    return {
      buildingId,
      sunAngleHash,
      components,
    };
  }
}
