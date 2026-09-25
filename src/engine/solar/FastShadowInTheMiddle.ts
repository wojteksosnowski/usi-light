import type { Point2D } from '@/types/geometry';
import type {
  CanonicalBuildingShadow,
  CanonicalShadowComponent,
  CanonicalShadowRing,
  FastShadowVertex,
} from '@/types/canonicalShadow';

export interface ProjectedShadowPolygon {
  readonly outer: Point2D[];
  readonly holes: Point2D[][];
  readonly zMin: number;
  readonly zMax: number;
}

export class FastShadowInTheMiddle {
  /**
   * Przelicza w locie obrys cienia składowej dla zadanej wysokości pośredniej Z_target.
   * Zwraca wielokąt 2D w przestrzeni dachu docelowego lub null, jeśli element nie sięga tej wysokości.
   *
   * @param component Składowa cienia z wierzchołkami translacyjnymi (P0, Vxy, zMax)
   * @param zTarget Poziom odniesienia pośredniej płaszczyzny (np. wysokość dachu docelowego)
   */
  public static projectComponentToPlane(
    component: CanonicalShadowComponent,
    zTarget: number
  ): ProjectedShadowPolygon | null {
    // 1. Odrzucenie w O(1) - dach docelowy powyżej wierzchołka elementu
    if (zTarget >= component.zMax - 1e-4) {
      return null;
    }

    const rings = component.rings;
    if (!rings || rings.length === 0) {
      return null;
    }

    let outer: Point2D[] | null = null;
    const holes: Point2D[][] = [];

    for (let r = 0; r < rings.length; r++) {
      const ring = rings[r];
      const ringPts = this.projectRingToPlane(ring, zTarget);
      if (ringPts.length >= 3) {
        if (ring.isHole) {
          holes.push(ringPts);
        } else if (!outer) {
          outer = ringPts;
        } else {
          // Dodatkowy pierścień niebędący dziurą (np. multi-part)
          holes.push(ringPts);
        }
      }
    }

    if (!outer || outer.length < 3) {
      return null;
    }

    return {
      outer,
      holes,
      zMin: component.zMin,
      zMax: component.zMax,
    };
  }

  /**
   * Przelicza pojedynczy pierścień wierzchołków na wysokość zTarget za pomocą transformacji liniowej O(1) na wierzchołek.
   */
  public static projectRingToPlane(
    ring: CanonicalShadowRing,
    zTarget: number
  ): Point2D[] {
    const verts = ring.vertices;
    const n = verts.length;
    const pts: Point2D[] = new Array(n);

    for (let i = 0; i < n; i++) {
      const v = verts[i];
      if (v.zMax <= 0.0001) {
        pts[i] = { x: v.vx, y: v.vy };
        continue;
      }

      // Współczynnik przesunięcia liniowego: t = clamp(zTarget / zMax, 0, 1)
      const t = Math.min(1.0, Math.max(0.0, zTarget / v.zMax));

      // P(Z) = P0 + t * (V_xy - P0)
      pts[i] = {
        x: v.x0 + t * (v.vx - v.x0),
        y: v.y0 + t * (v.vy - v.y0),
      };
    }

    return pts;
  }

  /**
   * Przelicza wszystkie składowe cienia budynku rzucone na zadaną płaszczyznę pośrednią Z_target.
   */
  public static projectBuildingShadowToPlane(
    buildingShadow: CanonicalBuildingShadow,
    zTarget: number
  ): ProjectedShadowPolygon[] {
    const results: ProjectedShadowPolygon[] = [];
    const comps = buildingShadow.components;

    for (let i = 0; i < comps.length; i++) {
      const projected = this.projectComponentToPlane(comps[i], zTarget);
      if (projected) {
        results.push(projected);
      }
    }

    return results;
  }
}
