import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrthographicCamera as DreiOrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import { Scan } from 'lucide-react';
import type { BuildingLoop } from '@/types/geometry';
import { getBuildingSolids } from '@/engine/preview/buildingIsoGeometry';
import { miterOffsetPolygon } from '@/utils/math2d/miterOffset';
import { getIsoCameraOffset, type IsoOrientation } from './isoCameraPresets';
import { useActionRecorderStore } from '../../modules/action-recorder/useActionRecorderStore';

/** Clockwise cycle used for the left/right compass arrows, 45° per step. */
const ORIENTATION_CYCLE: IsoOrientation[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** White architectural-model tones — near-white with a faint tint by isTested. */
const COLOR_PROPOSED = '#ffffff';
const COLOR_EXISTING = '#f8fafc';
const STORY_LINE_COLOR = 0x1e293b;
const EDGE_ANGLE_THRESHOLD_DEG = 2;

export const XRAY_COLORS = {
  residential: '#6366f1', // Indygo / niebieski
  service: '#f59e0b',     // Bursztynowy / pomarańczowy
  garage: '#64748b',      // Szary / łupek
};

interface BuildingIsoPreviewProps {
  building: BuildingLoop;
  groupBuildings?: BuildingLoop[];
  highlightEdgeIndex?: number;
  highlightColor?: string;
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
  highlightColor: string = '#f59e0b'
): THREE.Group {
  const group = new THREE.Group();
  const createdMaterials: THREE.Material[] = [];

  buildings.forEach((bldg) => {
    const solids = getBuildingSolids(bldg);
    const bType = bldg.buildingType || 'residential';
    const typeColor = XRAY_COLORS[bType] || XRAY_COLORS.residential;

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

    // Widoczne linie ciągłe (LessEqualDepth)
    const storyLineMaterial = new THREE.LineBasicMaterial({
      color: isXRay ? 0x0f172a : STORY_LINE_COLOR,
      transparent: true,
      opacity: isXRay ? 0.8 : 0.5,
      linewidth: 1.5,
      depthFunc: THREE.LessEqualDepth,
      depthTest: true,
    });
    createdMaterials.push(storyLineMaterial);

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

      const visibleLines = new THREE.LineSegments(edges, storyLineMaterial);
      visibleLines.renderOrder = 2;
      solidGroup.add(visibleLines);

      const hiddenLines = new THREE.LineSegments(edges, dashedLineMaterial);
      hiddenLines.computeLineDistances();
      hiddenLines.renderOrder = 1;
      solidGroup.add(hiddenLines);

      // Podświetlenie wybranej krawędzi (tylko dla aktywnego budynku)
      if (bldg.id === activeBuildingId && highlightEdgeIndex !== undefined && highlightEdgeIndex >= 0) {
        const n = solid.polygon.length;
        if (n >= 3) {
          const targetIdx = highlightEdgeIndex < n ? highlightEdgeIndex : highlightEdgeIndex % n;
          const p1 = solid.polygon[targetIdx];
          const p2 = solid.polygon[(targetIdx + 1) % n];

          if (p1 && p2) {
            const highlightMat = new THREE.LineBasicMaterial({
              color: new THREE.Color(highlightColor),
              linewidth: 3,
              depthTest: false,
              transparent: true,
              opacity: 0.95,
            });
            createdMaterials.push(highlightMat);

            const pts = [
              new THREE.Vector3(p1.x, p1.y, 0.05),
              new THREE.Vector3(p2.x, p2.y, 0.05),
              new THREE.Vector3(p1.x, p1.y, outerDepth + 0.05),
              new THREE.Vector3(p2.x, p2.y, outerDepth + 0.05),
            ];
            const highlightGeo = new THREE.BufferGeometry().setFromPoints(pts);
            const highlightLines = new THREE.LineSegments(highlightGeo, highlightMat);
            highlightLines.renderOrder = 999;
            solidGroup.add(highlightLines);
          }
        }
      }

      group.add(solidGroup);
    });
  });

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

const IsoScene: React.FC<{
  buildings: BuildingLoop[];
  activeBuildingId?: string;
  isXRay: boolean;
  orientation: IsoOrientation;
  highlightEdgeIndex?: number;
  highlightColor?: string;
}> = ({
  buildings,
  activeBuildingId,
  isXRay,
  orientation,
  highlightEdgeIndex,
  highlightColor,
}) => {
  const { camera, size, invalidate } = useThree();
  const groupRef = useRef<THREE.Group | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const centerRef = useRef(new THREE.Vector3());
  const distanceRef = useRef(10);
  const tweenRafRef = useRef<number | null>(null);
  const [frameData, setFrameData] = useState<FrameData | null>(null);

  // Full geometry signature ensuring real-time live preview updates on any vertex/parameter change
  const geometrySignature = useMemo(() => {
    return (
      buildings.map(getBuildingGeometrySignature).join('||') +
      `_xray:${isXRay}_hl:${highlightEdgeIndex}_col:${highlightColor}_act:${activeBuildingId}`
    );
  }, [buildings, activeBuildingId, isXRay, highlightEdgeIndex, highlightColor]);

  const group = useMemo(() => {
    return buildGeometryGroup(
      buildings,
      activeBuildingId,
      isXRay,
      highlightEdgeIndex,
      highlightColor
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

  // Auto-frame whenever geometry changes or viewport size updates
  useEffect(() => {
    if (!size || size.width <= 0 || size.height <= 0) {
      return;
    }

    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) {
      setFrameData(null);
      invalidate();
      return;
    }

    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const safeRadius = Math.max(1, isNaN(sphere.radius) ? 10 : sphere.radius);

    centerRef.current.copy(center);
    distanceRef.current = Math.max(safeRadius * 2.6, 5);
    const hasUnderground = box.min.y < -0.01;

    setFrameData({
      center: center.clone(),
      radius: safeRadius,
      groundY: isFinite(box.min.y) ? box.min.y : 0,
      hasUnderground,
    });

    const orthoCam = camera as THREE.OrthographicCamera;
    const worldExtent = safeRadius * 2;
    const viewportPx = Math.max(10, Math.min(size.width, size.height));
    const zoom = worldExtent > 0 ? (viewportPx * 0.95) / worldExtent : 1;
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
  }, [group, size.width, size.height, camera, orientation, invalidate]);

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
  highlightColor,
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
            highlightColor={highlightColor}
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
