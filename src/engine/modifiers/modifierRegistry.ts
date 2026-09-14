import { BuildingLoop, Point2D } from '../../types/geometry';
import {
  BayWindowModifier,
  CornerCutModifier,
  DonutModifier,
  GateModifier,
  Modifier,
  ModifierType,
  StoryFootprint,
  StoryOffsetModifier,
  TerraceModifier,
  ZoneFootprint,
  ZoneOffsetModifier,
} from '../../types/modifiers';
import { miterOffsetPolygon } from '../../utils/math2d/miterOffset';
import { generateGateCorridor } from '../../utils/math2d/gateGeometry';
import {
  cutGateFromFootprint,
  generateBayWindowPolygon,
  generateCornerCutPolygon,
  generateDonutHoles,
  generateTerracePolygon,
  generateZoneBand,
  resolveStoryModifierSteps,
  sanitizeStoryFootprint,
} from './modifierPipeline';
import { resolveFragmentEdgeIndex, resolveFragmentVertexIndex, resolveIndexTarget } from './modifierIndexTarget';

export interface ModifierApplyContext {
  storyFootprints: StoryFootprint[];
  zoneFootprints: ZoneFootprint[];
  baseVertices: Point2D[];
  K: number;
  building: BuildingLoop;
}

export type ModifierApplyFn<M extends Modifier> = (modifier: M, ctx: ModifierApplyContext) => void;

/**
 * Zwraca wszystkie fragmenty obrysu danej kondygnacji. Zwykle jest to jeden element, ale po
 * przecięciu bramą (`gate`) kondygnacja może rozpaść się na kilka rozłącznych fragmentów (skrzydeł)
 * dzielących to samo `storyIndex` — pozycja w tablicy `storyFootprints` przestaje wtedy odpowiadać
 * indeksowi kondygnacji, więc modyfikatory muszą dopasowywać się po polu `storyIndex`, a nie po
 * indeksie tablicy.
 */
function getStoryFragments(ctx: ModifierApplyContext, storyIndex: number): StoryFootprint[] {
  return ctx.storyFootprints.filter((fp) => fp.storyIndex === storyIndex);
}

/**
 * Sprawdza, czy globalny indeks (krawędzi/wierzchołka) mieści się w danym fragmencie obrysu
 * (zewnętrzny obrys + otwory). Po rozcięciu bramą (`gate`) ten sam globalny indeks może być
 * poprawny dla jednego skrzydła kondygnacji, a nieistniejący dla drugiego.
 */
function isIndexWithinFootprint(footprint: StoryFootprint, globalIndex: number): boolean {
  const holesLen = footprint.holes?.reduce((sum, hole) => sum + hole.length, 0) ?? 0;
  return globalIndex < footprint.polygon.length + holesLen;
}

/**
 * Rozwiązuje globalny indeks krawędzi obrysu zewnętrznego dla konkretnego fragmentu kondygnacji,
 * ZAWSZE dopasowując go geometrycznie do `baseVertices` (pierwotny, nigdy niemodyfikowany obrys
 * budynku), zamiast traktować go jako surowy indeks pozycyjny w aktualnym `footprint.polygon`.
 * To konieczne nie tylko po rozcięciu bramą (`gate`) — gdzie ten sam fragment kondygnacji
 * rozpada się na kilka rozłącznych fragmentów o niepowiązanej lokalnej numeracji krawędzi — ale
 * także dla POJEDYNCZEGO, niedzielonego fragmentu: uniwersalna sanityzacja uruchamiana po KAŻDYM
 * kroku potoku (`applyModifier` → `sanitizeStoryFootprint`, wywoływana na wszystkich kondygnacjach,
 * nawet tych, których dany modyfikator nie dotyczy) przepuszcza obrys przez boolean union
 * (`polygon-clipping`), który może po cichu przestawić punkt startowy / kolejność wierzchołków.
 * Surowy `edgeIndex` wskazywałby wtedy zupełnie inną ścianę niż ta, dla której użytkownik go wybrał
 * (np. wcześniejszy `gate`, uruchomiony przed `terrace` na tym samym budynku, wystarczy by
 * przenumerować wierzchołki kondygnacji, której `gate` w ogóle nie dotyka).
 * Zwraca `null`, jeśli dany fragment w ogóle nie zawiera fragmentu tej ściany.
 * Indeksy otworów (>= baseVertices.length, czyli już poza pierwotnym obrysem zewnętrznym) nie są
 * tu obsługiwane — otwory nie mają odpowiednika w `baseVertices`, więc zostają przy kontroli zakresu.
 */
function resolveGlobalIndexForFragment(
  footprint: StoryFootprint,
  globalIndex: number | undefined,
  baseVertices: Point2D[],
  resolveGeometric: (footprint: StoryFootprint, index: number, baseVertices: Point2D[]) => number | null
): number | undefined | null {
  if (globalIndex === undefined) return undefined;
  if (globalIndex >= baseVertices.length) {
    return isIndexWithinFootprint(footprint, globalIndex) ? globalIndex : null;
  }
  return resolveGeometric(footprint, globalIndex, baseVertices);
}

function resolveOuterEdgeIndexForFragment(
  footprint: StoryFootprint,
  globalIndex: number | undefined,
  baseVertices: Point2D[]
): number | undefined | null {
  return resolveGlobalIndexForFragment(footprint, globalIndex, baseVertices, resolveFragmentEdgeIndex);
}

/** Analogiczne dopasowanie dla indeksu wierzchołka (używane przez corner_cut scope='vertex'). */
function resolveVertexIndexForFragment(
  footprint: StoryFootprint,
  globalIndex: number | undefined,
  baseVertices: Point2D[]
): number | undefined | null {
  return resolveGlobalIndexForFragment(footprint, globalIndex, baseVertices, resolveFragmentVertexIndex);
}

/**
 * Rejestr aplikatorów modyfikatorów. Jedyne miejsce (obok modifierDescriptors.tsx w warstwie UI),
 * gdzie wolno rozgałęziać się po `ModifierType` — nowy typ modyfikatora dopisuje tu jeden wpis
 * zamiast rozszerzać łańcuch if/else w applyBuildingModifiers.
 */
export const MODIFIER_APPLIERS: { [K in ModifierType]: ModifierApplyFn<Extract<Modifier, { type: K }>> } = {
  story_offset: (modifier: StoryOffsetModifier, ctx) => {
    const { distance, storiesCount } = modifier;
    if (Math.abs(distance) < 1e-4) return;

    const steps = resolveStoryModifierSteps(ctx.K, storiesCount);
    for (const { storyIndex } of steps) {
      for (const footprint of getStoryFragments(ctx, storyIndex)) {
        footprint.polygon = miterOffsetPolygon(footprint.polygon, distance);
        if (footprint.holes && footprint.holes.length > 0) {
          footprint.holes = footprint.holes.map((hole) => miterOffsetPolygon(hole, -distance));
        }
      }
    }
  },

  zone_offset: (modifier: ZoneOffsetModifier, ctx) => {
    const band = generateZoneBand(ctx.baseVertices, modifier.distance, modifier.cornerType);
    if (band.outer && band.outer.length >= 3) {
      ctx.zoneFootprints.push({
        id: modifier.id,
        areaType: modifier.areaType || ctx.building.areaType || 'plot',
        distance: modifier.distance,
        polygon: band.outer,
        holes: [band.inner],
      });
    }
  },

  bay_window: (modifier: BayWindowModifier, ctx) => {
    const { width, projection, storiesCount, edgeIndex, sideAngle, positionRatio } = modifier;
    if (Math.abs(projection) < 1e-4 || width <= 1e-3) return;

    const steps = resolveStoryModifierSteps(ctx.K, storiesCount);
    for (const { storyIndex } of steps) {
      const fragments = getStoryFragments(ctx, storyIndex);
      for (const footprint of fragments) {
        const resolvedEdgeIndex = resolveOuterEdgeIndexForFragment(footprint, edgeIndex, ctx.baseVertices);
        if (resolvedEdgeIndex === null) continue;
        const target = resolveIndexTarget(footprint, resolvedEdgeIndex);
        if (target.isHole) {
          footprint.holes![target.holeIndex!] = generateBayWindowPolygon(
            footprint.holes![target.holeIndex!],
            width,
            projection,
            target.localIndex,
            sideAngle ?? 45,
            positionRatio ?? 0.5
          );
        } else {
          footprint.polygon = generateBayWindowPolygon(
            footprint.polygon,
            width,
            projection,
            resolvedEdgeIndex,
            sideAngle ?? 45,
            positionRatio ?? 0.5
          );
        }
      }
    }
  },

  terrace: (modifier: TerraceModifier, ctx) => {
    const { depth, storiesCount, edgeIndex, variant } = modifier;
    if (Math.abs(depth) < 1e-4) return;

    const isCascade = variant === 'steps';
    const steps = resolveStoryModifierSteps(ctx.K, storiesCount, { cascade: isCascade });
    const maxMultiplier = isCascade && steps.length > 0 ? Math.max(...steps.map((s) => s.stepMultiplier)) : 1;
    const baseStepDepth = depth / maxMultiplier;

    for (const { storyIndex, stepMultiplier } of steps) {
      const storyDepth = isCascade ? baseStepDepth * stepMultiplier : depth;
      const fragments = getStoryFragments(ctx, storyIndex);
      for (const footprint of fragments) {
        const resolvedEdgeIndex = resolveOuterEdgeIndexForFragment(footprint, edgeIndex, ctx.baseVertices);
        if (resolvedEdgeIndex === null) continue;
        const target = resolveIndexTarget(footprint, resolvedEdgeIndex);

        if (target.isHole) {
          footprint.holes![target.holeIndex!] = generateTerracePolygon(
            footprint.holes![target.holeIndex!],
            storyDepth,
            target.localIndex
          );
        } else {
          footprint.polygon = generateTerracePolygon(footprint.polygon, storyDepth, resolvedEdgeIndex);
        }
      }
    }
  },

  donut: (modifier: DonutModifier, ctx) => {
    const { offset, storiesCount } = modifier;
    if (Math.abs(offset) < 1e-4) return;

    const steps = resolveStoryModifierSteps(ctx.K, storiesCount);
    for (const { storyIndex } of steps) {
      for (const footprint of getStoryFragments(ctx, storyIndex)) {
        const holes = generateDonutHoles(footprint.polygon, offset);
        if (holes && holes.length > 0) {
          footprint.holes = [...(footprint.holes || []), ...holes];
        }
      }
    }
  },

  corner_cut: (modifier: CornerCutModifier, ctx) => {
    const { depth, storiesCount, mode, scope, edgeIndex, vertexIndex } = modifier;
    if (depth <= 1e-4) return;

    const rawTargetIdx = scope === 'vertex' ? vertexIndex : scope === 'edge' ? edgeIndex : undefined;

    const steps = resolveStoryModifierSteps(ctx.K, storiesCount);
    for (const { storyIndex } of steps) {
      const fragments = getStoryFragments(ctx, storyIndex);
      for (const footprint of fragments) {
        const targetIdx =
          scope === 'vertex'
            ? resolveVertexIndexForFragment(footprint, rawTargetIdx, ctx.baseVertices)
            : resolveOuterEdgeIndexForFragment(footprint, rawTargetIdx, ctx.baseVertices);
        if (targetIdx === null) continue;
        const target = resolveIndexTarget(footprint, targetIdx);

        if (target.isHole) {
          footprint.holes![target.holeIndex!] = generateCornerCutPolygon(
            footprint.holes![target.holeIndex!],
            depth,
            mode,
            scope,
            target.localIndex
          );
        } else {
          footprint.polygon = generateCornerCutPolygon(footprint.polygon, depth, mode, scope, targetIdx);
        }
      }
    }
  },

  gate: (modifier: GateModifier, ctx) => {
    const { width, storiesCount, edgeIndex, positionRatio } = modifier;
    if (width <= 1e-4) return;

    const steps = resolveStoryModifierSteps(ctx.K, storiesCount);
    const targetStoryIndices = new Set(steps.map((s) => s.storyIndex));

    const newFootprints: StoryFootprint[] = [];
    for (const sf of ctx.storyFootprints) {
      if (targetStoryIndices.has(sf.storyIndex)) {
        const corridor = generateGateCorridor(
          sf.polygon,
          sf.holes,
          width,
          positionRatio ?? 0.5,
          edgeIndex
        );
        if (corridor) {
          const cutResults = cutGateFromFootprint(sf, corridor.cuttingPolygon);
          newFootprints.push(...cutResults);
        } else {
          newFootprints.push(sf);
        }
      } else {
        newFootprints.push(sf);
      }
    }

    ctx.storyFootprints = newFootprints;
  },
};

export function applyModifier(modifier: Modifier, ctx: ModifierApplyContext): void {
  const applier = MODIFIER_APPLIERS[modifier.type] as ModifierApplyFn<Modifier>;
  applier(modifier, ctx);

  // Systemowa sanityzacja obrysów kondygnacji po każdym kroku modyfikatora
  for (let s = 0; s < ctx.storyFootprints.length; s++) {
    ctx.storyFootprints[s] = sanitizeStoryFootprint(ctx.storyFootprints[s]);
  }
}
