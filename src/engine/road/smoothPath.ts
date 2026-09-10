import { Point2D } from '../../types/geometry';
import { isSegmentClear } from './obstacleZone';
import { isPointInPolygon } from '../../utils/math2d/polygons';
import { distancePointToSegment } from '../../utils/math2d/segments';

const ARC_SEGMENTS = 12; // liczba segmentów aproksymujących ćwiartkę łuku (skalowana kątem)
// Dolny limit promienia przy redukcji z powodu kolizji (ułamek żądanego). Niski próg celowo —
// wolimy mały, ale gładki łuk zamiast całkowitej rezygnacji i pozostawienia ostrego załamania
// (patrz roadtest.json: narożnik blisko przeszkody potrafił nie zmieścić się nawet przy 50%).
const MIN_RADIUS_FRACTION = 0.001;
const RADIUS_RETRY_STEPS = 25; // dokładniejsza pętla redukcji promienia

interface FilletResult {
  points: Point2D[]; // punkty łuku (bez P_in/P_out na krawędziach — tylko próbki łuku), puste gdy brak zakrętu
  tangentLength: number; // odległość P_in/P_out od wierzchołka wzdłuż sąsiednich odcinków
  effRadius: number; // faktycznie osiągnięty promień (może być mniejszy od żądanego, patrz maxTangent)
}

/** Wyznacza łuk (fillet) styczny do dwóch odcinków schodzących się w `curr`, o promieniu `radius`
 * przycinanym w dół tak by nie wyjść poza połowę długości żadnego z sąsiednich odcinków. */
function computeFillet(prev: Point2D, curr: Point2D, next: Point2D, radius: number): FilletResult {
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

  const maxTangent = 0.49 * Math.min(len1, len2);
  let t = radius / Math.tan(theta / 2);
  if (t > maxTangent) t = maxTangent;
  if (t < 1e-6) return { points: [], tangentLength: 0, effRadius: 0 };

  const effRadius = t * Math.tan(theta / 2);

  const pIn = { x: curr.x + ray1.x * t, y: curr.y + ray1.y * t };
  const pOut = { x: curr.x + ray2.x * t, y: curr.y + ray2.y * t };

  let bx = ray1.x + ray2.x;
  let by = ray1.y + ray2.y;
  const bLen = Math.hypot(bx, by);
  if (bLen < 1e-6) return { points: [], tangentLength: 0, effRadius: 0 };
  bx /= bLen;
  by /= bLen;

  const centerDist = effRadius / Math.sin(theta / 2);
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
    points.push({ x: center.x + effRadius * Math.cos(a), y: center.y + effRadius * Math.sin(a) });
  }
  // Zastępujemy pierwszy/ostatni próbkowany punkt dokładnymi P_in/P_out (unikamy błędu numerycznego).
  points[0] = pIn;
  points[points.length - 1] = pOut;

  return { points, tangentLength: t, effRadius };
}

/**
 * Odległość punktu od granicy wielokąta; ujemna, gdy punkt leży wewnątrz (rzeczywiste
 * przecięcie z bryłą przeszkody, nie tylko naruszenie marginesu bezpieczeństwa).
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
 * Sprawdza, czy gęsto próbkowana ścieżka zachowuje rzeczywisty minimalny odstęp `minClearance`
 * od SUROWYCH (niezdylatowanych) przeszkód.
 */
function isPathClearOfObstacles(
  path: Point2D[],
  rawObstacles: Point2D[][],
  minClearance: number
): boolean {
  const eps = 1e-4;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const samples = Math.max(1, Math.ceil(len / 0.25));
    for (let s = 0; s <= samples; s++) {
      const t = s / samples;
      const pt = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      for (const obstacle of rawObstacles) {
        if (obstacle.length < 3) continue;
        if (signedDistanceToPolygon(pt, obstacle) < minClearance - eps) return false;
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
 * Wygładza łamaną centerline łukami kołowymi o promieniu `desiredRadius` w każdym wewnętrznym
 * załamaniu, próbkując wynik do gęstej polilinii. W trybie centered_smooth wszystkie załamania
 * są bezwzględnie zastępowane łukami kołowymi (fillet), redukując promień adaptacyjnie do poziomu
 * bezkolizyjnego.
 */
export function smoothCenterlineWithArcs(
  centerline: Point2D[],
  desiredRadius: number,
  rawObstacles: Point2D[][],
  minClearance: number,
  plotInset: Point2D[] | null
): { path: Point2D[]; fullyMet: boolean } {
  if (centerline.length < 3 || desiredRadius < 1e-6) {
    return { path: centerline.slice(), fullyMet: true };
  }

  const result: Point2D[] = [centerline[0]];
  let fullyMet = true;

  for (let i = 1; i < centerline.length - 1; i++) {
    const prev = centerline[i - 1];
    const curr = centerline[i];
    const next = centerline[i + 1];

    let radius = desiredRadius;
    let chosenFillet: FilletResult | null = null;

    for (let attempt = 0; attempt <= RADIUS_RETRY_STEPS; attempt++) {
      const fillet = computeFillet(prev, curr, next, radius);
      if (fillet.points.length === 0) {
        // Brak zakrętu w tym wierzchołku (odcinki są współliniowe)
        chosenFillet = fillet;
        break;
      }
      const candidatePath = [result[result.length - 1], ...fillet.points];
      if (
        isPathClearOfObstacles(candidatePath, rawObstacles, minClearance) &&
        isPathInsidePlot(candidatePath, plotInset)
      ) {
        chosenFillet = fillet;
        if (fillet.effRadius < desiredRadius - 1e-4) fullyMet = false;
        break;
      }
      radius = desiredRadius * (1 - ((attempt + 1) / (RADIUS_RETRY_STEPS + 1)) * (1 - MIN_RADIUS_FRACTION));
    }

    if (!chosenFillet || chosenFillet.points.length === 0) {
      // Jeśli przy zmniejszaniu promienia żaden krok nie przeszedł, generujemy minimalny bezpieczny fillet
      const fallbackFillet = computeFillet(prev, curr, next, Math.max(0.05, desiredRadius * MIN_RADIUS_FRACTION));
      if (fallbackFillet.points.length > 0) {
        chosenFillet = fallbackFillet;
        fullyMet = false;
      }
    }

    if (!chosenFillet || chosenFillet.points.length === 0) {
      result.push(curr);
      continue;
    }

    // Unikamy duplikowania punktu początkowego łuku jeśli pokrywa się z poprzednim końcem
    const ptsToAdd = chosenFillet.points;
    for (let pIdx = 0; pIdx < ptsToAdd.length; pIdx++) {
      const p = ptsToAdd[pIdx];
      const last = result[result.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) > 1e-4) {
        result.push(p);
      }
    }
  }

  const endPt = centerline[centerline.length - 1];
  const lastPt = result[result.length - 1];
  if (Math.hypot(endPt.x - lastPt.x, endPt.y - lastPt.y) > 1e-4) {
    result.push(endPt);
  }

  return { path: result, fullyMet };
}
