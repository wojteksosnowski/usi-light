/**
 * TerrainMeshRenderLayer — warstwa CAD render pipeline do rysowania 3D mesh terenu.
 * Renderuje wireframe trójkątów pobranych z store'u (terrainMesh).
 */

import { CadRenderLayer, CadRenderFrameContext } from '../../../components/cad/pipeline/types';
import { renderTerrainMesh } from '../../../engine/terrain/TerrainCanvasRenderer';
import { useWfsStore } from '../store/useWfsStore';

export class TerrainMeshRenderLayer implements CadRenderLayer {
  readonly id = 'wfs_terrain_mesh';
  readonly zIndex = 3; // Po cieniowaniu NMT i przed drzewami

  visible: boolean = false;
  triangles: Float64Array = new Float64Array(0);
  opacity: number = 0.3;

  setData(data: { triangles: Float64Array }): void {
    this.triangles = data.triangles;
  }

  setVisibility(visible: boolean): void {
    this.visible = visible;
  }

  setOpacity(opacity: number): void {
    this.opacity = opacity;
  }

  shouldRender(context: CadRenderFrameContext): boolean {
    return Boolean(this.visible && this.triangles.length > 0 && context.renderContext);
  }

  render(context: CadRenderFrameContext): void {
    if (!this.visible || this.triangles.length === 0 || !context.renderContext) return;

    const rc = context.renderContext;
    const ctx = rc.ctx;

    renderTerrainMesh(ctx, Array.from(this.triangles), {
      rc,
      opacity: this.opacity,
      lineWidth: 1,
      shaded: true,
    });
  }
}
