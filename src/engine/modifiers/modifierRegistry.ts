import { BuildingLoop, Point2D } from '../../types/geometry';
import {
  BayWindowModifier,
  CornerCutModifier,
  DonutModifier,
  GateModifier,
  Modifier,
  ModifierType,
  PilaModifier,
  StoryFootprint,
  StoryOffsetModifier,
  SztycaModifier,
  TerraceModifier,
  ZoneFootprint,
  ZoneFunctionModifier,
  ZoneOffsetModifier,
} from '../../types/modifiers';
import { miterOffsetPolygon } from '../../utils/math2d/miterOffset';
import { generateGateCorridor } from '../../utils/math2d/gateGeometry';
import {
  cutGateFromFootprint,
  generateBayWindowPolygon,
  generateCornerCutPolygon,
  generateDonutHoles,
  generatePilaPolygon,
  generateTerracePolygon,
  generateZoneBand,
  resolveStoryModifierSteps,
  sanitizeStoryFootprint,
  splitFootprintByEdgeOffset,
} from './modifierPipeline';
import {
  deriveEdgeOrigins,
  deriveHoleOrigins,
  findEdgeByOrigin,
  resolveFragmentEdgeIndex,
  resolveFragmentVertexIndex,
  resolveIndexTarget,
} from './modifierIndexTarget';

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

/**
 * Rozwiązuje indeks krawędzi obrysu zewnętrznego, preferując DZIEDZICZONE ID (`footprint.edgeOrigins`)
 * nad zgadywaniem geometrycznym od zera względem `baseVertices`. Krawędzie każdego fragmentu niosą
 * swoje pochodzenie krok po kroku przez cały potok (patrz `deriveEdgeOrigins` w `modifierPipeline.ts`
 * i inicjalizacja tożsamości w `applyBuildingModifiers`), więc selektor `edgeIndex` odnajduje
 * bezpośrednich potomków oryginalnej ściany zamiast dopasowywać współrzędne na nowo przy każdym kroku.
 * Dopasowanie geometryczne (`resolveFragmentEdgeIndex`) zostaje wyłącznie jako fallback dla
 * fragmentów bez ustawionego `edgeOrigins` (np. skonstruowanych ręcznie, bez przejścia przez potok).
 */
function resolveOuterEdgeIndexForFragment(
  footprint: StoryFootprint,
  globalIndex: number | undefined,
  baseVertices: Point2D[]
): number | undefined | null {
  if (globalIndex === undefined) return undefined;
  if (globalIndex >= baseVertices.length) {
    return isIndexWithinFootprint(footprint, globalIndex) ? globalIndex : null;
  }
  // `edgeOrigins` obecne, ale całkowicie puste (same `null`) oznacza fragment, którego linia
  // dziedziczenia została już wcześniej utracona (np. przez corner_cut) — nie ma sensu ufać "brakowi
  // właściciela" w takim przypadku, spadamy na dopasowanie geometryczne jak dotychczas.
  if (footprint.edgeOrigins && footprint.edgeOrigins.some((tag) => tag !== null)) {
    return findEdgeByOrigin(footprint.edgeOrigins, globalIndex);
  }
  return resolveFragmentEdgeIndex(footprint, globalIndex, baseVertices);
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
        footprint.polygon = miterOffsetPolygon(footprint.polygon, distance)[0] ?? footprint.polygon;
        if (footprint.holes && footprint.holes.length > 0) {
          footprint.holes = footprint.holes.flatMap((hole) => miterOffsetPolygon(hole, -distance));
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
          // Dziedziczenie ID krawędzi po tej mutacji jest utrzymywane UNIWERSALNIE, dla każdego typu
          // modyfikatora jednakowo, w applyModifier() poniżej (re-derivacja geometryczna względem
          // stanu sprzed kroku) — nie trzeba tu ręcznie śledzić wstawek.
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
          // corner_cut zmienia liczbę wierzchołków w sposób zależny od trybu (chamfer/fillet/notch),
          // ale dziedziczenie ID krawędzi jest i tak utrzymywane UNIWERSALNIE w applyModifier()
          // poniżej — re-derivacja geometryczna nie zależy od tego, JAK footprint.polygon się zmienił.
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
      if (!targetStoryIndices.has(sf.storyIndex)) {
        newFootprints.push(sf);
        continue;
      }

      const resolvedEdgeIndex = resolveOuterEdgeIndexForFragment(sf, edgeIndex, ctx.baseVertices);
      if (resolvedEdgeIndex === null) {
        // Ten fragment (skrzydło po wcześniejszym gate) nie zawiera ściany wskazanej
        // przez edgeIndex — nie jest jej właścicielem, więc nie tniemy tutaj.
        newFootprints.push(sf);
        continue;
      }

      // Ściany bez dziedziczonego pochodzenia (edgeOrigins[i] === null) to artefakty cięcia innej
      // bramy w tym samym przebiegu (tunel) — promień "first hit" nie może traktować ich jako
      // prawdziwej ściany przeciwległej (patrz gateGeometry.ts). Gdy `edgeOrigins` jest całkowicie
      // puste (linia dziedziczenia już wcześniej utracona, np. przez corner_cut), filtr wykluczyłby
      // WSZYSTKIE ściany — zamiast tego nie filtrujemy wcale (zachowanie jak dotychczas).
      const hasLineage = sf.edgeOrigins && sf.edgeOrigins.some((tag) => tag !== null);
      const edgeEligible = hasLineage ? sf.edgeOrigins!.map((tag) => tag !== null) : undefined;
      const corridor = generateGateCorridor(
        sf.polygon,
        sf.holes,
        width,
        positionRatio ?? 0.5,
        resolvedEdgeIndex,
        edgeEligible
      );
      if (corridor) {
        const cutResults = cutGateFromFootprint(sf, corridor.cuttingPolygon);
        newFootprints.push(...cutResults);
      } else {
        newFootprints.push(sf);
      }
    }

    ctx.storyFootprints = newFootprints;
  },

  sztyca: (modifier: SztycaModifier, ctx) => {
    const { storiesCount, storeyHeight, offset } = modifier;
    if (storiesCount <= 0 || storeyHeight <= 0) return;
    if (ctx.storyFootprints.length === 0) return;

    // Znajdź najwyższą rzędną hTop wśród aktualnych kondygnacji
    let maxHTop = -Infinity;
    for (const sf of ctx.storyFootprints) {
      if (sf.hTop > maxHTop) {
        maxHTop = sf.hTop;
      }
    }

    // Wybierz obrysy z najwyższego poziomu
    const topFootprints = ctx.storyFootprints.filter(
      (sf) => Math.abs(sf.hTop - maxHTop) < 1e-4
    );
    if (topFootprints.length === 0) return;

    let currentBase = maxHTop;
    let nextIndex = ctx.K;

    for (let i = 0; i < storiesCount; i++) {
      const hBot = currentBase;
      const hTop = currentBase + storeyHeight;
      currentBase = hTop;

      for (const topSf of topFootprints) {
        let poly = topSf.polygon.map((p) => ({ ...p }));
        if (offset && Math.abs(offset) > 1e-4) {
          poly = miterOffsetPolygon(poly, offset)[0] ?? poly;
        }
        let holes: Point2D[][] | undefined = undefined;
        if (topSf.holes && topSf.holes.length > 0) {
          holes = topSf.holes.flatMap((h) => {
            if (offset && Math.abs(offset) > 1e-4) {
              return miterOffsetPolygon(h, -offset);
            }
            return [h.map((p) => ({ ...p }))];
          });
        }

        ctx.storyFootprints.push({
          storyIndex: nextIndex,
          hBottom: hBot,
          hTop: hTop,
          polygon: poly,
          holes: holes,
          buildingType: topSf.buildingType,
        });
      }
      nextIndex++;
    }

    ctx.K += storiesCount;
  },

  pila: (modifier: PilaModifier, ctx) => {
    const { teethCount, storiesCount, edgeIndex, toothAngle, alignment } = modifier;
    if (teethCount < 1) return;

    const steps = resolveStoryModifierSteps(ctx.K, storiesCount);
    for (const { storyIndex } of steps) {
      const fragments = getStoryFragments(ctx, storyIndex);
      for (const footprint of fragments) {
        const resolvedEdgeIndex = resolveOuterEdgeIndexForFragment(footprint, edgeIndex, ctx.baseVertices);
        if (resolvedEdgeIndex === null) continue;
        const target = resolveIndexTarget(footprint, resolvedEdgeIndex);

        if (target.isHole) {
          footprint.holes![target.holeIndex!] = generatePilaPolygon(
            footprint.holes![target.holeIndex!],
            teethCount,
            target.localIndex,
            toothAngle ?? 90,
            alignment ?? 'prev_edge'
          );
        } else {
          footprint.polygon = generatePilaPolygon(
            footprint.polygon,
            teethCount,
            resolvedEdgeIndex,
            toothAngle ?? 90,
            alignment ?? 'prev_edge'
          );
        }
      }
    }
  },

  zone_function: (modifier: ZoneFunctionModifier, ctx) => {
    const { buildingType, scope, storiesCount, edgeIndex, depth } = modifier;
    if (!buildingType) return;

    const steps = resolveStoryModifierSteps(ctx.K, storiesCount);
    const targetStoryIndices = new Set(steps.map((s) => s.storyIndex));

    if (scope === 'storeys') {
      for (const sf of ctx.storyFootprints) {
        if (targetStoryIndices.has(sf.storyIndex)) {
          sf.buildingType = buildingType;
        }
      }
    } else if (scope === 'edge_offset') {
      const offsetDepth = depth ?? 10.0;
      if (offsetDepth <= 1e-4) return;

      const newFootprints: StoryFootprint[] = [];
      for (const sf of ctx.storyFootprints) {
        if (targetStoryIndices.has(sf.storyIndex)) {
          const resolvedEdgeIndex = resolveOuterEdgeIndexForFragment(sf, edgeIndex, ctx.baseVertices);
          if (resolvedEdgeIndex === null) {
            newFootprints.push(sf);
            continue;
          }
          const splitResults = splitFootprintByEdgeOffset(
            sf,
            resolvedEdgeIndex,
            offsetDepth,
            buildingType
          );
          newFootprints.push(...splitResults);
        } else {
          newFootprints.push(sf);
        }
      }
      ctx.storyFootprints = newFootprints;
    }
  },
};

/**
 * Uniwersalne dziedziczenie ID krawędzi/otworów: JEDEN mechanizm dla WSZYSTKICH typów modyfikatorów,
 * a nie osobna logika księgowania wstawek per typ. Przed uruchomieniem aplikatora zapisuje referencje
 * do bieżących `polygon`/`holes`/tagów każdego fragmentu; po jego uruchomieniu, dla każdego fragmentu,
 * którego `polygon` (lub `holes`) zostały PODMIENIONE (nowa referencja — każdy generator zwraca nową
 * tablicę, nigdy nie mutuje w miejscu), odtwarza tagi geometrycznie względem stanu SPRZED kroku
 * (`deriveEdgeOrigins`/`deriveHoleOrigins`). Fragmenty nowo utworzone w tym kroku (np. skrzydła
 * `gate`) nie mają wpisu "sprzed" — już niosą własne tagi, nadane przez funkcję, która je stworzyła
 * (`cutGateFromFootprint`), więc nie są tu dotykane.
 */
function inheritEdgeLineage(ctx: ModifierApplyContext, before: Map<StoryFootprint, StoryFootprint>): void {
  for (const fp of ctx.storyFootprints) {
    const prev = before.get(fp);
    if (!prev) continue; // nowo utworzony fragment (np. przez gate) — już otagowany przez twórcę

    if (fp.polygon !== prev.polygon) {
      fp.edgeOrigins = deriveEdgeOrigins(fp.polygon, prev.polygon, prev.edgeOrigins);
    }
    if (fp.holes !== prev.holes) {
      fp.holeOrigins = deriveHoleOrigins(fp.holes || [], prev.holes, prev.holeOrigins);
    }
  }
}

export function applyModifier(modifier: Modifier, ctx: ModifierApplyContext): void {
  const before = new Map<StoryFootprint, StoryFootprint>();
  for (const fp of ctx.storyFootprints) {
    before.set(fp, { ...fp });
  }

  const applier = MODIFIER_APPLIERS[modifier.type] as ModifierApplyFn<Modifier>;
  applier(modifier, ctx);

  inheritEdgeLineage(ctx, before);

  // Systemowa sanityzacja obrysów kondygnacji po każdym kroku modyfikatora
  for (let s = 0; s < ctx.storyFootprints.length; s++) {
    ctx.storyFootprints[s] = sanitizeStoryFootprint(ctx.storyFootprints[s]);
  }
}
