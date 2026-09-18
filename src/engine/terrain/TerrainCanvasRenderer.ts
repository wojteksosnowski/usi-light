/**
 * TerrainCanvasRenderer — renderuje siatkę terenu (wireframe) na Canvas 2D CAD.
 *
 * Renderuje jako overlay po geometrii budynków, z przezroczystością sterowaną
 * przez opacity i APP_CONFIG.cad.
 */

import { APP_CONFIG } from '../../config/appConfig';
import { CadRenderContext } from '../../components/cad/types';
import type { AffineMatrix2D } from '../../utils/math2d/affineMatrix';

export interface TerrainWireframeRenderOptions {
  /** Kontekst renderowania CAD (ctx, viewState itp.). */
  rc: CadRenderContext;
  /** Przezroczystość warstwy mesh. */
  opacity?: number;
  /** Grubość linii wireframe w pikselach ekranowych. */
  lineWidth?: number;
  /** Kolor krawędzi — domyślnie kolor selection z APP_CONFIG. */
  edgeColor?: string;
  /** Czy rysować też wypełnienie trójkątów z gradientem wysokości. */
  shaded?: boolean;
}

/**
 * Renders terrain mesh as wireframe overlay on the canvas context.
 * Uses the renderContext's viewState to apply pan/zoom transform.
 */
export function renderTerrainMesh(
  ctx: CanvasRenderingContext2D,
  triangles: number[],
  opts: TerrainWireframeRenderOptions
): void {
  const {
    rc,
    opacity = 0.35,
    lineWidth = 1,
    edgeColor = APP_CONFIG.cad.selectionColor,
  } = opts;

  // Apply viewport transform (pan + zoom) from CadRenderContext
  const vs = rc.viewState;
  ctx.setTransform(vs.scale, 0, 0, vs.scale, vs.panX, vs.panY);

  ctx.globalAlpha = opacity;
  ctx.strokeStyle = edgeColor;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round' as CanvasLineJoin;

  if (opts.shaded && triangles.length >= 9) {
    renderShadedTriangles(ctx, triangles, edgeColor, opacity);
  }

  renderWireframe(ctx, triangles);

  ctx.globalAlpha = 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Draws solid filled triangles with height-based shading. */
function renderShadedTriangles(
  ctx: CanvasRenderingContext2D,
  triangles: number[],
  _baseColor: string,
  baseOpacity: number
): void {
  for (let i = 0; i < triangles.length; i += 9) {
    const z0 = triangles[i + 2];
    const z1 = triangles[i + 5];
    const z2 = triangles[i + 8];

    if (!Number.isFinite(z0) || !Number.isFinite(z1) || !Number.isFinite(z2)) continue;

    ctx.beginPath();
    ctx.moveTo(triangles[i], triangles[i + 1]);
    ctx.lineTo(triangles[i + 3], triangles[i + 4]);
    ctx.lineTo(triangles[i + 6], triangles[i + 7]);
    ctx.closePath();

    const fillRgba = `rgba(56, 189, 248, ${baseOpacity * 0.5})`;
    ctx.fillStyle = fillRgba;
    ctx.fill();
  }
}

/** Draws wireframe edges from triangle vertex indices. */
function renderWireframe(
  ctx: CanvasRenderingContext2D,
  triangles: number[]
): void {
  const edgeSet = new Set<string>();

  for (let i = 0; i < triangles.length; i += 9) {
    const edges: [number, number][] = [[0, 1], [1, 2], [2, 0]];

    for (const [vA, vB] of edges) {
      const key = edgeKey(vA, vB);
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);

      const ax = triangles[i + vA * 3];
      const ay = triangles[i + vA * 3 + 1];
      const bx = triangles[i + vB * 3];
      const by = triangles[i + vB * 3 + 1];

      if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(bx) || !Number.isFinite(by)) continue;

      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
  }
}

/** Creates a unique key for an undirected edge pair. */
function edgeKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}
