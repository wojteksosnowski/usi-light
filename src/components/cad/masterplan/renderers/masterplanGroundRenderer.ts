import { CadRenderPipeline } from '@/components/cad/pipeline/CadRenderPipeline';
import { CadRenderFrameContext } from '@/components/cad/pipeline/types';
import { useWfsStore } from '@/modules/wfs-import/store/useWfsStore';
import { Point2D, BuildingLoop } from '@/types/geometry';
import { detectBoundaryMergeGroups } from '@/utils/math2d/boundaryMerging';
import {
  extractBuildingStoryTiers,
  getMasterplanSolarAngles,
  MasterplanStoryTier,
} from '../masterplanGeometry';
import { getCachedGroundShadowSamples, getCachedShadowBoundsForCulling, drawMasterplanShadowResult } from '../masterplanShadowCache';
import { viewportWorldBounds, cullBuildingsByViewport } from '../masterplanSpatial';

/**
 * Paleta barwna dla podkładu „Masterplan White”
 */
export const MASTERPLAN_COLORS = {
  paper: '#FAFAF9',
  waterFill: '#DDE7EE',
  waterStroke: '#B8C8D4',
  forestFill: '#D8E2DC',
  forestStroke: '#BAC7BE',
  grassFill: '#E8EFE9',
  grassStroke: '#D2DDD4',
  roadFill: '#ECECEE',
  roadStroke: '#D1D1D6',
  pathFill: '#F3F3F4',
  parcelBoundary: 'rgba(156, 163, 175, 0.75)',
  projectBoundary: '#DC2626',
  projectBoundaryPlayground: '#D97706',
  projectBoundaryPaved: '#64748B',
  shadowSamples: [
    { weight: 0.25, color: 'rgba(30, 41, 59, 0.08)', offsetMin: -1 },
    { weight: 0.50, color: 'rgba(30, 41, 59, 0.14)', offsetMin: 0 },
    { weight: 0.25, color: 'rgba(30, 41, 59, 0.08)', offsetMin: 1 },
  ],
  roofProposed: '#FFFFFF',
  roofExisting: '#F5F5F7',
  contourProposed: '#111827',
  contourExisting: '#374151',
  innerEdge: '#64748B',
  selectedOutline: '#2563EB',
  hoverFill: 'rgba(254, 243, 199, 0.35)',
  accompanyingInvestment: '#3B82F6',
};

/**
 * Renderuje podkład geodezyjny (plamy wód, zieleni, dróg, działek) oraz cienie gruntowe.
 */
export function renderMasterplanGround(context: CadRenderFrameContext, hourFraction: number = 12.0): void {
  const { renderContext, buildings, visibleBuildings, selectedBuildingId, selectedBuildingIds } = context;
  const { ctx, width, height, viewRotationDeg, viewState, latitude, longitude, equinoxDate, sunlightMethod, screenToWorld } = renderContext;
  const method = sunlightMethod ?? 'raycasting';

  const bldgs = visibleBuildings || buildings;

  // 1. Podstawa: czysty biały arkusz
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = MASTERPLAN_COLORS.paper;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  // 1.1 Renderowanie aktywnych warstw podkładowych (Satelita, Ortofotomapa, GESUT, BDOT, MPZP, Wektory, Drzewa)
  const pipeline = CadRenderPipeline.getDefault();
  const mainLayers = pipeline.getMainLayers();
  for (const layer of mainLayers) {
    if (layer.id === 'satellite_map' || layer.id.startsWith('wfs_')) {
      if (layer.shouldRender(context)) {
        try {
          ctx.save();
          layer.render(context);
        } catch (err) {
          console.error(`[Masterplan] Błąd podczas renderowania warstwy podkładowej [${layer.id}]:`, err);
        } finally {
          ctx.restore();
        }
      }
    }
  }

  // Ustawienie transformacji do współrzędnych świata CAD
  ctx.save();
  ctx.translate(viewState.panX, viewState.panY);
  ctx.rotate((-viewRotationDeg * Math.PI) / 180);
  ctx.scale(viewState.scale, -viewState.scale);

  // 2. Granice działek / obiekty boundary (z wirtualnym zlewaniem się działek projektowanych)
  const isBuildingSelected = (id: string) => id === selectedBuildingId || (selectedBuildingIds && selectedBuildingIds.includes(id));
  const boundaryObjects = bldgs.filter((b: BuildingLoop) => b.category === 'boundary');

  if (boundaryObjects.length > 0) {
    const boundaryMergeGroups = detectBoundaryMergeGroups(buildings);
    const mergeableGroups = boundaryMergeGroups.filter((g) => {
      const selectedFlags = g.buildingIds.map(isBuildingSelected);
      return selectedFlags.every((v) => v) || selectedFlags.every((v) => !v);
    });
    const mergeableBoundaryIds = new Set<string>();
    for (const g of mergeableGroups) {
      for (const id of g.buildingIds) mergeableBoundaryIds.add(id);
    }

    // A. Rysowanie scalonych grup działek projektowanych (wspólna obwiednia + delikatne linie wewnętrzne)
    for (const group of mergeableGroups) {
      if (!group.outer || group.outer.length < 3) continue;
      const isSelected = group.buildingIds.some(isBuildingSelected);
      const isPlayground = group.areaType === 'playground';
      const isAccompanying = group.poolKind === 'accompanying';
      const strokeColor = isSelected
        ? MASTERPLAN_COLORS.selectedOutline
        : isAccompanying
        ? MASTERPLAN_COLORS.accompanyingInvestment
        : isPlayground
        ? MASTERPLAN_COLORS.projectBoundaryPlayground
        : MASTERPLAN_COLORS.projectBoundary;
      const fillColor = isSelected
        ? (isPlayground ? 'rgba(245, 158, 11, 0.16)' : 'rgba(220, 38, 38, 0.12)')
        : isAccompanying
        ? 'rgba(59, 130, 246, 0.06)'
        : (isPlayground ? 'rgba(245, 158, 11, 0.06)' : 'rgba(220, 38, 38, 0.04)');

      ctx.save();
      ctx.beginPath();
      group.outer.forEach((p: Point2D, idx: number) => {
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      for (const hole of group.holes || []) {
        if (!hole || hole.length < 3) continue;
        hole.forEach((p: Point2D, idx: number) => {
          if (idx === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
      }
      ctx.fillStyle = fillColor;
      ctx.fill('evenodd');

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = (isSelected ? 2.5 : 1.8) / viewState.scale;
      ctx.setLineDash([]);
      ctx.stroke();

      // Delikatne linie podziału na krawędziach wewnętrznych
      if (group.sharedEdges && group.sharedEdges.length > 0) {
        ctx.strokeStyle = isAccompanying
          ? 'rgba(59, 130, 246, 0.35)'
          : isPlayground
          ? 'rgba(217, 119, 6, 0.35)'
          : 'rgba(220, 38, 38, 0.35)';
        ctx.lineWidth = 0.8 / viewState.scale;
        ctx.setLineDash([3 / viewState.scale, 2 / viewState.scale]);
        for (const se of group.sharedEdges) {
          ctx.beginPath();
          ctx.moveTo(se.edge[0].x, se.edge[0].y);
          ctx.lineTo(se.edge[1].x, se.edge[1].y);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    // B. Rysowanie pojedynczych / niescalonych granic
    for (const bound of boundaryObjects) {
      if (!bound.vertices || bound.vertices.length < 3) continue;
      if (mergeableBoundaryIds.has(bound.id)) continue; // obsłużone w grupie wyżej

      const isTested = bound.isTested === true;
      const isAccompanying = bound.isAccompanyingInvestment === true;
      const isSelected = isBuildingSelected(bound.id);
      const isPlayground = bound.areaType === 'playground';

      ctx.save();
      ctx.beginPath();
      bound.vertices.forEach((p: Point2D, idx: number) => {
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();

      if (isTested) {
        // Wyrazista granica w projekcie
        const strokeColor = isSelected
          ? MASTERPLAN_COLORS.selectedOutline
          : isPlayground
          ? MASTERPLAN_COLORS.projectBoundaryPlayground
          : MASTERPLAN_COLORS.projectBoundary;
        const fillColor = isSelected
          ? (isPlayground ? 'rgba(245, 158, 11, 0.16)' : 'rgba(220, 38, 38, 0.12)')
          : (isPlayground ? 'rgba(245, 158, 11, 0.06)' : 'rgba(220, 38, 38, 0.04)');

        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = (isSelected ? 2.5 : 1.8) / viewState.scale;
        ctx.setLineDash([]);
        ctx.stroke();
      } else if (isAccompanying) {
        // Inwestycja towarzysząca - akcent niebieski, rozłączny z isTested
        const strokeColor = isSelected ? MASTERPLAN_COLORS.selectedOutline : MASTERPLAN_COLORS.accompanyingInvestment;
        const fillColor = isSelected ? 'rgba(59, 130, 246, 0.14)' : 'rgba(59, 130, 246, 0.06)';

        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = (isSelected ? 2.5 : 1.8) / viewState.scale;
        ctx.setLineDash([]);
        ctx.stroke();
      } else {
        // Granica ewidencyjna / zewnętrzna
        ctx.strokeStyle = isSelected ? MASTERPLAN_COLORS.selectedOutline : MASTERPLAN_COLORS.parcelBoundary;
        ctx.lineWidth = (isSelected ? 1.5 : 0.75) / viewState.scale;
        ctx.setLineDash([4 / viewState.scale, 2 / viewState.scale]);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // 3. Pełne Cienie Gruntowe z uwzględnieniem kondygnacji i modyfikatorów (Boolean Union per próbka penumbry)
  // Cienie w układzie świata są niezmiennicze względem kamery — liczone raz dla sceny i pozycji słońca.
  const actualBuildings = (buildings || bldgs).filter((b: BuildingLoop) => b.category !== 'boundary' && b.defaultHeight > 0);

  const allTiers: MasterplanStoryTier[] = [];
  for (const bldg of actualBuildings) {
    allTiers.push(...extractBuildingStoryTiers(bldg));
  }

  const shadowResult = getCachedGroundShadowSamples(
    allTiers,
    MASTERPLAN_COLORS.shadowSamples,
    latitude,
    longitude,
    equinoxDate,
    hourFraction,
    method
  );

  const viewport = viewportWorldBounds({ width, height, screenToWorld });
  ctx.save();
  drawMasterplanShadowResult(ctx, shadowResult, viewport);
  ctx.restore();

  ctx.restore();
}

