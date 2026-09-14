import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrthographicCamera as DreiOrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { Scan } from 'lucide-react';
import type { BuildingLoop } from '@/types/geometry';
import { getBuildingSolids } from '@/engine/preview/buildingIsoGeometry';
import { miterOffsetPolygon } from '@/utils/math2d/miterOffset';
import { getIsoCameraOffset, type IsoOrientation } from './isoCameraPresets';
import { getPolygonCentroid, getPolygonInteriorPoint } from '@/utils/math2d/polygons';
import { useActionRecorderStore } from '../../modules/action-recorder/useActionRecorderStore';

/** Clockwise cycle used for the left/right compass arrows, 45° per step. */
const ORIENTATION_CYCLE: IsoOrientation[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** White architectural-model tones — near-white with a faint tint by isTested. */
const COLOR_PROPOSED = '#ffffff';
const COLOR_EXISTING = '#f8fafc';
const STORY_LINE_COLOR = 0x1e293b;
const EDGE_ANGLE_THRESHOLD_DEG = 2;
/** Liczba przedziałów grubości linii wg głębokości względem kamery (depth cueing) - patrz [[musimy-naprawic-to-zolte-breezy-wind]]. */
const DEPTH_LINE_BUCKETS = 6;
const DEPTH_LINE_BASE_WIDTH = 2.8;
/** Najdalsza linia ma mieć 50% grubości najbliższej. */
const DEPTH_LINE_MIN_FACTOR = 0.5;
/** Linie dzielące fasadę na kondygnacje mają 50% grubości linii konturowych bryły. */
const STORY_DIVIDER_FACTOR = 0.5;
/** Mnożnik marginesu kadru auto-fit - ustalony testowo (0.95 bazowe * 1.1 dobrane empirycznie). */
const ZOOM_MARGIN_FACTOR = 1.4;
/** Wstęga podświetlenia wybranej krawędzi modyfikatora - zawsze fioletowa (token --accent-purple). */
const HIGHLIGHT_RIBBON_COLOR = '#c084fc';
const RIBBON_WIDTH = 3.0;

export const XRAY_COLORS = {
  residential: '#6366f1', // Indygo / niebieski
  service: '#f59e0b',     // Bursztynowy / pomarańczowy
  garage: '#64748b',      // Szary / łupek
};

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
  // krawędzi względem kamery (depth cueing grubości linii) - patrz [[musimy-naprawic-to-zolte-breezy-wind]].
  const camDirOffset = getIsoCameraOffset(orientation, 1);
  const viewDirWorld = new THREE.Vector3(camDirOffset.x, camDirOffset.y, camDirOffset.z).normalize();

  // Zbierane w pierwszym przebiegu (per solidGroup) do globalnej normalizacji głębokości oraz
  // klasyfikacji kontur/podział kondygnacji (patrz [[musimy-naprawic-to-zolte-breezy-wind]]).
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
  const storyLineColor = isXRay ? 0x0f172a : STORY_LINE_COLOR;
  const storyLineOpacity = isXRay ? 0.8 : 0.5;

  buildings.forEach((bldg) => {
    const solids = getBuildingSolids(bldg);
    const bType = bldg.buildingType || 'residential';
    const typeColor = XRAY_COLORS[bType] || XRAY_COLORS.residential;
    // Wstęga podświetlenia krawędzi ma się pojawić tylko na najniższej kondygnacji budynku.
    const minHBottomForBuilding = solids.length > 0 ? Math.min(...solids.map((s) => s.hBottom)) : 0;

    // Materiał powłoki zewnętrznej
    const outerMaterial = new THREE.MeshStandardMaterial({
      color: isXRay ? '#ffffff' : (bldg.isTested ? COLOR_PROPOSED : COLOR_EXISTING),
      roughness: isXRay ? 0.3 : 0.85,
      metalness: isXRay ? 0.05 : 0.05,
      transparent: isXRay,
      opacity: isXRay ? 0.5 : 1.0,
      depthWrite: !isXRay,
      side: THREE.DoubleSide,
    });
    createdMaterials.push(outerMaterial);

    // Materiał wewnętrznych kondygnacji w trybie X-Ray (kolor zgodny z typem, kryjący)
    const innerMaterial = isXRay
      ? new THREE.MeshStandardMaterial({
        color: typeColor,
        roughness: 0.35,
        metalness: 0.05,
        transparent: false,
        opacity: 1.0,
        depthWrite: true,
        side: THREE.DoubleSide,
      })
      : null;
    if (innerMaterial) {
      createdMaterials.push(innerMaterial);
    }

    // Ukryte / podziemne linie przerywane (GreaterDepth)
    const dashedLineMaterial = new THREE.LineDashedMaterial({
      color: isXRay ? 0x334155 : 0x94a3b8,
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
      if (isXRay && innerMaterial) {
        const innerPolygon = miterOffsetPolygon(solid.polygon, -0.4);
        const innerHoles = (solid.holes ?? []).map((h) => miterOffsetPolygon(h, 0.4));
        const innerShape = pointsToPath(innerPolygon, new THREE.Shape());
        for (const hole of innerHoles) {
          innerShape.holes.push(pointsToPath(hole, new THREE.Path()));
        }

        const innerDepth = Math.max(0.05, outerDepth - 0.4);
        const innerGeometry = new THREE.ExtrudeGeometry(innerShape, { depth: innerDepth, bevelEnabled: false });
        const innerMesh = new THREE.Mesh(innerGeometry, innerMaterial);
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
      const edges = new THREE.EdgesGeometry(outerGeometry, EDGE_ANGLE_THRESHOLD_DEG);

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
        // wyprowadzenie w [[musimy-naprawic-to-zolte-breezy-wind]] (solidGroup.rotation.x = -PI/2).
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
      // najniższej kondygnacji - patrz [[musimy-naprawic-to-zolte-breezy-wind]]). Odnajdywana przez
      // DZIEDZICZONE ID (`solid.edgeOrigins`, patrz StoryFootprint.edgeOrigins) — ten sam mechanizm,
      // którego używa silnik modyfikatorów do rozwiązywania `edgeIndex` — a nie surowy indeks
      // pozycyjny (`% n`), który na różnych kondygnacjach (o różnych, niezależnie zmodyfikowanych
      // kształtach) może wskazywać zupełnie inne, niepowiązane krawędzie. Gdy dana kondygnacja nie
      // zawiera już tej ściany (np. wycięta bramą) albo `edgeOrigins` nie jest dostępne, podświetlenie
      // jest pomijane zamiast zawijać się na przypadkową krawędź.
      if (
        bldg.id === activeBuildingId &&
        highlightEdgeIndex !== undefined &&
        highlightEdgeIndex >= 0 &&
        solid.hBottom === minHBottomForBuilding
      ) {
        const n = solid.polygon.length;
        // Brak `edgeOrigins` (np. budynek bez modyfikatorów, albo scena zapisana przed wprowadzeniem
        // tego pola) -> brak informacji o dziedziczeniu, spadamy na dawne zachowanie pozycyjne zamiast
        // milcząco gubić podświetlenie. Gdy `edgeOrigins` JEST dostępne, ufamy mu w pełni: brak wpisu
        // oznacza, że ta kondygnacja naprawdę nie zawiera już tej ściany.
        const targetIdx = solid.edgeOrigins
          ? solid.edgeOrigins.indexOf(highlightEdgeIndex)
          : highlightEdgeIndex % Math.max(n, 1);
        if (n >= 3 && targetIdx >= 0) {
          const p1 = solid.polygon[targetIdx];
          const p2 = solid.polygon[(targetIdx + 1) % n];

          if (p1 && p2) {
            // Wektor prostopadły do krawędzi, skierowany na zewnątrz obrysu (porównanie ze
            // znanym punktem wewnętrznym wielokąta - jeśli normalna wskazuje w jego stronę, odwracamy ją).
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
            const outX = p1.x + nx * RIBBON_WIDTH, outY = p1.y + ny * RIBBON_WIDTH;
            const out2X = p2.x + nx * RIBBON_WIDTH, out2Y = p2.y + ny * RIBBON_WIDTH;

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
              color: new THREE.Color(HIGHLIGHT_RIBBON_COLOR),
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
  // przedziałów grubości wg znormalizowanej głębokości względem kamery (najbliższe = grubsze,
  // najdalsze = DEPTH_LINE_MIN_FACTOR grubości najbliższych), niezależnie dla dwóch warstw:
  // kontur bryły (narożniki pionowe + linia dachu/gruntu) - grubszy, i podziały kondygnacji
  // (poziome linie międzypiętrowe) - STORY_DIVIDER_FACTOR grubości konturu - przybliżenie zamiast
  // pełnego cieniowania per-wierzchołek, patrz [[musimy-naprawic-to-zolte-breezy-wind]].
  const depthRange = globalMaxDepth - globalMinDepth;
  const Y_RANGE_EPS = Math.max(Y_EPS, (globalMaxY - globalMinY) * 1e-4);
  for (const bucket of pendingEdgeBuckets) {
    const segmentCount = bucket.depths.length;
    // [warstwa][bucket głębokości] -> tablica pozycji
    const bucketedPositions: number[][][] = [
      Array.from({ length: DEPTH_LINE_BUCKETS }, () => []),
      Array.from({ length: DEPTH_LINE_BUCKETS }, () => []),
    ];
    for (let s = 0; s < segmentCount; s++) {
      const hy = bucket.horizontalY[s];
      const isContour =
        hy === null ||
        Math.abs(hy - globalMinY) < Y_RANGE_EPS ||
        Math.abs(hy - globalMaxY) < Y_RANGE_EPS;
      const layer = isContour ? 0 : 1;

      const t = depthRange > 1e-6 ? (bucket.depths[s] - globalMinDepth) / depthRange : 1;
      const bucketIdx = Math.min(DEPTH_LINE_BUCKETS - 1, Math.max(0, Math.floor(t * DEPTH_LINE_BUCKETS)));
      const base = s * 6;
      const arr = bucketedPositions[layer][bucketIdx];
      for (let k = 0; k < 6; k++) arr.push(bucket.positions[base + k]);
    }

    for (let layer = 0; layer < 2; layer++) {
      const layerFactor = layer === 0 ? 1 : STORY_DIVIDER_FACTOR;
      for (let b = 0; b < DEPTH_LINE_BUCKETS; b++) {
        const posArr = bucketedPositions[layer][b];
        if (posArr.length === 0) continue;
        // t reprezentuje środek przedziału (b=0 najdalszy, b=DEPTH_LINE_BUCKETS-1 najbliższy).
        const bucketT = (b + 0.5) / DEPTH_LINE_BUCKETS;
        const depthFactor = DEPTH_LINE_MIN_FACTOR + (1 - DEPTH_LINE_MIN_FACTOR) * bucketT;

        const lineGeo = new LineSegmentsGeometry();
        lineGeo.setPositions(posArr);
        const lineMat = new LineMaterial({
          color: storyLineColor,
          transparent: true,
          opacity: storyLineOpacity,
          linewidth: DEPTH_LINE_BASE_WIDTH * layerFactor * depthFactor,
          depthFunc: THREE.LessEqualDepth,
          depthTest: true,
        });
        // resolution jest wymagana przez LineMaterial - realny rozmiar viewportu jest dopinany
        // w IsoScene (useEffect po `size` z useThree), tu tylko wartość startowa.
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

/**
 * Zasięg świata budynku liczony WYŁĄCZNIE z danych geometrycznych (getBuildingSolids), bez
 * dotykania drzewa obiektów Three.js/matrixWorld - środek/zasięg są właściwością samego obiektu,
 * nie czymś odwrotnie wyliczanym z wyrenderowanej sceny - patrz [[musimy-naprawic-to-zolte-breezy-wind]].
 */
function getBuildingWorldExtent(bldg: BuildingLoop): WorldExtent | null {
  const solids = getBuildingSolids(bldg);
  if (solids.length === 0) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const solid of solids) {
    for (const p of solid.polygon) {
      // Lokalne (x,y) rzutu -> świat (Y-up): worldX = x, worldZ = -y.
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (-p.y < minZ) minZ = -p.y;
      if (-p.y > maxZ) maxZ = -p.y;
    }
    if (solid.hBottom < minY) minY = solid.hBottom;
    if (solid.hTop > maxY) maxY = solid.hTop;
  }
  return isFinite(minX) ? { minX, maxX, minY, maxY, minZ, maxZ } : null;
}

/** Centroid rzutu (najniższej kondygnacji) budynku w świecie - X/Z. */
function getBuildingWorldCentroid(bldg: BuildingLoop): { x: number; z: number } | null {
  const solids = getBuildingSolids(bldg);
  if (solids.length === 0) return null;
  const baseSolid = solids.reduce((min, s) => (s.hBottom < min.hBottom ? s : min), solids[0]);
  if (baseSolid.polygon.length < 3) return null;
  const c = getPolygonCentroid(baseSolid.polygon);
  return { x: c.x, z: -c.y };
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
    const groupRef = useRef<THREE.Group | null>(null);
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
    // liczone analitycznie z danych (getBuildingWorldExtent/getBuildingWorldCentroid) - NIE z
    // drzewa obiektów Three.js/matrixWorld - patrz [[musimy-naprawic-to-zolte-breezy-wind]].
    useEffect(() => {
      if (!size || size.width <= 0 || size.height <= 0) {
        return;
      }

      // Zasięg całej sceny (do dopasowania zoomu, obejmuje sąsiednie budynki grupy).
      let sceneMinX = Infinity, sceneMaxX = -Infinity, sceneMinY = Infinity, sceneMaxY = -Infinity;
      let sceneMinZ = Infinity, sceneMaxZ = -Infinity;
      for (const bldg of buildings) {
        const ext = getBuildingWorldExtent(bldg);
        if (!ext) continue;
        if (ext.minX < sceneMinX) sceneMinX = ext.minX;
        if (ext.maxX > sceneMaxX) sceneMaxX = ext.maxX;
        if (ext.minY < sceneMinY) sceneMinY = ext.minY;
        if (ext.maxY > sceneMaxY) sceneMaxY = ext.maxY;
        if (ext.minZ < sceneMinZ) sceneMinZ = ext.minZ;
        if (ext.maxZ > sceneMaxZ) sceneMaxZ = ext.maxZ;
      }
      if (!isFinite(sceneMinX)) {
        setFrameData(null);
        invalidate();
        return;
      }

      // Środek patrzenia/obrotu kamery liczymy z centroidu RZUTU (footprintu) aktywnego budynku,
      // a nie ze środka bounding-boxa całej wyekstrudowanej bryły 3D - dla budynków z asymetrycznymi
      // elementami (wykusz, uskok, ścięty narożnik...) środek bboxa jest systematycznie przesunięty
      // względem intuicyjnego środka budynku, co dawało "dziwny" pivot obrotu i dryfowanie budynku
      // w kadrze przy przesuwaniu go w CAD - patrz [[musimy-naprawic-to-zolte-breezy-wind]].
      const activeBuilding = buildings.find((b) => b.id === activeBuildingId);
      const activeCentroid = activeBuilding ? getBuildingWorldCentroid(activeBuilding) : null;
      const activeExtent = activeBuilding ? getBuildingWorldExtent(activeBuilding) : null;

      const center = activeCentroid && activeExtent
        ? new THREE.Vector3(activeCentroid.x, (activeExtent.minY + activeExtent.maxY) / 2, activeCentroid.z)
        : new THREE.Vector3((sceneMinX + sceneMaxX) / 2, (sceneMinY + sceneMaxY) / 2, (sceneMinZ + sceneMaxZ) / 2);

      // Promień musi obejmować całą scenę (np. sąsiednie budynki grupy), ale liczony względem
      // NOWEGO środka (centroid rzutu aktywnego budynku), nie środka pełnego zasięgu sceny.
      const sceneHalfSize = new THREE.Vector3(
        (sceneMaxX - sceneMinX) / 2,
        (sceneMaxY - sceneMinY) / 2,
        (sceneMaxZ - sceneMinZ) / 2
      );
      const sceneCenter = new THREE.Vector3((sceneMinX + sceneMaxX) / 2, (sceneMinY + sceneMaxY) / 2, (sceneMinZ + sceneMaxZ) / 2);
      const centerOffset = sceneCenter.distanceTo(center);
      const rawRadius = sceneHalfSize.length() + centerOffset;
      const safeRadius = Math.max(1, isNaN(rawRadius) ? 10 : rawRadius);

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
      const zoom = worldExtent > 0 ? (viewportPx * ZOOM_MARGIN_FACTOR) / worldExtent : 1;
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
        const dir = new THREE.Vector3(0.55, 1, 0.4).normalize();
        light.position.copy(center).addScaledVector(dir, Math.max(safeRadius * 3.5, 8));
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
    }, [group, size.width, size.height, camera, orientation, invalidate, buildings, activeBuildingId]);

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
        <hemisphereLight color="#ffffff" groundColor="#cbd5e1" intensity={1.4} />
        <ambientLight intensity={0.65} />
        <directionalLight
          ref={dirLightRef}
          position={[8, 12, 5]}
          intensity={1.2}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <primitive ref={groupRef} object={group} />

        {frameData && (
          <mesh
            position={[frameData.center.x, 0, frameData.center.z]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
          >
            <planeGeometry args={[Math.max(frameData.radius * 12, 30), Math.max(frameData.radius * 12, 30)]} />
            <meshStandardMaterial
              color="#eeeeee"
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
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: '8px',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 6px',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '150px',
          height: '20px',
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            display: 'flex',
            alignItems: 'flex-start',
            transform: 'translateX(-50%)',
            transition: 'transform 220ms ease-out',
          }}
        >
          {items.map((offset) => {
            const idx = (currentIndex + offset + ORIENTATION_CYCLE.length * 100) % ORIENTATION_CYCLE.length;
            const isActive = offset === 0;
            return (
              <div
                key={`${offset}-${idx}`}
                style={{
                  width: '30px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    fontSize: isActive ? '10px' : '9px',
                    fontWeight: isActive ? 700 : 500,
                    letterSpacing: '0.06em',
                    color: isActive ? '#1a1a1a' : 'rgba(0, 0, 0, 0.45)',
                    lineHeight: 1,
                  }}
                >
                  {ORIENTATION_CYCLE[idx]}
                </span>
                <span
                  style={{
                    marginTop: '3px',
                    width: '1px',
                    height: isActive ? '6px' : '4px',
                    backgroundColor: isActive ? '#1a1a1a' : 'rgba(0, 0, 0, 0.25)',
                  }}
                />
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

function loadStoredOrientation(): IsoOrientation {
  try {
    const stored = localStorage.getItem(ORIENTATION_STORAGE_KEY);
    if (stored && (ORIENTATION_CYCLE as string[]).includes(stored)) {
      return stored as IsoOrientation;
    }
  } catch {
    // localStorage unavailable
  }
  return 'SW';
}

function loadStoredXRay(): boolean {
  try {
    return localStorage.getItem(XRAY_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

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
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '4 / 3',
        borderRadius: '12px',
        overflow: 'hidden',
        backgroundColor: '#eeeeee',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
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
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '5px 8px',
            borderRadius: '6px',
            border: effectiveIsXRay ? '1px solid #6366f1' : '1px solid rgba(0, 0, 0, 0.15)',
            backgroundColor: effectiveIsXRay ? 'rgba(99, 102, 241, 0.9)' : 'rgba(255, 255, 255, 0.85)',
            color: effectiveIsXRay ? '#ffffff' : '#334155',
            backdropFilter: 'blur(4px)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
            cursor: 'pointer',
            fontSize: '10.5px',
            fontWeight: 600,
          }}
        >
          <Scan size={13} />
          <span>X-Ray</span>
        </button>
      )}

      {/* Legenda trybu X-Ray */}
      {effectiveIsXRay && (
        <div
          style={{
            position: 'absolute',
            top: '8px',
            left: '8px',
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
            padding: '5px 7px',
            borderRadius: '6px',
            backgroundColor: 'rgba(255, 255, 255, 0.88)',
            border: '1px solid rgba(0, 0, 0, 0.1)',
            backdropFilter: 'blur(4px)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
            fontSize: '9.5px',
            pointerEvents: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#1e293b' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '2px', backgroundColor: '#6366f1' }} />
            <span>Mieszkalny</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#1e293b' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '2px', backgroundColor: '#f59e0b' }} />
            <span>Usługowy</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#1e293b' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '2px', backgroundColor: '#64748b' }} />
            <span>Garaż</span>
          </div>
        </div>
      )}

      {/* Left/right halves of the viewport act as rotate buttons (45° per click). */}
      <button
        type="button"
        onClick={() => rotate(-1)}
        aria-label="Obróć w lewo"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '50%',
          height: '100%',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          padding: 0,
        }}
      />
      <button
        type="button"
        onClick={() => rotate(1)}
        aria-label="Obróć w prawo"
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          width: '50%',
          height: '100%',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          padding: 0,
        }}
      />

      {/* Compass strip: purely visual, ticks slide to reflect the current direction. */}
      <CompassStrip orientation={effectiveOrientation} />
    </div>
  );
};

export default BuildingIsoPreview;
