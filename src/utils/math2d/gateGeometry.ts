import { Point2D } from '../../types/geometry';
import { isPolygonCCW } from './polygons';
import { calculateOutwardNormal } from './vec2';

export interface GateSpanResult {
  edgeIndex: number;
  oppEdgeIndex: number;
  isHitOnHole: boolean;
  holeIndex?: number;
  edgeLength: number;
  tMin: number;
  tMax: number;
  maxWidth: number;
  p1: Point2D;
  p2: Point2D;
  oppP1: Point2D;
  oppP2: Point2D;
  inwardNormal: Point2D;
  unitTangent: Point2D;
  distanceToHit: number;
}

export interface GateCorridorPoints {
  a1: Point2D; // Punkt wejściowy lewy (na krawędzi wejściowej)
  a2: Point2D; // Punkt wejściowy prawy (na krawędzi wejściowej)
  b2: Point2D; // Punkt wyjściowy prawy (na trafionej krawędzi)
  b1: Point2D; // Punkt wyjściowy lewy (na trafionej krawędzi)
  cuttingPolygon: Point2D[]; // Czworokąt wycięcia (rozszerzony o margines dla czystego boolean difference)
}

interface SegmentRef {
  q1: Point2D;
  q2: Point2D;
  isHole: boolean;
  holeIndex?: number;
  localIndex: number;
  globalIndex: number;
}

/**
 * Wyznacza dopuszczalną rozpiętość korytarza bramy dla wybranej krawędzi wejściowej wielokąta.
 *
 * Algorytm First Hit:
 * 1. Zbiera wszystkie krawędzie (zewnętrzne oraz wygenerowane otwory/patio).
 * 2. Rzuca promień prostopadły do wybranej krawędzi w kierunku wnętrza (inwardNormal).
 * 3. Znajduje pierwsze przecięcie z krawędzią (first hit) i tam się zatrzymuje.
 * 4. Rzutuje wierzchołki trafionej krawędzi prostopadle na wybraną krawędź wejściową.
 * 5. Wyznacza granice T_min, T_max oraz maksymalną dopuszczalną szerokość maxWidth.
 */
export function computeGateSpan(
  vertices: Point2D[],
  holes?: Point2D[][],
  edgeIndex?: number,
  edgeEligible?: boolean[]
): GateSpanResult | null {
  if (!vertices || vertices.length < 3) return null;
  const n = vertices.length;
  const isCCW = isPolygonCCW(vertices);

  // 1. Zidentyfikuj krawędź wejściową (wskazaną lub domyślnie najdłuższą na obrysie zewnętrznym)
  let bestEdgeIdx = 0;
  let maxEdgeLen = 0;
  for (let i = 0; i < n; i++) {
    const pt1 = vertices[i];
    const pt2 = vertices[(i + 1) % n];
    const len = Math.hypot(pt2.x - pt1.x, pt2.y - pt1.y);
    if (len > maxEdgeLen) {
      maxEdgeLen = len;
      bestEdgeIdx = i;
    }
  }

  const eIdx = edgeIndex !== undefined && edgeIndex >= 0 ? edgeIndex : bestEdgeIdx;

  let p1: Point2D;
  let p2: Point2D;
  let isInputHole = false;
  let inputHoleIdx: number | undefined;

  if (eIdx < n) {
    p1 = vertices[eIdx];
    p2 = vertices[(eIdx + 1) % n];
  } else {
    // Krawędź na otworze (globalIndex >= n)
    let rem = eIdx - n;
    let found = false;
    p1 = vertices[0];
    p2 = vertices[1];
    if (holes && holes.length > 0) {
      for (let h = 0; h < holes.length; h++) {
        const hLen = holes[h].length;
        if (rem < hLen) {
          p1 = holes[h][rem];
          p2 = holes[h][(rem + 1) % hLen];
          isInputHole = true;
          inputHoleIdx = h;
          found = true;
          break;
        }
        rem -= hLen;
      }
    }
    if (!found) {
      p1 = vertices[bestEdgeIdx];
      p2 = vertices[(bestEdgeIdx + 1) % n];
    }
  }

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const edgeLen = Math.hypot(dx, dy);
  if (edgeLen < 1e-4) return null;

  const ux = dx / edgeLen;
  const uy = dy / edgeLen;
  const unitTangent = { x: ux, y: uy };

  // Normalna skierowana do wnętrza bryły
  const outNorm = calculateOutwardNormal(p1, p2, isInputHole ? !isCCW : isCCW);
  const inNorm = { x: -outNorm.x, y: -outNorm.y };

  // 2. Zbierz wszystkie kandydujące krawędzie (zewnętrzne + otwory dziedzińca)
  const allSegments: SegmentRef[] = [];

  // 2a. Krawędzie obrysu zewnętrznego
  for (let i = 0; i < n; i++) {
    if (!isInputHole && i === eIdx) continue;
    if (!isInputHole && n > 3 && (i === (eIdx - 1 + n) % n || i === (eIdx + 1) % n)) continue;
    // Ściany bez dziedziczonego pochodzenia (np. tunel innej bramy wyciętej wcześniej w tym samym
    // przebiegu potoku) nie są prawdziwymi przegrodami budynku — promień "first hit" nie może w nie
    // trafiać jako "ściana przeciwległa", bo prowadzi to do korytarza obciętego przez cudzą bramę
    // zamiast przez rzeczywistą, dalszą ścianę (patrz modifierRegistry.ts: aplikator `gate`).
    if (!isInputHole && edgeEligible && edgeEligible[i] === false) continue;

    allSegments.push({
      q1: vertices[i],
      q2: vertices[(i + 1) % n],
      isHole: false,
      localIndex: i,
      globalIndex: i,
    });
  }

  // 2b. Krawędzie wygenerowanych otworów (np. dziedzińce z Donata)
  if (holes && holes.length > 0) {
    let globalOffset = n;
    holes.forEach((hole, hIdx) => {
      const hLen = hole.length;
      for (let j = 0; j < hLen; j++) {
        if (isInputHole && inputHoleIdx === hIdx && (j === eIdx - globalOffset || j === (eIdx - globalOffset - 1 + hLen) % hLen || j === (eIdx - globalOffset + 1) % hLen)) {
          continue;
        }
        allSegments.push({
          q1: hole[j],
          q2: hole[(j + 1) % hLen],
          isHole: true,
          holeIndex: hIdx,
          localIndex: j,
          globalIndex: globalOffset + j,
        });
      }
      globalOffset += hLen;
    });
  }

  // 3. Sprawdź przecięcia promieni prostopadłych dla każdego segmentu
  interface HitCandidate {
    segment: SegmentRef;
    tMin: number;
    tMax: number;
    maxWidth: number;
    distance: number;
  }

  const candidates: HitCandidate[] = [];

  for (const seg of allSegments) {
    const { q1, q2 } = seg;

    // Rzut wierzchołków q1, q2 na układ (u, inNorm) z początkiem w p1:
    const tQ1 = (q1.x - p1.x) * ux + (q1.y - p1.y) * uy;
    const sQ1 = (q1.x - p1.x) * inNorm.x + (q1.y - p1.y) * inNorm.y;

    const tQ2 = (q2.x - p1.x) * ux + (q2.y - p1.y) * uy;
    const sQ2 = (q2.x - p1.x) * inNorm.x + (q2.y - p1.y) * inNorm.y;

    // Krawędź musi leżeć w kierunku normalnej wewnętrznej (s > 0)
    if (sQ1 <= 1e-4 && sQ2 <= 1e-4) continue;

    const tOppMin = Math.min(tQ1, tQ2);
    const tOppMax = Math.max(tQ1, tQ2);

    // Część wspólna przedziału E_input ([0, edgeLen]) oraz rzutu trafionej krawędzi
    const tMin = Math.max(0, tOppMin);
    const tMax = Math.min(edgeLen, tOppMax);
    const maxWidth = tMax - tMin;

    if (maxWidth > 1e-3) {
      // Oblicz odległość s na środku wspólnego przedziału
      const tMid = (tMin + tMax) / 2;
      const denom = tQ2 - tQ1;
      let sMid = (sQ1 + sQ2) / 2;
      if (Math.abs(denom) > 1e-5) {
        const factor = (tMid - tQ1) / denom;
        sMid = sQ1 + factor * (sQ2 - sQ1);
      }

      if (sMid > 1e-3) {
        candidates.push({
          segment: seg,
          tMin,
          tMax,
          maxWidth,
          distance: sMid,
        });
      }
    }
  }

  if (candidates.length === 0) return null;

  // 4. FIRST HIT: Wybierz krawędź o NAJMNIEJSZEJ odległości (najbliższą wzdłuż promienia)
  // Przy zbliżonych odległościach (np. symetryczne lub przeciwległe ściany) stosujemy deterministyczny tie-breaker (globalIndex)
  candidates.sort((a, b) => {
    const diff = a.distance - b.distance;
    if (Math.abs(diff) > 1e-4) return diff;
    return a.segment.globalIndex - b.segment.globalIndex;
  });
  const firstHit = candidates[0];

  return {
    edgeIndex: eIdx,
    oppEdgeIndex: firstHit.segment.globalIndex,
    isHitOnHole: firstHit.segment.isHole,
    holeIndex: firstHit.segment.holeIndex,
    edgeLength: edgeLen,
    tMin: firstHit.tMin,
    tMax: firstHit.tMax,
    maxWidth: firstHit.maxWidth,
    p1,
    p2,
    oppP1: firstHit.segment.q1,
    oppP2: firstHit.segment.q2,
    inwardNormal: inNorm,
    unitTangent,
    distanceToHit: firstHit.distance,
  };
}

/**
 * Generuje punkty czworokąta korytarza bramy dla zadanej szerokości `width` i pozycji procentowej `positionRatio`.
 */
export function generateGateCorridor(
  vertices: Point2D[],
  holes?: Point2D[][],
  width: number = 4.0,
  positionRatio: number = 0.5,
  edgeIndex?: number,
  edgeEligible?: boolean[]
): GateCorridorPoints | null {
  const span = computeGateSpan(vertices, holes, edgeIndex, edgeEligible);
  if (!span) return null;
  if (span.maxWidth <= 1e-3 || width <= 1e-3) return null;

  const effWidth = Math.min(width, span.maxWidth);
  const availableMargin = Math.max(0, span.maxWidth - effWidth);
  const clampedRatio = Math.max(0, Math.min(1, positionRatio));

  const tStart = span.tMin + availableMargin * clampedRatio;
  const tEnd = tStart + effWidth;

  const { p1, oppP1, oppP2, unitTangent: u, inwardNormal: inNorm } = span;

  // Obliczenie s(t) dla rzutu na trafioną krawędź
  const tQ1 = (oppP1.x - p1.x) * u.x + (oppP1.y - p1.y) * u.y;
  const sQ1 = (oppP1.x - p1.x) * inNorm.x + (oppP1.y - p1.y) * inNorm.y;

  const tQ2 = (oppP2.x - p1.x) * u.x + (oppP2.y - p1.y) * u.y;
  const sQ2 = (oppP2.x - p1.x) * inNorm.x + (oppP2.y - p1.y) * inNorm.y;

  const getSAtT = (t: number) => {
    const denom = tQ2 - tQ1;
    if (Math.abs(denom) < 1e-5) return Math.max(0.1, (sQ1 + sQ2) / 2);
    const factor = (t - tQ1) / denom;
    return sQ1 + factor * (sQ2 - sQ1);
  };

  const sStart = getSAtT(tStart);
  const sEnd = getSAtT(tEnd);

  // Punkty na krawędzi wejściowej
  const a1: Point2D = {
    x: p1.x + tStart * u.x,
    y: p1.y + tStart * u.y,
  };
  const a2: Point2D = {
    x: p1.x + tEnd * u.x,
    y: p1.y + tEnd * u.y,
  };

  // Punkty na trafionej krawędzi
  const b1: Point2D = {
    x: a1.x + sStart * inNorm.x,
    y: a1.y + sStart * inNorm.y,
  };
  const b2: Point2D = {
    x: a2.x + sEnd * inNorm.x,
    y: a2.y + sEnd * inNorm.y,
  };

  // Bezpieczny wielokąt wycinający (rozszerzony o margines na zewnątrz o EPS = 0.2m wzdłuż normalnej)
  const EPS = 0.2;
  const cutA1: Point2D = { x: a1.x - EPS * inNorm.x, y: a1.y - EPS * inNorm.y };
  const cutA2: Point2D = { x: a2.x - EPS * inNorm.x, y: a2.y - EPS * inNorm.y };
  const cutB2: Point2D = { x: b2.x + EPS * inNorm.x, y: b2.y + EPS * inNorm.y };
  const cutB1: Point2D = { x: b1.x + EPS * inNorm.x, y: b1.y + EPS * inNorm.y };

  return {
    a1,
    a2,
    b2,
    b1,
    cuttingPolygon: [cutA1, cutA2, cutB2, cutB1],
  };
}
