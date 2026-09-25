import type { BuildingLoop, BuildingType, FacadeSegment, Point2D, Vector2D } from '@/types/geometry';
import type {
  CompiledMetrics,
  CompiledObjectGeometry,
  Face3D,
  LabelPlacementInfo,
  Point3D,
  Polygon2D,
  PrecomputedMasterplanTier,
  ShadowCastingEdge,
  StorySlice,
} from '@/types/compiledGeometry';
import { applyBuildingModifiers } from '../modifiers/modifierPipeline';
import {
  calculateSignedArea,
  isPolygonCCW,
  rotatePointAroundPivot,
  getPolygonInteriorPoint,
  computePolygonDominantAngle,
  isPolygonConvex,
  polygonFingerprint,
  collapseIdenticalConsecutiveHeightRuns,
} from '@/utils/math2d/polygons';
import { calculateOutwardNormal } from '@/utils/math2d/vec2';
import { clippingResultToPolygonsWithHoles, polygonsWithHolesToClipping, PolygonWithHoles } from '@/utils/math2d/polygons';
import polygonClipping from 'polygon-clipping';

function computePolygonNetArea(exterior: readonly Point2D[], holes?: readonly (readonly Point2D[])[]): number {
  const outer = Math.abs(calculateSignedArea(exterior as Point2D[]));
  const inner = holes ? holes.reduce((sum, h) => sum + Math.abs(calculateSignedArea(h as Point2D[])), 0) : 0;
  return Math.max(0, outer - inner);
}

function computePolygonPerimeter(points: readonly Point2D[]): number {
  if (points.length < 2) return 0;
  let len = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    len += Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }
  return len;
}

function computeBounds2DFromRings(rings: readonly (readonly Point2D[])[]): { min: Point2D; max: Point2D } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const ring of rings) {
    for (const p of ring) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }

  if (!Number.isFinite(minX)) {
    return { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

function computeBounds3DFromFaces(faces: readonly Face3D[]): { min: Point3D; max: Point3D } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const face of faces) {
    for (const v of face.vertices) {
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
      if (v.z < minZ) minZ = v.z;
      if (v.z > maxZ) maxZ = v.z;
    }
  }

  if (!Number.isFinite(minX)) {
    return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  }
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
}

export class GeometryCompiler {
  /**
   * Generuje deterministyczny hash stanu wejściowego obiektu.
   */
  public static computeStateHash(bldg: BuildingLoop): string {
    const vLen = bldg.vertices ? bldg.vertices.length : 0;
    const v0 = bldg.vertices && bldg.vertices.length > 0 ? `${bldg.vertices[0].x.toFixed(4)},${bldg.vertices[0].y.toFixed(4)}` : '';
    const vLast = bldg.vertices && bldg.vertices.length > 1 ? `${bldg.vertices[vLen - 1].x.toFixed(4)},${bldg.vertices[vLen - 1].y.toFixed(4)}` : '';
    const hCount = bldg.holes ? bldg.holes.length : 0;
    const hLen = bldg.holes ? bldg.holes.reduce((sum, h) => sum + h.length, 0) : 0;
    const modHash = bldg.modifiers && bldg.modifiers.length > 0 ? JSON.stringify(bldg.modifiers) : '[]';
    const sweepKey = bldg.sweepPath ? `${bldg.sweepPath.length}:${bldg.sweepWidth}:${bldg.sweepAlignment}` : '';
    const rot = bldg.transform ? bldg.transform.rotationDeg.toFixed(2) : '0';
    return `${bldg.id}|${bldg.category ?? 'building'}|${(bldg.elevation ?? 0).toFixed(3)}|${bldg.defaultHeight.toFixed(3)}|${(bldg.firstFloorHeight ?? 0).toFixed(2)}|${(bldg.typicalFloorHeight ?? 0).toFixed(2)}|${bldg.storeysCount ?? 0}|${vLen}|${v0}|${vLast}|${hCount}|${hLen}|${modHash}|${sweepKey}|${bldg.buildingType ?? 'residential'}|${bldg.isCityCentre ? 1 : 0}|rot:${rot}`;
  }

  /**
   * Kompiluje geometrię pojedynczego obiektu BuildingLoop (Bake on Edit).
   */
  public static bakeBuilding(building: BuildingLoop): CompiledObjectGeometry {
    const hash = this.computeStateHash(building);
    if (building.computed && building.computed.geometryHash === hash) {
      return building.computed;
    }

    const baseVertices = building.vertices ?? [];
    const baseHoles = building.holes ?? [];
    const baseElevation = building.elevation ?? 0;
    const defaultHeight = building.defaultHeight ?? 0;

    // 1. Zastosowanie modyfikatorów geometrycznych (2.5D)
    let modifierResult = {
      storyPolygons: building.storyPolygons ?? [],
      zonePolygons: building.zonePolygons ?? [],
      segments: building.segments ?? [],
    };

    if (baseVertices.length >= 3 && defaultHeight > 0) {
      modifierResult = applyBuildingModifiers(building);
    }

    const storyPolygons = modifierResult.storyPolygons;
    const segments = modifierResult.segments;

    // 2. Budowa reprezentacji 2D
    const storySlices: StorySlice[] = [];
    if (storyPolygons.length > 0) {
      storyPolygons.forEach((sf, idx) => {
        storySlices.push({
          storyIndex: sf.storyIndex ?? idx,
          elevationBottom: sf.hBottom,
          elevationTop: sf.hTop,
          height: Math.max(0, sf.hTop - sf.hBottom),
          footprint: {
            exterior: sf.polygon,
            holes: sf.holes ?? [],
          },
          edgeOrigins: sf.edgeOrigins,
        });
      });
    } else if (baseVertices.length >= 3) {
      storySlices.push({
        storyIndex: 0,
        elevationBottom: baseElevation,
        elevationTop: baseElevation + defaultHeight,
        height: defaultHeight,
        footprint: {
          exterior: baseVertices,
          holes: baseHoles,
        },
      });
    }

    const footprintBase: Polygon2D =
      storySlices.length > 0
        ? storySlices[0].footprint
        : { exterior: baseVertices, holes: baseHoles };

    const footprintRoof: Polygon2D =
      storySlices.length > 0
        ? storySlices[storySlices.length - 1].footprint
        : { exterior: baseVertices, holes: baseHoles };

    const all2DRings: Point2D[][] = [];
    if (footprintBase.exterior.length > 0) all2DRings.push([...footprintBase.exterior]);
    for (const h of footprintBase.holes) all2DRings.push([...h]);
    for (const slice of storySlices) {
      all2DRings.push([...slice.footprint.exterior]);
      for (const h of slice.footprint.holes) all2DRings.push([...h]);
    }

    const bounds2D = computeBounds2DFromRings(all2DRings);

    // 3. Budowa siatki 3D (faces)
    const faces: Face3D[] = [];
    const castingEdges: ShadowCastingEdge[] = [];

    storySlices.forEach((slice, sliceIdx) => {
      const { exterior, holes } = slice.footprint;
      const hBottom = slice.elevationBottom;
      const hTop = slice.elevationTop;

      if (exterior.length >= 3 && hTop > hBottom) {
        const isCCW = isPolygonCCW(exterior as Point2D[]);
        const n = exterior.length;

        // Ściany obrysu zewnętrznego
        for (let i = 0; i < n; i++) {
          const p1 = exterior[i];
          const p2 = exterior[(i + 1) % n];
          const norm2D = calculateOutwardNormal(p1, p2, isCCW);
          const edgeOrigin = slice.edgeOrigins ? slice.edgeOrigins[i] : i;

          faces.push({
            id: `${building.id}_f${sliceIdx}_w${i}`,
            sourceObjectId: building.id,
            type: 'wall',
            floorIndex: slice.storyIndex,
            edgeOriginIndex: edgeOrigin,
            buildingType: building.buildingType,
            vertices: [
              { x: p1.x, y: p1.y, z: hBottom },
              { x: p2.x, y: p2.y, z: hBottom },
              { x: p2.x, y: p2.y, z: hTop },
              { x: p1.x, y: p1.y, z: hTop },
            ],
            normal: { x: norm2D.x, y: norm2D.y, z: 0 },
          });

          // Górna krawędź ściany rzucająca cień
          castingEdges.push({
            p1: { x: p1.x, y: p1.y, z: hTop },
            p2: { x: p2.x, y: p2.y, z: hTop },
            isRidgeOrRoofEdge: true,
            normal2D: norm2D,
          });
        }

        // Ściany otworów (patio / dziedzińce)
        holes.forEach((hole, holeIdx) => {
          if (hole.length >= 3) {
            const hn = hole.length;
            for (let j = 0; j < hn; j++) {
              const hp1 = hole[j];
              const hp2 = hole[(j + 1) % hn];
              const hNorm2D = calculateOutwardNormal(hp1, hp2, !isCCW);

              faces.push({
                id: `${building.id}_f${sliceIdx}_h${holeIdx}_w${j}`,
                sourceObjectId: building.id,
                type: 'wall',
                floorIndex: slice.storyIndex,
                buildingType: building.buildingType,
                vertices: [
                  { x: hp1.x, y: hp1.y, z: hBottom },
                  { x: hp2.x, y: hp2.y, z: hBottom },
                  { x: hp2.x, y: hp2.y, z: hTop },
                  { x: hp1.x, y: hp1.y, z: hTop },
                ],
                normal: { x: hNorm2D.x, y: hNorm2D.y, z: 0 },
              });
            }
          }
        });

        // Dach najwyższej kondygnacji
        if (sliceIdx === storySlices.length - 1) {
          faces.push({
            id: `${building.id}_f${sliceIdx}_roof`,
            sourceObjectId: building.id,
            type: 'roof',
            floorIndex: slice.storyIndex,
            buildingType: building.buildingType,
            vertices: exterior.map((p) => ({ x: p.x, y: p.y, z: hTop })),
            normal: { x: 0, y: 0, z: 1 },
          });
        }

        // Posadzka przyziemia
        if (sliceIdx === 0) {
          faces.push({
            id: `${building.id}_f0_ground`,
            sourceObjectId: building.id,
            type: 'ground',
            floorIndex: slice.storyIndex,
            buildingType: building.buildingType,
            vertices: exterior.map((p) => ({ x: p.x, y: p.y, z: hBottom })),
            normal: { x: 0, y: 0, z: -1 },
          });
        }
      }
    });

    const bounds3D = computeBounds3DFromFaces(faces);

    // 4. Kalkulacja metryk
    const footprintArea = computePolygonNetArea(footprintBase.exterior, footprintBase.holes);
    let grossFloorArea = 0;
    let volume = 0;

    storySlices.forEach((slice) => {
      const sliceArea = computePolygonNetArea(slice.footprint.exterior, slice.footprint.holes);
      grossFloorArea += sliceArea;
      volume += sliceArea * slice.height;
    });

    const perimeter = computePolygonPerimeter(footprintBase.exterior);
    const heightMax = storySlices.length > 0
      ? Math.max(...storySlices.map((s) => s.elevationTop))
      : baseElevation + defaultHeight;

    const metrics: CompiledMetrics = {
      footprintArea,
      grossFloorArea: grossFloorArea > 0 ? grossFloorArea : footprintArea,
      volume,
      perimeter,
      heightMax,
    };

    let labelInfo: LabelPlacementInfo | undefined;
    const baseVerts = (footprintBase.exterior as Point2D[]) || baseVertices;
    if (baseVerts.length >= 3) {
      const labelAnchor = getPolygonInteriorPoint(baseVerts);
      const dominantAngleRad = computePolygonDominantAngle(baseVerts);
      const spanX = Math.max(0.1, bounds2D.max.x - bounds2D.min.x);
      const spanY = Math.max(0.1, bounds2D.max.y - bounds2D.min.y);
      labelInfo = {
        labelAnchor,
        dominantAngleRad,
        spanX,
        spanY,
      };
    }

    // Prekompilacja story tiers dla widoku Masterplan (Bake on Edit)
    const rawTiers: PrecomputedMasterplanTier[] = [];
    const defaultBldgType = building.buildingType ?? 'residential';
    if (storySlices.length > 0) {
      for (const s of storySlices) {
        if (!s.footprint.exterior || s.footprint.exterior.length < 3) continue;
        const poly = s.footprint.exterior as Point2D[];
        const holes = (s.footprint.holes as Point2D[][]) || [];
        rawTiers.push({
          storyIndex: s.storyIndex,
          polygon: poly,
          holes,
          hBottom: s.elevationBottom,
          hTop: s.elevationTop,
          geomFingerprint: polygonFingerprint(poly),
          isConvex: isPolygonConvex(poly),
          buildingType: defaultBldgType,
        });
      }
    } else if (baseVertices.length >= 3 && defaultHeight > 0) {
      rawTiers.push({
        storyIndex: 0,
        polygon: baseVertices,
        holes: baseHoles,
        hBottom: baseElevation,
        hTop: baseElevation + defaultHeight,
        geomFingerprint: polygonFingerprint(baseVertices),
        isConvex: isPolygonConvex(baseVertices),
        buildingType: defaultBldgType,
      });
    }

    const masterplanTiers: PrecomputedMasterplanTier[] = rawTiers.length > 0
      ? collapseIdenticalConsecutiveHeightRuns(
          rawTiers,
          (t) => t.polygon as Point2D[],
          (t) => t.holes as Point2D[][],
          (t) => t.hBottom,
          (t) => t.hTop,
          (last, hBottom, hTop) => ({ ...last, hBottom, hTop }),
          (t) => t.buildingType
        )
      : [];

    const baseIsConvex = baseVertices.length >= 3 ? isPolygonConvex(baseVertices as Point2D[]) : true;
    const baseGeomFingerprint = baseVertices.length >= 3 ? polygonFingerprint(baseVertices as Point2D[]) : '';

    return {
      geometryHash: hash,
      computedAt: Date.now(),
      representation2D: {
        footprintBase,
        footprintRoof,
        storySlices,
        masterplanTiers,
        bounds2D,
        labelInfo,
        isConvex: baseIsConvex,
        geomFingerprint: baseGeomFingerprint,
      },
      representation3D: {
        faces,
        bounds3D,
      },
      analysis: {
        castingEdges,
        heightMin: baseElevation,
        heightMax,
        simplifiedEnvelope2D: footprintBase,
      },
      metrics,
    };
  }

  /**
   * Kompiluje zagregowaną geometrię grupy logicznej na bazie gotowych danych dzieci (Bottom-Up).
   */
  public static bakeGroup(group: BuildingLoop, children: readonly BuildingLoop[]): CompiledObjectGeometry {
    const validChildren = children.filter((c) => (c.vertices && c.vertices.length >= 3) || c.computed !== undefined);
    const bakedChildren = validChildren.map((c) => (c.computed ? c.computed : this.bakeBuilding(c)));
    const hash = `${group.id}|group|${bakedChildren.map((c) => c.geometryHash).sort().join(';')}`;

    if (group.computed && group.computed.geometryHash === hash) {
      return group.computed;
    }

    if (bakedChildren.length === 0) {
      return this.bakeBuilding(group);
    }

    // 1. Scalenie obrysów 2D (Union)
    const basePolygonsToUnion: PolygonWithHoles[] = bakedChildren.map((c) => ({
      outer: c.representation2D.footprintBase.exterior as Point2D[],
      holes: (c.representation2D.footprintBase.holes ?? []) as Point2D[][],
    }));

    let mergedExterior: Point2D[] = [];
    let mergedHoles: Point2D[][] = [];

    try {
      const clippingInput = polygonsWithHolesToClipping(basePolygonsToUnion);
      const unionResult = polygonClipping.union(clippingInput[0], ...clippingInput.slice(1));
      const parsedUnion = clippingResultToPolygonsWithHoles(unionResult);

      if (parsedUnion.length > 0) {
        mergedExterior = parsedUnion[0].outer;
        mergedHoles = parsedUnion[0].holes;
      }
    } catch {
      mergedExterior = bakedChildren[0].representation2D.footprintBase.exterior as Point2D[];
      mergedHoles = (bakedChildren[0].representation2D.footprintBase.holes ?? []) as Point2D[][];
    }

    const footprintBase: Polygon2D = {
      exterior: mergedExterior,
      holes: mergedHoles,
    };

    // 2. Agregacja ścian 3D i krawędzi
    const aggregatedFaces: Face3D[] = bakedChildren.flatMap((c) => c.representation3D.faces);
    const aggregatedCastingEdges: ShadowCastingEdge[] = bakedChildren.flatMap((c) => c.analysis.castingEdges);

    // 3. Połączenie obwiedni 2D i 3D
    const allMinX = Math.min(...bakedChildren.map((c) => c.representation2D.bounds2D.min.x));
    const allMaxX = Math.max(...bakedChildren.map((c) => c.representation2D.bounds2D.max.x));
    const allMinY = Math.min(...bakedChildren.map((c) => c.representation2D.bounds2D.min.y));
    const allMaxY = Math.max(...bakedChildren.map((c) => c.representation2D.bounds2D.max.y));

    const bounds2D = {
      min: { x: allMinX, y: allMinY },
      max: { x: allMaxX, y: allMaxY },
    };

    const bounds3D = computeBounds3DFromFaces(aggregatedFaces);

    // 4. Sumowanie metryk (czas O(K))
    const aggregatedMetrics: CompiledMetrics = bakedChildren.reduce(
      (acc, c) => ({
        footprintArea: acc.footprintArea + c.metrics.footprintArea,
        grossFloorArea: acc.grossFloorArea + c.metrics.grossFloorArea,
        volume: acc.volume + c.metrics.volume,
        perimeter: acc.perimeter + c.metrics.perimeter,
        heightMax: Math.max(acc.heightMax, c.metrics.heightMax),
      }),
      { footprintArea: 0, grossFloorArea: 0, volume: 0, perimeter: 0, heightMax: 0 }
    );

    let labelInfo: LabelPlacementInfo | undefined;
    if (mergedExterior.length >= 3) {
      const labelAnchor = getPolygonInteriorPoint(mergedExterior);
      const dominantAngleRad = computePolygonDominantAngle(mergedExterior);
      const spanX = Math.max(0.1, bounds2D.max.x - bounds2D.min.x);
      const spanY = Math.max(0.1, bounds2D.max.y - bounds2D.min.y);
      labelInfo = {
        labelAnchor,
        dominantAngleRad,
        spanX,
        spanY,
      };
    }

    return {
      geometryHash: hash,
      computedAt: Date.now(),
      representation2D: {
        footprintBase,
        footprintRoof: footprintBase,
        storySlices: [],
        bounds2D,
        labelInfo,
      },
      representation3D: {
        faces: aggregatedFaces,
        bounds3D,
      },
      analysis: {
        castingEdges: aggregatedCastingEdges,
        heightMin: Math.min(...bakedChildren.map((c) => c.analysis.heightMin)),
        heightMax: Math.max(...bakedChildren.map((c) => c.analysis.heightMax)),
        simplifiedEnvelope2D: footprintBase,
      },
      metrics: aggregatedMetrics,
    };
  }

  /**
   * Szybka transformacja afiniczna (translacja / obrót) zbuforowanej geometrii
   * bez konieczności ponownego przeliczania modyfikatorów i operacji boolowskich (AGENTS.md §1).
   */
  public static transformCompiledGeometry(
    computed: CompiledObjectGeometry,
    dx: number,
    dy: number,
    rotationRad: number = 0,
    pivot: Point2D = { x: 0, y: 0 }
  ): CompiledObjectGeometry {
    const isTranslating = Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6;
    const isRotating = Math.abs(rotationRad) > 1e-6;

    if (!isTranslating && !isRotating) {
      return computed;
    }

    const transformPoint2D = (p: Point2D): Point2D => {
      let x = p.x;
      let y = p.y;
      if (isRotating) {
        const rotated = rotatePointAroundPivot({ x, y }, pivot, rotationRad);
        x = rotated.x;
        y = rotated.y;
      }
      if (isTranslating) {
        x += dx;
        y += dy;
      }
      return { x, y };
    };

    const transformPoint3D = (p: Point3D): Point3D => {
      const p2 = transformPoint2D({ x: p.x, y: p.y });
      return { x: p2.x, y: p2.y, z: p.z };
    };

    const cos = Math.cos(rotationRad);
    const sin = Math.sin(rotationRad);

    const transformVector2D = (v: Vector2D): Vector2D =>
      isRotating ? { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos } : { x: v.x, y: v.y };

    const transformVector3D = (v: Point3D): Point3D => ({ ...transformVector2D(v), z: v.z });

    const transformPolygon2D = (poly: Polygon2D): Polygon2D => ({
      exterior: poly.exterior.map(transformPoint2D),
      holes: poly.holes.map((h) => h.map(transformPoint2D)),
    });

    const transformedBase = transformPolygon2D(computed.representation2D.footprintBase);
    const transformedRoof = transformPolygon2D(computed.representation2D.footprintRoof);
    const transformedStorySlices = computed.representation2D.storySlices.map((s) => ({
      ...s,
      footprint: transformPolygon2D(s.footprint),
    }));

    const transformedFaces: Face3D[] = computed.representation3D.faces.map((f) => ({
      ...f,
      vertices: f.vertices.map(transformPoint3D),
      normal: transformVector3D(f.normal),
    }));

    const transformedCastingEdges: ShadowCastingEdge[] = computed.analysis.castingEdges.map((e) => ({
      ...e,
      p1: transformPoint3D(e.p1),
      p2: transformPoint3D(e.p2),
      normal2D: e.normal2D ? transformVector2D(e.normal2D) : undefined,
    }));

    const allRings = [transformedBase.exterior, ...transformedBase.holes];
    const bounds2D = computeBounds2DFromRings(allRings);
    const bounds3D = computeBounds3DFromFaces(transformedFaces);

    const transformedLabelInfo: LabelPlacementInfo | undefined = computed.representation2D.labelInfo
      ? {
          labelAnchor: transformPoint2D(computed.representation2D.labelInfo.labelAnchor),
          dominantAngleRad: computed.representation2D.labelInfo.dominantAngleRad + rotationRad,
          spanX: Math.max(0.1, bounds2D.max.x - bounds2D.min.x),
          spanY: Math.max(0.1, bounds2D.max.y - bounds2D.min.y),
        }
      : undefined;

    const vLen = transformedBase.exterior.length;
    const v0 = vLen > 0 ? `${transformedBase.exterior[0].x.toFixed(4)},${transformedBase.exterior[0].y.toFixed(4)}` : '';
    const vLast = vLen > 1 ? `${transformedBase.exterior[vLen - 1].x.toFixed(4)},${transformedBase.exterior[vLen - 1].y.toFixed(4)}` : '';

    const tokens = computed.geometryHash.split('|');
    let updatedHash = computed.geometryHash;
    if (tokens.length >= 17) {
      tokens[7] = String(vLen);
      tokens[8] = v0;
      tokens[9] = vLast;
      if (isRotating) {
        const oldRotStr = tokens[16]?.replace('rot:', '') || '0';
        const oldRotDeg = parseFloat(oldRotStr) || 0;
        const deltaDeg = (rotationRad * 180) / Math.PI;
        const newRotDeg = Number(((((oldRotDeg + deltaDeg) % 360) + 360) % 360).toFixed(2));
        tokens[16] = `rot:${newRotDeg.toFixed(2)}`;
      }
      updatedHash = tokens.join('|');
    } else {
      updatedHash = `${computed.geometryHash}|tr:${v0}|rot:${rotationRad.toFixed(4)}`;
    }

    const transformedMasterplanTiers: PrecomputedMasterplanTier[] | undefined = computed.representation2D.masterplanTiers?.map((t) => {
      const transformedPoly = t.polygon.map(transformPoint2D);
      const transformedHoles = t.holes.map((h) => h.map(transformPoint2D));
      return {
        ...t,
        polygon: transformedPoly,
        holes: transformedHoles,
        geomFingerprint: polygonFingerprint(transformedPoly as Point2D[]),
        isConvex: t.isConvex,
      };
    });

    return {
      ...computed,
      geometryHash: updatedHash,
      computedAt: Date.now(),
      representation2D: {
        footprintBase: transformedBase,
        footprintRoof: transformedRoof,
        storySlices: transformedStorySlices,
        masterplanTiers: transformedMasterplanTiers,
        bounds2D,
        labelInfo: transformedLabelInfo,
        isConvex: computed.representation2D.isConvex,
        geomFingerprint: polygonFingerprint(transformedBase.exterior as Point2D[]),
      },
      representation3D: {
        faces: transformedFaces,
        bounds3D,
      },
      analysis: {
        ...computed.analysis,
        castingEdges: transformedCastingEdges,
        simplifiedEnvelope2D: transformedBase,
      },
    };
  }

  /**
   * Zwraca zbuforowane granice AABB obiektu 2D z modelu skompilowanego w O(1)
   * lub z wierzchołków bazowych jako fallback.
   */
  public static getBuildingBounds2D(bldg: BuildingLoop): { min: Point2D; max: Point2D } | null {
    if (bldg.computed?.representation2D?.bounds2D) {
      return bldg.computed.representation2D.bounds2D;
    }
    if (bldg.vertices && bldg.vertices.length >= 3) {
      return computeBounds2DFromRings([bldg.vertices]);
    }
    return null;
  }
}
