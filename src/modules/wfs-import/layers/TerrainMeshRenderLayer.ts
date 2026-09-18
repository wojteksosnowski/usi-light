/**
 * TerrainMeshRenderLayer — warstwa CAD render pipeline do rysowania 3D mesh terenu oraz izohips (warstwic).
 */

import { CadRenderLayer, CadRenderFrameContext } from '../../../components/cad/pipeline/types';
import { renderTerrainMesh, renderTerrainContours } from '../../../engine/terrain/TerrainCanvasRenderer';
import type { TerrainContourData } from '../store/useWfsStore';

export interface TerrainRenderLayerData {
  triangles: Float64Array;
  wireframeEdges?: Float64Array;
  contours?: TerrainContourData[];
  showMesh?: boolean;
  meshOpacity?: number;
  showContours?: boolean;
  contoursOpacity?: number;
}

export class TerrainMeshRenderLayer implements CadRenderLayer {
  readonly id = 'wfs_terrain_mesh';
  readonly zIndex = 3; // Po cieniowaniu NMT i przed drzewami / budynkami

  triangles: Float64Array = new Float64Array(0);
  wireframeEdges: Float64Array = new Float64Array(0);
  contours: TerrainContourData[] = [];
  showMesh: boolean = false;
  meshOpacity: number = 0.35;
  showContours: boolean = true;
  contoursOpacity: number = 0.65;

  setData(data: TerrainRenderLayerData): void {
    this.triangles = data.triangles;
    this.wireframeEdges = data.wireframeEdges || new Float64Array(0);
    this.contours = data.contours || [];
    if (data.showMesh !== undefined) this.showMesh = data.showMesh;
    if (data.meshOpacity !== undefined) this.meshOpacity = data.meshOpacity;
    if (data.showContours !== undefined) this.showContours = data.showContours;
    if (data.contoursOpacity !== undefined) this.contoursOpacity = data.contoursOpacity;
  }

  shouldRender(context: CadRenderFrameContext): boolean {
    const hasData = this.triangles.length > 0 || this.wireframeEdges.length > 0 || this.contours.length > 0;
    const isAnyVisible = this.showMesh || this.showContours;
    return Boolean(hasData && isAnyVisible && context.renderContext);
  }

  render(context: CadRenderFrameContext): void {
    if (!context.renderContext) return;
    const rc = context.renderContext;
    const ctx = rc.ctx;

    // 1. Renderowanie siatki 3D Wireframe (jeśli włączona)
    if (this.showMesh && (this.triangles.length >= 9 || this.wireframeEdges.length >= 4)) {
      renderTerrainMesh(ctx, this.triangles, {
        rc,
        opacity: this.meshOpacity,
        lineWidth: 1,
        shaded: true,
        wireframeEdges: this.wireframeEdges,
      });
    }

    // 2. Renderowanie warstwic / izohips (jeśli włączone)
    if (this.showContours && this.contours.length > 0) {
      renderTerrainContours(ctx, this.contours, {
        rc,
        opacity: this.contoursOpacity,
        showLabels: true,
      });
    }
  }
}
