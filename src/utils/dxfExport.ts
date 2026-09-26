import { DxfWriter, LWPolylineFlags, Units } from '@tarikjabiri/dxf';
import { AnalysisPointResult, BuildingLoop, HourlyShadowLoop, PinnedFacadePoint } from '../types/geometry';
import { buildFacadeComplianceBands, buildFacadePointAnalysisEntities, DXF_ANALYSIS_LAYERS } from './dxf/analysisGeometryBuilder';
import { CrsDetectionResult, detectCoordinateSystem } from './geoTransform';

interface DxfExportParams {
  buildings: BuildingLoop[];
  pinnedPoints: PinnedFacadePoint[];
  /** Obrysy zakresu cienia z krokami co 1h (obwiednia + pośrednie godziny), na osobnej warstwie. */
  hourlyShadows?: HourlyShadowLoop[];
  /** Wyniki analiz §12/§56 dla wszystkich przypiętych punktów fasady (P1/P2/P3) — źródło łuku (§12)
   * i trójkąta (§56) rysowanych w konkretnym punkcie pomiarowym. */
  pinnedPointResults?: AnalysisPointResult[];
  /** Gęsto próbkowane wyniki §12/§56 dla wszystkich testowanych budynków (co `samplingInterval`
   * wzdłuż każdej fasady) — źródło kolorowych obwiedni (bands) wzdłuż całego obrysu budynku,
   * niezależne od przypiętych punktów fasady. */
  analysisResults?: AnalysisPointResult[];
  /** Opcjonalne metadane CRS */
  crsInfo?: CrsDetectionResult;
  /** Opcjonalna nazwa projektu dla pliku */
  projectName?: string;
}

const SHADOW_RANGE_LAYER = 'ZAKRES_CIENIA_GODZINOWY';
const SHADOW_RANGE_WIDTH_M = 0.1;

/**
 * Buduje pełny, zgodny ze specyfikacją DXF dokument (HEADER/TABLES/BLOCKS/ENTITIES/OBJECTS,
 * z uchwytami i $HANDSEED zarządzanymi przez bibliotekę `@tarikjabiri/dxf`) i zwraca jego
 * treść jako tablicę linii (naprzemiennie kod grupy / wartość), zgodnie z formatem DXF.
 */
export function buildDxfLines({
  buildings,
  pinnedPoints,
  hourlyShadows,
  pinnedPointResults,
  analysisResults,
  crsInfo,
  dxf = new DxfWriter(),
}: DxfExportParams & { dxf?: DxfWriter }): string[] {
  // Wymuś jednostkę METRY ($INSUNITS = 6)
  dxf.setUnits(Units.Meters);

  dxf.addLayer('BUDYNKI', 7, 'CONTINUOUS');
  dxf.addLayer('BUDYNKI_BADANE', 4, 'CONTINUOUS');
  dxf.addLayer('GRANICE_DZIALEK', 1, 'CONTINUOUS');
  dxf.addLayer('PUNKTY_POMIARU', 3, 'CONTINUOUS');
  dxf.addLayer('RZEZBA_TERENU', 8, 'CONTINUOUS');
  dxf.addLayer(SHADOW_RANGE_LAYER, 5, 'CONTINUOUS');
  dxf.addLayer(DXF_ANALYSIS_LAYERS.shadowing, 1, 'CONTINUOUS');
  dxf.addLayer(DXF_ANALYSIS_LAYERS.sunlight, 1, 'CONTINUOUS');

  buildings.forEach((b) => {
    let layer = 'BUDYNKI';
    if (b.category === 'boundary') {
      layer = 'GRANICE_DZIALEK';
    } else if (b.isTested) {
      layer = 'BUDYNKI_BADANE';
    }

    if (b.vertices.length >= 2) {
      dxf.addLWPolyline(
        b.vertices.map((v) => ({ point: v })),
        {
          layerName: layer,
          flags: LWPolylineFlags.Closed,
          elevation: b.defaultHeight || 0,
        }
      );
    }
  });

  // Pinned points
  pinnedPoints.forEach((pt) => {
    const b = buildings.find((bg) => bg.id === pt.buildingId);
    const seg = b?.segments.find((s) => s.id === pt.segmentId);
    if (seg) {
      const px = seg.p1.x + (seg.p2.x - seg.p1.x) * pt.offsetRatio;
      const py = seg.p1.y + (seg.p2.y - seg.p1.y) * pt.offsetRatio;

      dxf.addPoint(px, py, 0, { layerName: 'PUNKTY_POMIARU' });
      dxf.addText({ x: px + 0.5, y: py + 0.5, z: 0 }, 0.6, pt.label || 'P', { layerName: 'PUNKTY_POMIARU' });
    }
  });

  // Obrysy zakresu cienia co 1h (§ 12/§56 kontekst — obwiednia pośrednich godzin)
  if (hourlyShadows && hourlyShadows.length > 0) {
    hourlyShadows.forEach((hourly) => {
      hourly.polygons.forEach((ring) => {
        if (ring.length < 3) return;
        dxf.addLWPolyline(
          ring.map((v) => ({ point: v })),
          {
            layerName: SHADOW_RANGE_LAYER,
            flags: LWPolylineFlags.Closed,
            constantWidth: SHADOW_RANGE_WIDTH_M,
          }
        );

        const label = hourly.polygons[0]?.[0];
        if (label) {
          const hh = Math.floor(hourly.hourDecimal);
          const mm = Math.round((hourly.hourDecimal - hh) * 60);
          dxf.addText({ x: label.x, y: label.y, z: 0 }, 0.5, `${hh}:${String(mm).padStart(2, '0')}`, {
            layerName: SHADOW_RANGE_LAYER,
          });
        }
      });
    });
  }

  // Obwiednie §12/§56 wzdłuż fasad wszystkich testowanych budynków (gęste próbkowanie, niezależne
  // od przypiętych punktów)
  if (analysisResults && analysisResults.length > 0) {
    buildFacadeComplianceBands(dxf, analysisResults, buildings);
  }

  // Łuk §12 / trójkąt §56 dla przypiętych punktów fasady (P1/P2/P3)
  if (pinnedPointResults && pinnedPointResults.length > 0) {
    buildFacadePointAnalysisEntities(dxf, pinnedPointResults, buildings);
  }

  return dxf.document.stringify().split('\n');
}

export async function exportSceneToDxf({
  buildings,
  pinnedPoints,
  hourlyShadows,
  pinnedPointResults,
  analysisResults,
  crsInfo,
  projectName,
}: DxfExportParams): Promise<void> {
  const dxf = new DxfWriter();

  const detectedCrs = crsInfo || detectCoordinateSystem(buildings.flatMap((b) => b.vertices || []));

  const lines = buildDxfLines({
    buildings,
    pinnedPoints,
    hourlyShadows,
    pinnedPointResults,
    analysisResults,
    crsInfo: detectedCrs,
    dxf,
  });

  const dxfContent = lines.join('\n');
  const blob = new Blob([dxfContent], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;

  const crsSuffix = detectedCrs.isGeodetic ? `-${detectedCrs.crs.replace(':', '_')}` : '';
  const projNameSafe = projectName ? `-${projectName.replace(/[^a-zA-Z0-9_\u00C0-\u017F-]/g, '_')}` : '';
  link.download = `usi-light${projNameSafe}${crsSuffix}-${new Date().toISOString().slice(0, 10)}.dxf`;
  link.click();
  URL.revokeObjectURL(url);
}

