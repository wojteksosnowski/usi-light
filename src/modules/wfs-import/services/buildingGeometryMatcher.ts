/**
 * buildingGeometryMatcher.ts
 *
 * Moduł inteligentnego porównywania i godzenia geometrii budynków pomiędzy
 * zasobem miejskim (WFS / EGiB) a OpenStreetMap (OSM).
 *
 * Jeżeli budynek w OSM składa się z większej liczby brył (np. building:part lub
 * rozbitych sekcji o różnych wysokościach) LUB posiada otwory/dziedzińce (holes),
 * których brakuje w geometrii z zasobu miejskiego, moduł wybiera bogatszą
 * reprezentację z OSM, zachowując spójność atrybutów i identyfikatorów.
 */

import { BuildingLoop, Point2D } from '../../../types/geometry';
import {
  computePointsBoundingBox,
  calculateSignedArea,
  intersectionPolygonsWithHoles,
  PolygonWithHoles,
} from '../../../utils/math2d/polygons';

export interface BoundingBox2D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface MatchScore {
  bboxOverlapRatio: number;
  iouRatio: number;
  wfsCoverageRatio: number; // Jaki ułamek powierzchni WFS pokrywa OSM
}

/**
 * Oblicza Bounding Box (AABB) dla BuildingLoop (uwzględniając obrys zewnętrzny)
 */
export function getBuildingBBox(building: BuildingLoop): BoundingBox2D {
  return computePointsBoundingBox(building.vertices);
}

/**
 * Szybki test czy dwa BBoxy się przecinają (z opcjonalnym marginesem tolerancji)
 */
export function doBBoxesOverlap(b1: BoundingBox2D, b2: BoundingBox2D, margin: number = 0.5): boolean {
  return (
    b1.maxX + margin >= b2.minX &&
    b1.minX - margin <= b2.maxX &&
    b1.maxY + margin >= b2.minY &&
    b1.minY - margin <= b2.maxY
  );
}

/**
 * Oblicza pole Bounding Boxa
 */
export function getBBoxArea(bbox: BoundingBox2D): number {
  const w = Math.max(0, bbox.maxX - bbox.minX);
  const h = Math.max(0, bbox.maxY - bbox.minY);
  return w * h;
}

/**
 * Oblicza pole przecięcia dwóch BBoxów
 */
export function getBBoxIntersectionArea(b1: BoundingBox2D, b2: BoundingBox2D): number {
  const minX = Math.max(b1.minX, b2.minX);
  const maxX = Math.min(b1.maxX, b2.maxX);
  const minY = Math.max(b1.minY, b2.minY);
  const maxY = Math.min(b1.maxY, b2.maxY);

  if (maxX <= minX || maxY <= minY) return 0;
  return (maxX - minX) * (maxY - minY);
}

/**
 * Oblicza stopień pokrycia BBox (Intersection over Union BBoxów)
 */
export function computeBBoxIoU(b1: BoundingBox2D, b2: BoundingBox2D): number {
  const inter = getBBoxIntersectionArea(b1, b2);
  if (inter <= 0) return 0;
  const a1 = getBBoxArea(b1);
  const a2 = getBBoxArea(b2);
  const union = a1 + a2 - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Konwertuje BuildingLoop na PolygonWithHoles
 */
export function buildingToPolygonWithHoles(b: BuildingLoop): PolygonWithHoles {
  return {
    outer: b.vertices,
    holes: b.holes && b.holes.length > 0 ? b.holes : [],
  };
}

/**
 * Oblicza pole netto wielokąta z otworami
 */
export function computePolygonWithHolesNetArea(pwh: PolygonWithHoles): number {
  let area = Math.abs(calculateSignedArea(pwh.outer));
  if (pwh.holes && pwh.holes.length > 0) {
    for (const hole of pwh.holes) {
      area -= Math.abs(calculateSignedArea(hole));
    }
  }
  return Math.max(0, area);
}

/**
 * Oblicza stopień pokrycia i IoU pomiędzy dwoma budynkami (lub grupami brył)
 */
export function computeBuildingMatchScore(wfs: BuildingLoop, osmList: BuildingLoop[]): MatchScore {
  const wfsBox = getBuildingBBox(wfs);
  const wfsPwh = buildingToPolygonWithHoles(wfs);
  const wfsArea = computePolygonWithHolesNetArea(wfsPwh);

  if (wfsArea <= 0 || osmList.length === 0) {
    return { bboxOverlapRatio: 0, iouRatio: 0, wfsCoverageRatio: 0 };
  }

  // Łączny BBox dla grupy OSM
  let osmMinX = Infinity, osmMaxX = -Infinity, osmMinY = Infinity, osmMaxY = -Infinity;
  for (const o of osmList) {
    const ob = getBuildingBBox(o);
    if (ob.minX < osmMinX) osmMinX = ob.minX;
    if (ob.maxX > osmMaxX) osmMaxX = ob.maxX;
    if (ob.minY < osmMinY) osmMinY = ob.minY;
    if (ob.maxY > osmMaxY) osmMaxY = ob.maxY;
  }
  const combinedOsmBBox: BoundingBox2D = { minX: osmMinX, maxX: osmMaxX, minY: osmMinY, maxY: osmMaxY };

  const bboxOverlapRatio = computeBBoxIoU(wfsBox, combinedOsmBBox);

  // Dokładne przecięcie wielokątów przez silnik boolowski
  const osmPwhList = osmList.map(buildingToPolygonWithHoles);
  let osmTotalArea = 0;
  for (const op of osmPwhList) {
    osmTotalArea += computePolygonWithHolesNetArea(op);
  }

  const intersections = intersectionPolygonsWithHoles([wfsPwh], osmPwhList);
  let intersectionArea = 0;
  for (const inter of intersections) {
    intersectionArea += computePolygonWithHolesNetArea(inter);
  }

  const wfsCoverageRatio = wfsArea > 0 ? intersectionArea / wfsArea : 0;
  const unionArea = wfsArea + osmTotalArea - intersectionArea;
  const iouRatio = unionArea > 0 ? intersectionArea / unionArea : 0;

  return {
    bboxOverlapRatio,
    iouRatio,
    wfsCoverageRatio,
  };
}

export interface ReconcileOptions {
  /** Minimalny współczynnik pokrycia IoU lub wfsCoverage, aby uznać obiekt za pasujący (domyślnie 0.35) */
  minCoverageThreshold?: number;
  /** Czy włączać budynki z OSM, które w ogóle nie występują w zasobie WFS (domyślnie false - zachowujemy zasób jako główny rejestr) */
  includeOrphanOsmBuildings?: boolean;
}

export interface ReconcileResult {
  buildings: BuildingLoop[];
  stats: {
    wfsTotal: number;
    osmTotal: number;
    replacedWithMoreParts: number;
    replacedWithHoles: number;
    keptWfs: number;
    addedOrphanOsm: number;
  };
}

/**
 * Inteligentne godzenie budynków z WFS oraz OSM.
 *
 * Kryteria wyboru geometrii OSM nad WFS:
 * 1. OSM posiada otwory/dziedzińce (holes), a WFS ich nie posiada.
 * 2. WFS odpowiada wielu bryłom składowym w OSM (np. segmenty o różnych wysokościach).
 * 3. Stopień dopasowania przestrzennego (BBox + wfsCoverage / IoU) jest wystarczająco wysoki (>= 35%).
 */
export function reconcileBuildingsWithOsm(
  wfsBuildings: BuildingLoop[],
  osmBuildings: BuildingLoop[],
  options?: ReconcileOptions
): ReconcileResult {
  const minCoverage = options?.minCoverageThreshold ?? 0.35;
  const includeOrphans = options?.includeOrphanOsmBuildings ?? false;

  if (osmBuildings.length === 0) {
    return {
      buildings: [...wfsBuildings],
      stats: {
        wfsTotal: wfsBuildings.length,
        osmTotal: 0,
        replacedWithMoreParts: 0,
        replacedWithHoles: 0,
        keptWfs: wfsBuildings.length,
        addedOrphanOsm: 0,
      },
    };
  }

  if (wfsBuildings.length === 0) {
    return {
      buildings: [...osmBuildings],
      stats: {
        wfsTotal: 0,
        osmTotal: osmBuildings.length,
        replacedWithMoreParts: 0,
        replacedWithHoles: 0,
        keptWfs: 0,
        addedOrphanOsm: osmBuildings.length,
      },
    };
  }

  const resultBuildings: BuildingLoop[] = [];
  const usedOsmIndices = new Set<number>();

  const wfsBBoxes = wfsBuildings.map(getBuildingBBox);
  const osmBBoxes = osmBuildings.map(getBuildingBBox);

  let replacedWithMoreParts = 0;
  let replacedWithHoles = 0;
  let keptWfs = 0;

  // Dla każdego budynku z WFS szukamy kandydatów z OSM
  for (let wi = 0; wi < wfsBuildings.length; wi++) {
    const wfsBld = wfsBuildings[wi];
    const wfsBox = wfsBBoxes[wi];
    const wfsHasHoles = !!(wfsBld.holes && wfsBld.holes.length > 0);

    const matchingOsmIndices: number[] = [];

    for (let oi = 0; oi < osmBuildings.length; oi++) {
      if (doBBoxesOverlap(wfsBox, osmBBoxes[oi], 1.0)) {
        matchingOsmIndices.push(oi);
      }
    }

    if (matchingOsmIndices.length === 0) {
      // Brak kandydata w OSM -> zachowaj WFS
      resultBuildings.push(wfsBld);
      keptWfs++;
      continue;
    }

    const candidateOsm = matchingOsmIndices.map((i) => osmBuildings[i]);
    const score = computeBuildingMatchScore(wfsBld, candidateOsm);

    const isMatchValid = score.wfsCoverageRatio >= minCoverage || score.iouRatio >= minCoverage;

    if (!isMatchValid) {
      resultBuildings.push(wfsBld);
      keptWfs++;
      continue;
    }

    // Sprawdź czy OSM oferuje bogatszą geometrię:
    // A) Więcej brył niż w WFS (np. candidateOsm.length >= 2)
    const osmHasMultipleParts = candidateOsm.length > 1;

    // B) OSM posiada otwory, których brakuje w WFS
    const osmHasNewHoles = !wfsHasHoles && candidateOsm.some((o) => o.holes && o.holes.length > 0);

    if (osmHasMultipleParts || osmHasNewHoles) {
      // Zastąp obiektem/obiektami z OSM!
      for (const idx of matchingOsmIndices) {
        usedOsmIndices.add(idx);
      }

      // Zachowaj ewentualne atrybuty/nazwę z WFS, jeśli OSM nie ma nazwy szczegółowej
      const adaptedOsm = candidateOsm.map((o, partIdx) => {
        const id = osmHasMultipleParts ? `${wfsBld.id}-osm-p${partIdx}` : `${wfsBld.id}-osm`;
        const name = o.name.startsWith('Budynek OSM') ? wfsBld.name : o.name;
        return {
          ...o,
          id,
          name,
          // Jeśli WFS miał wyliczoną wysokość z kondygnacji, a OSM nie, zachowaj parametry kondygnacji
          heightSource: o.heightSource === 'default' && wfsBld.heightSource !== 'default'
            ? wfsBld.heightSource
            : o.heightSource,
          defaultHeight: o.heightSource === 'default' && wfsBld.heightSource !== 'default'
            ? wfsBld.defaultHeight
            : o.defaultHeight,
          storeysCount: o.heightSource === 'default' && wfsBld.heightSource !== 'default'
            ? wfsBld.storeysCount
            : o.storeysCount,
        };
      });

      resultBuildings.push(...adaptedOsm);

      if (osmHasMultipleParts) {
        replacedWithMoreParts++;
      } else if (osmHasNewHoles) {
        replacedWithHoles++;
      }
    } else {
      // Geometria OSM nie wnosi dodatkowych brył ani brakujących otworów -> zachowaj precyzyjną geometrię WFS
      resultBuildings.push(wfsBld);
      for (const idx of matchingOsmIndices) {
        usedOsmIndices.add(idx);
      }
      keptWfs++;
    }
  }

  let addedOrphanOsm = 0;
  if (includeOrphans) {
    for (let oi = 0; oi < osmBuildings.length; oi++) {
      if (!usedOsmIndices.has(oi)) {
        resultBuildings.push(osmBuildings[oi]);
        addedOrphanOsm++;
      }
    }
  }

  return {
    buildings: resultBuildings,
    stats: {
      wfsTotal: wfsBuildings.length,
      osmTotal: osmBuildings.length,
      replacedWithMoreParts,
      replacedWithHoles,
      keptWfs,
      addedOrphanOsm,
    },
  };
}
