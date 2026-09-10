import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrthographicCamera as DreiOrthographicCamera, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { BuildingLoop } from '@/types/geometry';
import { getBuildingSolids } from '@/engine/preview/buildingIsoGeometry';
import { getIsoCameraOffset, type IsoOrientation } from './isoCameraPresets';

/** Clockwise cycle used for the left/right compass arrows, 45° per step. */
const ORIENTATION_CYCLE: IsoOrientation[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** White architectural-model tones — near-white with a faint tint by isTested. */
const COLOR_PROPOSED = '#ffffff';
const COLOR_EXISTING = '#fbfaf9';
const STORY_LINE_COLOR = 0x000000;
const EDGE_ANGLE_THRESHOLD_DEG = 2;

interface BuildingIsoPreviewProps {
  building: BuildingLoop;
}

interface FrameInfo {
  center: THREE.Vector3;
  radius: number;
  groundY: number;
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

function buildGeometryGroup(building: BuildingLoop): THREE.Group {
  const group = new THREE.Group();
  const solids = getBuildingSolids(building);
  const material = new THREE.MeshStandardMaterial({
    color: building.isTested ? COLOR_PROPOSED : COLOR_EXISTING,
    roughness: 1,
    metalness: 0,
  });
  const storyLineMaterial = new THREE.LineBasicMaterial({
    color: STORY_LINE_COLOR,
    transparent: true,
    opacity: 0.45,
    linewidth: 2,
  });

  solids.forEach((solid) => {
    const shape = pointsToPath(solid.polygon, new THREE.Shape());
    for (const hole of solid.holes) {
      shape.holes.push(pointsToPath(hole, new THREE.Path()));
    }

    const depth = solid.hTop - solid.hBottom;
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Per-solid local group: everything below (mesh + its edge lines) is
    // built in the same local XY-extruded-along-Z space, and this single
    // group carries the one CAD-ground-plane -> Y-up transform. That way
    // lines can never drift out of sync with the mesh they outline.
    const solidGroup = new THREE.Group();
    solidGroup.rotation.x = -Math.PI / 2;
    solidGroup.position.y = solid.hBottom;
    solidGroup.add(mesh);

    // Full edge contour (top/bottom caps, outer vertical corners, and —
    // unlike the old manual loop/vertical-line approach — the inner walls
    // of any courtyard/hole) traced directly off the real geometry, as a
    // child of the same local group as the mesh it outlines.
    const edges = new THREE.EdgesGeometry(geometry, EDGE_ANGLE_THRESHOLD_DEG);
    solidGroup.add(new THREE.LineSegments(edges, storyLineMaterial));

    group.add(solidGroup);
  });

  group.userData.material = material;
  group.userData.storyLineMaterial = storyLineMaterial;
  return group;
}

/**
 * Lightweight screen-space ambient occlusion, built from three.js's own
 * `examples/jsm/postprocessing` modules (already part of the installed
 * `three` package — no extra dependency). Renders via a manual
 * EffectComposer instead of R3F's default render call (a `useFrame`
 * priority > 0 hands rendering control to us); still fully compatible with
 * `frameloop="demand"` — `invalidate()` schedules one frame, and this
 * `useFrame` runs within it.
 */
const AOComposer: React.FC<{ radius: number }> = ({ radius }) => {
  const { gl, scene, camera, size, invalidate } = useThree();
  const composerRef = useRef<EffectComposer | null>(null);
  const ssaoRef = useRef<SSAOPass | null>(null);

  useEffect(() => {
    const composer = new EffectComposer(gl);
    const renderPass = new RenderPass(scene, camera);
    const ssaoPass = new SSAOPass(scene, camera, size.width, size.height);
    ssaoPass.output = SSAOPass.OUTPUT.Default;
    // SSAOShader defaults to a perspective depth-reconstruction formula;
    // our preview only ever uses an orthographic camera, so without this
    // the occlusion term comes out ~fully occluded everywhere (black model).
    ssaoPass.ssaoMaterial.defines['PERSPECTIVE_CAMERA'] = 0;
    ssaoPass.ssaoMaterial.needsUpdate = true;
    ssaoPass.depthRenderMaterial.defines['PERSPECTIVE_CAMERA'] = 0;
    ssaoPass.depthRenderMaterial.needsUpdate = true;
    composer.addPass(renderPass);
    composer.addPass(ssaoPass);
    composer.addPass(new OutputPass());
    composer.setSize(size.width, size.height);

    composerRef.current = composer;
    ssaoRef.current = ssaoPass;
    invalidate();

    return () => {
      composer.dispose();
      composerRef.current = null;
      ssaoRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera]);

  useEffect(() => {
    composerRef.current?.setSize(size.width, size.height);
    const ssao = ssaoRef.current;
    if (ssao) {
      // Tuned relative to the building's own scale (bounding-sphere radius)
      // instead of fixed units, so AO reads consistently across small and
      // large buildings alike.
      ssao.kernelRadius = Math.max(radius * 0.25, 0.4);
      ssao.minDistance = 0.0003;
      ssao.maxDistance = Math.max(radius * 0.05, 0.015);
    }
    invalidate();
  }, [size.width, size.height, radius, invalidate]);

  useFrame(() => {
    composerRef.current?.render();
  }, 1);

  return null;
};

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const IsoScene: React.FC<{
  building: BuildingLoop;
  orientation: IsoOrientation;
  onFrame: (frame: FrameInfo | null) => void;
}> = ({ building, orientation, onFrame }) => {
  const { camera, size, invalidate } = useThree();
  const groupRef = useRef<THREE.Group | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const centerRef = useRef(new THREE.Vector3());
  const distanceRef = useRef(10);
  const tweenRafRef = useRef<number | null>(null);
  const [radius, setRadius] = useState(10);

  const group = useMemo(() => buildGeometryGroup(building), [
    building.storyPolygons,
    building.vertices,
    building.elevation,
    building.defaultHeight,
    building.isTested,
    building.transform?.rotationDeg,
  ]);

  useEffect(() => {
    return () => {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
          child.geometry.dispose();
        }
      });
      const mat = group.userData.material as THREE.Material | undefined;
      mat?.dispose();
      const storyLineMat = group.userData.storyLineMaterial as THREE.Material | undefined;
      storyLineMat?.dispose();
    };
  }, [group]);

  // Auto-frame whenever geometry changes.
  useEffect(() => {
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) {
      onFrame(null);
      invalidate();
      return;
    }
    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    centerRef.current.copy(center);
    distanceRef.current = Math.max(sphere.radius * 2.6, 1);
    onFrame({ center: center.clone(), radius: sphere.radius, groundY: box.min.y });
    setRadius(sphere.radius);

    const orthoCam = camera as THREE.OrthographicCamera;
    const worldExtent = sphere.radius * 2;
    const viewportPx = Math.min(size.width, size.height);
    const zoom = worldExtent > 0 ? (viewportPx * 0.999) / worldExtent : 1;
    orthoCam.zoom = zoom;
    // Shift the framed object up by 15% of the viewport height.
    orthoCam.setViewOffset(size.width, size.height, 0, 0.08 * size.height, size.width, size.height);

    const offset = getIsoCameraOffset(orientation, distanceRef.current);
    camera.position.set(center.x + offset.x, center.y + offset.y, center.z + offset.z);
    camera.lookAt(center);
    // Keep the near/far range tight around the building (rather than the
    // generic 0.1..1000 default) so the depth buffer SSAO reads from has
    // enough precision to produce a visible effect at this small scale.
    orthoCam.near = 0.1;
    orthoCam.far = Math.max(distanceRef.current * 3, 10);
    orthoCam.updateProjectionMatrix();

    // Size the shadow camera's ortho frustum to fit this building, and aim
    // the light at its center, so self-shadowing (e.g. a setback storey
    // shadowing the terrace/roof below it) stays crisp regardless of scale.
    const light = dirLightRef.current;
    if (light) {
      const dir = new THREE.Vector3(0.55, 1, 0.4).normalize();
      light.position.copy(center).addScaledVector(dir, Math.max(sphere.radius * 4, 4));
      light.target.position.copy(center);
      light.target.updateMatrixWorld();
      const extent = Math.max(sphere.radius * 1.5, 1);
      const shadowCam = light.shadow.camera as THREE.OrthographicCamera;
      shadowCam.left = -extent;
      shadowCam.right = extent;
      shadowCam.top = extent;
      shadowCam.bottom = -extent;
      shadowCam.near = 0.1;
      shadowCam.far = Math.max(sphere.radius * 8, 8);
      shadowCam.updateProjectionMatrix();
      light.shadow.bias = -0.0005;
      light.shadow.normalBias = Math.max(sphere.radius * 0.01, 0.02);
      light.shadow.needsUpdate = true;
    }

    invalidate();
    // orientation intentionally excluded: geometry changes should keep the
    // current orientation; the dedicated effect below handles orientation switches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, size.width, size.height, camera, invalidate, onFrame]);

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
      <hemisphereLight color="#ffffff" groundColor="#f6f6f6" intensity={1.25} />
      <ambientLight intensity={0.7} />
      <directionalLight ref={dirLightRef} position={[6, 10, 4]} intensity={0.32} castShadow />
      <primitive ref={groupRef} object={group} />
      <AOComposer radius={radius} />
    </>
  );
};

const CompassStrip: React.FC<{ orientation: IsoOrientation }> = ({ orientation }) => {
  const currentIndex = ORIENTATION_CYCLE.indexOf(orientation);
  // Render a wider band of ticks/labels than fits, offset so the current
  // direction sits centered — mimicking a scrolling compass tape.
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

function loadStoredOrientation(): IsoOrientation {
  try {
    const stored = localStorage.getItem(ORIENTATION_STORAGE_KEY);
    if (stored && (ORIENTATION_CYCLE as string[]).includes(stored)) {
      return stored as IsoOrientation;
    }
  } catch {
    // localStorage unavailable (private mode, etc.) — fall back to default.
  }
  return 'SW';
}

export const BuildingIsoPreview: React.FC<BuildingIsoPreviewProps> = ({ building }) => {
  const [orientation, setOrientationState] = useState<IsoOrientation>(loadStoredOrientation);
  const [frame, setFrame] = useState<FrameInfo | null>(null);

  const setOrientation = (next: IsoOrientation) => {
    setOrientationState(next);
    try {
      localStorage.setItem(ORIENTATION_STORAGE_KEY, next);
    } catch {
      // Ignore storage failures — the orientation still applies for this session.
    }
  };

  const rotate = (dir: 1 | -1) => {
    const idx = ORIENTATION_CYCLE.indexOf(orientation);
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
        <Canvas frameloop="demand" shadows dpr={[1, 2]} gl={{ antialias: true, toneMapping: THREE.NoToneMapping }}>
          <DreiOrthographicCamera makeDefault position={[10, 10, 10]} near={0.1} far={1000} />
          <IsoScene building={building} orientation={orientation} onFrame={setFrame} />
          {frame ? (
            <>
              {/* Crisp, real directional shadow cast onto the base plane.
                    Invisible everywhere except where a shadow actually falls. */}
              <mesh
                position={[frame.center.x, frame.groundY, frame.center.z]}
                rotation={[-Math.PI / 2, 0, 0]}
                receiveShadow
              >
                <planeGeometry args={[Math.max(frame.radius * 8, 4), Math.max(frame.radius * 8, 4)]} />
                <shadowMaterial opacity={0.28} />
              </mesh>
              {/* Soft blurred contact AO right at the base, complementing the crisp cast shadow above. */}
              <ContactShadows
                position={[frame.center.x, frame.groundY + 0.01, frame.center.z]}
                opacity={0.5}
                scale={Math.max(frame.radius * 3, 1)}
                blur={2.2}
                far={Math.max(frame.radius * 1.5, 1)}
                resolution={256}
                frames={1}
              />
            </>
          ) : null}
        </Canvas>
      </div>

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
      <CompassStrip orientation={orientation} />
    </div>
  );
};

export default BuildingIsoPreview;
