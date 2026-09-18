/**
 * osmLanduseRenderer.ts
 *
 * Silnik renderujący warstwy zagospodarowania terenu OSM (Landuse) na płótnie Canvas 2D / 2.5D.
 * Renderuje wielokąty z otworami wewnętrznymi (subpath regułą evenodd) z indywidualnymi stylami per warstwa.
 */

import { CadRenderContext } from '../../../components/cad/types';
import { OsmLanduseFeature, OsmLanduseLayerConfig } from '../store/useOsmLanduseStore';
import { applyMatrixToContext, resolveViewportMatrix } from '../../../utils/math2d';

export interface RenderOsmLanduseOptions {
  rc: CadRenderContext;
  features: OsmLanduseFeature[];
  layers: OsmLanduseLayerConfig[];
  showGroup: boolean;
  projectRadius?: number;
}

/**
 * Konwertuje kolor HEX na RGBA z zadanym alpha
 */
function hexToRgba(hex: string, alpha: number): string {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map((char) => char + char).join('');
  }
  if (c.length === 6) {
    const num = parseInt(c, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
}

export function renderOsmLanduse(options: RenderOsmLanduseOptions): void {
  const { rc, features, layers, showGroup, projectRadius } = options;
  if (!showGroup || features.length === 0) return;

  const layerMap = new Map<string, OsmLanduseLayerConfig>();
  for (const layer of layers) {
    layerMap.set(layer.id, layer);
  }

  const { ctx, viewState, viewRotationDeg } = rc;
  ctx.save();
  const vm = resolveViewportMatrix(rc, viewState, viewRotationDeg);
  applyMatrixToContext(vm, ctx);

  if (projectRadius != null) {
    ctx.beginPath();
    ctx.arc(0, 0, projectRadius, 0, Math.PI * 2);
    ctx.clip();
  }

  // Sortuj cechy wg kolejności warstw (order)
  const sortedFeatures = [...features].sort((a, b) => {
    const orderA = layerMap.get(a.layerId)?.order ?? 99;
    const orderB = layerMap.get(b.layerId)?.order ?? 99;
    return orderA - orderB;
  });

  for (const feature of sortedFeatures) {
    const layer = layerMap.get(feature.layerId);
    if (!layer || !layer.isVisible) continue;

    // 1. Geometria liniowa (drogi, tory, ścieżki, cieki liniowe)
    if (
      (feature.geometryType === 'line' || feature.points) &&
      feature.points &&
      feature.points.length >= 2
    ) {
      const path = new Path2D();
      path.moveTo(feature.points[0].x, feature.points[0].y);
      for (let i = 1; i < feature.points.length; i++) {
        path.lineTo(feature.points[i].x, feature.points[i].y);
      }

      ctx.strokeStyle = hexToRgba(layer.strokeColor || layer.color, layer.opacity);
      ctx.lineWidth = (layer.lineWidth ?? 2) / viewState.scale;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (layer.lineDash && layer.lineDash.length > 0) {
        ctx.setLineDash(layer.lineDash.map((d) => d / viewState.scale));
      } else {
        ctx.setLineDash([]);
      }

      ctx.stroke(path);
      continue;
    }

    // 2. Geometria poligonowa (obszary zagospodarowania, parkingi, lasy, wody)
    if (feature.polygon && feature.polygon.length >= 3) {
      const path = new Path2D();
      path.moveTo(feature.polygon[0].x, feature.polygon[0].y);
      for (let i = 1; i < feature.polygon.length; i++) {
        path.lineTo(feature.polygon[i].x, feature.polygon[i].y);
      }
      path.closePath();

      if (feature.holes && feature.holes.length > 0) {
        for (const hole of feature.holes) {
          if (hole.length < 3) continue;
          path.moveTo(hole[0].x, hole[0].y);
          for (let i = 1; i < hole.length; i++) {
            path.lineTo(hole[i].x, hole[i].y);
          }
          path.closePath();
        }
      }

      ctx.setLineDash([]);
      ctx.lineWidth = 1 / viewState.scale;
      ctx.fillStyle = hexToRgba(layer.color, layer.opacity);
      ctx.strokeStyle = hexToRgba(layer.strokeColor, Math.min(1, layer.opacity + 0.3));
      ctx.fill(path, 'evenodd');
      ctx.stroke(path);
    }
  }

  ctx.restore();
}
