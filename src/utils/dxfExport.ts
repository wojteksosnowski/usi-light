import { BuildingLoop, PinnedFacadePoint } from '../types/geometry';

interface DxfExportParams {
  buildings: BuildingLoop[];
  pinnedPoints: PinnedFacadePoint[];
}

export function exportSceneToDxf({ buildings, pinnedPoints }: DxfExportParams): void {
  const lines: string[] = [];

  // DXF Header
  lines.push('0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '0', 'ENDSEC');

  // DXF Tables
  lines.push('0', 'SECTION', '2', 'TABLES');
  lines.push('0', 'TABLE', '2', 'LAYER', '70', '3');
  lines.push('0', 'LAYER', '2', 'BUDYNKI', '70', '0', '62', '7', '6', 'CONTINUOUS');
  lines.push('0', 'LAYER', '2', 'GRANICE', '70', '0', '62', '1', '6', 'CONTINUOUS');
  lines.push('0', 'LAYER', '2', 'PUNKTY_POMIARU', '70', '0', '62', '3', '6', 'CONTINUOUS');
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

  lines.push('0', 'ENDSEC');
  lines.push('0', 'EOF');

  const dxfContent = lines.join('\n');
  const blob = new Blob([dxfContent], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `usi-light-export-${new Date().toISOString().slice(0, 10)}.dxf`;
  link.click();
  URL.revokeObjectURL(url);
}
