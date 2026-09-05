import { CadRenderContext } from '../types';
import { BuildingLoop, ProjectSettings } from '../../../types/geometry';
import { analyzePlaygroundSunlight } from '../../../engine/analysisEngine';
import { generatePolygonalVoronoiCells } from '../../../utils/math2d/voronoi';

/**
 * Zwraca łagodny gradient w krokach co 0.5h naświetlenia:
 * - 0.0h (pełny cień): nasycony głęboki teal
 * - 0.5h - 1.5h: morski teal przechodzący w łagodną szałwię
 * - 2.0h (próg normy): piaskowo-szałwiowy
 * - 2.5h - 3.5h: jasny piaskowy do złocistego piaskowego
 * - >= 4.0h (pełne słońce): ciepły, słoneczny piaskowy
 */
export function getPlaygroundSunlightColor(hours: number): string {
  const h = Math.max(0, Number.isFinite(hours) ? hours : 0);
  const step = Math.round(h * 2) / 2; // Zaokrąglenie do 0.5h

  if (step <= 0.0) return 'rgba(13, 148, 136, 0.78)'; // 0.0h: Ciemny morski teal (brak słońca)
  if (step <= 0.5) return 'rgba(20, 184, 166, 0.74)'; // 0.5h: Klasyczny teal
  if (step <= 1.0) return 'rgba(45, 212, 191, 0.70)'; // 1.0h: Morski jasny teal
  if (step <= 1.5) return 'rgba(110, 204, 178, 0.68)'; // 1.5h: Mięta morska
  if (step <= 2.0) return 'rgba(152, 201, 160, 0.66)'; // 2.0h: Łagodna szałwia
  if (step <= 2.5) return 'rgba(196, 200, 142, 0.66)'; // 2.5h: Piaskowo-szałwiowy
  if (step <= 3.0) return 'rgba(224, 198, 132, 0.68)'; // 3.0h: Jasny piaskowy
  if (step <= 3.5) return 'rgba(238, 195, 118, 0.72)'; // 3.5h: Piaskowo-złocisty
  return 'rgba(245, 197, 105, 0.76)';                 // >= 4.0h: Ciepły, pełny piaskowy
}

/**
 * Wizualizuje nasłonecznienie placu zabaw (§ 33 ust. 3 WT) na rzucie CAD:
 * Wypełnia obszar placu łagodnym gradientem teal -> piaskowy w krokach co 0.5h naświetlenia,
 * bez wyświetlania pojedynczych punktów ani etykiet z czasami.
 */
export function renderPlaygroundSunlightVisualizations(
  rc: CadRenderContext,
  buildings: BuildingLoop[],
  settings: ProjectSettings,
  sunlightMethod: 'raycasting' | 'segments' = 'raycasting',
  layerSettings: Record<string, any> = {}
) {
  const testedPlaygrounds = buildings.filter(
    (b) =>
      b.category === 'boundary' &&
      b.areaType === 'playground' &&
      b.isTested &&
      b.isIncluded !== false &&
      Array.isArray(b.vertices) &&
      b.vertices.length >= 3
  );

  if (testedPlaygrounds.length === 0) return;

  const { ctx, worldToScreen, viewState } = rc;

  ctx.save();

  for (const pg of testedPlaygrounds) {
    const lyr = pg.layer || 'Domyślna (0)';
    const lyrSetting = layerSettings[lyr] || {};
    if (lyrSetting.isVisible === false) continue;

    const analysis = analyzePlaygroundSunlight(pg, buildings, settings, sunlightMethod, { isInteracting: rc.isInteracting });
    const samplePoints = analysis.samplePoints || [];

    // 1. Wypełnienie obszaru placu zabaw gradientem barw w krokach co 0.5h (przycięte do obrysu)
    if (samplePoints.length > 0 && pg.vertices.length >= 3) {
      ctx.save();
      ctx.beginPath();
      const p0 = worldToScreen(pg.vertices[0].x, pg.vertices[0].y);
      ctx.moveTo(p0.sx, p0.sy);
      for (let i = 1; i < pg.vertices.length; i++) {
        const p = worldToScreen(pg.vertices[i].x, pg.vertices[i].y);
        ctx.lineTo(p.sx, p.sy);
      }
      ctx.closePath();
      ctx.clip();

      const useVoronoi = pg.playgroundVoronoi !== false;

      if (useVoronoi) {
        // Prawdziwy analityczny diagram Voronoi (polygonal Voronoi cells)
        const sites = samplePoints.map((sp) => sp.point);
        const cells = generatePolygonalVoronoiCells(sites, pg.vertices);

        // Mapowanie punktu na kolor
        const pointColorMap = new Map<string, string>();
        for (const sp of samplePoints) {
          pointColorMap.set(`${sp.point.x.toFixed(3)},${sp.point.y.toFixed(3)}`, getPlaygroundSunlightColor(sp.hours));
        }

        // Rysowanie komórek Voronoi (wypełnienie kolorem + jasna, subtelna obwódka)
        for (const cell of cells) {
          if (!cell.polygon || cell.polygon.length < 3) continue;
          const color = pointColorMap.get(`${cell.site.x.toFixed(3)},${cell.site.y.toFixed(3)}`) || getPlaygroundSunlightColor(0);

          ctx.beginPath();
          const pStart = worldToScreen(cell.polygon[0].x, cell.polygon[0].y);
          ctx.moveTo(pStart.sx, pStart.sy);
          for (let i = 1; i < cell.polygon.length; i++) {
            const pNext = worldToScreen(cell.polygon[i].x, cell.polygon[i].y);
            ctx.lineTo(pNext.sx, pNext.sy);
          }
          ctx.closePath();

          ctx.fillStyle = color;
          ctx.fill();

          // Obwódka komórki Voronoi z ciemnego piaskowego z przezroczystością
          ctx.setLineDash([]);
          ctx.strokeStyle = 'rgba(145, 105, 55, 0.55)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      } else {
        // Tryb siatki ortogonalnej: rysowanie regularnych kafelków ortogonalnych
        const step = Math.max(0.1, settings.samplingInterval ?? 0.5);
        const cellScreenSize = Math.max(3, step * viewState.scale * 1.05);

        for (const sp of samplePoints) {
          const { sx, sy } = worldToScreen(sp.point.x, sp.point.y);
          if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;

          ctx.fillStyle = getPlaygroundSunlightColor(sp.hours);
          ctx.fillRect(
            sx - cellScreenSize / 2,
            sy - cellScreenSize / 2,
            cellScreenSize,
            cellScreenSize
          );
        }
      }
      ctx.restore();
    }

    // 2. Rysowanie plakietki statusowej § 33.3 w centroidzie placu zabaw
    let cx = 0;
    let cy = 0;
    for (const v of pg.vertices) {
      cx += v.x;
      cy += v.y;
    }
    cx /= pg.vertices.length;
    cy /= pg.vertices.length;

    const { sx: csx, sy: csy } = worldToScreen(cx, cy);
    if (Number.isFinite(csx) && Number.isFinite(csy)) {
      const isCompliant = analysis.isCompliant;
      const statusText = isCompliant ? '✓ § 33.3 SPEŁNIONY' : '✕ § 33.3 NIESPEŁNIONY';
      const pctText = `${analysis.sunlitPercentage}% pow. (min. ${analysis.requiredDurationHours}h)`;

      ctx.font = 'bold 11px Inter, sans-serif';
      const textW1 = ctx.measureText(statusText).width;
      ctx.font = '10px Inter, monospace';
      const textW2 = ctx.measureText(pctText).width;

      const cardW = Math.max(textW1, textW2) + 20;
      const cardH = 34;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
      ctx.strokeStyle = isCompliant ? '#10b981' : '#ef4444';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.roundRect(csx - cardW / 2, csy - cardH / 2, cardW, cardH, 6);
      ctx.fill();
      ctx.stroke();

      // Linia 1: Status
      ctx.fillStyle = isCompliant ? '#34d399' : '#fca5a5';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(statusText, csx, csy - 6);

      // Linia 2: Procent i wymóg
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '10px Inter, monospace';
      ctx.fillText(pctText, csx, csy + 8);
    }
  }

  ctx.restore();
}
