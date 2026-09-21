import { Point2D } from '../../types/geometry';
import { AnchorPoint, SnapResult, SnapContext, TrackingRay, SnapGuideLine, computeClampedWorldTolerance } from './types';
import { normalizeAngle180, lineIntersection2D } from '../../utils/math2d';

export interface OtrackDwellState {
  candidateVertex: Point2D | null;
  candidateBuildingId?: string;
  firstSeenAt: number;
  lastScreenPos: { sx: number; sy: number };
}

/**
 * OtrackManager - Zarządza akwizycją punktów śledzenia CAD (Hover Dwell >= 300ms)
 * oraz generowaniem promieni naprowadzających i ich wzajemnych przecięć.
 */
export class OtrackManager {
  private acquiredAnchors: AnchorPoint[] = [];
  private dwellState: OtrackDwellState | null = null;
  private readonly dwellThresholdMs: number;
  private readonly maxAnchors: number;

  constructor(dwellThresholdMs = 300, maxAnchors = 2) {
    this.dwellThresholdMs = dwellThresholdMs;
    this.maxAnchors = maxAnchors;
  }

  public getAnchors(): readonly AnchorPoint[] {
    return this.acquiredAnchors;
  }

  public clearAnchors(): void {
    this.acquiredAnchors = [];
    this.dwellState = null;
  }

  public removeAnchor(id: string): void {
    this.acquiredAnchors = this.acquiredAnchors.filter((a) => a.id !== id);
  }

  /**
   * Sprawdza i aktualizuje stan zatrzymania kursora (dwell) nad wierzchołkiem.
   * Jeśli kursor spędził nad punktem >= dwellThresholdMs, punkt zostaje dodany/przełączony.
   */
  public updateDwell(
    hoveredVertex: Point2D | null,
    mouseScreen: { sx: number; sy: number },
    hoveredBuildingId?: string,
    now: number = performance.now()
  ): { newlyAcquired: boolean; toggledOff: boolean } {
    if (!hoveredVertex) {
      this.dwellState = null;
      return { newlyAcquired: false, toggledOff: false };
    }

    if (
      !this.dwellState ||
      !this.dwellState.candidateVertex ||
      Math.hypot(this.dwellState.candidateVertex.x - hoveredVertex.x, this.dwellState.candidateVertex.y - hoveredVertex.y) > 0.05 ||
      Math.hypot(this.dwellState.lastScreenPos.sx - mouseScreen.sx, this.dwellState.lastScreenPos.sy - mouseScreen.sy) > 6.0
    ) {
      this.dwellState = {
        candidateVertex: { ...hoveredVertex },
        candidateBuildingId: hoveredBuildingId,
        firstSeenAt: now,
        lastScreenPos: { ...mouseScreen },
      };
      return { newlyAcquired: false, toggledOff: false };
    }

    // Kursor spoczywa w miejscu
    const elapsed = now - this.dwellState.firstSeenAt;
    if (elapsed >= this.dwellThresholdMs) {
      const v = this.dwellState.candidateVertex;
      const existingIdx = this.acquiredAnchors.findIndex(
        (a) => Math.hypot(a.point.x - v.x, a.point.y - v.y) < 0.05
      );

      if (existingIdx >= 0) {
        // Toggle off - usunięcie po ponownym najechaniu
        this.acquiredAnchors.splice(existingIdx, 1);
        this.dwellState = null;
        return { newlyAcquired: false, toggledOff: true };
      } else {
        // Dodanie nowego punktu
        if (this.acquiredAnchors.length >= this.maxAnchors) {
          this.acquiredAnchors.shift(); // Usunięcie najstarszego
        }
        this.acquiredAnchors.push({
          id: `anchor_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          point: { ...v },
          sourceType: 'vertex',
          sourceBuildingId: hoveredBuildingId,
          acquiredAt: now,
        });
        this.dwellState = null;
        return { newlyAcquired: true, toggledOff: false };
      }
    }

    return { newlyAcquired: false, toggledOff: false };
  }

  /**
   * Generuje promienie OTRACK dla zarejestrowanych punktów kotwiczących
   */
  public generateTrackingRays(context: SnapContext): TrackingRay[] {
    const rays: TrackingRay[] = [];
    const rayLength = 100.0;

    for (const anchor of this.acquiredAnchors) {
      // 1. Promienie Ortho (0° poziomy i 90° pionowy)
      rays.push({
        anchorId: anchor.id,
        origin: anchor.point,
        type: 'horizontal',
        label: `OTRACK 0° (${anchor.sourceBuildingId ?? 'Punkt'})`,
        A: 0,
        B: 1,
        C: -anchor.point.y,
        angleRad: 0,
        p1: { x: anchor.point.x - rayLength, y: anchor.point.y },
        p2: { x: anchor.point.x + rayLength, y: anchor.point.y },
      });

      rays.push({
        anchorId: anchor.id,
        origin: anchor.point,
        type: 'vertical',
        label: `OTRACK 90° (${anchor.sourceBuildingId ?? 'Punkt'})`,
        A: 1,
        B: 0,
        C: -anchor.point.x,
        angleRad: Math.PI / 2,
        p1: { x: anchor.point.x, y: anchor.point.y - rayLength },
        p2: { x: anchor.point.x, y: anchor.point.y + rayLength },
      });

      // 2. Promienie dominanty sceny jeśli dostępne
      if (context.dominantDirections && context.dominantDirections.length > 0) {
        const dom = context.dominantDirections[0];
        // Zsynchronizowane z regułą separacji EDGE_UCS/OTRACK (segmentStatistics.ts, spec §2.2,
        // próg EDGE_UCS_DEADBAND_DEG, domyślnie 2°): gdy dominanta jest nierozróżnialna od widoku,
        // isTrackingActive===false i promienie dominanty są pomijane (uniknięcie duplikatu
        // z promieniami ortho 0°/90° powyżej).
        if (dom.isTrackingActive !== false && dom.angleDeg !== 0 && dom.angleDeg !== 90) {
          const rad1 = (dom.angleDeg * Math.PI) / 180;
          const rad2 = (dom.orthogonalDeg * Math.PI) / 180;
          const cos1 = Math.cos(rad1), sin1 = Math.sin(rad1);
          const cos2 = Math.cos(rad2), sin2 = Math.sin(rad2);

          rays.push({
            anchorId: anchor.id,
            origin: anchor.point,
            type: 'parallel',
            isStatistical: true,
            label: `Siatka ${dom.angleDeg.toFixed(1)}°`,
            A: -sin1,
            B: cos1,
            C: -(-sin1 * anchor.point.x + cos1 * anchor.point.y),
            angleRad: rad1,
            p1: { x: anchor.point.x - rayLength * cos1, y: anchor.point.y - rayLength * sin1 },
            p2: { x: anchor.point.x + rayLength * cos1, y: anchor.point.y + rayLength * sin1 },
          });

          rays.push({
            anchorId: anchor.id,
            origin: anchor.point,
            type: 'perpendicular',
            isStatistical: true,
            label: `Siatka ${dom.orthogonalDeg.toFixed(1)}°`,
            A: -sin2,
            B: cos2,
            C: -(-sin2 * anchor.point.x + cos2 * anchor.point.y),
            angleRad: rad2,
            p1: { x: anchor.point.x - rayLength * cos2, y: anchor.point.y - rayLength * sin2 },
            p2: { x: anchor.point.x + rayLength * cos2, y: anchor.point.y + rayLength * sin2 },
          });
        }
      }
    }

    return rays;
  }

  /**
   * Wyznacza snapowanie do promieni OTRACK lub przecięcia dwóch promieni
   */
  public evaluateOtrackSnap(point: Point2D, context: SnapContext): SnapResult | null {
    if (this.acquiredAnchors.length === 0) return null;

    const rays = this.generateTrackingRays(context);
    if (rays.length === 0) return null;

    // Ujednolicona apertura px<->world z resztą strategii (computeClampedWorldTolerance),
    // zamiast osobnego, nieskoordynowanego twardego `?? 12`.
    const { thresholdPx } = computeClampedWorldTolerance(point, context);

    // 1. Sprawdź przecięcie dwóch promieni z różnych punktów bazowych (Dual-Ray Intersection)
    if (this.acquiredAnchors.length >= 2) {
      const a1 = this.acquiredAnchors[0];
      const a2 = this.acquiredAnchors[1];
      const raysA1 = rays.filter((r) => r.anchorId === a1.id);
      const raysA2 = rays.filter((r) => r.anchorId === a2.id);

      for (const r1 of raysA1) {
        for (const r2 of raysA2) {
          const intPt = lineIntersection2D(r1.origin, r1.angleRad, r2.origin, r2.angleRad);
          if (!intPt) continue;

          const sInt = context.worldToScreen(intPt.x, intPt.y);
          const distPx = Math.hypot(context.mouseScreen.sx - sInt.sx, context.mouseScreen.sy - sInt.sy);

          if (distPx <= thresholdPx * 1.5) {
            return {
              point: { ...intPt },
              snapped: true,
              type: 'otrack_intersection',
              label: 'Przecięcie OTRACK (✕)',
              description: `Przecięcie linii śledzenia`,
              screenDistancePx: distPx,
              activeRays: [r1, r2],
              intersectingAnchors: [a1, a2],
              guideLines: [
                { p1: r1.p1, p2: r1.p2, type: 'otrack_ray' },
                { p1: r2.p1, p2: r2.p2, type: 'otrack_ray' },
              ],
            };
          }
        }
      }
    }

    // 2. Snapowanie do pojedynczego promienia OTRACK
    let bestRaySnap: SnapResult | null = null;
    let minDistPx = thresholdPx;

    for (const r of rays) {
      // Dystans punktu do prostej Ax + By + C = 0
      const signedDist = r.A * point.x + r.B * point.y + r.C;
      const projX = point.x - signedDist * r.A;
      const projY = point.y - signedDist * r.B;

      const sProj = context.worldToScreen(projX, projY);
      const distPx = Math.hypot(context.mouseScreen.sx - sProj.sx, context.mouseScreen.sy - sProj.sy);

      if (distPx <= minDistPx) {
        minDistPx = distPx;
        bestRaySnap = {
          point: { x: projX, y: projY },
          snapped: true,
          type: 'otrack_ray',
          label: r.label,
          description: `Śledzenie osi (${r.label})`,
          screenDistancePx: distPx,
          activeRays: [r],
          guideLines: [
            { p1: r.p1, p2: r.p2, type: 'otrack_ray', isStatistical: r.isStatistical },
          ],
        };
      }
    }

    return bestRaySnap;
  }
}
