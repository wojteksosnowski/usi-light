import { CadRenderFrameContext } from '@/components/cad/pipeline/types';
import { BuildingLoop, Point2D } from '@/types/geometry';
import { MASTERPLAN_COLORS } from './masterplanGroundRenderer';
import {
  extractBuildingStoryTiers,
  getMasterplanSolarAngles,
  computeShadowOffsetVector,
  MasterplanStoryTier,
} from '../masterplanGeometry';
import {
  tierFootprintBounds,
  extendBoundsByOffset,
  boundsOverlap,
  Bounds,
  viewportWorldBounds,
  cullBuildingsByViewport,
} from '../masterplanSpatial';
import { getCachedRoofShadowSamples, getCachedShadowBoundsForCulling, drawMasterplanShadowResult } from '../masterplanShadowCache';
import {
  buildMasterplanLabelCandidates,
  resolveMasterplanLabelCollisions,
  renderMasterplanLabels,
} from '../masterplanLabels';

/**
 * Renderuje dachy budynków, rzutowanie cieni ΔH od wyższych kondygnacji/budynków (zacienianie wzajemne i własne)
 * oraz czarne linie tuszowe i etykiety wysokościowe.
 */
export function renderMasterplanRoofs(context: CadRenderFrameContext, hourFraction: number = 12.0): void {
  const { renderContext, buildings, visibleBuildings, selectedBuildingId, selectedBuildingIds, hoveredBuildingId } = context;
  const { ctx, width, height, viewRotationDeg, viewState, latitude, longitude, equinoxDate, masterplanShadowAlgorithm, sunlightMethod, screenToWorld } = renderContext;
  const shadowAlgorithm = masterplanShadowAlgorithm ?? 'legacy';
  const method = sunlightMethod ?? 'raycasting';

  const bldgs = (visibleBuildings || buildings).filter(
    (b: BuildingLoop) => b.category !== 'boundary' && b.vertices && b.vertices.length >= 3
  );

  if (bldgs.length === 0) return;

  const angles = getMasterplanSolarAngles(latitude, longitude, equinoxDate, hourFraction, 0, method);

  // Viewport culling: odrzuca budynki, których bryła + szacowany zasięg cienia nie przecinają się
  // z widocznym obszarem, zanim w ogóle trafią do extractBuildingStoryTiers.
  const viewport = viewportWorldBounds({ width, height, screenToWorld });
  const getCachedShadowBounds = getCachedShadowBoundsForCulling(shadowAlgorithm, method, latitude, longitude, equinoxDate, hourFraction);
  const culledBldgs = cullBuildingsByViewport(bldgs, viewport, angles, getCachedShadowBounds);

  // 1. Ekstrakcja wszystkich poziomów kondygnacji (w tym z modyfikatorów: uskoków/tarasów/sztycy)
  const allTiers: MasterplanStoryTier[] = [];
  for (const bldg of culledBldgs) {
    allTiers.push(...extractBuildingStoryTiers(bldg, selectedBuildingId, selectedBuildingIds, hoveredBuildingId));
  }

  if (allTiers.length === 0) return;

  // 2. Sortowanie poziomów dachowych po wysokości Htop rosnąco (najniższe dachy najpierw, najwyższe na końcu)
  const sortedTiers = [...allTiers].sort((a, b) => a.hTop - b.hTop);
  const sortedTierBounds = sortedTiers.map(tierFootprintBounds);

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
    // Dokładny filtr przestrzenny: obliczamy realny zasięg cienia dla deltaHTop (a nie pełnego hTop!)
    const currentH = tier.hTop;
    const tierBounds: Bounds = sortedTierBounds[i];
    const higherTiers = sortedTiers.slice(i + 1).filter((ht, offset) => {
      const deltaHTop = ht.hTop - currentH;
      if (deltaHTop <= 0.05) return false;
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
        method
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

  ctx.restore(); // Przywrócenie transformacji sprzed pętli dachów

  // 4. Inteligentny układ etykiet Master Plan:
  // - Etykiety nie mieszczące się w geometrii kształtu znikają (zasada z CAD)
  // - Wykrywanie i rozwiązywanie kolizji (rozsuwanie / łączenie etykiet budynek+obszar, budynek+budynek)
  const allObjects = (visibleBuildings || buildings).filter(
    (b: BuildingLoop) => b.vertices && b.vertices.length >= 3
  );

  const candidates = buildMasterplanLabelCandidates(
    allObjects,
    renderContext.worldToScreen,
    viewState.scale,
    selectedBuildingId,
    selectedBuildingIds,
    hoveredBuildingId,
    viewRotationDeg
  );

  const resolvedLabels = resolveMasterplanLabelCollisions(candidates);
  renderMasterplanLabels(ctx, resolvedLabels);
}

