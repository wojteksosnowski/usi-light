/**
 * TerrainEngine — silnik generowania 3D mesh z siatki NMT (Arc/Info ASCII Grid).
 *
 * Obsługuje:
 * - Przejrzystą, rzadką siatkę trójkątów (Contour-Driven Delaunay TIN z upraszczaniem RDP)
 * - Rzadkie próbkowanie na płaszczyznach (~35-45m) i wyraziste krawędzie na skarpach (~15m)
 * - Eksport do DXF jako 3DFACE (RZEZBA_TERENU) oraz 3D POLYLINE (WARSTWICE_TERENU)
 * - Eksport konturów izolinii jako LWPOLYLINE + TEXT labels
 * - Wyciąganie vertexów, trójkątów i krawędzi wireframe (Float64Array) do renderowania na Canvas 2D
 * - Izolinie (Marching Squares) z wyznaczaniem pętli i poziomów wysokości w kartezjańskim układzie CAD
 */

import { triangulateDelaunay2D, Point2DLike } from '../../utils/math2d/delaunay';

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
  /** Liczba komórek / trójkątów. */
  totalCells: number;
  /** Rozkład głębokości drzewa quadtree [leaves_per_depth_level]. */
  depthDistribution: Record<number, number> | number[];
}

export interface GridAffineTransform {
  /** Wektor kroku kolumny w kierunku osi X (East) w CAD: dx per col */
  ux: number;
  /** Wektor kroku kolumny w kierunku osi Y (North) w CAD: dy per col */
  uy: number;
  /** Wektor kroku wiersza w kierunku osi X (East) w CAD: dx per row */
  vx: number;
  /** Wektor kroku wiersza w kierunku osi Y (North) w CAD: dy per row */
  vy: number;
}

export interface TerrainEngineOptions {
  minCellSizeMeters?: number;
  heightSplitThreshold?: number;
  maxHeightSplitThreshold?: number;
  maxDepth?: number;
  maxEdgeThickness?: number;
  useQuadtree?: boolean;
}

export interface ContourResult {
  elevation: number;
  loops: Array<Array<{ x: number; y: number }>>;
}

/** Domyślny interwał warstwic bazowych dla TIN — 2.5 m. */
const DEFAULT_MAX_EDGE_THICKNESS = 2.5;

export class TerrainEngine {
  readonly data: Float64Array;
  readonly cols: number;
  readonly rows: number;
  originX: number;
  originY: number;
  readonly cellSize: number;
  readonly noDataValue: number;
  readonly maxEdgeThickness: number;
  readonly defaultOptions?: TerrainEngineOptions;
  readonly transform2D?: GridAffineTransform;

  meshInfo: TerrainMeshInfo | null = null;

  constructor(
    data: Float64Array,
    cols: number,
    rows: number,
    originX: number,
    originY: number,
    cellSize: number,
    noDataValue: number,
    optionsOrThickness: number | TerrainEngineOptions = DEFAULT_MAX_EDGE_THICKNESS,
    transform2D?: GridAffineTransform
  ) {
    this.data = data;
    this.cols = cols;
    this.rows = rows;
    this.originX = originX;
    this.originY = originY;
    this.cellSize = cellSize;
    this.noDataValue = noDataValue;
    this.transform2D = transform2D;

    if (typeof optionsOrThickness === 'number') {
      this.maxEdgeThickness = optionsOrThickness;
    } else {
      this.defaultOptions = optionsOrThickness;
      this.maxEdgeThickness = optionsOrThickness.heightSplitThreshold ?? optionsOrThickness.maxHeightSplitThreshold ?? optionsOrThickness.maxEdgeThickness ?? DEFAULT_MAX_EDGE_THICKNESS;
    }
  }

  static fromGrid(
    data: Float64Array,
    ncols: number,
    nrows: number,
    originX: number,
    originY: number,
    cellsize: number,
    nodata: number,
    optionsOrThickness: number | TerrainEngineOptions = DEFAULT_MAX_EDGE_THICKNESS,
    transform2D?: GridAffineTransform
  ): TerrainEngine {
    return new TerrainEngine(data, ncols, nrows, originX, originY, cellsize, nodata, optionsOrThickness, transform2D);
  }

  /**
   * Zwraca współrzędne 2D wierzchołka siatki (c, r) w przestrzeni CAD.
   */
  gridPoint(c: number, r: number): { x: number; y: number } {
    if (this.transform2D) {
      return {
        x: this.originX + c * this.transform2D.ux + r * this.transform2D.vx,
        y: this.originY + c * this.transform2D.uy + r * this.transform2D.vy,
      };
    }
    return {
      x: this.originX + c * this.cellSize,
      y: this.originY + r * this.cellSize,
    };
  }

  get bounds(): HeightmapBounds {
    if (this.transform2D) {
      const p00 = this.gridPoint(0, 0);
      const p10 = this.gridPoint(this.cols, 0);
      const p01 = this.gridPoint(0, this.rows);
      const p11 = this.gridPoint(this.cols, this.rows);
      return {
        minX: Math.min(p00.x, p10.x, p01.x, p11.x),
        minY: Math.min(p00.y, p10.y, p01.y, p11.y),
        maxX: Math.max(p00.x, p10.x, p01.x, p11.x),
        maxY: Math.max(p00.y, p10.y, p01.y, p11.y),
      };
    }
    return {
      minX: this.originX,
      minY: this.originY,
      maxX: this.originX + this.cols * this.cellSize,
      maxY: this.originY + this.rows * this.cellSize,
    };
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

  /**
   * Zwraca interpolowaną wysokość Z w zadanym punkcie CAD (x, y).
   */
  sampleElevationAtCad(x: number, y: number): number {
    let c: number;
    let r: number;

    if (this.transform2D) {
      const dx = x - this.originX;
      const dy = y - this.originY;
      const det = this.transform2D.ux * this.transform2D.vy - this.transform2D.uy * this.transform2D.vx;
      if (Math.abs(det) < 1e-9) return NaN;

      c = (dx * this.transform2D.vy - dy * this.transform2D.vx) / det;
      r = (-dx * this.transform2D.uy + dy * this.transform2D.ux) / det;
    } else {
      c = (x - this.originX) / this.cellSize;
      r = (y - this.originY) / this.cellSize;
    }

    if (c < 0 || c > this.cols - 1 || r < 0 || r > this.rows - 1) return NaN;

    const c0 = Math.floor(c);
    const c1 = Math.min(c0 + 1, this.cols - 1);
    const r0 = Math.floor(r);
    const r1 = Math.min(r0 + 1, this.rows - 1);

    const u = c - c0;
    const v = r - r0;

    const z00 = this.elevation(c0, r0);
    const z10 = this.elevation(c1, r0);
    const z01 = this.elevation(c0, r1);
    const z11 = this.elevation(c1, r1);

    if (!this.isValid(z00) || !this.isValid(z10) || !this.isValid(z01) || !this.isValid(z11)) {
      const valid = [z00, z10, z01, z11].filter((val) => this.isValid(val));
      return valid.length > 0 ? valid.reduce((s, val) => s + val, 0) / valid.length : NaN;
    }

    return (1 - u) * (1 - v) * z00 + u * (1 - v) * z10 + (1 - u) * v * z01 + u * v * z11;
  }

  // ---------------------------------------------------------------------------
  // Contour-Driven Delaunay TIN & Adaptive Mesh Generation
  // ---------------------------------------------------------------------------

  buildAdaptiveMesh(config?: TerrainEngineOptions): void {
    this.buildTinMesh(config);
  }

  /**
   * Generuje rzadki, przejrzysty model TIN (Triangulated Irregular Network) oparty na warstwicach i triangulacji Delaunaya.
   */
  buildTinMesh(config?: TerrainEngineOptions): void {
    const opts = { ...this.defaultOptions, ...config };
    const interval = Math.max(1.0, opts.heightSplitThreshold ?? 2.5);
    const sampleSpacing = Math.max(8.0, opts.minCellSizeMeters ?? 16.0);
    const anchorSpacing = Math.max(25.0, sampleSpacing * 2.5);

    const pointsList: Array<{ x: number; y: number; z: number }> = [];
    const pointSpatialSet = new Set<string>();

    const addPoint = (x: number, y: number, z: number) => {
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
      const key = `${Math.round(x / 2)},${Math.round(y / 2)}`; // snap 2.0m
      if (pointSpatialSet.has(key)) return;
      pointSpatialSet.add(key);
      pointsList.push({ x, y, z });
    };

    // 1. Próbkowanie wzdłuż wygenerowanych warstwic z upraszczaniem RDP
    const contours = this.generateContours({ interval, minLength: 6 });

    for (const contour of contours) {
      const z = contour.elevation;
      for (const loop of contour.loops) {
        if (loop.length < 2) continue;

        const simplified = simplifyRdp(loop, 1.0);

        addPoint(simplified[0].x, simplified[0].y, z);
        let prev = simplified[0];

        for (let i = 1; i < simplified.length - 1; i++) {
          const pt = simplified[i];
          const dist = Math.hypot(pt.x - prev.x, pt.y - prev.y);
          if (dist >= sampleSpacing) {
            addPoint(pt.x, pt.y, z);
            prev = pt;
          }
        }

        const last = simplified[simplified.length - 1];
        addPoint(last.x, last.y, z);
      }
    }

    // 2. Dodanie punktów brzegowych BBOX i siatki bazowej (Anchor Points)
    const stepC = Math.max(1, Math.round(anchorSpacing / this.cellSize));
    const stepR = Math.max(1, Math.round(anchorSpacing / this.cellSize));

    for (let r = 0; r < this.rows; r += stepR) {
      for (let c = 0; c < this.cols; c += stepC) {
        const pt = this.gridPoint(c, r);
        const z = this.elevation(c, r);
        if (this.isValid(z)) {
          addPoint(pt.x, pt.y, z);
        }
      }
      const ptLast = this.gridPoint(this.cols - 1, r);
      const zLast = this.elevation(this.cols - 1, r);
      if (this.isValid(zLast)) addPoint(ptLast.x, ptLast.y, zLast);
    }

    for (let c = 0; c < this.cols; c += stepC) {
      const pt = this.gridPoint(c, this.rows - 1);
      const z = this.elevation(c, this.rows - 1);
      if (this.isValid(z)) addPoint(pt.x, pt.y, z);
    }
    const ptNE = this.gridPoint(this.cols - 1, this.rows - 1);
    const zNE = this.elevation(this.cols - 1, this.rows - 1);
    if (this.isValid(zNE)) addPoint(ptNE.x, ptNE.y, zNE);

    // 3. Fallback dla małych siatek / małej liczby punktów
    if (pointsList.length < 3 && this.cols > 0 && this.rows > 0) {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const z = this.elevation(c, r);
          if (this.isValid(z)) {
            const pt = this.gridPoint(c, r);
            addPoint(pt.x, pt.y, z);
          }
        }
      }
    }

    // 4. Triangulacja Delaunaya 2D
    const indices = triangulateDelaunay2D(pointsList);

    // 5. Zapisanie struktury w Float64Array
    const vertexList: number[] = [];
    for (const p of pointsList) {
      vertexList.push(p.x, p.y, p.z);
    }

    this.meshInfo = {
      vertices: new Float64Array(vertexList),
      totalVertices: pointsList.length,
      indices,
      totalCells: indices.length / 3,
      depthDistribution: { 0: indices.length / 3 },
    };
  }

  // ---------------------------------------------------------------------------
  // Mesh Info Getters
  // ---------------------------------------------------------------------------

  getMeshVertices(): Array<{ x: number; y: number; z: number }> {
    if (!this.meshInfo) return [];
    const verts: Array<{ x: number; y: number; z: number }> = [];
    for (let i = 0; i < this.meshInfo.totalVertices; i++) {
      const vx = this.meshInfo.vertices[i * 3];
      const vy = this.meshInfo.vertices[i * 3 + 1];
      const vz = this.meshInfo.vertices[i * 3 + 2];
      if (!Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(vz)) continue;
      verts.push({ x: vx, y: vy, z: vz });
    }
    return verts;
  }

  getMeshTriangles(): number[] {
    if (!this.meshInfo) return [];
    const result: number[] = [];
    const verts = this.meshInfo.vertices;
    const indices = this.meshInfo.indices;

    for (let i = 0; i < indices.length; i += 3) {
      const idx0 = indices[i] * 3;
      const idx1 = indices[i + 1] * 3;
      const idx2 = indices[i + 2] * 3;

      const v0x = verts[idx0], v0y = verts[idx0 + 1], v0z = verts[idx0 + 2];
      const v1x = verts[idx1], v1y = verts[idx1 + 1], v1z = verts[idx1 + 2];
      const v2x = verts[idx2], v2y = verts[idx2 + 1], v2z = verts[idx2 + 2];

      if (
        Number.isFinite(v0x) && Number.isFinite(v0y) && Number.isFinite(v0z) &&
        Number.isFinite(v1x) && Number.isFinite(v1y) && Number.isFinite(v1z) &&
        Number.isFinite(v2x) && Number.isFinite(v2y) && Number.isFinite(v2z)
      ) {
        result.push(v0x, v0y, v0z, v1x, v1y, v1z, v2x, v2y, v2z);
      }
    }

    return result;
  }

  /**
   * Zwraca unikalne krawędzie siatki do szybkiego renderowania wireframe w Canvas 2D: [x0, y0, x1, y1, ...]
   */
  getWireframeEdges(): Float64Array {
    if (!this.meshInfo || this.meshInfo.indices.length === 0) return new Float64Array(0);

    const edges: number[] = [];
    const edgeSet = new Set<string>();
    const indices = this.meshInfo.indices;
    const verts = this.meshInfo.vertices;

    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i];
      const i1 = indices[i + 1];
      const i2 = indices[i + 2];

      const tri = [
        [i0, i1],
        [i1, i2],
        [i2, i0],
      ];

      for (const [a, b] of tri) {
        const minIdx = a < b ? a : b;
        const maxIdx = a < b ? b : a;
        const key = `${minIdx}_${maxIdx}`;
        if (edgeSet.has(key)) continue;
        edgeSet.add(key);

        edges.push(
          verts[a * 3], verts[a * 3 + 1],
          verts[b * 3], verts[b * 3 + 1]
        );
      }
    }

    return new Float64Array(edges);
  }

  // ---------------------------------------------------------------------------
  // Contours (Marching Squares)
  // ---------------------------------------------------------------------------

  generateContours(options: { interval: number; minLength?: number }): ContourResult[] {
    const interval = options.interval;
    const minLength = options.minLength ?? 0;

    let minElev = Infinity;
    let maxElev = -Infinity;

    for (let i = 0; i < this.data.length; i++) {
      const val = this.data[i];
      if (this.isValid(val)) {
        if (val < minElev) minElev = val;
        if (val > maxElev) maxElev = val;
      }
    }

    if (!Number.isFinite(minElev) || !Number.isFinite(maxElev) || minElev === maxElev) {
      return [];
    }

    const firstContour = Math.ceil(minElev / interval) * interval;
    const lastContour = Math.floor(maxElev / interval) * interval;
    const results: ContourResult[] = [];

    for (let level = firstContour; level <= lastContour + 0.0001; level += interval) {
      const roundedLevel = Math.round(level / interval) * interval;
      const segments: Array<[{ x: number; y: number }, { x: number; y: number }]> = [];

      for (let r = 0; r < this.rows - 1; r++) {
        for (let c = 0; c < this.cols - 1; c++) {
          const z00 = this.elevation(c, r);       // BL
          const z10 = this.elevation(c + 1, r);   // BR
          const z01 = this.elevation(c, r + 1);   // TL
          const z11 = this.elevation(c + 1, r + 1); // TR

          if (!this.isValid(z00) || !this.isValid(z10) || !this.isValid(z01) || !this.isValid(z11)) {
            continue;
          }

          const p00 = this.gridPoint(c, r);       // BL
          const p10 = this.gridPoint(c + 1, r);   // BR
          const p01 = this.gridPoint(c, r + 1);   // TL
          const p11 = this.gridPoint(c + 1, r + 1); // TR

          // Interpolacja liniowa na 4 krawędziach komórki
          // Bottom: BL (p00) -> BR (p10)
          const tBottom = (roundedLevel - z00) / (z10 - z00 || 1e-6);
          const bottomPt = {
            x: p00.x + tBottom * (p10.x - p00.x),
            y: p00.y + tBottom * (p10.y - p00.y),
          };

          // Right: BR (p10) -> TR (p11)
          const tRight = (roundedLevel - z10) / (z11 - z10 || 1e-6);
          const rightPt = {
            x: p10.x + tRight * (p11.x - p10.x),
            y: p10.y + tRight * (p11.y - p10.y),
          };

          // Top: TL (p01) -> TR (p11)
          const tTop = (roundedLevel - z01) / (z11 - z01 || 1e-6);
          const topPt = {
            x: p01.x + tTop * (p11.x - p01.x),
            y: p01.y + tTop * (p11.y - p01.y),
          };

          // Left: BL (p00) -> TL (p01)
          const tLeft = (roundedLevel - z00) / (z01 - z00 || 1e-6);
          const leftPt = {
            x: p00.x + tLeft * (p01.x - p00.x),
            y: p00.y + tLeft * (p01.y - p00.y),
          };

          // Klasyfikacja narożników: bit 0 = BL, bit 1 = BR, bit 2 = TR, bit 3 = TL
          let caseIdx = 0;
          if (z00 >= roundedLevel) caseIdx |= 1;
          if (z10 >= roundedLevel) caseIdx |= 2;
          if (z11 >= roundedLevel) caseIdx |= 4;
          if (z01 >= roundedLevel) caseIdx |= 8;

          if (caseIdx === 0 || caseIdx === 15) continue;

          switch (caseIdx) {
            case 1:
            case 14:
              segments.push([leftPt, bottomPt]);
              break;
            case 2:
            case 13:
              segments.push([bottomPt, rightPt]);
              break;
            case 3:
            case 12:
              segments.push([leftPt, rightPt]);
              break;
            case 4:
            case 11:
              segments.push([rightPt, topPt]);
              break;
            case 5: {
              const centerVal = (z00 + z10 + z11 + z01) / 4;
              if (centerVal >= roundedLevel) {
                segments.push([leftPt, topPt]);
                segments.push([bottomPt, rightPt]);
              } else {
                segments.push([leftPt, bottomPt]);
                segments.push([topPt, rightPt]);
              }
              break;
            }
            case 6:
            case 9:
              segments.push([bottomPt, topPt]);
              break;
            case 7:
            case 8:
              segments.push([topPt, leftPt]);
              break;
            case 10: {
              const centerVal = (z00 + z10 + z11 + z01) / 4;
              if (centerVal >= roundedLevel) {
                segments.push([topPt, rightPt]);
                segments.push([leftPt, bottomPt]);
              } else {
                segments.push([leftPt, topPt]);
                segments.push([bottomPt, rightPt]);
              }
              break;
            }
          }
        }
      }

      const connectedLoops = this._stitchSegments(segments, minLength);
      if (connectedLoops.length > 0) {
        results.push({
          elevation: roundedLevel,
          loops: connectedLoops,
        });
      }
    }

    return results;
  }

  private _stitchSegments(
    segments: Array<[{ x: number; y: number }, { x: number; y: number }]>,
    minLength: number
  ): Array<Array<{ x: number; y: number }>> {
    if (segments.length === 0) return [];

    const tolerance = 1e-4;
    const epsEq = (p1: { x: number; y: number }, p2: { x: number; y: number }) =>
      Math.hypot(p1.x - p2.x, p1.y - p2.y) < tolerance;

    const chains: Array<Array<{ x: number; y: number }>> = [];
    const used = new Uint8Array(segments.length);

    for (let i = 0; i < segments.length; i++) {
      if (used[i]) continue;
      used[i] = 1;

      const chain = [segments[i][0], segments[i][1]];
      let extended = true;

      while (extended) {
        extended = false;
        const tail = chain[chain.length - 1];
        const head = chain[0];

        for (let j = 0; j < segments.length; j++) {
          if (used[j]) continue;
          const [s0, s1] = segments[j];

          if (epsEq(tail, s0)) {
            chain.push(s1);
            used[j] = 1;
            extended = true;
            break;
          } else if (epsEq(tail, s1)) {
            chain.push(s0);
            used[j] = 1;
            extended = true;
            break;
          } else if (epsEq(head, s1)) {
            chain.unshift(s0);
            used[j] = 1;
            extended = true;
            break;
          } else if (epsEq(head, s0)) {
            chain.unshift(s1);
            used[j] = 1;
            extended = true;
            break;
          }
        }
      }

      if (chain.length >= 2) {
        if (minLength > 0) {
          let totalLen = 0;
          for (let k = 1; k < chain.length; k++) {
            totalLen += Math.hypot(chain[k].x - chain[k - 1].x, chain[k].y - chain[k - 1].y);
          }
          if (totalLen >= minLength || chain.length >= minLength) {
            chains.push(chain);
          }
        } else {
          chains.push(chain);
        }
      }
    }

    return chains;
  }

  // ---------------------------------------------------------------------------
  // DXF Export
  // ---------------------------------------------------------------------------

  exportMeshAsDxf(): { type: 'dxf'; content: string } {
    if (!this.meshInfo) throw new Error('Najpierw wywołaj buildAdaptiveMesh()');

    const lines: string[] = [];
    lines.push('0', 'SECTION', '2', 'HEADER', '0', 'ENDSEC');
    lines.push('0', 'SECTION', '2', 'ENTITIES');

    let validCount = 0;
    for (let i = 0; i < this.meshInfo.totalVertices; i++) {
      if (Number.isFinite(this.meshInfo.vertices[i * 3 + 2])) validCount++;
    }

    lines.push('0', 'POLYLINE');
    lines.push('8', 'RZEZBA_TERENU');
    lines.push('66', '1');
    lines.push('70', '16'); // 3D polygon mesh
    lines.push('71', String(Math.max(2, Math.ceil(Math.sqrt(validCount)))));
    lines.push('72', String(Math.max(2, Math.ceil(Math.sqrt(validCount)))));
    lines.push('73', '0');
    lines.push('74', '0');

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
      lines.push('70', '64');
    }

    lines.push('0', 'SEQEND');
    lines.push('8', 'RZEZBA_TERENU');
    lines.push('0', 'ENDSEC');
    lines.push('0', 'EOF');

    return { type: 'dxf', content: lines.join('\n') };
  }

  exportContoursAsDxf(options: { interval: number }): { type: 'dxf'; content: string } {
    if (!this.meshInfo) throw new Error('Najpierw wywołaj buildAdaptiveMesh()');
    const contours = this.generateContours(options);

    const lines: string[] = [];
    lines.push('0', 'SECTION', '2', 'HEADER', '0', 'ENDSEC');
    lines.push('0', 'SECTION', '2', 'ENTITIES');

    for (const contour of contours) {
      for (const poly of contour.loops) {
        if (poly.length < 2) continue;

        lines.push('0', 'LWPOLYLINE');
        lines.push('8', 'IZOHIPSY_TERENU');
        lines.push('90', String(poly.length));
        for (const pt of poly) {
          lines.push('10', pt.x.toFixed(6));
          lines.push('20', pt.y.toFixed(6));
        }

        const mid = poly[Math.floor(poly.length / 2)];
        lines.push('0', 'TEXT');
        lines.push('8', 'IZOHIPSY_TERENU');
        lines.push('10', mid.x.toFixed(6));
        lines.push('20', (mid.y - options.interval * 0.5).toFixed(6));
        lines.push('40', String(options.interval * 2));
        lines.push('1', contour.elevation.toFixed(1));
      }
    }

    lines.push('0', 'ENDSEC');
    lines.push('0', 'EOF');

    return { type: 'dxf', content: lines.join('\n') };
  }
}

// ---------------------------------------------------------------------------
// Ramer-Douglas-Peucker Polyline Simplification
// ---------------------------------------------------------------------------

function simplifyRdp(points: Array<{ x: number; y: number }>, epsilon: number): Array<{ x: number; y: number }> {
  if (points.length <= 2) return points;

  let dmax = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  if (dmax > epsilon) {
    const rec1 = simplifyRdp(points.slice(0, index + 1), epsilon);
    const rec2 = simplifyRdp(points.slice(index), epsilon);
    return rec1.slice(0, rec1.length - 1).concat(rec2);
  } else {
    return [points[0], points[end]];
  }
}

function perpendicularDistance(
  p: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number }
): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return Math.hypot(p.x - p1.x, p.y - p1.y);
  return Math.abs(dy * p.x - dx * p.y + p2.x * p1.y - p2.y * p1.x) / len;
}
