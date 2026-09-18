/**
 * TerrainCanvasRenderer — renderuje siatkę 3D terenu (wireframe) oraz izohipsy (warstwice) na Canvas 2D CAD.
 *
 * Zgodny z regułami AGENTS.md (użycie macierzy afinicznych Canvas) oraz UI Design System.
 */

import { APP_CONFIG } from '../../config/appConfig';
import { CadRenderContext } from '../../components/cad/types';
import { applyMatrixToContext, resolveViewportMatrix } from '../../utils/math2d';
import type { TerrainContourData } from '../../modules/wfs-import/store/useWfsStore';

export interface TerrainWireframeRenderOptions {
  /** Kontekst renderowania CAD (ctx, viewState itp.). */
  rc: CadRenderContext;
  /** Przezroczystość warstwy mesh. */
  opacity?: number;
  /** Grubość linii wireframe w pikselach ekranowych. */
  lineWidth?: number;
  /** Kolor krawędzi — domyślnie kolor cyan/selection z APP_CONFIG. */
  edgeColor?: string;
  /** Czy rysować też wypełnienie trójkątów z gradientem wysokości. */
  shaded?: boolean;
  /** Pre-kalkulowane unikalne krawędzie [x0, y0, x1, y1, ...] dla błyskawicznego renderu */
  wireframeEdges?: Float64Array;
}

export interface TerrainContoursRenderOptions {
  /** Kontekst renderowania CAD (ctx, viewState itp.). */
  rc: CadRenderContext;
  /** Przezroczystość warstwy warstwic. */
  opacity?: number;
  /** Kolor linii warstwic. */
  contourColor?: string;
  /** Czy renderować etykiety wysokości (tekst). */
  showLabels?: boolean;
}

/**
 * Renderuje siatkę 3D terenu (wireframe + cieniowanie wysokości) na Canvas 2D.
 */
export function renderTerrainMesh(
  ctx: CanvasRenderingContext2D,
  triangles: Float64Array | number[],
  opts: TerrainWireframeRenderOptions
): void {
  const {
    rc,
    opacity = 0.3,
    lineWidth = 1,
    edgeColor = 'rgba(56, 189, 248, 0.5)',
    wireframeEdges,
  } = opts;

  if (triangles.length < 9 && (!wireframeEdges || wireframeEdges.length < 4)) return;

  const { viewState, viewRotationDeg } = rc;
  ctx.save();
  const vm = resolveViewportMatrix(rc, viewState, viewRotationDeg);
  applyMatrixToContext(vm, ctx);

  ctx.globalAlpha = opacity;

  if (opts.shaded && triangles.length >= 9) {
    renderShadedTriangles(ctx, triangles, opacity);
  }

  renderWireframe(ctx, triangles, edgeColor, lineWidth / viewState.scale, wireframeEdges);

  ctx.restore();
}

/**
 * Renderuje izohipsy (warstwice terenu z etykietami wysokości) na Canvas 2D.
 */
export function renderTerrainContours(
  ctx: CanvasRenderingContext2D,
  contours: TerrainContourData[],
  opts: TerrainContoursRenderOptions
): void {
  const {
    rc,
    opacity = 0.65,
    contourColor = 'rgba(56, 189, 248, 0.85)',
    showLabels = true,
  } = opts;

  if (!contours || contours.length === 0) return;

  const { viewState, viewRotationDeg } = rc;
  ctx.save();
  const vm = resolveViewportMatrix(rc, viewState, viewRotationDeg);
  applyMatrixToContext(vm, ctx);

  ctx.globalAlpha = opacity;
  const invScale = 1 / viewState.scale;

  for (const contour of contours) {
    const isMajor = Math.round(contour.elevation) % 5 === 0;
    ctx.lineWidth = (isMajor ? 1.5 : 0.8) * invScale;
    ctx.strokeStyle = isMajor ? 'rgba(56, 189, 248, 0.95)' : contourColor;

    for (const loop of contour.loops) {
      if (loop.length < 2) continue;

      ctx.beginPath();
      ctx.moveTo(loop[0].x, loop[0].y);
      for (let i = 1; i < loop.length; i++) {
        ctx.lineTo(loop[i].x, loop[i].y);
      }
      ctx.stroke();

      // Renderowanie etykiety wysokości na warstwicach głównych
      if (showLabels && isMajor && loop.length >= 4 && viewState.scale >= 0.5) {
        const midIdx = Math.floor(loop.length / 2);
        const p1 = loop[midIdx];
        const p2 = loop[Math.min(midIdx + 1, loop.length - 1)];
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

        ctx.save();
        ctx.translate(p1.x, p1.y);
        // Obrót tekstu tak, by nie był do góry nogami
        const textAngle = (angle > Math.PI / 2 || angle < -Math.PI / 2) ? angle + Math.PI : angle;
        ctx.rotate(textAngle);

        ctx.font = `bold ${Math.max(9, Math.round(11 * invScale))}px sans-serif`;
        ctx.fillStyle = 'rgba(56, 189, 248, 0.95)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${contour.elevation.toFixed(0)} m`, 0, -2 * invScale);
        ctx.restore();
      }
    }
  }

  ctx.restore();
}

/** Draws solid filled triangles with subtle height-based shading. */
function renderShadedTriangles(
  ctx: CanvasRenderingContext2D,
  triangles: Float64Array | number[],
  baseOpacity: number
): void {
  for (let i = 0; i < triangles.length; i += 9) {
    const x0 = triangles[i];
    const y0 = triangles[i + 1];
    const x1 = triangles[i + 3];
    const y1 = triangles[i + 4];
    const x2 = triangles[i + 6];
    const y2 = triangles[i + 7];

    if (!Number.isFinite(x0) || !Number.isFinite(y0)) continue;

    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.closePath();

    ctx.fillStyle = `rgba(56, 189, 248, ${baseOpacity * 0.25})`;
    ctx.fill();
  }
}

/** Draws wireframe edges from triangles or pre-computed edge buffer without duplicate edges. */
function renderWireframe(
  ctx: CanvasRenderingContext2D,
  triangles: Float64Array | number[],
  edgeColor: string,
  lineWidth: number,
  wireframeEdges?: Float64Array
): void {
  ctx.strokeStyle = edgeColor;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';

  if (wireframeEdges && wireframeEdges.length >= 4) {
    ctx.beginPath();
    for (let i = 0; i < wireframeEdges.length; i += 4) {
      ctx.moveTo(wireframeEdges[i], wireframeEdges[i + 1]);
      ctx.lineTo(wireframeEdges[i + 2], wireframeEdges[i + 3]);
    }
    ctx.stroke();
    return;
  }

  ctx.beginPath();
  const edgeSet = new Set<string>();

  for (let i = 0; i < triangles.length; i += 9) {
    const p0x = triangles[i], p0y = triangles[i + 1];
    const p1x = triangles[i + 3], p1y = triangles[i + 4];
    const p2x = triangles[i + 6], p2y = triangles[i + 7];

    if (!Number.isFinite(p0x) || !Number.isFinite(p1x) || !Number.isFinite(p2x)) continue;

    const edges = [
      [p0x, p0y, p1x, p1y],
      [p1x, p1y, p2x, p2y],
      [p2x, p2y, p0x, p0y],
    ];

    for (const [ax, ay, bx, by] of edges) {
      const k1 = `${Math.round(ax * 100)},${Math.round(ay * 100)}`;
      const k2 = `${Math.round(bx * 100)},${Math.round(by * 100)}`;
      const key = k1 < k2 ? `${k1}_${k2}` : `${k2}_${k1}`;

      if (edgeSet.has(key)) continue;
      edgeSet.add(key);

      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
    }
  }

  ctx.stroke();
}
