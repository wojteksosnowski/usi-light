import { BuildingLoop, Point2D } from '../../types/geometry';
import { isPointInPolygon } from '../../utils/math2d/polygons';
import { isBuildingVariantActive } from '../../utils/geometrySelectors';

export interface HeightmapBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface HeightmapConfig {
  resolution?: number; // Metry na komórkę rastra (domyślnie 0.5m)
  margin?: number; // Margines wokół sceny w metrach (domyślnie 20m)
}

/**
 * HeightmapShadowEngine - Dyskretny silnik matrycowy wysokości i cieniowania.
 * Umożliwia błyskawiczny test przesłaniania/nasłonecznienia w czasie O(steps) zamiast
 * kosztownego badania przecięć wielokąt-wielokąt O(N * M).
 */
export class HeightmapShadowEngine {
  readonly resolution: number;
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly bounds: HeightmapBounds;
  readonly heightGrid: Float32Array;

  constructor(buildings: BuildingLoop[], config: HeightmapConfig = {}) {
    this.resolution = config.resolution ?? 0.5;
    const margin = config.margin ?? 20.0;

    // 1. Obliczenie granic sceny
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const bldg of buildings) {
      if (!bldg || !Array.isArray(bldg.vertices) || bldg.vertices.length < 3) continue;
      if (!isBuildingVariantActive(bldg)) continue;
      for (const v of bldg.vertices) {
        if (v.x < minX) minX = v.x;
        if (v.x > maxX) maxX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.y > maxY) maxY = v.y;
      }
    }

    if (!Number.isFinite(minX)) {
      minX = -100;
      maxX = 100;
      minY = -100;
      maxY = 100;
    }

    minX -= margin;
    maxX += margin;
    minY -= margin;
    maxY += margin;

    this.bounds = { minX, minY, maxX, maxY };
    this.gridWidth = Math.max(1, Math.ceil((maxX - minX) / this.resolution));
    this.gridHeight = Math.max(1, Math.ceil((maxY - minY) / this.resolution));

    this.heightGrid = new Float32Array(this.gridWidth * this.gridHeight);

    // 2. Rasteryzacja budynków do matrycy wysokości
    this.rasterizeBuildings(buildings);
  }

  private worldToGrid(x: number, y: number): { gx: number; gy: number } {
    return {
      gx: Math.floor((x - this.bounds.minX) / this.resolution),
      gy: Math.floor((y - this.bounds.minY) / this.resolution),
    };
  }

  private gridToWorld(gx: number, gy: number): { x: number; y: number } {
    return {
      x: this.bounds.minX + (gx + 0.5) * this.resolution,
      y: this.bounds.minY + (gy + 0.5) * this.resolution,
    };
  }

  private rasterizeBuildings(buildings: BuildingLoop[]): void {
    for (const bldg of buildings) {
      if (!bldg || !Array.isArray(bldg.vertices) || bldg.vertices.length < 3) continue;
      if (bldg.isIncluded === false) continue;
      if (!isBuildingVariantActive(bldg)) continue;

      const topHeight = (bldg.elevation || 0) + (bldg.defaultHeight || 0);
      if (topHeight <= 0) continue;

      // AABB budynku w komórkach siatki
      let bMinX = Infinity;
      let bMinY = Infinity;
      let bMaxX = -Infinity;
      let bMaxY = -Infinity;

      for (const v of bldg.vertices) {
        if (v.x < bMinX) bMinX = v.x;
        if (v.x > bMaxX) bMaxX = v.x;
        if (v.y < bMinY) bMinY = v.y;
        if (v.y > bMaxY) bMaxY = v.y;
      }

      const { gx: startGx, gy: startGy } = this.worldToGrid(bMinX, bMinY);
      const { gx: endGx, gy: endGy } = this.worldToGrid(bMaxX, bMaxY);

      const minGx = Math.max(0, startGx);
      const maxGx = Math.min(this.gridWidth - 1, endGx);
      const minGy = Math.max(0, startGy);
      const maxGy = Math.min(this.gridHeight - 1, endGy);

      for (let gy = minGy; gy <= maxGy; gy++) {
        for (let gx = minGx; gx <= maxGx; gx++) {
          const pt = this.gridToWorld(gx, gy);
          if (isPointInPolygon(pt, bldg.vertices)) {
            // Sprawdź czy nie jest w otworze (hole)
            let inHole = false;
            if (bldg.holes) {
              for (const hole of bldg.holes) {
                if (isPointInPolygon(pt, hole)) {
                  inHole = true;
                  break;
                }
              }
            }

            if (!inHole) {
              const idx = gy * this.gridWidth + gx;
              if (topHeight > this.heightGrid[idx]) {
                this.heightGrid[idx] = topHeight;
              }
            }
          }
        }
      }
    }
  }

  /**
   * Sprawdza czy dany punkt (x, y, z) jest zacieniony przy danym kącie słońca.
   * Promień marchingu biegnie w stronę słońca (od punktu testowego).
   *
   * @param x Współrzędna X punktu w metrach
   * @param y Współrzędna Y punktu w metrach
   * @param z Rzędna wysokości punktu w metrach
   * @param sunAzimuthDeg Azymut słońca w stopniach (0=N, 90=E, 180=S, 270=W)
   * @param sunElevationDeg Kąt elewacji słońca w stopniach
   * @param maxDistance Maksymalny zasięg promienia w metrach (np. 150m)
   * @returns true jeśli punkt jest w cieniu przeszkody, false jeśli jest nasłoneczniony
   */
  public isPointInShadow(
    x: number,
    y: number,
    z: number,
    sunAzimuthDeg: number,
    sunElevationDeg: number,
    maxDistance: number = 200.0
  ): boolean {
    if (sunElevationDeg <= 0.5) return true; // Słońce pod horyzontem

    const azRad = (sunAzimuthDeg * Math.PI) / 180;
    const elevRad = (sunElevationDeg * Math.PI) / 180;
    const tanElev = Math.tan(elevRad);

    // Wektor w stronę słońca w płaszczyźnie poziomej (+Y = North, +X = East)
    const dirX = Math.sin(azRad);
    const dirY = Math.cos(azRad);

    const stepSize = this.resolution;
    const numSteps = Math.ceil(maxDistance / stepSize);

    // Start odrobinę przed badanym punktem, aby uniknąć samo-przesłaniania
    let curX = x + dirX * stepSize * 0.5;
    let curY = y + dirY * stepSize * 0.5;
    let dist = stepSize * 0.5;

    for (let step = 0; step < numSteps; step++) {
      const { gx, gy } = this.worldToGrid(curX, curY);

      // Jeśli promień wyszedł poza granice sceny, brak cienia
      if (gx < 0 || gx >= this.gridWidth || gy < 0 || gy >= this.gridHeight) {
        return false;
      }

      const idx = gy * this.gridWidth + gx;
      const obstacleHeight = this.heightGrid[idx];

      if (obstacleHeight > 0) {
        const rayHeightAtDist = z + dist * tanElev;
        if (obstacleHeight > rayHeightAtDist) {
          return true; // Przeszkoda przecina promień słońca
        }
      }

      curX += dirX * stepSize;
      curY += dirY * stepSize;
      dist += stepSize;
    }

    return false;
  }

  /**
   * Zwraca rzędną wysokości z matrycy w danym punkcie świata O(1).
   */
  public getHeightAt(x: number, y: number): number {
    const { gx, gy } = this.worldToGrid(x, y);
    if (gx < 0 || gx >= this.gridWidth || gy < 0 || gy >= this.gridHeight) {
      return 0;
    }
    return this.heightGrid[gy * this.gridWidth + gx];
  }
}
