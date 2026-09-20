import { DxfWriter, LWPolylineFlags, TrueColor } from '@tarikjabiri/dxf';
import { AnalysisPointResult, BuildingLoop, Point2D } from '../../types/geometry';
import { APP_CONFIG } from '../../config/appConfig';

const DEG2RAD = Math.PI / 180;
const LINE_WIDTH_M = 0.15;
const BAND_WIDTH_M = 0.3;
const ARC_SUBDIVISIONS = 8;

export const DXF_ANALYSIS_LAYERS = {
  shadowing: 'ANALIZA_S12',
  sunlight: 'ANALIZA_S56',
} as const;

// ACI (AutoCAD Color Index) mapowane na legendę widoczną w aplikacji (shadowingRenderer.ts / sunlightRenderer.ts)
const ACI_RED = 1;
const ACI_YELLOW = 2;
const ACI_GREEN = 3;

function findBuilding(buildings: BuildingLoop[], buildingId: string): BuildingLoop | undefined {
  return buildings.find((b) => b.id === buildingId);
}

/** Parsuje `rgba(r, g, b, a)` (jedyny format zwracany przez `APP_CONFIG.analysisBands.*`) na wartość
 * 24-bit (jako string, zgodnie z `CommonEntityOptions.trueColor: string`) wymaganą przez grupę DXF 420. */
function rgbaStringToTrueColor(rgba: string): string {
  const match = rgba.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  const [, r, g, b] = match ?? [undefined, '0', '0', '0'];
  const hex = `#${[r, g, b].map((c) => Number(c).toString(16).padStart(2, '0')).join('')}`;
  return String(TrueColor.fromHex(hex));
}

/** Dodaje do `dxf` zamknięty klin (wedge, LWPOLYLINE o stałej szerokości) od punktu do łuku na
 * promieniu `radius`, pomiędzy kątami startDeg i endDeg (stopnie, konwencja matematyczna CCW od osi X). */
function addWedgeEntity(
  dxf: DxfWriter,
  center: Point2D,
  radius: number,
  startDeg: number,
  endDeg: number,
  layer: string,
  aci: number
): void {
  if (!Number.isFinite(radius) || radius <= 0) return;
  const startRad = startDeg * DEG2RAD;
  const endRad = endDeg * DEG2RAD;

  const vertices: Point2D[] = [center];
  for (let i = 0; i <= ARC_SUBDIVISIONS; i++) {
    const t = i / ARC_SUBDIVISIONS;
    const rad = startRad + (endRad - startRad) * t;
    vertices.push({
      x: center.x + Math.cos(rad) * radius,
      y: center.y + Math.sin(rad) * radius,
    });
  }

  dxf.addLWPolyline(
    vertices.map((v) => ({ point: v })),
    {
      layerName: layer,
      colorNumber: aci,
      flags: LWPolylineFlags.Closed,
      constantWidth: LINE_WIDTH_M,
    }
  );
}

/** Punkt na poziomej podstawie E-W trójkąta "Linijki Słońca" (Y = point.y - d), tak jak
 * `calcRulerEndpoint` w `sunlightRenderer.ts` — geometria jest już we współrzędnych świata. */
function calcRulerEndpoint(point: Point2D, dirX: number, dirY: number, d: number): Point2D {
  if (dirY < -1e-5) {
    const t = -d / dirY;
    return { x: point.x + dirX * t, y: point.y - d };
  }
  return { x: point.x + dirX * (d * 5.0), y: point.y - d };
}

/** Dodaje do `dxf` trójkąt sektora nasłonecznienia (punkt fasady + dwa promienie do poziomej
 * podstawy E-W), odzwierciedlający dokładnie kształt rysowany na ekranie przez `sunlightRenderer.ts`
 * (w przeciwieństwie do łuku §12, sektor §56 to trójkąt, nie wycinek koła). */
function addSunTriangleEntity(
  dxf: DxfWriter,
  point: Point2D,
  startAzimuthDeg: number,
  endAzimuthDeg: number,
  dist: number,
  layer: string,
  aci: number
): void {
  if (!Number.isFinite(dist) || dist <= 0) return;

  const az1MathRad = ((90 - startAzimuthDeg + 360) % 360) * DEG2RAD;
  const az2MathRad = ((90 - endAzimuthDeg + 360) % 360) * DEG2RAD;
  const p1 = calcRulerEndpoint(point, Math.cos(az1MathRad), Math.sin(az1MathRad), dist);
  const p2 = calcRulerEndpoint(point, Math.cos(az2MathRad), Math.sin(az2MathRad), dist);

  dxf.addLWPolyline(
    [{ point }, { point: p1 }, { point: p2 }],
    {
      layerName: layer,
      colorNumber: aci,
      flags: LWPolylineFlags.Closed,
    }
  );
}

/** Dodaje do `dxf` encje (warstwy ANALIZA_S12 / ANALIZA_S56) reprezentujące obrys sektorów §12
 * (przesłanianie, łuk) i §56 (nasłonecznienie, trójkąt) wokół każdego przypiętego punktu fasady
 * (P1/P2/P3), kolorowane wg tej samej legendy co w podglądzie aplikacji. */
export function buildFacadePointAnalysisEntities(
  dxf: DxfWriter,
  results: AnalysisPointResult[],
  buildings: BuildingLoop[]
): void {
  for (const result of results) {
    const normalWorldDeg = (Math.atan2(result.normal.y, result.normal.x) * 180) / Math.PI;
    if (!Number.isFinite(normalWorldDeg)) continue;
    const isCityCentre = findBuilding(buildings, result.buildingId)?.isCityCentre ?? false;
    const maxAllowedReq = isCityCentre ? 17.5 : 35.0;

    // § 12 — sektory przesłaniania (łuk)
    const sectors = result.shadowing?.sectors ?? [];
    sectors.forEach((sector, sIdx) => {
      const isFree = sector.isFree;
      const isTolerated = sector.isTolerated === true;

      let dist: number;
      if (isFree) {
        const prevSector = sIdx > 0 ? sectors[sIdx - 1] : null;
        const nextSector = sIdx < sectors.length - 1 ? sectors[sIdx + 1] : null;
        const prevReq = prevSector ? (prevSector.requiredDistance ?? 0) : 0;
        const nextReq = nextSector ? (nextSector.requiredDistance ?? 0) : 0;
        const boundingReq = Math.max(sector.requiredDistance ?? 0, prevReq, nextReq);
        dist = boundingReq > 0 ? Math.min(boundingReq, maxAllowedReq) : maxAllowedReq;
      } else {
        const req = sector.requiredDistance ?? 0;
        dist = Math.min(req > 0 ? req : maxAllowedReq, maxAllowedReq);
      }

      const aci = isFree ? ACI_GREEN : isTolerated ? ACI_YELLOW : ACI_RED;
      const startDeg = normalWorldDeg + sector.startAngleDeg;
      const endDeg = normalWorldDeg + sector.endAngleDeg;

      addWedgeEntity(dxf, result.point, dist, startDeg, endDeg, DXF_ANALYSIS_LAYERS.shadowing, aci);
    });

    // § 56 — sektory nasłonecznienia (trójkąt, azymuty bezwzględne: 0°=N, CW od północy)
    const sunSectors = result.sunlight?.sectors ?? [];
    sunSectors.forEach((sector) => {
      const dist = Math.min(sector.requiredDistance && sector.requiredDistance > 0 ? sector.requiredDistance : maxAllowedReq, maxAllowedReq);
      const aci = sector.isDirectSunlight ? ACI_GREEN : ACI_RED;

      addSunTriangleEntity(
        dxf,
        result.point,
        sector.startAzimuthDeg,
        sector.endAzimuthDeg,
        dist,
        DXF_ANALYSIS_LAYERS.sunlight,
        aci
      );
    });
  }
}

interface ComplianceInterval {
  color: string;
  startRatio: number;
  endRatio: number;
}

/** Grupuje `results` po (buildingId, segmentId) i scala kolejne punkty o tym samym stanie/kolorze
 * w ciągłe przedziały wzdłuż ściany — ten sam algorytm co `analysisBandsRenderer.ts`. */
function buildIntervals(points: AnalysisPointResult[], colorOf: (p: AnalysisPointResult) => string): ComplianceInterval[] {
  const sorted = [...points].sort((a, b) => a.shadowing.offsetRatio - b.shadowing.offsetRatio);
  const intervals: ComplianceInterval[] = [];
  const n = sorted.length;

  for (let i = 0; i < n; i++) {
    const p = sorted[i];
    const color = colorOf(p);
    const prevRatio = i === 0 ? 0.0 : (sorted[i - 1].shadowing.offsetRatio + p.shadowing.offsetRatio) / 2;
    const nextRatio = i === n - 1 ? 1.0 : (p.shadowing.offsetRatio + sorted[i + 1].shadowing.offsetRatio) / 2;

    const last = intervals[intervals.length - 1];
    if (last && last.color === color) {
      last.endRatio = nextRatio;
    } else {
      intervals.push({ color, startRatio: prevRatio, endRatio: nextRatio });
    }
  }

  return intervals;
}

/** Dodaje do `dxf` ciągłe, kolorowane pasma zgodności §12 (wewnątrz obrysu) i §56 (na zewnątrz)
 * biegnące wzdłuż fasad budynku — odpowiednik `analysisBandsRenderer.ts` przeniesiony do DXF jako
 * odcinki LWPOLYLINE o stałej szerokości (`BAND_WIDTH_M`) i kolorze zgodnym z legendą aplikacji. */
export function buildFacadeComplianceBands(
  dxf: DxfWriter,
  results: AnalysisPointResult[],
  buildings: BuildingLoop[]
): void {
  const { shadowing, sunlight } = APP_CONFIG.analysisBands;

  const byBuilding = new Map<string, Map<string, AnalysisPointResult[]>>();
  for (const res of results) {
    if (!byBuilding.has(res.buildingId)) byBuilding.set(res.buildingId, new Map());
    const bySegment = byBuilding.get(res.buildingId)!;
    if (!bySegment.has(res.segmentId)) bySegment.set(res.segmentId, []);
    bySegment.get(res.segmentId)!.push(res);
  }

  for (const [buildingId, bySegment] of byBuilding) {
    const bldg = findBuilding(buildings, buildingId);
    if (!bldg) continue;
    const bType = bldg.buildingType || 'residential';
    if (bType === 'garage') continue;
    const canRenderSunlight = bType === 'residential';

    for (const [segmentId, points] of bySegment) {
      const seg = bldg.segments.find((s) => s.id === segmentId);
      if (!seg) continue;

      const dx = seg.p2.x - seg.p1.x;
      const dy = seg.p2.y - seg.p1.y;

      // § 12 — pasmo wewnątrz obrysu (przeciwnie do normalnej ściany)
      const shadowingIntervals = buildIntervals(points, (p) =>
        p.shadowing.isCompliant ? shadowing.compliantColor() : shadowing.nonCompliantColor()
      );
      shadowingIntervals.forEach((inter) => {
        const o1 = { x: seg.p1.x + inter.startRatio * dx, y: seg.p1.y + inter.startRatio * dy };
        const o2 = { x: seg.p1.x + inter.endRatio * dx, y: seg.p1.y + inter.endRatio * dy };
        const offset = BAND_WIDTH_M / 2;
        const p1 = { x: o1.x - seg.normal.x * offset, y: o1.y - seg.normal.y * offset };
        const p2 = { x: o2.x - seg.normal.x * offset, y: o2.y - seg.normal.y * offset };

        dxf.addLWPolyline([{ point: p1 }, { point: p2 }], {
          layerName: DXF_ANALYSIS_LAYERS.shadowing,
          trueColor: rgbaStringToTrueColor(inter.color),
          constantWidth: BAND_WIDTH_M,
        });
      });

      // § 56 — pasmo na zewnątrz obrysu (tylko budynki mieszkalne)
      if (canRenderSunlight) {
        const sunlightIntervals = buildIntervals(points, (p) => sunlight.getColor(p.sunlight.totalHours));
        sunlightIntervals.forEach((inter) => {
          const o1 = { x: seg.p1.x + inter.startRatio * dx, y: seg.p1.y + inter.startRatio * dy };
          const o2 = { x: seg.p1.x + inter.endRatio * dx, y: seg.p1.y + inter.endRatio * dy };
          const offset = BAND_WIDTH_M / 2;
          const p1 = { x: o1.x + seg.normal.x * offset, y: o1.y + seg.normal.y * offset };
          const p2 = { x: o2.x + seg.normal.x * offset, y: o2.y + seg.normal.y * offset };

          dxf.addLWPolyline([{ point: p1 }, { point: p2 }], {
            layerName: DXF_ANALYSIS_LAYERS.sunlight,
            trueColor: rgbaStringToTrueColor(inter.color),
            constantWidth: BAND_WIDTH_M,
          });
        });
      }
    }
  }
}
