import { BuildingLoop, BuildingType, Point2D } from '@/types/geometry';
import { APP_CONFIG } from '@/config/appConfig';
import { miterOffsetPolygon } from '@/utils/math2d/miterOffset';

/**
 * Wyznacza dominujący typ budynku w projekcie na podstawie kubatur / liczby kondygnacji i budynków.
 * Domyślnie 'residential', jeśli projekt jest pusty.
 */
export function getDominantBuildingType(buildings: BuildingLoop[]): BuildingType {
  const activeBuildings = buildings.filter(
    (b) => b.category !== 'boundary' && b.vertices && b.vertices.length >= 3
  );

  if (activeBuildings.length === 0) return 'residential';

  const typeCounts: Record<BuildingType, number> = {
    residential: 0,
    service: 0,
    garage: 0,
  };

  for (const bldg of activeBuildings) {
    const mainType: BuildingType = bldg.buildingType ?? 'residential';
    const stories = Math.max(1, bldg.storeysCount ?? 1);

    if (bldg.storyPolygons && bldg.storyPolygons.length > 0) {
      for (const sf of bldg.storyPolygons) {
        const sfType: BuildingType = sf.buildingType ?? mainType;
        if (typeCounts[sfType] !== undefined) {
          typeCounts[sfType] += 1;
        }
      }
    } else {
      if (typeCounts[mainType] !== undefined) {
        typeCounts[mainType] += stories;
      }
    }

    if (Array.isArray(bldg.modifiers)) {
      for (const mod of bldg.modifiers) {
        if (mod.enabled && mod.type === 'zone_function') {
          const modType: BuildingType = mod.buildingType ?? 'service';
          if (typeCounts[modType] !== undefined) {
            typeCounts[modType] += 1;
          }
        }
      }
    }
  }

  let dominant: BuildingType = 'residential';
  let maxCount = -1;

  (Object.keys(typeCounts) as BuildingType[]).forEach((t) => {
    if (typeCounts[t] > maxCount) {
      maxCount = typeCounts[t];
      dominant = t;
    }
  });

  return dominant;
}

export interface BuildingTypeVisualEffect {
  color: string;
  alpha: number;
  blurPx: number;
  insetDistance: number;
}

/**
 * Oblicza parametry wizualne (kolor, alpha, blur, inset) dla kondygnacji o typie uzupełniającym.
 * Blur i przezroczystość rosną wraz z liczbą kondygnacji zakrywających daną funkcję.
 */
export function computeBuildingTypeEffect(
  buildingType: BuildingType,
  overheadStories: number
): BuildingTypeVisualEffect {
  const colorMap: Record<BuildingType, string> = {
    residential: APP_CONFIG.isoPreview.colors.xray.residential,
    service: APP_CONFIG.isoPreview.colors.xray.service,
    garage: APP_CONFIG.isoPreview.colors.xray.garage,
  };

  const color = colorMap[buildingType] ?? APP_CONFIG.isoPreview.colors.xray.service;

  // Głębokość zakrycia: overheadStories (np. 0 dla najwyższej kondygnacji / jednolitej bryły, 5 dla parteru pod 5 piętrami)
  const clampedOverhead = Math.max(0, overheadStories);
  const sqrtOverhead = Math.sqrt(clampedOverhead);

  // Alpha (krycie): start 0.55 dla pojedynczej kondygnacji, łagodny spadek do min 0.30
  const baseAlpha = 0.55;
  const alpha = Math.max(0.30, baseAlpha - sqrtOverhead * 0.08);

  // Blur (rozmycie): start 3.5px (miękki akcent już na parterze), łagodny wzrost do max 7.0px
  const baseBlur = 3.5;
  const blurPx = Math.min(7.0, baseBlur + sqrtOverhead * 1.2);

  const insetDistance = 1.2;

  return {
    color,
    alpha,
    blurPx,
    insetDistance,
  };
}

export interface BuildingFunctionZoneItem {
  polygon: Point2D[];
  holes?: Point2D[][];
  buildingType: BuildingType;
  overheadStories: number;
  isPartialZone?: boolean; // np. ze scope === 'edge_offset'
}

/**
 * Ekstrahuje wszystkie strefy funkcyjne z budynków, których typ różni się od typu dominującego.
 */
export function extractBuildingFunctionZones(
  buildings: BuildingLoop[],
  dominantType: BuildingType
): BuildingFunctionZoneItem[] {
  const items: BuildingFunctionZoneItem[] = [];

  for (const bldg of buildings) {
    if (bldg.category === 'boundary' || !bldg.vertices || bldg.vertices.length < 3) continue;

    const bldgType = bldg.buildingType ?? 'residential';
    const bldgMaxH = bldg.defaultHeight || 0;
    const tierTypicalH = bldg.typicalFloorHeight ?? 3.0;
    const totalStories = Math.max(1, bldg.storeysCount ?? Math.round(bldgMaxH / tierTypicalH));

    if (Array.isArray(bldg.storyPolygons) && bldg.storyPolygons.length > 0) {
      for (const sf of bldg.storyPolygons) {
        if (!sf.polygon || sf.polygon.length < 3) continue;
        const sfType = sf.buildingType ?? bldgType;
        if (sfType !== dominantType) {
          const overhead = Math.max(0, totalStories - sf.storyIndex - 1);
          // Jeśli pole powierzchni strefy jest znacznie mniejsze niż obrys bazowy budynku, uznaj za partial
          items.push({
            polygon: sf.polygon,
            holes: sf.holes,
            buildingType: sfType,
            overheadStories: overhead,
          });
        }
      }
    } else if (bldgType !== dominantType) {
      items.push({
        polygon: bldg.vertices,
        holes: bldg.holes,
        buildingType: bldgType,
        overheadStories: 0,
      });
    }
  }

  return items;
}

/**
 * Renderuje pasmo funkcyjne (wewnętrzny offset od obwiedni) z rozmyciem i przezroczystością
 * dla kondygnacji lub strefy o typie innym niż dominujący.
 */
export function renderBuildingTypeOffset(
  ctx: CanvasRenderingContext2D,
  polygon: Point2D[],
  holes: Point2D[][] | undefined,
  effect: BuildingTypeVisualEffect,
  scale: number
): void {
  if (!polygon || polygon.length < 3) return;

  const insetPolygons = miterOffsetPolygon(polygon, -effect.insetDistance, { miterLimit: 2.0 });
  const targetRings = insetPolygons.length > 0 ? insetPolygons : [polygon];

  ctx.save();

  // Maska do obrysu zewnętrznego (aby rozmyty offset nie wylewał się poza obrys strefy)
  ctx.beginPath();
  polygon.forEach((p, idx) => {
    if (idx === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();

  if (holes && holes.length > 0) {
    for (const hole of holes) {
      if (hole.length < 3) continue;
      hole.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
    }
  }

  ctx.clip('evenodd');

  ctx.globalAlpha = effect.alpha;
  if (effect.blurPx > 0) {
    ctx.filter = `blur(${effect.blurPx}px)`;
  }
  ctx.fillStyle = effect.color;

  // Wypełnij wnętrze wygenerowanego obrysu (offsetu / insetu)
  ctx.beginPath();
  for (const ring of targetRings) {
    if (ring.length < 3) continue;
    ring.forEach((p, idx) => {
      if (idx === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
  }
  ctx.fill('evenodd');

  // Delikatny obrys wygenerowanego konturu tuszem w kolorze funkcji
  ctx.filter = 'none';
  ctx.lineWidth = 0.6 / scale;
  ctx.strokeStyle = effect.color;
  for (const ring of targetRings) {
    if (ring.length < 3) continue;
    ctx.beginPath();
    ring.forEach((p, idx) => {
      if (idx === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Główna funkcja rzutująca wszystkie strefy funkcyjne na widok Masterplan z góry.
 * Rysuje strefy funkcyjne (w tym partery i strefy brzegowe zakryte wyższymi piętrami)
 * z zachowaniem porządku głębokości (najbardziej zakryte najpierw, najwyższe na końcu).
 */
export function renderMasterplanFunctionOverlays(
  ctx: CanvasRenderingContext2D,
  buildings: BuildingLoop[],
  scale: number,
  dominantType: BuildingType
): void {
  const functionZones = extractBuildingFunctionZones(buildings, dominantType);
  if (functionZones.length === 0) return;

  // Sortuj od największego overheadStories do najmniejszego (najgłębsze na dole)
  const sortedZones = [...functionZones].sort((a, b) => b.overheadStories - a.overheadStories);

  for (const zone of sortedZones) {
    const effect = computeBuildingTypeEffect(zone.buildingType, zone.overheadStories);
    renderBuildingTypeOffset(ctx, zone.polygon, zone.holes, effect, scale);
  }
}
