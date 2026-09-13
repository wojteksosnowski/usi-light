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
import { resolveIndexTarget } from './modifierIndexTarget';

export interface ModifierApplyContext {
  storyFootprints: StoryFootprint[];
  zoneFootprints: ZoneFootprint[];
  baseVertices: Point2D[];
  K: number;
  building: BuildingLoop;
}

export type ModifierApplyFn<M extends Modifier> = (modifier: M, ctx: ModifierApplyContext) => void;

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
      const footprint = ctx.storyFootprints[storyIndex];
      footprint.polygon = miterOffsetPolygon(footprint.polygon, distance);
      if (footprint.holes && footprint.holes.length > 0) {
        footprint.holes = footprint.holes.map((hole) => miterOffsetPolygon(hole, -distance));
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
      const footprint = ctx.storyFootprints[storyIndex];
      const target = resolveIndexTarget(footprint, edgeIndex);
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
          edgeIndex,
          sideAngle ?? 45,
          positionRatio ?? 0.5
        );
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
      const footprint = ctx.storyFootprints[storyIndex];
      const target = resolveIndexTarget(footprint, edgeIndex);

      if (target.isHole) {
        footprint.holes![target.holeIndex!] = generateTerracePolygon(
          footprint.holes![target.holeIndex!],
          storyDepth,
          target.localIndex
        );
      } else {
        footprint.polygon = generateTerracePolygon(footprint.polygon, storyDepth, edgeIndex);
      }
    }
  },

  donut: (modifier: DonutModifier, ctx) => {
    const { offset, storiesCount } = modifier;
    if (Math.abs(offset) < 1e-4) return;

    const steps = resolveStoryModifierSteps(ctx.K, storiesCount);
    for (const { storyIndex } of steps) {
      const footprint = ctx.storyFootprints[storyIndex];
      const holes = generateDonutHoles(footprint.polygon, offset);
      if (holes && holes.length > 0) {
        footprint.holes = [...(footprint.holes || []), ...holes];
      }
    }
  },

  corner_cut: (modifier: CornerCutModifier, ctx) => {
    const { depth, storiesCount, mode, scope, edgeIndex, vertexIndex } = modifier;
    if (depth <= 1e-4) return;

    const targetIdx = scope === 'vertex' ? vertexIndex : scope === 'edge' ? edgeIndex : undefined;

    const steps = resolveStoryModifierSteps(ctx.K, storiesCount);
    for (const { storyIndex } of steps) {
      const footprint = ctx.storyFootprints[storyIndex];
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
