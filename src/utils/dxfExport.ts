import { BuildingLoop, PinnedFacadePoint } from '../types/geometry';
import { CrsDetectionResult, LatLon } from './geoTransform';
import { buildTerrainMeshDxfEntities } from '../modules/wfs-import/utils/terrainMeshDxf';
import type { TerrainMeshData } from '../modules/wfs-import/store/useWfsStore';

interface DxfExportParams {
  buildings: BuildingLoop[];
  pinnedPoints: PinnedFacadePoint[];
  /** Pobrana i wygenerowana siatka terenu (z pamięci RAM) */
  terrainMeshData?: TerrainMeshData | null;
  /** Jeśli podane, do eksportu dołączana jest siatka rzeźby terenu pobierana w locie (NMT, GUGiK WCS). */
  terrain?: {
    projectCenter: LatLon;
    radiusMeters: number;
    projectCrs: CrsDetectionResult;
  };
}

/**
 * Buduje linie DXF (3DFACE oraz 3D POLYLINE dla warstwic) z obiektu TerrainMeshData.
 */
export function buildDxfEntitiesFromTerrainMesh(mesh: TerrainMeshData): string[] {
  const lines: string[] = [];
  const triangles = mesh.triangles;

  // 1. Siatka trójkątów powierzchniowych 3DFACE (kompatybilna ze wszystkimi programami CAD)
  for (let i = 0; i < triangles.length; i += 9) {
    const x0 = triangles[i], y0 = triangles[i + 1], z0 = triangles[i + 2];
    const x1 = triangles[i + 3], y1 = triangles[i + 4], z1 = triangles[i + 5];
    const x2 = triangles[i + 6], y2 = triangles[i + 7], z2 = triangles[i + 8];

    if (!Number.isFinite(x0) || !Number.isFinite(x1) || !Number.isFinite(x2)) continue;

    lines.push('0', '3DFACE');
    lines.push('8', 'RZEZBA_TERENU');
    lines.push('10', x0.toFixed(3));
    lines.push('20', y0.toFixed(3));
    lines.push('30', z0.toFixed(3));
    lines.push('11', x1.toFixed(3));
    lines.push('21', y1.toFixed(3));
    lines.push('31', z1.toFixed(3));
    lines.push('12', x2.toFixed(3));
    lines.push('22', y2.toFixed(3));
    lines.push('32', z2.toFixed(3));
    lines.push('13', x2.toFixed(3));
    lines.push('23', y2.toFixed(3));
    lines.push('33', z2.toFixed(3));
  }

  // 2. Warstwice / Izohipsy (3D POLYLINE + etykiety tekstowe)
  if (mesh.contours && mesh.contours.length > 0) {
    for (const c of mesh.contours) {
      for (const loop of c.loops) {
        if (loop.length < 2) continue;
        lines.push('0', 'POLYLINE');
        lines.push('8', 'WARSTWICE_TERENU');
        lines.push('66', '1');
        lines.push('70', '8'); // 3D polyline
        for (const pt of loop) {
          lines.push('0', 'VERTEX');
          lines.push('8', 'WARSTWICE_TERENU');
          lines.push('70', '32'); // 3D polyline vertex
          lines.push('10', pt.x.toFixed(3));
          lines.push('20', pt.y.toFixed(3));
          lines.push('30', c.elevation.toFixed(3));
        }
        lines.push('0', 'SEQEND');

        // Etykieta wysokości tekstem DXF
        const midPt = loop[Math.floor(loop.length / 2)];
        lines.push('0', 'TEXT');
        lines.push('8', 'WARSTWICE_ETYKIETY');
        lines.push('10', midPt.x.toFixed(3));
        lines.push('20', midPt.y.toFixed(3));
        lines.push('30', c.elevation.toFixed(3));
        lines.push('40', '0.75'); // wysokość tekstu
        lines.push('1', `${c.elevation.toFixed(0)}m`);
      }
    }
  }

  return lines;
}

export async function exportSceneToDxf({
  buildings,
  pinnedPoints,
  terrainMeshData,
  terrain,
}: DxfExportParams): Promise<{ terrainWarning: string | null }> {
  const lines: string[] = [];
  let terrainWarning: string | null = null;
  let terrainEntityLines: string[] = [];

  // Jeśli mamy już gotowy mesh w pamięci, generujemy encje DXF natychmiast
  if (terrainMeshData && terrainMeshData.triangles.length > 0) {
    terrainEntityLines = buildDxfEntitiesFromTerrainMesh(terrainMeshData);
  } else if (terrain) {
    // W przeciwnym razie pobieramy z GUGiK WCS
    const result = await buildTerrainMeshDxfEntities(terrain.projectCenter, terrain.radiusMeters, terrain.projectCrs);
    terrainEntityLines = result.entityLines;
    terrainWarning = result.warning;
  }

  // DXF Header
  lines.push('0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '0', 'ENDSEC');

  // DXF Tables
  lines.push('0', 'SECTION', '2', 'TABLES');
  lines.push('0', 'TABLE', '2', 'LAYER', '70', '6');
  lines.push('0', 'LAYER', '2', 'BUDYNKI', '70', '0', '62', '7', '6', 'CONTINUOUS');
  lines.push('0', 'LAYER', '2', 'GRANICE', '70', '0', '62', '1', '6', 'CONTINUOUS');
  lines.push('0', 'LAYER', '2', 'PUNKTY_POMIARU', '70', '0', '62', '3', '6', 'CONTINUOUS');
  lines.push('0', 'LAYER', '2', 'RZEZBA_TERENU', '70', '0', '62', '8', '6', 'CONTINUOUS');
  lines.push('0', 'LAYER', '2', 'WARSTWICE_TERENU', '70', '0', '62', '4', '6', 'CONTINUOUS');
  lines.push('0', 'LAYER', '2', 'WARSTWICE_ETYKIETY', '70', '0', '62', '4', '6', 'CONTINUOUS');
  lines.push('0', 'ENDTAB');
  lines.push('0', 'ENDSEC');

  // DXF Entities
  lines.push('0', 'SECTION', '2', 'ENTITIES');

  buildings.forEach((b) => {
    const layer = b.category === 'boundary' ? 'GRANICE' : 'BUDYNKI';
    if (b.vertices.length >= 2) {
      lines.push('0', 'POLYLINE');
      lines.push('8', layer);
      lines.push('66', '1'); // Followed by vertices
      lines.push('70', '1'); // Closed polygon

      b.vertices.forEach((v) => {
        lines.push('0', 'VERTEX');
        lines.push('8', layer);
        lines.push('10', v.x.toFixed(4));
        lines.push('20', v.y.toFixed(4));
        lines.push('30', (b.defaultHeight || 0).toFixed(4));
      });

      lines.push('0', 'SEQEND');
    }
  });

  // Pinned points
  pinnedPoints.forEach((pt) => {
    const b = buildings.find((bg) => bg.id === pt.buildingId);
    const seg = b?.segments.find((s) => s.id === pt.segmentId);
    if (seg) {
      const px = seg.p1.x + (seg.p2.x - seg.p1.x) * pt.offsetRatio;
      const py = seg.p1.y + (seg.p2.y - seg.p1.y) * pt.offsetRatio;

      lines.push('0', 'POINT');
      lines.push('8', 'PUNKTY_POMIARU');
      lines.push('10', px.toFixed(4));
      lines.push('20', py.toFixed(4));
      lines.push('30', '0.0');

      lines.push('0', 'TEXT');
      lines.push('8', 'PUNKTY_POMIARU');
      lines.push('10', (px + 0.5).toFixed(4));
      lines.push('20', (py + 0.5).toFixed(4));
      lines.push('30', '0.0');
      lines.push('40', '0.6'); // Height
      lines.push('1', pt.label || 'P');
    }
  });

  if (terrainEntityLines.length > 0) {
    lines.push(...terrainEntityLines);
  }

  lines.push('0', 'ENDSEC');
  lines.push('0', 'EOF');

  const dxfContent = lines.join('\n');
  const blob = new Blob([dxfContent], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `usi-light-export-${new Date().toISOString().slice(0, 10)}.dxf`;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    try {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      // Ignoruj błędy czyszczenia
    }
  }, 1500);

  return { terrainWarning };
}
