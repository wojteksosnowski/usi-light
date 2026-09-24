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
import { getBuildingAABB } from '@/engine/buildingGeometryCache';
import { getCachedRoofShadowSamples, getCachedShadowBoundsForCulling, drawMasterplanShadowResult } from '../masterplanShadowCache';
import {
  buildMasterplanLabelCandidates,
  resolveMasterplanLabelCollisions,
  renderMasterplanLabels,
} from '../masterplanLabels';
import {
  getDominantBuildingType,
  renderMasterplanFunctionOverlays,
} from '../masterplanBuildingTypes';

interface CachedRoofsHierarchy {
  sceneRef: BuildingLoop[];
  sortedTiers: MasterplanStoryTier[];
  sortedTierBounds: Bounds[];
  sunKey: string;
  higherTiersPerTier: MasterplanStoryTier[][];
}

let cachedRoofsHierarchy: CachedRoofsHierarchy | null = null;

function getOrComputeRoofsHierarchy(
  sceneRef: BuildingLoop[],
  angles: ReturnType<typeof getMasterplanSolarAngles>,
  sunKey: string
): { sortedTiers: MasterplanStoryTier[]; sortedTierBounds: Bounds[]; higherTiersPerTier: MasterplanStoryTier[][] } {
  if (
    cachedRoofsHierarchy &&
    cachedRoofsHierarchy.sceneRef === sceneRef &&
    cachedRoofsHierarchy.sunKey === sunKey
  ) {
    return cachedRoofsHierarchy;
  }

  let sortedTiers: MasterplanStoryTier[];
  let sortedTierBounds: Bounds[];

  if (cachedRoofsHierarchy && cachedRoofsHierarchy.sceneRef === sceneRef) {
    sortedTiers = cachedRoofsHierarchy.sortedTiers;
    sortedTierBounds = cachedRoofsHierarchy.sortedTierBounds;
  } else {
    const validBuildings = sceneRef.filter(
      (b: BuildingLoop) => b.category !== 'boundary' && b.vertices && b.vertices.length >= 3
    );
    const allTiers: MasterplanStoryTier[] = [];
    for (let i = 0; i < validBuildings.length; i++) {
      allTiers.push(...extractBuildingStoryTiers(validBuildings[i]));
    }
    sortedTiers = allTiers.sort((a, b) => a.hTop - b.hTop);
    sortedTierBounds = sortedTiers.map(tierFootprintBounds);
  }

  const higherTiersPerTier: MasterplanStoryTier[][] = new Array(sortedTiers.length);
  const n = sortedTiers.length;
  for (let i = 0; i < n; i++) {
    const currentH = sortedTiers[i].hTop;
    const currentTierBounds = sortedTierBounds[i];
    const higher: MasterplanStoryTier[] = [];
    for (let j = i + 1; j < n; j++) {
      const ht = sortedTiers[j];
      const deltaHTop = ht.hTop - currentH;
      if (deltaHTop <= 0.05) continue;
      const htOffset = computeShadowOffsetVector(deltaHTop, angles);
      const htReachBounds = extendBoundsByOffset(sortedTierBounds[j], htOffset.dx * 1.05, htOffset.dy * 1.05);
      if (boundsOverlap(currentTierBounds, htReachBounds)) {
        higher.push(ht);
      }
    }
    higherTiersPerTier[i] = higher;
  }

  cachedRoofsHierarchy = {
    sceneRef,
    sortedTiers,
    sortedTierBounds,
    sunKey,
    higherTiersPerTier,
  };

  return cachedRoofsHierarchy;
}

/**
 * Renderuje dachy budynków, rzutowanie cieni ΔH od wyższych kondygnacji/budynków (zacienianie wzajemne i własne)
 * oraz czarne linie tuszowe i etykiety wysokościowe.
 */
export function renderMasterplanRoofs(context: CadRenderFrameContext, hourFraction: number = 12.0): void {
  const { renderContext, buildings, visibleBuildings, selectedBuildingId, selectedBuildingIds, hoveredBuildingId } = context;
  const { ctx, width, height, viewRotationDeg, viewState, latitude, longitude, equinoxDate, sunlightMethod, screenToWorld } = renderContext;
  const method = sunlightMethod ?? 'raycasting';

  const sceneBuildings = visibleBuildings || buildings;
  if (!sceneBuildings || sceneBuildings.length === 0) return;

  const dominantBuildingType = getDominantBuildingType(sceneBuildings);

  const angles = getMasterplanSolarAngles(latitude, longitude, equinoxDate, hourFraction, 0, method);
  const sunKey = `${latitude}:${longitude}:${equinoxDate}:${hourFraction.toFixed(2)}:${method}`;

  const viewport = viewportWorldBounds({ width, height, screenToWorld });

  // 1. Pobranie zbuforowanej hierarchii kondygnacji i relacji cieni ΔH (stabilne O(1) przy pan/zoom)
  const { sortedTiers, sortedTierBounds, higherTiersPerTier } = getOrComputeRoofsHierarchy(sceneBuildings, angles, sunKey);
  if (sortedTiers.length === 0) return;

  ctx.save();
  ctx.translate(viewState.panX, viewState.panY);
  ctx.rotate((-viewRotationDeg * Math.PI) / 180);
  ctx.scale(viewState.scale, -viewState.scale);

  // 3. Pętla po poziomach dachowych od najniższego do najwyższego
  for (let i = 0; i < sortedTiers.length; i++) {
    const tier = sortedTiers[i];
    const tierBounds: Bounds = sortedTierBounds[i];

    // Culling rysowania: pomiń dachy niewidoczne w aktualnym oknie
    if (!boundsOverlap(tierBounds, viewport)) {
      continue;
    }

    const isSelected = tier.buildingId === selectedBuildingId || (selectedBuildingIds && selectedBuildingIds.includes(tier.buildingId));
    const isHovered = tier.buildingId === hoveredBuildingId;
    const isProposed = tier.bldgRef?.isTested ?? tier.isProposed;

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

    // 2. Pobierz wyższe bryły z gotowej mapy relacji cienia
    const currentH = tier.hTop;
    const higherTiers = higherTiersPerTier[i];

    if (higherTiers && higherTiers.length > 0) {
      // Rysujemy obrys cienia dachowego (A456 umbra) z sumą boolowską (brak podwójnego nakładania się cieni)
      const currentTierKey = `${tier.buildingId}:${tier.storyIndex}`;
      const shadowResult = getCachedRoofShadowSamples(
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

  // 3. Wizualizacja stref i kondygnacji funkcyjnych (w tym parterów i stref krawędziowych modyfikatora zone_function)
  // Rysowane w przestrzeni świata CAD z zachowaniem hierarchii zakrycia (blur + opacity)
  const visibleBldgs = sceneBuildings.filter((b: BuildingLoop) => {
    const aabb = getBuildingAABB(b);
    return aabb ? boundsOverlap(aabb, viewport) : true;
  });
  renderMasterplanFunctionOverlays(ctx, visibleBldgs, viewState.scale, dominantBuildingType);

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
    viewRotationDeg,
    viewport
  );

  const resolvedLabels = resolveMasterplanLabelCollisions(candidates);
  renderMasterplanLabels(ctx, resolvedLabels);
}

