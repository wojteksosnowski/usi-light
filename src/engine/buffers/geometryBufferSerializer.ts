import { BuildingLoop, FacadeSegment, Point2D } from '../../types/geometry';

/**
 * Płaska struktura bufora pamięci dla obiektów i przeszkód geometrycznych.
 *
 * Układ danych bufora binarnego (Float32Array):
 * [0]: Liczba budynków (numBuildings)
 * [1]: Liczba wszystkich segmentów fasad (totalSegments)
 * [2]: Liczba wierzchołków wielokątów (totalVertices)
 * [3..7]: Zarezerwowane na flagi / wersję formatu
 *
 * Rekord Budynku (nagłówek 8 floatów):
 * [0]: idNumeric (hash lub indeks)
 * [1]: category (0 = building, 1 = boundary, 2 = balcony)
 * [2]: isTested (1.0 = true, 0.0 = false)
 * [3]: isIncluded (1.0 = true, 0.0 = false)
 * [4]: elevation (hBase)
 * [5]: defaultHeight (hTop)
 * [6]: numVertices
 * [7]: numHoles
 *
 * Następnie wierzchołki: [x0, y0, x1, y1, ...]
 */

export interface FlatObstacleSegment {
  p1x: number;
  p1y: number;
  p2x: number;
  p2y: number;
  normalX: number;
  normalY: number;
  hBase: number;
  hTop: number;
  isTested: boolean;
  bldgIndex: number;
}

export interface FlatSerializedGeometry {
  buffer: ArrayBuffer;
  numBuildings: number;
  numSegments: number;
  numVertices: number;
}

export function serializeGeometryToFlatBuffer(buildings: BuildingLoop[]): FlatSerializedGeometry {
  // 1. Zliczenie rozmiaru bufora
  let totalVertices = 0;
  let totalSegments = 0;
  let numBuildings = 0;

  for (const bldg of buildings) {
    if (!bldg || !Array.isArray(bldg.vertices) || bldg.vertices.length < 3) continue;
    numBuildings++;
    totalVertices += bldg.vertices.length;
    if (bldg.holes) {
      for (const h of bldg.holes) {
        totalVertices += h.length;
      }
    }
    if (bldg.segments) {
      totalSegments += bldg.segments.length;
    }
  }

  // Obliczenie rozmiaru w floatach:
  // Nagłówek główny: 8 floatów
  // Na budynek: 8 floatów nagłówka + totalVertices * 2
  // Na segment: 8 floatów [p1x, p1y, p2x, p2y, nx, ny, hBase, hTop]
  const totalFloats = 8 + numBuildings * 8 + totalVertices * 2 + totalSegments * 8;
  const floatArray = new Float32Array(totalFloats);

  floatArray[0] = numBuildings;
  floatArray[1] = totalSegments;
  floatArray[2] = totalVertices;
  floatArray[3] = 1.0; // Version 1.0

  let offset = 8;

  // 2. Serializacja budynków i wierzchołków
  let bldgIdx = 0;
  for (const bldg of buildings) {
    if (!bldg || !Array.isArray(bldg.vertices) || bldg.vertices.length < 3) continue;

    const catCode = bldg.category === 'boundary' ? 1 : bldg.category === 'balcony' ? 2 : 0;
    floatArray[offset] = bldgIdx;
    floatArray[offset + 1] = catCode;
    floatArray[offset + 2] = bldg.isTested ? 1.0 : 0.0;
    floatArray[offset + 3] = bldg.isIncluded !== false ? 1.0 : 0.0;
    floatArray[offset + 4] = bldg.elevation || 0.0;
    floatArray[offset + 5] = bldg.defaultHeight || 0.0;
    floatArray[offset + 6] = bldg.vertices.length;
    floatArray[offset + 7] = bldg.holes ? bldg.holes.length : 0;
    offset += 8;

    for (let v = 0; v < bldg.vertices.length; v++) {
      floatArray[offset++] = bldg.vertices[v].x;
      floatArray[offset++] = bldg.vertices[v].y;
    }

    if (bldg.holes) {
      for (const hole of bldg.holes) {
        for (let hv = 0; hv < hole.length; hv++) {
          floatArray[offset++] = hole[hv].x;
          floatArray[offset++] = hole[hv].y;
        }
      }
    }
    bldgIdx++;
  }

  // 3. Serializacja segmentów fasad
  bldgIdx = 0;
  for (const bldg of buildings) {
    if (!bldg || !Array.isArray(bldg.vertices) || bldg.vertices.length < 3) continue;
    if (bldg.segments) {
      for (const seg of bldg.segments) {
        floatArray[offset] = seg.p1.x;
        floatArray[offset + 1] = seg.p1.y;
        floatArray[offset + 2] = seg.p2.x;
        floatArray[offset + 3] = seg.p2.y;
        floatArray[offset + 4] = seg.normal?.x ?? 0.0;
        floatArray[offset + 5] = seg.normal?.y ?? 0.0;
        floatArray[offset + 6] = seg.hBase ?? bldg.elevation ?? 0.0;
        floatArray[offset + 7] = seg.hTop ?? bldg.defaultHeight ?? 0.0;
        offset += 8;
      }
    }
    bldgIdx++;
  }

  return {
    buffer: floatArray.buffer,
    numBuildings,
    numSegments: totalSegments,
    numVertices: totalVertices,
  };
}

/**
 * Błyskawiczne odczytanie segmentów przeszkód z płaskiego bufora Float32Array.
 */
export function deserializeObstacleSegmentsFromBuffer(
  bufferOrFloats: ArrayBuffer | Float32Array
): FlatObstacleSegment[] {
  const floats =
    bufferOrFloats instanceof Float32Array
      ? bufferOrFloats
      : new Float32Array(bufferOrFloats);

  const numBuildings = floats[0];
  const totalSegments = floats[1];
  const totalVertices = floats[2];

  let offset = 8;
  // Pomiń nagłówki i wierzchołki budynków
  offset += numBuildings * 8 + totalVertices * 2;

  const segments: FlatObstacleSegment[] = new Array(totalSegments);
  for (let i = 0; i < totalSegments; i++) {
    segments[i] = {
      p1x: floats[offset],
      p1y: floats[offset + 1],
      p2x: floats[offset + 2],
      p2y: floats[offset + 3],
      normalX: floats[offset + 4],
      normalY: floats[offset + 5],
      hBase: floats[offset + 6],
      hTop: floats[offset + 7],
      isTested: false,
      bldgIndex: -1,
    };
    offset += 8;
  }

  return segments;
}
