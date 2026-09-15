import { CadRenderFrameContext } from '@/components/cad/pipeline/types';
import { BuildingLoop, Point2D } from '@/types/geometry';
import { MASTERPLAN_COLORS } from './masterplanGroundRenderer';
import {
  extractBuildingStoryTiers,
  getMasterplanSolarAngles,
  computeShadowOffsetVector,
  MasterplanStoryTier,
} from '../masterplanGeometry';
import { tierFootprintBounds, extendBoundsByOffset, boundsOverlap, Bounds } from '../masterplanSpatial';
import { getCachedRoofShadowSamples, drawMasterplanShadowResult } from '../masterplanShadowCache';

/**
 * Renderuje dachy budynków, rzutowanie cieni ΔH od wyższych kondygnacji/budynków (zacienianie wzajemne i własne)
 * oraz czarne linie tuszowe i etykiety wysokościowe.
 */
export function renderMasterplanRoofs(context: CadRenderFrameContext, hourFraction: number = 12.0): void {
  const { renderContext, buildings, visibleBuildings, selectedBuildingId, selectedBuildingIds, hoveredBuildingId } = context;
  const { ctx, viewRotationDeg, viewState, latitude, longitude, equinoxDate, masterplanShadowAlgorithm, isInteracting } = renderContext;
  const shadowAlgorithm = masterplanShadowAlgorithm ?? 'legacy';

  const bldgs = (visibleBuildings || buildings).filter(
    (b: BuildingLoop) => b.category !== 'boundary' && b.vertices && b.vertices.length >= 3
  );

  if (bldgs.length === 0) return;

  // 1. Ekstrakcja wszystkich poziomów kondygnacji (w tym z modyfikatorów: uskoków/tarasów/sztycy)
  const allTiers: MasterplanStoryTier[] = [];
  for (const bldg of bldgs) {
    allTiers.push(...extractBuildingStoryTiers(bldg, selectedBuildingId, selectedBuildingIds, hoveredBuildingId));
  }

  if (allTiers.length === 0) return;

  // 2. Sortowanie poziomów dachowych po wysokości Htop rosnąco (najniższe dachy najpierw, najwyższe na końcu)
  const sortedTiers = [...allTiers].sort((a, b) => a.hTop - b.hTop);
  const sortedTierBounds = sortedTiers.map(tierFootprintBounds);
  const angles = getMasterplanSolarAngles(latitude, longitude, equinoxDate, hourFraction, 0);

  ctx.save();
  ctx.translate(viewState.panX, viewState.panY);
  ctx.rotate((-viewRotationDeg * Math.PI) / 180);
  ctx.scale(viewState.scale, -viewState.scale);

  // 3. Pętla po poziomach dachowych od najniższego do najwyższego
  for (let i = 0; i < sortedTiers.length; i++) {
    const tier = sortedTiers[i];
    const isSelected = tier.isSelected;
    const isHovered = tier.isHovered;
    const isProposed = tier.isProposed;

    const baseFill = isHovered
      ? MASTERPLAN_COLORS.hoverFill
      : isProposed
      ? MASTERPLAN_COLORS.roofProposed
      : MASTERPLAN_COLORS.roofExisting;

    // --- A. Renderowanie dachu i cieniowania dachowego ΔH pod maską (ctx.clip) ---
    ctx.save();

    // Utworzenie ścieżki dachu (wraz z otworami/patio)
    ctx.beginPath();
    tier.polygon.forEach((p: Point2D, idx: number) => {
      if (idx === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();

    if (tier.holes && tier.holes.length > 0) {
      for (const hole of tier.holes) {
        if (hole.length < 3) continue;
        hole.forEach((p: Point2D, idx: number) => {
          if (idx === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
      }
    }

    // Wytnij obszar dachu (wszystkie rzucane cienie zostaną przycięte do obrysu dachu)
    ctx.clip('evenodd');

    // 1. Wypełnij bazowym nieprzezroczystym kolorem dachu (zasłania cienie gruntowe i niższe bryły pod spodem)
    ctx.fillStyle = baseFill;
    ctx.fill('evenodd');

    // 2. Pobierz wszystkie kondygnacje/bryły wyższe (z tego samego budynku - self-shading, oraz z innych budynków - mutual shading)
    // Filtr przestrzenny (AABB zasięgu cienia higherTier vs. footprint tier) eliminuje tiery, których
    // cień nigdy nie dotknie tego dachu, niezależnie od ich wysokości — patrz masterplanSpatial.ts.
    const currentH = tier.hTop;
    const tierBounds: Bounds = sortedTierBounds[i];
    const higherTiers = sortedTiers.slice(i + 1).filter((ht, offset) => {
      if (ht.hTop <= currentH + 0.05) return false;
      const deltaHTop = ht.hTop - currentH;
      const htOffset = computeShadowOffsetVector(deltaHTop, angles);
      const htReachBounds = extendBoundsByOffset(sortedTierBounds[i + 1 + offset], htOffset.dx * 1.05, htOffset.dy * 1.05);
      return boundsOverlap(tierBounds, htReachBounds);
    });

    if (higherTiers.length > 0) {
      // Rysujemy 3 próbki cienia dachowego (t-1, t, t+1) z sumą boolowską (brak podwójnego nakładania się cieni)
      const currentTierKey = `${tier.buildingId}:${tier.storyIndex}`;
      const shadowResult = getCachedRoofShadowSamples(
        shadowAlgorithm,
        currentTierKey,
        currentH,
        higherTiers,
        MASTERPLAN_COLORS.shadowSamples,
        latitude,
        longitude,
        equinoxDate,
        hourFraction,
        isInteracting
      );

      drawMasterplanShadowResult(ctx, shadowResult);
    }

    // Zwolnij maskę (clip)
    ctx.restore();

    // --- B. Rysunek tuszem technicznym na wierzchu ---
    ctx.save();
    ctx.beginPath();
    tier.polygon.forEach((p: Point2D, idx: number) => {
      if (idx === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();

    if (isSelected) {
      // Podwójny obrys techniczny dla zaznaczenia
      ctx.strokeStyle = MASTERPLAN_COLORS.selectedOutline;
      ctx.lineWidth = 2.5 / viewState.scale;
      ctx.stroke();

      ctx.lineWidth = 0.75 / viewState.scale;
      ctx.stroke();
    } else {
      ctx.strokeStyle = isProposed ? MASTERPLAN_COLORS.contourProposed : MASTERPLAN_COLORS.contourExisting;
      ctx.lineWidth = (isProposed ? 1.8 : 1.2) / viewState.scale;
      ctx.stroke();
    }

    // Obrys otworów (patio / dziedziniec)
    if (tier.holes && tier.holes.length > 0) {
      ctx.strokeStyle = MASTERPLAN_COLORS.innerEdge;
      ctx.lineWidth = 0.75 / viewState.scale;
      for (const hole of tier.holes) {
        if (hole.length < 3) continue;
        ctx.beginPath();
        hole.forEach((p: Point2D, idx: number) => {
          if (idx === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // 4. Etykiety wysokościowe (bez 'H=') w środku geometrycznym najwyższego dachu każdego budynku
  ctx.save();
  ctx.font = `600 ${Math.max(9, Math.min(13, 11 * viewState.scale))}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const bldg of bldgs) {
    if (!bldg.vertices || bldg.vertices.length < 3) continue;
    const hVal = bldg.defaultHeight || 0;
    const label = hVal % 1 === 0 ? `${hVal}m` : `${hVal.toFixed(1)}m`;

    const center = getPolygonCenter(bldg.vertices);
    const screenPt = renderContext.worldToScreen(center.x, center.y);

    // Rysujemy etykietę w przestrzeni ekranu (bez odwracania Y)
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    const textWidth = ctx.measureText(label).width;
    ctx.fillRect(screenPt.sx - textWidth / 2 - 4, screenPt.sy - 8, textWidth + 8, 16);

    ctx.fillStyle = '#334155';
    ctx.fillText(label, screenPt.sx, screenPt.sy);
    ctx.restore();
  }

  ctx.restore();
  ctx.restore();
}

function getPolygonCenter(points: Point2D[]): Point2D {
  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  return { x: sumX / points.length, y: sumY / points.length };
}

