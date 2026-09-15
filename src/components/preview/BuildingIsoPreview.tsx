import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrthographicCamera as DreiOrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { Scan } from 'lucide-react';
import type { BuildingLoop, Point2D } from '@/types/geometry';
import { APP_CONFIG } from '@/config/appConfig';
import { getBuildingSolids } from '@/engine/preview/buildingIsoGeometry';
import { miterOffsetPolygon } from '@/utils/math2d/miterOffset';
import { getIsoCameraOffset, getSunDirection3D, type IsoOrientation } from './isoCameraPresets';
import { getPolygonCentroid, getPolygonInteriorPoint, computePointsBoundingBox, computePolygonArea } from '@/utils/math2d/polygons';
import { useActionRecorderStore } from '../../modules/action-recorder/useActionRecorderStore';
import { useSolarAnalysisStore } from '@/store';
import { calculateSolarPosition } from '@/utils/solar';

/** Clockwise cycle used for the left/right compass arrows, 45° per step. */
const ORIENTATION_CYCLE: IsoOrientation[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

const { colors: ISO_COLORS, geometry: ISO_GEO } = APP_CONFIG.isoPreview;
export const XRAY_COLORS = ISO_COLORS.xray;


interface BuildingIsoPreviewProps {
  building: BuildingLoop;
  groupBuildings?: BuildingLoop[];
  highlightEdgeIndex?: number;
  hideToolbar?: boolean;
  overrideOrientation?: IsoOrientation;
  overrideIsXRay?: boolean;
}

interface FrameData {
  center: THREE.Vector3;
  radius: number;
  groundY: number;
  hasUnderground: boolean;
}

/** Traces a closed loop of points onto a THREE.Path (or its Shape subclass). */
function pointsToPath<T extends THREE.Path>(points: { x: number; y: number }[], path: T): T {
  points.forEach((pt, i) => {
    if (i === 0) path.moveTo(pt.x, pt.y);
    else path.lineTo(pt.x, pt.y);
  });
  path.closePath();
  return path;
}

function buildGeometryGroup(
  buildings: BuildingLoop[],
  activeBuildingId?: string,
  isXRay: boolean = false,
  highlightEdgeIndex?: number,
  orientation: IsoOrientation = 'SW'
): THREE.Group {
  const group = new THREE.Group();
  const createdMaterials: THREE.Material[] = [];

  // Kierunek "w stronę kamery" w przestrzeni świata (Y-up), używany do policzenia głębokości
  // krawędzi względem kamery (depth cueing grubości linii).
  const camDirOffset = getIsoCameraOffset(orientation, 1);
  const viewDirWorld = new THREE.Vector3(camDirOffset.x, camDirOffset.y, camDirOffset.z).normalize();

  // Zbierane w pierwszym przebiegu (per solidGroup) do globalnej normalizacji głębokości oraz
  // klasyfikacji kontur/podział kondygnacji.
  type PendingEdgeBucket = {
    solidGroup: THREE.Group;
    positions: Float32Array;
    depths: number[];
    /** Wysokość świata segmentu, jeśli poziomy (oba końce na tym samym Y); null jeśli skośny/pionowy. */
    horizontalY: (number | null)[];
  };
  const pendingEdgeBuckets: PendingEdgeBucket[] = [];
  let globalMinDepth = Infinity;
  let globalMaxDepth = -Infinity;
  let globalMinY = Infinity;
  let globalMaxY = -Infinity;
  const Y_EPS = 1e-3;
  // Kolor/przezroczystość widocznych krawędzi - stałe dla całego wywołania, bo `isXRay` jest wspólne.
  const storyLineColor = isXRay ? ISO_COLORS.storyLineXRay : ISO_COLORS.storyLine;
  const storyLineOpacity = isXRay ? 0.8 : 0.5;

  buildings.forEach((bldg) => {
    const solids = getBuildingSolids(bldg);
    const bType = bldg.buildingType || 'residential';
    const typeColor = XRAY_COLORS[bType] || XRAY_COLORS.residential;
    // Wstęga podświetlenia krawędzi ma się pojawić tylko na najniższej kondygnacji budynku.
    const minHBottomForBuilding = solids.length > 0 ? Math.min(...solids.map((s) => s.hBottom)) : 0;

    // Materiał powłoki zewnętrznej
    const outerMaterial = new THREE.MeshStandardMaterial({
      color: isXRay ? '#ffffff' : (bldg.isTested ? ISO_COLORS.proposed : ISO_COLORS.existing),
      roughness: isXRay ? 0.3 : 0.85,
      metalness: isXRay ? 0.05 : 0.05,
      transparent: isXRay,
      opacity: isXRay ? 0.5 : 1.0,
      depthWrite: !isXRay,
      side: THREE.DoubleSide,
    });
    createdMaterials.push(outerMaterial);

    // Ukryte / podziemne linie przerywane (GreaterDepth)
    const dashedLineMaterial = new THREE.LineDashedMaterial({
      color: isXRay ? ISO_COLORS.dashedLineXRay : ISO_COLORS.dashedLine,
      transparent: true,
      opacity: isXRay ? 0.65 : 0.4,
      dashSize: 0.8,
      gapSize: 0.5,
      scale: 1,
      depthFunc: THREE.GreaterDepth,
      depthTest: true,
      depthWrite: false,
    });
    createdMaterials.push(dashedLineMaterial);

    solids.forEach((solid) => {
      const solidGroup = new THREE.Group();
      solidGroup.rotation.x = -Math.PI / 2;
      solidGroup.position.y = solid.hBottom;

      const outerDepth = Math.max(0.1, solid.hTop - solid.hBottom);

      // W trybie X-Ray generujemy wewnętrzną bryłę kondygnacji (offset -0.4m, obniżenie o 0.4m)
      if (isXRay) {
        const solidType = solid.buildingType || bType;
        const solidTypeColor = XRAY_COLORS[solidType] || XRAY_COLORS.residential;
        const solidInnerMaterial = new THREE.MeshStandardMaterial({
          color: solidTypeColor,
          roughness: 0.35,
          metalness: 0.05,
          transparent: false,
          opacity: 1.0,
          depthWrite: true,
          side: THREE.DoubleSide,
        });
        createdMaterials.push(solidInnerMaterial);

        const innerPolygon = miterOffsetPolygon(solid.polygon, -0.4)[0] ?? solid.polygon;
        const innerHoles = (solid.holes ?? []).flatMap((h) => miterOffsetPolygon(h, 0.4));
        const innerShape = pointsToPath(innerPolygon, new THREE.Shape());
        for (const hole of innerHoles) {
          innerShape.holes.push(pointsToPath(hole, new THREE.Path()));
        }

        const innerDepth = Math.max(0.05, outerDepth - 0.4);
        const innerGeometry = new THREE.ExtrudeGeometry(innerShape, { depth: innerDepth, bevelEnabled: false });
        const innerMesh = new THREE.Mesh(innerGeometry, solidInnerMaterial);
        innerMesh.castShadow = true;
        innerMesh.receiveShadow = true;
        innerMesh.renderOrder = 0;
        solidGroup.add(innerMesh);
      }

      // Zewnętrzna powłoka kondygnacji
      const outerShape = pointsToPath(solid.polygon, new THREE.Shape());
      for (const hole of solid.holes) {
        outerShape.holes.push(pointsToPath(hole, new THREE.Path()));
      }

      const outerGeometry = new THREE.ExtrudeGeometry(outerShape, { depth: outerDepth, bevelEnabled: false });
      const outerMesh = new THREE.Mesh(outerGeometry, outerMaterial);
      outerMesh.castShadow = true;
      outerMesh.receiveShadow = true;
      outerMesh.renderOrder = isXRay ? 1 : 0;
      solidGroup.add(outerMesh);

      // Krawędzie z obliczonymi odległościami dla linii przerywanych
      const edges = new THREE.EdgesGeometry(outerGeometry, ISO_GEO.edgeAngleThresholdDeg);

      // Widoczne krawędzie: grubość linii będzie zależna od głębokości względem kamery
      // (depth cueing) - zbieramy dane teraz, a same linie (fat lines) budujemy w drugim
      // przebiegu po policzeniu globalnego min/max głębokości dla całej sceny.
      const edgePositions = edges.attributes.position.array as Float32Array;
      const segmentCount = edgePositions.length / 6; // 2 wierzchołki * 3 współrzędne na segment
      const depths: number[] = new Array(segmentCount);
      const horizontalY: (number | null)[] = new Array(segmentCount);
      for (let s = 0; s < segmentCount; s++) {
        const base = s * 6;
        const midLocalX = (edgePositions[base] + edgePositions[base + 3]) / 2;
        const midLocalY = (edgePositions[base + 1] + edgePositions[base + 4]) / 2;
        const midLocalZ = (edgePositions[base + 2] + edgePositions[base + 5]) / 2;
        // Lokalne (x,y,z) ekstruzji -> świat (Y-up): world = (x, z + hBottom, -y) - patrz
        // wyprowadzenie (solidGroup.rotation.x = -PI/2).
        const worldX = midLocalX;
        const worldY = midLocalZ + solid.hBottom;
        const worldZ = -midLocalY;
        const depth = worldX * viewDirWorld.x + worldY * viewDirWorld.y + worldZ * viewDirWorld.z;
        depths[s] = depth;
        if (depth < globalMinDepth) globalMinDepth = depth;
        if (depth > globalMaxDepth) globalMaxDepth = depth;

        // Klasyfikacja kontur/podział kondygnacji: segment jest poziomy, gdy oba końce mają to
        // samo światowe Y (worldY = localZ + hBottom dla każdego z dwóch wierzchołków segmentu).
        const worldY1 = edgePositions[base + 2] + solid.hBottom;
        const worldY2 = edgePositions[base + 5] + solid.hBottom;
        const isHorizontal = Math.abs(worldY1 - worldY2) < Y_EPS;
        horizontalY[s] = isHorizontal ? (worldY1 + worldY2) / 2 : null;
        if (isHorizontal) {
          const hy = horizontalY[s] as number;
          if (hy < globalMinY) globalMinY = hy;
          if (hy > globalMaxY) globalMaxY = hy;
        }
      }
      pendingEdgeBuckets.push({ solidGroup, positions: edgePositions, depths, horizontalY });

      const hiddenLines = new THREE.LineSegments(edges, dashedLineMaterial);
      hiddenLines.computeLineDistances();
      hiddenLines.renderOrder = 1;
      solidGroup.add(hiddenLines);

      // Wstęga podświetlenia wybranej krawędzi (tylko dla aktywnego budynku, i tylko na jego
      // najniższej kondygnacji).
      if (
        bldg.id === activeBuildingId &&
        highlightEdgeIndex !== undefined &&
        highlightEdgeIndex >= 0 &&
        solid.hBottom === minHBottomForBuilding
      ) {
        const n = solid.polygon.length;
        const targetIdx = solid.edgeOrigins
          ? solid.edgeOrigins.indexOf(highlightEdgeIndex)
          : highlightEdgeIndex % Math.max(n, 1);
        if (n >= 3 && targetIdx >= 0) {
          const p1 = solid.polygon[targetIdx];
          const p2 = solid.polygon[(targetIdx + 1) % n];

          if (p1 && p2) {
            const edgeDx = p2.x - p1.x;
            const edgeDy = p2.y - p1.y;
            const edgeLen = Math.hypot(edgeDx, edgeDy) || 1;
            let nx = -edgeDy / edgeLen;
            let ny = edgeDx / edgeLen;
            const interior = getPolygonInteriorPoint(solid.polygon);
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            const toInteriorX = interior.x - midX;
            const toInteriorY = interior.y - midY;
            if (nx * toInteriorX + ny * toInteriorY > 0) {
              nx = -nx;
              ny = -ny;
            }

            const RIBBON_Z = 0.03;
            const inX = p1.x, inY = p1.y;
            const in2X = p2.x, in2Y = p2.y;
            const outX = p1.x + nx * ISO_GEO.ribbonWidth, outY = p1.y + ny * ISO_GEO.ribbonWidth;
            const out2X = p2.x + nx * ISO_GEO.ribbonWidth, out2Y = p2.y + ny * ISO_GEO.ribbonWidth;

            const ribbonGeo = new THREE.BufferGeometry();
            const ribbonPositions = new Float32Array([
              inX, inY, RIBBON_Z,
              in2X, in2Y, RIBBON_Z,
              out2X, out2Y, RIBBON_Z,
              inX, inY, RIBBON_Z,
              out2X, out2Y, RIBBON_Z,
              outX, outY, RIBBON_Z,
            ]);
            ribbonGeo.setAttribute('position', new THREE.BufferAttribute(ribbonPositions, 3));
            ribbonGeo.computeVertexNormals();

            const ribbonMat = new THREE.MeshBasicMaterial({
              color: new THREE.Color(ISO_COLORS.highlightRibbon),
              transparent: true,
              opacity: 0.85,
              side: THREE.DoubleSide,
              depthTest: true,
            });
            createdMaterials.push(ribbonMat);
            const ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
            ribbonMesh.renderOrder = 999;
            solidGroup.add(ribbonMesh);
          }
        }
      }

      group.add(solidGroup);
    });
  });

  // Drugi przebieg: budujemy fat-lines (Line2/LineSegments2) pogrupowane w DEPTH_LINE_BUCKETS
  const depthRange = globalMaxDepth - globalMinDepth;
  const Y_RANGE_EPS = Math.max(Y_EPS, (globalMaxY - globalMinY) * 1e-4);
  for (const bucket of pendingEdgeBuckets) {
    const segmentCount = bucket.depths.length;
    // [warstwa][bucket głębokości] -> tablica pozycji
    const bucketedPositions: number[][][] = [
      Array.from({ length: ISO_GEO.depthLineBuckets }, () => []),
      Array.from({ length: ISO_GEO.depthLineBuckets }, () => []),
    ];
    for (let s = 0; s < segmentCount; s++) {
      const hy = bucket.horizontalY[s];
      const isContour =
        hy === null ||
        Math.abs(hy - globalMinY) < Y_RANGE_EPS ||
        Math.abs(hy - globalMaxY) < Y_RANGE_EPS;
      const layer = isContour ? 0 : 1;

      const t = depthRange > 1e-6 ? (bucket.depths[s] - globalMinDepth) / depthRange : 1;
      const bucketIdx = Math.min(ISO_GEO.depthLineBuckets - 1, Math.max(0, Math.floor(t * ISO_GEO.depthLineBuckets)));
      const base = s * 6;
      const arr = bucketedPositions[layer][bucketIdx];
      for (let k = 0; k < 6; k++) arr.push(bucket.positions[base + k]);
    }

    for (let layer = 0; layer < 2; layer++) {
      const layerFactor = layer === 0 ? 1 : ISO_GEO.storyDividerFactor;
      for (let b = 0; b < ISO_GEO.depthLineBuckets; b++) {
        const posArr = bucketedPositions[layer][b];
        if (posArr.length === 0) continue;
        const bucketT = (b + 0.5) / ISO_GEO.depthLineBuckets;
        const depthFactor = ISO_GEO.depthLineMinFactor + (1 - ISO_GEO.depthLineMinFactor) * bucketT;

        const lineGeo = new LineSegmentsGeometry();
        lineGeo.setPositions(posArr);
        const lineMat = new LineMaterial({
          color: storyLineColor,
          transparent: true,
          opacity: storyLineOpacity,
          linewidth: ISO_GEO.depthLineBaseWidth * layerFactor * depthFactor,
          depthFunc: THREE.LessEqualDepth,
          depthTest: true,
        });
        lineMat.resolution.set(800, 600);
        createdMaterials.push(lineMat);

        const fatLine = new LineSegments2(lineGeo, lineMat);
        fatLine.renderOrder = 2;
        bucket.solidGroup.add(fatLine);
      }
    }
  }

  group.userData.materials = createdMaterials;
  return group;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function getBuildingGeometrySignature(b: BuildingLoop): string {
  const vStr = b.vertices ? b.vertices.map((p) => `${p.x},${p.y}`).join(';') : '';
  const hStr = b.holes ? b.holes.map((hole) => hole.map((p) => `${p.x},${p.y}`).join(';')).join('|') : '';
  const swStr = b.sweepWidth !== undefined ? `${b.sweepWidth}_${b.sweepAlignment || ''}` : '';
  const spStr = b.sweepPath ? b.sweepPath.map((p) => `${p.x},${p.y}`).join(';') : '';
  const modStr = b.modifiers ? JSON.stringify(b.modifiers) : '';
  const spolyStr = b.storyPolygons
    ? b.storyPolygons
      .map((s) => `${s.storyIndex}:${s.hBottom}-${s.hTop}:${s.polygon.map((p) => `${p.x},${p.y}`).join(',')}`)
      .join('|')
    : '';
  const trStr = b.transform ? `${b.transform.tx},${b.transform.ty},${b.transform.rotationDeg}` : '';
  const flStr = `${b.firstFloorHeight || ''}_${b.typicalFloorHeight || ''}_${b.storeysCount || ''}`;

  return `${b.id}:${b.isTested}:${b.buildingType || ''}:${b.defaultHeight}:${b.elevation || 0}:${flStr}:${trStr}:${swStr}:${vStr}:${hStr}:${spStr}:${modStr}:${spolyStr}`;
}

interface WorldExtent {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

interface BuildingWorldInfo {
  extent: WorldExtent;
  /** Centroid rzutu (najniższej kondygnacji) budynku w świecie - X/Z. */
  centroid: { x: number; z: number };
}

/**
 * Zasięg i centroid budynku liczone WYŁĄCZNIE z danych geometrycznych (getBuildingSolids), bez
 * dotykania drzewa obiektów Three.js/matrixWorld - środek/zasięg są właściwością samego obiektu,
 * nie czymś odwrotnie wyliczanym z wyrenderowanej sceny. Jedno wywołanie getBuildingSolids/jeden
 * przebieg po wierzchołkach obsługuje oba wyniki naraz, żeby uniknąć powtarzania tej samej pracy.
 */
export function getBuildingWorldInfo(bldg: BuildingLoop): BuildingWorldInfo | null {
  const solids = getBuildingSolids(bldg);
  if (solids.length === 0) return null;

  const allPoints: Point2D[] = [];
  let minY = Infinity, maxY = -Infinity;
  for (const solid of solids) {
    allPoints.push(...solid.polygon);
    if (solid.hBottom < minY) minY = solid.hBottom;
    if (solid.hTop > maxY) maxY = solid.hTop;
  }
  // Lokalne (x,y) rzutu -> świat (Y-up): worldX = x, worldZ = -y.
  const bbox = computePointsBoundingBox(allPoints);
  if (!isFinite(bbox.minX)) return null;

  // Modyfikatory typu "gate" mogą przecinać najniższą kondygnację na wylot, dzieląc jej footprint
  // na kilka odrębnych wielokątów o tym samym hBottom. Centroid musi uwzględniać WSZYSTKIE takie
  // fragmenty (ważone polem powierzchni), inaczej wybór jednego z nich systematycznie przesuwa
  // środek patrzenia kamery względem rzeczywistego środka budynku.
  const minHBottom = solids.reduce((min, s) => Math.min(min, s.hBottom), Infinity);
  const baseSolids = solids.filter((s) => s.hBottom === minHBottom && s.polygon.length >= 3);
  let centroidLocal: Point2D | null = null;
  if (baseSolids.length > 0) {
    let sumX = 0, sumY = 0, sumArea = 0;
    let firstCentroid: Point2D | null = null;
    for (const s of baseSolids) {
      const area = computePolygonArea(s.polygon);
      const c = getPolygonCentroid(s.polygon);
      if (!firstCentroid) firstCentroid = c;
      sumX += c.x * area;
      sumY += c.y * area;
      sumArea += area;
    }
    centroidLocal = sumArea > 0 ? { x: sumX / sumArea, y: sumY / sumArea } : firstCentroid;
  }
  const centroid = centroidLocal
    ? { x: centroidLocal.x, z: -centroidLocal.y }
    : { x: (bbox.minX + bbox.maxX) / 2, z: -(bbox.minY + bbox.maxY) / 2 };

  return {
    extent: { minX: bbox.minX, maxX: bbox.maxX, minY, maxY, minZ: -bbox.maxY, maxZ: -bbox.minY },
    centroid,
  };
}

const IsoScene: React.FC<{
  buildings: BuildingLoop[];
  activeBuildingId?: string;
  isXRay: boolean;
  orientation: IsoOrientation;
  highlightEdgeIndex?: number;
}> = ({
  buildings,
  activeBuildingId,
  isXRay,
  orientation,
  highlightEdgeIndex,
}) => {
    const { camera, size, invalidate } = useThree();
    const solarSettings = useSolarAnalysisStore((s) => s.settings);
    // Pozycja słońca w południe równonocy (ta sama konwencja co domyślny render Masterplanu) —
    // podgląd 3D pokazuje cień fizycznie zgodny z tym, co widać w widoku 2D, zamiast zahardkodowanego kierunku światła.
    const sunDirection = useMemo(() => {
      const month = solarSettings.equinoxDate === 'autumn' ? 9 : 3;
      const day = solarSettings.equinoxDate === 'autumn' ? 23 : 21;
      const pos = calculateSolarPosition(solarSettings.latitude, solarSettings.longitude, month, day, 12.0);
      const dir = getSunDirection3D(pos.azimuthDeg, pos.elevationDeg);
      return new THREE.Vector3(dir.x, dir.y, dir.z).normalize();
    }, [solarSettings.latitude, solarSettings.longitude, solarSettings.equinoxDate]);
    const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
    const centerRef = useRef(new THREE.Vector3());
    const distanceRef = useRef(10);
    const tweenRafRef = useRef<number | null>(null);
    const [frameData, setFrameData] = useState<FrameData | null>(null);

    // Full geometry signature ensuring real-time live preview updates on any vertex/parameter change.
    // `orientation` jest częścią sygnatury, bo grubość linii (depth cueing) zależy od kierunku patrzenia.
    const geometrySignature = useMemo(() => {
      return (
        buildings.map(getBuildingGeometrySignature).join('||') +
        `_xray:${isXRay}_hl:${highlightEdgeIndex}_act:${activeBuildingId}_or:${orientation}`
      );
    }, [buildings, activeBuildingId, isXRay, highlightEdgeIndex, orientation]);

    const group = useMemo(() => {
      return buildGeometryGroup(
        buildings,
        activeBuildingId,
        isXRay,
        highlightEdgeIndex,
        orientation
      );
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [geometrySignature]);

    useEffect(() => {
      return () => {
        group.traverse((child) => {
          if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
            child.geometry.dispose();
          }
        });
        const materials = group.userData.materials as THREE.Material[] | undefined;
        materials?.forEach((m) => m.dispose());
      };
    }, [group]);

    // LineMaterial (fat lines) wymaga rozmiaru viewportu w pikselach do poprawnego przeliczenia
    // grubości linii - dopinamy realny rozmiar tutaj (przy tworzeniu geometrii ustawiana jest
    // tylko wartość startowa).
    useEffect(() => {
      if (!size || size.width <= 0 || size.height <= 0) return;
      group.traverse((child: any) => {
        if (child.material?.isLineMaterial) {
          child.material.resolution.set(size.width, size.height);
        }
      });
      invalidate();
    }, [group, size, invalidate]);

    // Auto-frame whenever geometry changes or viewport size updates. Środek/zasięg budynku są
    // liczone analitycznie z danych (getBuildingWorldInfo) - NIE z drzewa obiektów Three.js/matrixWorld.
    useEffect(() => {
      if (!size || size.width <= 0 || size.height <= 0) {
        return;
      }

      // Zasięg całej sceny (do dopasowania zoomu, obejmuje sąsiednie budynki grupy) - jedno
      // wywołanie na budynek, reużywane też dla aktywnego budynku poniżej zamiast liczyć go ponownie.
      let sceneMinX = Infinity, sceneMaxX = -Infinity, sceneMinY = Infinity, sceneMaxY = -Infinity;
      let sceneMinZ = Infinity, sceneMaxZ = -Infinity;
      let activeInfo: BuildingWorldInfo | null = null;
      const allPoints3D: { x: number; y: number; z: number }[] = [];

      for (const bldg of buildings) {
        const info = getBuildingWorldInfo(bldg);
        if (!info) continue;
        if (bldg.id === activeBuildingId) activeInfo = info;
        const ext = info.extent;
        if (ext.minX < sceneMinX) sceneMinX = ext.minX;
        if (ext.maxX > sceneMaxX) sceneMaxX = ext.maxX;
        if (ext.minY < sceneMinY) sceneMinY = ext.minY;
        if (ext.maxY > sceneMaxY) sceneMaxY = ext.maxY;
        if (ext.minZ < sceneMinZ) sceneMinZ = ext.minZ;
        if (ext.maxZ > sceneMaxZ) sceneMaxZ = ext.maxZ;

        const solids = getBuildingSolids(bldg);
        for (const s of solids) {
          for (const p of s.polygon) {
            allPoints3D.push({ x: p.x, y: s.hBottom, z: -p.y });
            allPoints3D.push({ x: p.x, y: s.hTop, z: -p.y });
          }
          for (const h of s.holes) {
            for (const p of h) {
              allPoints3D.push({ x: p.x, y: s.hBottom, z: -p.y });
              allPoints3D.push({ x: p.x, y: s.hTop, z: -p.y });
            }
          }
        }
      }
      if (!isFinite(sceneMinX) || allPoints3D.length === 0) {
        setFrameData(null);
        invalidate();
        return;
      }

      // Środek patrzenia/obrotu kamery liczymy z centroidu RZUTU (footprintu) aktywnego budynku,
      // a nie ze środka bounding-boxa całej wyekstrudowanej bryły 3D - dla budynków z asymetrycznymi
      // elementami (wykusz, uskok, ścięty narożnik...) środek bboxa jest systematycznie przesunięty
      // względem intuicyjnego środka budynku, co dawało "dziwny" pivot obrotu i dryfowanie budynku
      // w kadrze przy przesuwaniu go w CAD.
      const center = activeInfo
        ? new THREE.Vector3(activeInfo.centroid.x, (activeInfo.extent.minY + activeInfo.extent.maxY) / 2, activeInfo.centroid.z)
        : new THREE.Vector3((sceneMinX + sceneMaxX) / 2, (sceneMinY + sceneMaxY) / 2, (sceneMinZ + sceneMaxZ) / 2);

      // Promień wyliczamy jako maksymalną odległość 3D od środka kadru (rotation-invariant bounding sphere),
      // co zapobiega pulsowaniu/zmianie zoomu przy obrocie budynku w scenie.
      let maxDistSq = 0;
      for (const pt of allPoints3D) {
        const dx = pt.x - center.x;
        const dy = pt.y - center.y;
        const dz = pt.z - center.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq > maxDistSq) {
          maxDistSq = distSq;
        }
      }
      const safeRadius = Math.max(1, Math.sqrt(maxDistSq));

      centerRef.current.copy(center);
      distanceRef.current = Math.max(safeRadius * 2.6, 5);
      const hasUnderground = sceneMinY < -0.01;

      setFrameData({
        center: center.clone(),
        radius: safeRadius,
        groundY: isFinite(sceneMinY) ? sceneMinY : 0,
        hasUnderground,
      });

      const orthoCam = camera as THREE.OrthographicCamera;
      const worldExtent = safeRadius * 2;
      const viewportPx = Math.max(10, Math.min(size.width, size.height));
      const zoom = worldExtent > 0 ? (viewportPx * ISO_GEO.zoomMarginFactor) / worldExtent : 1;
      orthoCam.zoom = isFinite(zoom) && zoom > 0 ? zoom : 1;

      try {
        orthoCam.setViewOffset(
          size.width,
          size.height,
          0,
          Math.round(0.08 * size.height),
          size.width,
          size.height
        );
      } catch {
        orthoCam.clearViewOffset();
      }

      const offset = getIsoCameraOffset(orientation, distanceRef.current);
      camera.position.set(center.x + offset.x, center.y + offset.y, center.z + offset.z);
      camera.lookAt(center);
      orthoCam.near = 0.1;
      orthoCam.far = Math.max(distanceRef.current * 4, 30);
      orthoCam.updateProjectionMatrix();

      // Size the shadow camera's ortho frustum to fit this building
      const light = dirLightRef.current;
      if (light) {
        light.position.copy(center).addScaledVector(sunDirection, Math.max(safeRadius * 3.5, 8));
        light.target.position.copy(center);
        light.target.updateMatrixWorld();
        const extent = Math.max(safeRadius * 1.6, 2);
        const shadowCam = light.shadow.camera as THREE.OrthographicCamera;
        shadowCam.left = -extent;
        shadowCam.right = extent;
        shadowCam.top = extent;
        shadowCam.bottom = -extent;
        shadowCam.near = 0.1;
        shadowCam.far = Math.max(safeRadius * 8, 20);
        shadowCam.updateProjectionMatrix();
        light.shadow.bias = -0.0005;
        light.shadow.normalBias = Math.max(safeRadius * 0.01, 0.02);
        light.shadow.needsUpdate = true;
      }

      invalidate();
    }, [group, size.width, size.height, camera, orientation, invalidate, geometrySignature, sunDirection]);

    // Smoothly tween the camera to the newly selected orientation.
    const prevOrientationRef = useRef(orientation);
    useEffect(() => {
      if (prevOrientationRef.current === orientation) return;
      prevOrientationRef.current = orientation;

      if (tweenRafRef.current !== null) cancelAnimationFrame(tweenRafRef.current);

      const start = camera.position.clone();
      const offset = getIsoCameraOffset(orientation, distanceRef.current);
      const end = new THREE.Vector3(
        centerRef.current.x + offset.x,
        centerRef.current.y + offset.y,
        centerRef.current.z + offset.z
      );
      const durationMs = 250;
      const startTime = performance.now();

      const tick = (now: number) => {
        const t = Math.min(1, (now - startTime) / durationMs);
        const eased = easeInOutCubic(t);
        camera.position.lerpVectors(start, end, eased);
        camera.lookAt(centerRef.current);
        invalidate();
        if (t < 1) {
          tweenRafRef.current = requestAnimationFrame(tick);
        } else {
          tweenRafRef.current = null;
        }
      };
      tweenRafRef.current = requestAnimationFrame(tick);

      return () => {
        if (tweenRafRef.current !== null) cancelAnimationFrame(tweenRafRef.current);
      };
    }, [orientation, camera, invalidate]);

    return (
      <>
        <hemisphereLight
          color={ISO_COLORS.hemisphereSky}
          groundColor={ISO_COLORS.hemisphereGround}
          intensity={1.4}
        />
        <ambientLight intensity={0.65} />
        <directionalLight
          ref={dirLightRef}
          position={[8, 12, 5]}
          intensity={1.2}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <primitive object={group} />

        {frameData && (
          <mesh
            position={[frameData.center.x, 0, frameData.center.z]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
          >
            <planeGeometry args={[Math.max(frameData.radius * 12, 30), Math.max(frameData.radius * 12, 30)]} />
            <meshStandardMaterial
              color={ISO_COLORS.groundPlane}
              roughness={1}
              metalness={0}
              depthWrite={true}
              polygonOffset={true}
              polygonOffsetFactor={1}
              polygonOffsetUnits={1}
              transparent={isXRay}
              opacity={isXRay ? 0.35 : 1.0}
            />
          </mesh>
        )}
      </>
    );
  };

const CompassStrip: React.FC<{ orientation: IsoOrientation }> = ({ orientation }) => {
  const currentIndex = ORIENTATION_CYCLE.indexOf(orientation);
  const TRACK_STEPS = 9; // -4..+4 relative to current
  const items = Array.from({ length: TRACK_STEPS }, (_, i) => i - Math.floor(TRACK_STEPS / 2));

  return (
    <div className="iso-compass-strip">
      <div className="iso-compass-track-window">
        <div className="iso-compass-track">
          {items.map((offset) => {
            const idx = (currentIndex + offset + ORIENTATION_CYCLE.length * 100) % ORIENTATION_CYCLE.length;
            const isActive = offset === 0;
            return (
              <div key={`${offset}-${idx}`} className="iso-compass-item">
                <span className={`iso-compass-label${isActive ? ' active' : ''}`}>
                  {ORIENTATION_CYCLE[idx]}
                </span>
                <span className={`iso-compass-tick${isActive ? ' active' : ''}`} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const ORIENTATION_STORAGE_KEY = 'usi-light.preview.orientation';
const XRAY_STORAGE_KEY = 'usi-light.preview.xray';

export const BuildingIsoPreview: React.FC<BuildingIsoPreviewProps> = ({
  building,
  groupBuildings,
  highlightEdgeIndex,
  hideToolbar = false,
  overrideOrientation,
  overrideIsXRay,
}) => {
  const globalOrientation = useActionRecorderStore((s) => s.settings.pipOrientation);
  const globalIsXRay = useActionRecorderStore((s) => s.settings.pipIsXRay);
  const updateSettings = useActionRecorderStore((s) => s.updateSettings);

  const effectiveOrientation = overrideOrientation ?? globalOrientation ?? 'SW';
  const effectiveIsXRay = overrideIsXRay ?? globalIsXRay ?? false;

  const effectiveBuildings = useMemo(() => {
    if (groupBuildings && groupBuildings.length > 0) {
      return groupBuildings;
    }
    return [building];
  }, [groupBuildings, building]);

  const setOrientation = (next: IsoOrientation) => {
    updateSettings({ pipOrientation: next });
    try {
      localStorage.setItem(ORIENTATION_STORAGE_KEY, next);
    } catch {
      // Ignore storage failures
    }
  };

  const toggleXRay = () => {
    const next = !effectiveIsXRay;
    updateSettings({ pipIsXRay: next });
    try {
      localStorage.setItem(XRAY_STORAGE_KEY, String(next));
    } catch {
      // Ignore storage failures
    }
  };

  const rotate = (dir: 1 | -1) => {
    const idx = ORIENTATION_CYCLE.indexOf(effectiveOrientation);
    const next = ORIENTATION_CYCLE[(idx + dir + ORIENTATION_CYCLE.length) % ORIENTATION_CYCLE.length];
    setOrientation(next);
  };

  return (
    <div className="iso-preview-container">
      <div className="iso-preview-canvas-wrap">
        <Canvas
          frameloop="demand"
          shadows
          dpr={[1, 2]}
          gl={{
            preserveDrawingBuffer: true,
            antialias: true,
            toneMapping: THREE.NoToneMapping,
          }}
        >
          <DreiOrthographicCamera makeDefault position={[10, 10, 10]} near={0.1} far={1000} />
          <IsoScene
            buildings={effectiveBuildings}
            activeBuildingId={building.id}
            isXRay={effectiveIsXRay}
            orientation={effectiveOrientation}
            highlightEdgeIndex={highlightEdgeIndex}
          />
        </Canvas>
      </div>

      {/* Przełącznik trybu X-Ray (ukryty gdy hideToolbar = true) */}
      {!hideToolbar && (
        <button
          type="button"
          onClick={toggleXRay}
          title={effectiveIsXRay ? 'Wyłącz tryb X-Ray' : 'Włącz tryb X-Ray (kolory typów obiektów)'}
          className={`iso-preview-xray-btn${effectiveIsXRay ? ' active' : ''}`}
        >
          <Scan size={13} />
          <span>X-Ray</span>
        </button>
      )}

      {/* Legenda trybu X-Ray */}
      {effectiveIsXRay && (
        <div className="iso-preview-legend">
          <div className="iso-preview-legend-item">
            <span className="iso-preview-legend-dot residential" />
            <span>Mieszkalny</span>
          </div>
          <div className="iso-preview-legend-item">
            <span className="iso-preview-legend-dot service" />
            <span>Usługowy</span>
          </div>
          <div className="iso-preview-legend-item">
            <span className="iso-preview-legend-dot garage" />
            <span>Garaż</span>
          </div>
        </div>
      )}

      {/* Left/right halves of the viewport act as rotate buttons (45° per click). */}
      <button
        type="button"
        onClick={() => rotate(-1)}
        aria-label="Obróć w lewo"
        className="iso-preview-rotate-btn left"
      />
      <button
        type="button"
        onClick={() => rotate(1)}
        aria-label="Obróć w prawo"
        className="iso-preview-rotate-btn right"
      />

      {/* Compass strip: purely visual, ticks slide to reflect the current direction. */}
      <CompassStrip orientation={effectiveOrientation} />
    </div>
  );
};

export default BuildingIsoPreview;
