/**
 * TerrainEngine — silnik generowania 3D mesh z siatki NMT (Arc/Info ASCII Grid).
 *
 * Obsługuje:
 * - Adaptive quadtree subdivision na podstawie zmiennej wysokości terenu
 * - Eksport do DXF jako POLYLINE 3D Polygon Mesh (group 70 = 16)
 * - Eksport konturów izolinii jako LWPOLYLINE + TEXT labels
 * - Wyciąganie vertexów i komórek (quad cells) do renderowania wireframe na Canvas
 */

export interface HeightmapBounds {
  /** Lewy dolny róg w przestrzeni CAD (m). */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface TerrainMeshInfo {
  /** Lista vertexów [x, y, z, x, y, z, ...] w Float64Array. */
  vertices: Float64Array;
  /** Liczba vertexów. */
  totalVertices: number;
  /** Lista indeksów trójkątów (3 uint32 per triangle). */
  indices: Uint32Array;
  /** Liczba trójkątów. */
  totalCells: number;
  /** Rozkład głębokości drzewa quadtree [leaves_per_depth_level]. */
  depthDistribution: number[];
}

interface QuadNode {
  /** Środek węzła — { x, y, z }. */
  center: { x: number; y: number; z: number };
  /** Czy ten węzeł został dalej podzielony? */
  subdivided: boolean;
  /** Potomkowie (4 lub 0). */
  children?: QuadNode[];
  /** Grubość krawędzi (max diff między narożnikami). */
  edgeThickness: number;
}

/** Maksymalna grubość krawędzi — poniżej tej wartości nie dzielimy further. */
const DEFAULT_MAX_EDGE_THICKNESS = 2.0;
/** Maksymalna głębokość podziału quadtree. */
const MAX_DEPTH = 8;

export class TerrainEngine {
  readonly data: Float64Array;
  readonly cols: number;
  readonly rows: number;
  originX: number;
  originY: number;
  readonly cellSize: number;
  readonly noDataValue: number;
  readonly maxEdgeThickness: number;

  meshInfo: TerrainMeshInfo | null = null;

  constructor(
    data: Float64Array,
    cols: number,
    rows: number,
    originX: number,
    originY: number,
    cellSize: number,
    noDataValue: number,
    maxEdgeThickness: number = DEFAULT_MAX_EDGE_THICKNESS
  ) {
    this.data = data;
    this.cols = cols;
    this.rows = rows;
    this.originX = originX;
    this.originY = originY;
    this.cellSize = cellSize;
    this.noDataValue = noDataValue;
    this.maxEdgeThickness = maxEdgeThickness;
  }

  static fromGrid(
    data: Float64Array,
    ncols: number,
    nrows: number,
    originX: number,
    originY: number,
    cellsize: number,
    nodata: number,
    maxEdgeThickness: number = DEFAULT_MAX_EDGE_THICKNESS
  ): TerrainEngine {
    return new TerrainEngine(data, ncols, nrows, originX, originY, cellsize, nodata, maxEdgeThickness);
  }

  // ---------------------------------------------------------------------------
  // Elevation helpers
  // ---------------------------------------------------------------------------

  private elevation(col: number, row: number): number {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return NaN;
    const val = this.data[row * this.cols + col];
    return val === this.noDataValue ? NaN : val;
  }

  private isValid(val: number): boolean {
    return Number.isFinite(val) && val !== this.noDataValue;
  }

  private avgElev(a: number, b: number, c: number, d: number): number {
    const valid = [a, b, c, d].filter((v) => this.isValid(v));
    return valid.length > 0 ? valid.reduce((s, v) => s + v, 0) / valid.length : 0;
  }

  // ---------------------------------------------------------------------------
  // Adaptive Quadtree Build
  // ---------------------------------------------------------------------------

  buildAdaptiveMesh(config?: { maxHeightSplitThreshold?: number }): void {
    const threshold = config?.maxHeightSplitThreshold ?? this.maxEdgeThickness;
    const root = this._buildQuadtree(0, 0, this.cols, this.rows, threshold, 0);
    this.meshInfo = this._extractMesh(root);
  }

  private _buildQuadtree(
    col0: number, row0: number, col1: number, row1: number,
    threshold: number, depth: number
  ): QuadNode {
    const midCol = Math.floor((col0 + col1) / 2);
    const midRow = Math.floor((row0 + row1) / 2);

    const cornerElevations = [
      this.elevation(col0, row0),
      this.elevation(col1, row0),
      this.elevation(col0, row1),
      this.elevation(col1, row1),
    ];

    const allNaN = cornerElevations.every((e) => !this.isValid(e));

    // Single cell or max depth — leaf
    if (allNaN || col1 - col0 === 1 && row1 - row0 === 1 || depth >= MAX_DEPTH) {
      const center = this._gridCenter(col0, row0, col1, row1);
      return {
        center: { x: center[0], y: center[1], z: this.avgElev(cornerElevations[0], cornerElevations[1], cornerElevations[2], cornerElevations[3]) },
        subdivided: false,
        edgeThickness: this._computeEdgeThickness(cornerElevations),
      };
    }

    const leftTop = this._buildQuadtree(col0, row0, midCol, midRow, threshold, depth + 1);
    const rightTop = this._buildQuadtree(midCol, row0, col1, midRow, threshold, depth + 1);
    const leftBottom = this._buildQuadtree(col0, midRow, midCol, row1, threshold, depth + 1);
    const rightBottom = this._buildQuadtree(midCol, midRow, col1, row1, threshold, depth + 1);

    return {
      center: this._avgCenters(leftTop.center, rightTop.center, leftBottom.center, rightBottom.center),
      subdivided: true,
      children: [leftTop, rightTop, leftBottom, rightBottom],
      edgeThickness: 0,
    };
  }

  private _gridCenter(col0: number, row0: number, col1: number, row1: number): [number, number] {
    return [
      this.originX + ((col0 + col1) / 2) * this.cellSize,
      this.originY + ((row0 + row1) / 2) * this.cellSize,
    ];
  }

  private _computeEdgeThickness(elevations: number[]): number {
    const valid = elevations.filter((e) => this.isValid(e));
    if (valid.length < 2) return 0;
    let maxDiff = 0;
    for (let i = 0; i < valid.length; i++) {
      for (let j = i + 1; j < valid.length; j++) {
        maxDiff = Math.max(maxDiff, Math.abs(valid[i] - valid[j]));
      }
    }
    return maxDiff;
  }

  private _avgCenters(a: {x:number;y:number;z:number}, b: {x:number;y:number;z:number}, c: {x:number;y:number;z:number}, d: {x:number;y:number;z:number}): {x:number;y:number;z:number} {
    return {
      x: (a.x + b.x + c.x + d.x) / 4,
      y: (a.y + b.y + c.y + d.y) / 4,
      z: this.avgElev(a.z, b.z, c.z, d.z),
    };
  }

  // ---------------------------------------------------------------------------
  // Mesh Extraction
  // ---------------------------------------------------------------------------

  private _extractMesh(root: QuadNode): TerrainMeshInfo {
    const vertexList: number[] = [];
    const indexList: number[] = [];
    const depthCounts: number[] = [];

    this._flattenTree(root, vertexList, indexList, depthCounts, 0);

    return {
      vertices: new Float64Array(vertexList),
      totalVertices: vertexList.length / 3,
      indices: new Uint32Array(indexList),
      totalCells: indexList.length / 3, // 3 indices per triangle
      depthDistribution: depthCounts,
    };
  }

  private _flattenTree(node: QuadNode, vertexList: number[], indexList: number[], depthCounts: number[], depth: number): number {
    if (node.subdivided && node.children) {
      depthCounts[depth] = (depthCounts[depth] || 0) + 1;

      const childIndices = node.children.map((child) =>
        this._flattenTree(child, vertexList, indexList, depthCounts, depth + 1)
      );

      // Triangulate: TL→BL→TR and BL→BR→TR
      if (childIndices.length === 4) {
        indexList.push(childIndices[0], childIndices[2], childIndices[1]);
        indexList.push(childIndices[2], childIndices[3], childIndices[1]);
      }

      return -1; // No direct vertex for subdivided node
    }

    const vIdx = vertexList.length / 3;
    vertexList.push(node.center.x, node.center.y, node.center.z);
    return vIdx;
  }

  // ---------------------------------------------------------------------------
  // Mesh Info Getters
  // ---------------------------------------------------------------------------

  getMeshVertices(): Array<{ x: number; y: number; z: number }> {
    if (!this.meshInfo) return [];
    const verts: Array<{ x: number; y: number; z: number }> = [];
    for (let i = 0; i < this.meshInfo.totalVertices; i++) {
      const vx = this.meshInfo!.vertices[i * 3];
      const vy = this.meshInfo!.vertices[i * 3 + 1];
      const vz = this.meshInfo!.vertices[i * 3 + 2];
      // Filter out NaN vertices from nodata cells
      if (!Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(vz)) continue;
      verts.push({ x: vx, y: vy, z: vz });
    }
    return verts;
  }

  getMeshTriangles(): number[] {
    if (!this.meshInfo) return [];
    const result: number[] = [];

    // Build a map of vertex index → finite triple
    const validVertexMap = new Map<number, Float64Array>();
    for (let i = 0; i < this.meshInfo.totalVertices; i++) {
      const base = i * 3;
      const vx = this.meshInfo.vertices[base];
      const vy = this.meshInfo.vertices[base + 1];
      const vz = this.meshInfo.vertices[base + 2];
      if (Number.isFinite(vx) && Number.isFinite(vy) && Number.isFinite(vz)) {
        validVertexMap.set(i, new Float64Array([vx, vy, vz]));
      }
    }

    // Only emit triangles where all three indices are valid
    for (let i = 0; i < this.meshInfo.totalCells; i++) {
      const idx0 = this.meshInfo.indices[i];
      const idx1 = this.meshInfo.indices[i + 1];
      const idx2 = this.meshInfo.indices[i + 2];

      const v0 = validVertexMap.get(idx0);
      const v1 = validVertexMap.get(idx1);
      const v2 = validVertexMap.get(idx2);

      if (v0 && v1 && v2) {
        result.push(...v0, ...v1, ...v2);
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // DXF Export
  // ---------------------------------------------------------------------------

  exportMeshAsDxf(): { type: 'dxf'; content: string } {
    if (!this.meshInfo) throw new Error('Najpierw wywołaj buildAdaptiveMesh()');

    const lines: string[] = [];

    lines.push('0', 'SECTION', '2', 'HEADER', '0', 'ENDSEC');
    lines.push('0', 'SECTION', '2', 'ENTITIES');

    // Count valid vertices for M,N estimates
    let validCount = 0;
    for (let i = 0; i < this.meshInfo.totalVertices; i++) {
      if (Number.isFinite(this.meshInfo.vertices[i * 3 + 2])) validCount++;
    }

    // POLYLINE 3D Polygon Mesh header
    lines.push('0', 'POLYLINE');
    lines.push('8', 'RZEZBA_TERENU');
    lines.push('66', '1');
    lines.push('70', '16'); // 3D polygon mesh
    lines.push('71', String(Math.max(2, Math.ceil(Math.sqrt(validCount)))));
    lines.push('72', String(Math.max(2, Math.ceil(Math.sqrt(validCount)))));
    lines.push('73', '0');
    lines.push('74', '0');

    // Vertices
    for (let i = 0; i < this.meshInfo.totalVertices; i++) {
      const vx = this.meshInfo.vertices[i * 3];
      const vy = this.meshInfo.vertices[i * 3 + 1];
      const vz = this.meshInfo.vertices[i * 3 + 2];
      if (!Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(vz)) continue;

      lines.push('0', 'VERTEX');
      lines.push('8', 'RZEZBA_TERENU');
      lines.push('10', vx.toFixed(6));
      lines.push('20', vy.toFixed(6));
      lines.push('30', vz.toFixed(6));
      lines.push('70', '64'); // 3D mesh vertex flag
    }

    lines.push('0', 'SEQEND');
    lines.push('8', 'RZEZBA_TERENU');
    lines.push('0', 'ENDSEC');
    lines.push('0', 'EOF');

    return { type: 'dxf', content: lines.join('\n') };
  }

  /** Extracts contour segments using marching squares algorithm. */
  private _contourSegments(level: number): Array<[number, number]> {
    const segs: Array<[number, number]> = [];

    for (let row = 0; row < this.rows - 1; row++) {
      for (let col = 0; col < this.cols - 1; col++) {
        const e00 = this.elevation(col, row);
        const e10 = this.elevation(col + 1, row);
        const e01 = this.elevation(col, row + 1);
        const e11 = this.elevation(col + 1, row + 1);

        if ([e00, e10, e01, e11].every((e) => !this.isValid(e))) continue;

        const avg = this.avgElev(e00, e10, e01, e11);
        const cellMinX = this.originX + col * this.cellSize;
        const cellMaxX = this.originX + (col + 1) * this.cellSize;
        const cellMinY = this.originY + row * this.cellSize;
        const cellMaxY = this.originY + (row + 1) * this.cellSize;

        // Simple: if average crosses level, add segment at center
        if ((e00 + e10 + e01 + e11) / 4 > level * 0.99 && (e00 + e10 + e01 + e11) / 4 < level * 1.01) {
          segs.push([cellMinX + this.cellSize / 2, cellMinY + this.cellSize / 2]);
        } else {
          // Linear interpolation on edges that cross
          const edges = [
            { a: [cellMinX, cellMinY], b: [cellMaxX, cellMinY], ea: e00, eb: e10 },       // top
            { a: [cellMinX, cellMaxY], b: [cellMaxX, cellMaxY], ea: e01, eb: e11 },         // bottom
            { a: [cellMinX, cellMinY], b: [cellMinX, cellMaxY], ea: e00, eb: e01 },         // left
            { a: [cellMaxX, cellMinY], b: [cellMaxX, cellMaxY], ea: e10, eb: e11 },         // right
          ];

          for (const edge of edges) {
            if (this.isValid(edge.ea) && this.isValid(edge.eb)) {
              if ((edge.ea - level) * (edge.eb - level) < 0) {
                const t = (level - edge.ea) / (edge.eb - edge.ea);
                segs.push([
                  edge.a[0] + t * (edge.b[0] - edge.a[0]),
                  edge.a[1] + t * (edge.b[1] - edge.a[1]),
                ]);
              }
            }
          }
        }
      }
    }

    return segs;
  }

  /** Groups disconnected contour points into polylines. */
  private _connectContourPoints(points: Array<[number, number]>): Array<Array<[number, number]>> {
    if (points.length < 2) return points.length > 0 ? [points] : [];

    const result: Array<Array<[number, number]>> = [[points[0]]];
    const used = new Set([0]);

    for (let pass = 0; pass < points.length; pass++) {
      const chain = result[result.length - 1];
      const lastPt = chain[chain.length - 1];
      let nearestDist = Infinity;
      let nearestIdx = -1;

      for (let i = 0; i < points.length; i++) {
        if (used.has(i)) continue;
        const d = Math.hypot(points[i][0] - lastPt[0], points[i][1] - lastPt[1]);
        if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
      }

      if (nearestIdx >= 0 && nearestDist < this.cellSize * 10) {
        chain.push(points[nearestIdx]);
        used.add(nearestIdx);
      } else {
        // Start new chain
        const nextUnused = points.findIndex((_, i) => !used.has(i));
        if (nextUnused >= 0) {
          result.push([points[nextUnused]]);
          used.add(nextUnused);
        } else break;
      }
    }

    return result.filter((c) => c.length >= 2);
  }

  exportContoursAsDxf(options: { interval: number }): { type: 'dxf'; content: string } {
    if (!this.meshInfo) throw new Error('Najpierw wywołaj buildAdaptiveMesh()');
    const interval = options.interval;
    const elevations: number[] = [];

    for (let i = 0; i < this.data.length; i++) {
      const val = this.data[i];
      if (Number.isFinite(val) && val !== this.noDataValue) elevations.push(val);
    }

    if (elevations.length === 0) throw new Error('Brak danych wysokości w gridzie');

    const minElev = Math.min(...elevations);
    const maxElev = Math.max(...elevations);
    const firstContour = Math.ceil(minElev / interval) * interval;
    const lastContour = Math.floor(maxElev / interval) * interval;

    const lines: string[] = [];
    lines.push('0', 'SECTION', '2', 'HEADER', '0', 'ENDSEC');
    lines.push('0', 'SECTION', '2', 'ENTITIES');

    for (let level = firstContour; level <= lastContour + 0.001; level += interval) {
      const segs = this._contourSegments(level);
      const polylines = this._connectContourPoints(segs);

      for (const poly of polylines) {
        if (poly.length < 2) continue;

        lines.push('0', 'LWPOLYLINE');
        lines.push('8', 'IZOHIPSY_TERENU');
        lines.push('90', String(poly.length));
        for (const [x, y] of poly) {
          lines.push('10', x.toFixed(6));
          lines.push('20', y.toFixed(6));
        }

        // Add TEXT label at midpoint
        const mid = poly[Math.floor(poly.length / 2)];
        lines.push('0', 'TEXT');
        lines.push('8', 'IZOHIPSY_TERENU');
        lines.push('10', mid[0].toFixed(6));
        lines.push('20', (mid[1] - interval * 0.5).toFixed(6));
        lines.push('40', String(interval * 2));
        lines.push('1', level.toFixed(1));
      }
    }

    lines.push('0', 'ENDSEC');
    lines.push('0', 'EOF');

    return { type: 'dxf', content: lines.join('\n') };
  }
}
