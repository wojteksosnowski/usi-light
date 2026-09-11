import { Point2D } from '../../types/geometry';
import { isSegmentClear } from './obstacleZone';
import { isPointInPolygon } from '../../utils/math2d/polygons';
import { distancePointToSegment } from '../../utils/math2d/segments';

const ARC_SEGMENTS = 16; // liczba segmentów aproksymujących ćwiartkę łuku

interface FilletResult {
  points: Point2D[]; // punkty łuku (włącznie z P_in i P_out), puste gdy brak zakrętu
  tangentLength: number; // odległość P_in/P_out od wierzchołka wzdłuż sąsiednich odcinków
  effRadius: number; // faktycznie zrealizowany promień łuku
}

/**
 * Usuwa z łamanej zbędne węzły leżące prawie w linii prostej (odchylenie < minTurnAngleDeg),
 * pod warunkiem, że usunięcie węzła nie powoduje kolizji bezpośredniego odcinka prev->next z przeszkodami.
 */
function pruneCollinearNodes(
  points: Point2D[],
  minTurnAngleDeg: number = 0.5,
  rawObstacles: Point2D[][] = [],
  minClearance: number = 0
): Point2D[] {
  if (points.length < 3) return points.slice();

  const result: Point2D[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const next = points[i + 1];

    const d1x = prev.x - curr.x;
    const d1y = prev.y - curr.y;
    const len1 = Math.hypot(d1x, d1y);
    const d2x = next.x - curr.x;
    const d2y = next.y - curr.y;
    const len2 = Math.hypot(d2x, d2y);

    if (len1 < 1e-4) continue;
    if (len2 < 1e-4) continue;

    const dot = Math.max(-1, Math.min(1, (d1x * d2x + d1y * d2y) / (len1 * len2)));
    const theta = Math.acos(dot);
    const turnAngleDeg = 180 - (theta * 180) / Math.PI;

    if (turnAngleDeg >= minTurnAngleDeg) {
      result.push(curr);
    } else {
      // Jeśli usunięcie węzła powoduje kolizję prostej prev -> next z przeszkodami, zachowujemy węzeł
      if (rawObstacles.length > 0 && !isPathClearOfObstacles([prev, next], rawObstacles, minClearance)) {
        result.push(curr);
      }
    }
  }
  result.push(points[points.length - 1]);
  return result;
}

/**
 * Scala wielokrotne mikro-ścięcia (krótkie krawędzie bevel) wierzchołków zakręcających w tę samą stronę
 * w jeden wierzchołek przecięcia prostych stycznych, umożliwiając wpisanie pełnego łuku o promieniu R_min,
 * pod warunkiem, że scalona łamana zachowuje bezpieczny odstęp od przeszkód.
 */
function collapseShortBevelNodes(
  points: Point2D[],
  minTurnRadius: number,
  rawObstacles: Point2D[][],
  minClearance: number
): Point2D[] {
  let current = points;
  for (let pass = 0; pass < 3; pass++) {
    if (current.length < 4) break;
    const result: Point2D[] = [current[0]];
    let modified = false;

    for (let i = 1; i < current.length - 1; i++) {
      if (i < current.length - 2) {
        const p0 = result[result.length - 1];
        const p1 = current[i];
        const p2 = current[i + 1];
        const p3 = current[i + 2];

        const d12 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (d12 < Math.max(10.0, minTurnRadius * 0.9)) {
          const v1 = { x: p1.x - p0.x, y: p1.y - p0.y };
          const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
          const l1 = Math.hypot(v1.x, v1.y);
          const l2 = Math.hypot(v2.x, v2.y);
          if (l1 > 1e-4 && l2 > 1e-4) {
            const cross1 = v1.x * (p2.y - p1.y) - v1.y * (p2.x - p1.x);
            const cross2 = (p2.x - p1.x) * v2.y - (p2.y - p1.y) * v2.x;
            if ((cross1 > 0 && cross2 > 0) || (cross1 < 0 && cross2 < 0)) {
              const denom = v1.x * v2.y - v1.y * v2.x;
              if (Math.abs(denom) > 1e-3) {
                const t = ((p2.x - p0.x) * v2.y - (p2.y - p0.y) * v2.x) / denom;
                const u = ((p2.x - p0.x) * v1.y - (p2.y - p0.y) * v1.x) / denom;
                if (t > 0.1 && t < 2.5 && u > -1.5 && u < 0.9) {
                  const q = { x: p0.x + v1.x * t, y: p0.y + v1.y * t };
                  const distQ1 = Math.hypot(q.x - p1.x, q.y - p1.y);
                  const distQ2 = Math.hypot(q.x - p2.x, q.y - p2.y);
                  if (distQ1 < Math.max(12.0, minTurnRadius * 0.9) && distQ2 < Math.max(12.0, minTurnRadius * 0.9)) {
                    if (isPathClearOfObstacles([p0, q, p3], rawObstacles, minClearance)) {
                      result.push(q);
                      i++; // pomijamy p2
                      modified = true;
                      continue;
                    }
                  }
                }
              }
            }
          }
        }
      }
      result.push(current[i]);
    }
    result.push(current[current.length - 1]);
    current = result;
    if (!modified) break;
  }
  return current;
}

/** Wyznacza łuk (fillet) styczny do dwóch odcinków schodzących się w `curr`, o promieniu `radius`.
 * Jeśli wymagana styczna przekracza `maxTangent`, zwraca pusty wynik. */
function computeFillet(
  prev: Point2D,
  curr: Point2D,
  next: Point2D,
  radius: number,
  maxTangent: number
): FilletResult {
  const d1x = prev.x - curr.x;
  const d1y = prev.y - curr.y;
  const len1 = Math.hypot(d1x, d1y);
  const d2x = next.x - curr.x;
  const d2y = next.y - curr.y;
  const len2 = Math.hypot(d2x, d2y);

  if (len1 < 1e-6 || len2 < 1e-6 || radius < 1e-6) {
    return { points: [], tangentLength: 0, effRadius: 0 };
  }

  const ray1 = { x: d1x / len1, y: d1y / len1 };
  const ray2 = { x: d2x / len2, y: d2y / len2 };

  const dot = Math.max(-1, Math.min(1, ray1.x * ray2.x + ray1.y * ray2.y));
  const theta = Math.acos(dot); // kąt między promieniami curr->prev i curr->next, (0, pi)

  // theta ~ pi oznacza, że trasa idzie prosto w tym wierzchołku — łuk niepotrzebny.
  if (theta > Math.PI - 1e-3) {
    return { points: [], tangentLength: 0, effRadius: 0 };
  }
  // theta ~ 0 to zawrócenie o 180° — geometrycznie zdegenerowane, pomijamy wygładzanie.
  if (theta < 1e-3) {
    return { points: [], tangentLength: 0, effRadius: 0 };
  }

  const t = radius / Math.tan(theta / 2);
  if (t > maxTangent + 1e-6) {
    // Żądany promień wymaga dłuższej stycznej niż dopuszczalna na tych odcinkach
    return { points: [], tangentLength: 0, effRadius: 0 };
  }
  if (t < 1e-6) return { points: [], tangentLength: 0, effRadius: 0 };

  const pIn = { x: curr.x + ray1.x * t, y: curr.y + ray1.y * t };
  const pOut = { x: curr.x + ray2.x * t, y: curr.y + ray2.y * t };

  let bx = ray1.x + ray2.x;
  let by = ray1.y + ray2.y;
  const bLen = Math.hypot(bx, by);
  if (bLen < 1e-6) return { points: [], tangentLength: 0, effRadius: 0 };
  bx /= bLen;
  by /= bLen;

  const centerDist = radius / Math.sin(theta / 2);
  const center = { x: curr.x + bx * centerDist, y: curr.y + by * centerDist };

  const a1 = Math.atan2(pIn.y - center.y, pIn.x - center.x);
  const a2 = Math.atan2(pOut.y - center.y, pOut.x - center.x);
  let delta = a2 - a1;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;

  const steps = Math.max(2, Math.round((Math.abs(delta) / (Math.PI / 2)) * ARC_SEGMENTS));
  const points: Point2D[] = [];
  for (let s = 0; s <= steps; s++) {
    const a = a1 + (delta * s) / steps;
    points.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) });
  }
  points[0] = pIn;
  points[points.length - 1] = pOut;

  return { points, tangentLength: t, effRadius: radius };
}

/**
 * Odległość punktu od granicy wielokąta; ujemna, gdy punkt leży wewnątrz.
 */
function signedDistanceToPolygon(pt: Point2D, polygon: Point2D[]): number {
  let minDist = Infinity;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const d = distancePointToSegment(pt, polygon[i], polygon[(i + 1) % n]);
    if (d < minDist) minDist = d;
  }
  return isPointInPolygon(pt, polygon) ? -minDist : minDist;
}

/**
 * Sprawdza, czy gęsto próbkowana ścieżka zachowuje wymagany odstęp od przeszkód (minClearance = W/2).
 * Ścisła tolerancja 0.02m (2cm) gwarantuje brak wnikania wstęgi drogi w strefy buforowe i przeszkody.
 */
function isPathClearOfObstacles(
  path: Point2D[],
  rawObstacles: Point2D[][],
  minClearance: number
): boolean {
  const CHORD_SAGITTA_TOLERANCE = 0.02;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const samples = Math.max(1, Math.ceil(len / 0.15));
    for (let s = 0; s <= samples; s++) {
      const t = s / samples;
      const pt = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      for (const obstacle of rawObstacles) {
        if (obstacle.length < 3) continue;
        const dist = signedDistanceToPolygon(pt, obstacle);
        if (dist < minClearance - CHORD_SAGITTA_TOLERANCE) {
          return false;
        }
      }
    }
  }
  return true;
}

/** Sprawdza, czy każdy odcinek gęsto próbkowanej ścieżki pozostaje w obrębie insetowanej działki. */
function isPathInsidePlot(path: Point2D[], plotInset: Point2D[] | null): boolean {
  if (!plotInset || plotInset.length < 3) return true;
  for (let i = 0; i < path.length - 1; i++) {
    if (!isSegmentClear(path[i], path[i + 1], [], plotInset)) return false;
  }
  return true;
}

/**
 * Wygładza łamaną centerline łukami kołowymi o minimalnym zadanym promieniu skrętu (R = desiredRadius).
 * Jeśli zadany promień nie mieści się geometrycznie na dostępnych stycznych lub powoduje kolizję
 * z przeszkodami, solver adaptacyjnie dobiera największy bezkolizyjny promień łuku,
 * całkowicie eliminując ostre załamania i ustawiając fullyMet = false.
 */
export function smoothCenterlineWithArcs(
  rawCenterline: Point2D[],
  desiredRadius: number,
  rawObstacles: Point2D[][],
  minClearance: number,
  plotInset: Point2D[] | null
): { path: Point2D[]; fullyMet: boolean } {
  // Krok 1: Uproszczenie wierzchołków leżących w linii prostej i scalenie mikro-faz
  const pruned = pruneCollinearNodes(rawCenterline, 0.5, rawObstacles, minClearance);
  const centerline = collapseShortBevelNodes(pruned, desiredRadius, rawObstacles, minClearance);

  if (centerline.length < 3 || desiredRadius < 1e-6) {
    return { path: centerline.slice(), fullyMet: true };
  }

  const thetas: number[] = new Array(centerline.length).fill(Math.PI);
  const reqTangents: number[] = new Array(centerline.length).fill(0);

  for (let i = 1; i < centerline.length - 1; i++) {
    const p = centerline[i - 1];
    const c = centerline[i];
    const n = centerline[i + 1];
    const d1x = p.x - c.x;
    const d1y = p.y - c.y;
    const l1 = Math.hypot(d1x, d1y);
    const d2x = n.x - c.x;
    const d2y = n.y - c.y;
    const l2 = Math.hypot(d2x, d2y);
    if (l1 > 1e-4 && l2 > 1e-4) {
      const dot = Math.max(-1, Math.min(1, (d1x * d2x + d1y * d2y) / (l1 * l2)));
      const th = Math.acos(dot);
      thetas[i] = th;
      if (th > 1e-3 && th < Math.PI - 1e-3) {
        reqTangents[i] = desiredRadius / Math.tan(th / 2);
      }
    }
  }

  const result: Point2D[] = [centerline[0]];
  let fullyMet = true;
  let lastTangentUsedOnNextSeg = 0;

  for (let i = 1; i < centerline.length - 1; i++) {
    const prev = centerline[i - 1];
    const curr = centerline[i];
    const next = centerline[i + 1];

    const d1x = prev.x - curr.x;
    const d1y = prev.y - curr.y;
    const len1 = Math.hypot(d1x, d1y);
    const d2x = next.x - curr.x;
    const d2y = next.y - curr.y;
    const len2 = Math.hypot(d2x, d2y);

    if (len1 < 1e-4 || len2 < 1e-4) {
      result.push(curr);
      lastTangentUsedOnNextSeg = 0;
      continue;
    }

    const theta = thetas[i];

    if (theta > Math.PI - 1e-3 || theta < 1e-3) {
      result.push(curr);
      lastTangentUsedOnNextSeg = 0;
      continue;
    }

    // Dynamiczna alokacja stycznej proporcjonalnie do wymaganej długości stycznych sąsiednich zakrętów
    const tCurr = reqTangents[i];
    const tNext = i < centerline.length - 2 ? reqTangents[i + 1] : 0;
    const fraction = tNext > 1e-4 && tCurr + tNext > 1e-4 ? Math.max(0.1, Math.min(0.9, tCurr / (tCurr + tNext))) : 0.98;

    const availPrev = i === 1
      ? 0.98 * len1
      : Math.max(0, (len1 - lastTangentUsedOnNextSeg) * 0.98);
    const availNext = i === centerline.length - 2
      ? 0.98 * len2
      : fraction * len2 * 0.98;

    const maxTangent = Math.min(availPrev, availNext);
    const maxFittingRadius = maxTangent * Math.tan(theta / 2);

    let chosenFillet: FilletResult | null = null;
    let turnFullyMet = true;

    // Krok 1: Próba wpisania promienia R >= desiredRadius
    if (maxFittingRadius >= desiredRadius - 1e-4) {
      const testRadii: number[] = [desiredRadius];
      if (maxFittingRadius > desiredRadius + 0.5) {
        const CANDIDATE_STEPS = 10;
        for (let s = 1; s <= CANDIDATE_STEPS; s++) {
          testRadii.push(desiredRadius + (maxFittingRadius - desiredRadius) * (s / CANDIDATE_STEPS));
        }
      }
      for (const testR of testRadii) {
        const candidateFillet = computeFillet(prev, curr, next, testR, maxTangent);
        if (candidateFillet.points.length === 0) continue;
        const candidatePath = candidateFillet.points;
        const isClear = isPathClearOfObstacles(candidatePath, rawObstacles, minClearance);
        const isInside = isPathInsidePlot(candidatePath, plotInset);
        if (isClear && isInside) {
          chosenFillet = candidateFillet;
          break;
        }
      }
    }

    // Krok 2: Jeśli promień >= desiredRadius nie mieści się lub koliduje z przeszkodami,
    // szukamy największego możliwego promienia R < desiredRadius, aby wyeliminować ostre załamanie
    if (!chosenFillet) {
      turnFullyMet = false;
      const upperR = Math.min(desiredRadius, maxFittingRadius);
      const FALLBACK_STEPS = 15;
      for (let s = FALLBACK_STEPS; s >= 1; s--) {
        const testR = (upperR * s) / FALLBACK_STEPS;
        if (testR < 0.5) continue;
        const candidateFillet = computeFillet(prev, curr, next, testR, maxTangent);
        if (candidateFillet.points.length === 0) continue;
        const candidatePath = candidateFillet.points;
        const isClear = isPathClearOfObstacles(candidatePath, rawObstacles, minClearance);
        const isInside = isPathInsidePlot(candidatePath, plotInset);
        if (isClear && isInside) {
          chosenFillet = candidateFillet;
          break;
        }
      }
    }

    if (!turnFullyMet) {
      fullyMet = false;
    }

    if (!chosenFillet || chosenFillet.points.length === 0) {
      fullyMet = false;
      result.push(curr);
      lastTangentUsedOnNextSeg = 0;
      continue;
    }

    // Dodajemy punkty wyznaczonego łuku
    const ptsToAdd = chosenFillet.points;
    for (let pIdx = 0; pIdx < ptsToAdd.length; pIdx++) {
      const p = ptsToAdd[pIdx];
      const last = result[result.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) > 1e-4) {
        result.push(p);
      }
    }
    lastTangentUsedOnNextSeg = chosenFillet.tangentLength;
  }

  const endPt = centerline[centerline.length - 1];
  const lastPt = result[result.length - 1];
  if (Math.hypot(endPt.x - lastPt.x, endPt.y - lastPt.y) > 1e-4) {
    result.push(endPt);
  }

  return { path: result, fullyMet };
}
