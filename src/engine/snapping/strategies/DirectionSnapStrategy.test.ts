import { describe, it, expect } from 'vitest';
import { calculateDirectionSnap, collectTargetDirections } from './DirectionSnapStrategy';
import { Point2D, BuildingLoop, FacadeSegment } from '../../../types/geometry';

const PX_PER_METER = 20;
function worldToScreen(wx: number, wy: number) {
  return { sx: wx * PX_PER_METER, sy: wy * PX_PER_METER };
}

function makeSegment(p1: Point2D, p2: Point2D, id = 'seg'): FacadeSegment {
  return {
    id,
    p1,
    p2,
    normal: { x: 0, y: -1 },
    length: Math.hypot(p2.x - p1.x, p2.y - p1.y),
    angleRad: Math.atan2(p2.y - p1.y, p2.x - p1.x),
    hTop: 10,
    hWindowBottom: 0.85,
    isCityCentre: false,
    buildingType: 'residential',
  };
}

function makeBuilding(overrides: Partial<BuildingLoop> & { id: string; segments: FacadeSegment[] }): BuildingLoop {
  return {
    name: overrides.id,
    layer: 'default',
    isTested: false,
    isCityCentre: false,
    buildingType: 'residential',
    defaultHeight: 10,
    hWindowBottom: 0.85,
    vertices: [],
    transform: { tx: 0, ty: 0, rotationDeg: 0 },
    ...overrides,
  };
}

// Faza C usunęła per-mode gating (otrackModes.ortho/.dominant/.relative/.dualIntersection) z
// calculateDirectionSnap/collectTargetDirections — OTRACK jest teraz wyłącznie grupową flagą
// (SnapContext.isDirectionSnappingActive), sprawdzaną raz w DirectionSnapStrategy.findSnap()
// PRZED wywołaniem calculateDirectionSnap. Wszystkie źródła kierunków (ortho/dominant/relative/
// dual-guide) są więc zawsze aktywne wewnątrz calculateDirectionSnap samego w sobie.
describe('DirectionSnapStrategy - grupowa flaga OTRACK (isDirectionSnappingActive)', () => {
  const originPoint: Point2D = { x: 0, y: 0 };
  const dummyBuildings: BuildingLoop[] = [];

  it('snaps to Ortho 0° (zawsze aktywne wewnątrz calculateDirectionSnap)', () => {
    const snap = calculateDirectionSnap({
      currentMouseWorld: { x: 10, y: 0.1 },
      originPoint,
      buildings: dummyBuildings,
    });

    expect(snap).not.toBeNull();
    expect(snap?.guideAngleDeg).toBe(0);
  });

  it('snaps to dominant direction gdy dostępna jest dominantDirections', () => {
    const dominantDirections = [{ angleDeg: 35.0, orthogonalDeg: 125.0, totalLength: 100, percentage: 50 }];

    const snap = calculateDirectionSnap({
      currentMouseWorld: { x: 10 * Math.cos((35 * Math.PI) / 180), y: 10 * Math.sin((35 * Math.PI) / 180) },
      originPoint,
      buildings: dummyBuildings,
      dominantDirections,
    });

    expect(snap).not.toBeNull();
    expect(Math.round(snap?.guideAngleDeg ?? 0)).toBe(35);
  });

  it('disables dominant direction when isTrackingActive is false', () => {
    const dominantDirections = [{ angleDeg: 35.0, orthogonalDeg: 125.0, totalLength: 100, percentage: 50, isTrackingActive: false }];

    const snap = calculateDirectionSnap({
      currentMouseWorld: { x: 10 * Math.cos((35 * Math.PI) / 180), y: 10 * Math.sin((35 * Math.PI) / 180) },
      originPoint,
      buildings: dummyBuildings,
      dominantDirections,
    });

    // Dominanta jest wyłączona przez isTrackingActive===false; kierunek myszy (35°) nie jest
    // wystarczająco blisko żadnej z pozostałych zawsze-aktywnych osi ortho (0°/90°) w granicach
    // domyślnej tolerancji kątowej, więc snap pozostaje null — tak samo jak przed Fazą C.
    expect(snap).toBeNull();
  });
});

describe('DirectionSnapStrategy - collectTargetDirections candidate sources', () => {
  const origin: Point2D = { x: 0, y: 0 };
  const mouse: Point2D = { x: 5, y: 5 };

  it('adds parallel and perpendicular candidates for the last polyline segment with highest priority', () => {
    const polylineVertices: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 2 }, // segment angle ~11.3°
    ];
    const candidates = collectTargetDirections(origin, mouse, [], [], polylineVertices);
    const segAngle = (Math.atan2(2, 10) * 180) / Math.PI;

    const parallel = candidates.find((c) => c.relationType === 'parallel' && Math.abs(c.angleDeg - segAngle) < 0.01);
    const perp = candidates.find((c) => c.relationType === 'perpendicular' && Math.abs(c.angleDeg - (segAngle + 90)) < 0.01);
    expect(parallel).toBeDefined();
    expect(parallel?.priority).toBe(1);
    expect(perp).toBeDefined();
    expect(perp?.priority).toBe(1);
  });

  it('gives older polyline segments lower priority (higher number) than the last one', () => {
    // Angles chosen (50° then 10°) so neither the segments nor their perpendiculars
    // (140°, 100°) collide within the angular dedup threshold.
    const v0: Point2D = { x: 0, y: 0 };
    const v1: Point2D = { x: 10 * Math.cos((50 * Math.PI) / 180), y: 10 * Math.sin((50 * Math.PI) / 180) };
    const v2: Point2D = { x: v1.x + 10 * Math.cos((10 * Math.PI) / 180), y: v1.y + 10 * Math.sin((10 * Math.PI) / 180) };
    const candidates = collectTargetDirections(origin, mouse, [], [], [v0, v1, v2]);
    const last = candidates.find((c) => c.relationType === 'parallel' && Math.abs(c.angleDeg - 10) < 0.01);
    const older = candidates.find((c) => c.relationType === 'parallel' && Math.abs(c.angleDeg - 50) < 0.01);
    expect(last?.priority).toBe(1);
    expect(older?.priority).toBe(3);
  });

  it('propagates a custom label from static reference segments to the perpendicular candidate', () => {
    const staticReferenceSegments = [{ p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, label: 'Krawędź A (Równoległy)' }];
    const candidates = collectTargetDirections(origin, mouse, [], [], [], undefined, undefined, undefined, undefined, undefined, staticReferenceSegments);
    const perp = candidates.find((c) => c.relationType === 'perpendicular' && Math.abs(c.angleDeg - 90) < 0.01);
    expect(perp?.sourceLabel).toBe('Krawędź A (Prostopadły 90°)');
  });

  it('labels the hovered building candidate as "Obiekt wskazany" and carries sourceSegment', () => {
    const seg = makeSegment({ x: 0, y: 0 }, { x: 10, y: 0 });
    const bldg = makeBuilding({ id: 'b1', segments: [seg] });
    const candidates = collectTargetDirections(origin, mouse, [bldg], [], [], 'b1');
    const parallel = candidates.find((c) => c.relationType === 'parallel' && c.angleDeg === 0);
    expect(parallel?.sourceLabel).toContain('Obiekt wskazany');
    expect(parallel?.sourceSegment).toEqual({ p1: seg.p1, p2: seg.p2, buildingId: 'b1', edgeIndex: 0 });
  });

  it('adds candidates from zonePolygons labeled as "Bufor (...)"', () => {
    const bldg = makeBuilding({
      id: 'b1',
      segments: [],
      zonePolygons: [
        { id: 'z1', distance: 4, polygon: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
      ],
    });
    const candidates = collectTargetDirections(origin, mouse, [bldg]);
    const zoneCandidate = candidates.find((c) => c.sourceLabel?.startsWith('Bufor ('));
    expect(zoneCandidate).toBeDefined();
  });

  it('sorts nearby (non-prioritized) building segments by distance and respects maxNearbySegments', () => {
    // near is vertical (90°, perpendicular normalizes to 0°); far is 45° so neither
    // it nor its perpendicular (135°) collides with near's pair via angular dedup.
    const near = makeBuilding({ id: 'near', segments: [makeSegment({ x: 4, y: 4 }, { x: 4, y: 6 }, 'near-seg')] });
    const rad45 = (45 * Math.PI) / 180;
    const far = makeBuilding({
      id: 'far',
      segments: [makeSegment({ x: 100, y: 100 }, { x: 100 + 10 * Math.cos(rad45), y: 100 + 10 * Math.sin(rad45) }, 'far-seg')],
    });
    const candidates = collectTargetDirections(origin, mouse, [far, near]);
    const nearIdx = candidates.findIndex((c) => c.sourceSegment?.buildingId === 'near');
    const farIdx = candidates.findIndex((c) => c.sourceSegment?.buildingId === 'far');
    expect(nearIdx).toBeGreaterThanOrEqual(0);
    expect(farIdx).toBeGreaterThanOrEqual(0);
    expect(nearIdx).toBeLessThan(farIdx);
  });

  it('halves effective distance for buildings sharing activeCategory, affecting sort order', () => {
    // Two candidate buildings at slightly different raw distances; the farther one
    // shares activeCategory ('boundary') so its halved effective distance should win.
    // sameCat is vertical (90°, perpendicular normalizes to 0°); otherCat is 45° so
    // neither it nor its perpendicular (135°) collides with sameCat's pair via dedup.
    // sameCat is farther away but its distance halves to 20; otherCat is closer at
    // an unhalved ~29 — without halving otherCat would sort first, with it sameCat wins.
    const sameCat = makeBuilding({
      id: 'sameCat',
      category: 'boundary',
      segments: [makeSegment({ x: 0, y: 40 }, { x: 0, y: 42 })],
    });
    const rad45 = (45 * Math.PI) / 180;
    const otherCat = makeBuilding({
      id: 'otherCat',
      category: 'building',
      segments: [makeSegment({ x: 21.2, y: 21.2 }, { x: 21.2 + 2 * Math.cos(rad45), y: 21.2 + 2 * Math.sin(rad45) })],
    });
    const candidates = collectTargetDirections(
      origin,
      mouse,
      [otherCat, sameCat],
      [],
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      [],
      'boundary'
    );
    const sameCatIdx = candidates.findIndex((c) => c.sourceSegment?.buildingId === 'sameCat');
    const otherCatIdx = candidates.findIndex((c) => c.sourceSegment?.buildingId === 'otherCat');
    expect(sameCatIdx).toBeGreaterThanOrEqual(0);
    expect(sameCatIdx).toBeLessThan(otherCatIdx);
  });

  it('excludes a fully excluded building via excludeBuildingId', () => {
    const bldg = makeBuilding({ id: 'excluded', segments: [makeSegment({ x: 4, y: 4 }, { x: 4, y: 6 })] });
    const candidates = collectTargetDirections(origin, mouse, [bldg], [], [], undefined, undefined, 'excluded');
    expect(candidates.some((c) => c.sourceSegment?.buildingId === 'excluded')).toBe(false);
  });

  it('excludes only the given segment indices when excludeBuildingId + excludeSegmentIndices are set', () => {
    const bldg = makeBuilding({
      id: 'partial',
      segments: [makeSegment({ x: 4, y: 4 }, { x: 4, y: 6 }, 's0'), makeSegment({ x: 4, y: 4 }, { x: 8, y: 4 }, 's1')],
    });
    const candidates = collectTargetDirections(
      origin,
      mouse,
      [bldg],
      [],
      [],
      undefined,
      undefined,
      'partial',
      undefined,
      [0]
    );
    const remaining = candidates.filter((c) => c.sourceSegment?.buildingId === 'partial');
    expect(remaining.every((c) => c.sourceSegment?.edgeIndex !== 0)).toBe(true);
    expect(remaining.some((c) => c.sourceSegment?.edgeIndex === 1)).toBe(true);
  });

  it('deduplicates angles within the dominant threshold (2.0°)', () => {
    const dominantDirections = [{ angleDeg: 10.0, orthogonalDeg: 100.0, totalLength: 100, percentage: 50 }];
    const bldg = makeBuilding({ id: 'b1', segments: [makeSegment({ x: 0, y: 0 }, { x: 10, y: 10 * Math.tan((11 * Math.PI) / 180) })] });
    const candidates = collectTargetDirections(origin, mouse, [bldg], dominantDirections);
    const near10 = candidates.filter((c) => Math.abs(c.angleDeg - 10) < 3);
    expect(near10.length).toBe(1);
  });

  it('does not deduplicate angles separated by more than the relative threshold (2.5°)', () => {
    const bldg = makeBuilding({
      id: 'b1',
      segments: [
        makeSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, 's0'), // 0°
        makeSegment({ x: 0, y: 0 }, { x: 10, y: 10 * Math.tan((4 * Math.PI) / 180) }, 's1'), // ~4°
      ],
    });
    const candidates = collectTargetDirections(origin, mouse, [bldg]);
    const zero = candidates.filter((c) => Math.abs(c.angleDeg - 0) < 0.5);
    const four = candidates.filter((c) => Math.abs(c.angleDeg - 4) < 0.5);
    expect(zero.length).toBe(1);
    expect(four.length).toBe(1);
  });

  it('always includes ortho 0°/90° by default alongside other sources', () => {
    const candidates = collectTargetDirections(origin, mouse);
    expect(candidates.some((c) => c.angleDeg === 0 && c.sourceLabel?.includes('Oś X'))).toBe(true);
    expect(candidates.some((c) => c.angleDeg === 90 && c.sourceLabel?.includes('Oś Y'))).toBe(true);
  });
});

describe('DirectionSnapStrategy - calculateDirectionSnap gating and axis selection', () => {
  it('returns null when below minDistanceMeters and no secondary origins are provided', () => {
    const snap = calculateDirectionSnap({
      currentMouseWorld: { x: 0.01, y: 0 },
      originPoint: { x: 0, y: 0 },
      minDistanceMeters: 0.2,
    });
    expect(snap).toBeNull();
  });

  it('picks the forward angle matching the mouse direction, not the opposite 180°', () => {
    // Mouse points toward -X; nearest axis candidate is the 0°/180° line, forward angle should be 180°.
    const snap = calculateDirectionSnap({
      currentMouseWorld: { x: -10, y: 0.1 },
      originPoint: { x: 0, y: 0 },
    });
    expect(snap).not.toBeNull();
    expect(snap?.guideAngleDeg).toBe(180);
  });

  it('rejects a snap point outside screenSnapThresholdPx when worldToScreen is provided', () => {
    const dominantDirections = [{ angleDeg: 45.0, orthogonalDeg: 135.0, totalLength: 100, percentage: 50 }];
    const snap = calculateDirectionSnap({
      currentMouseWorld: { x: 10, y: 0.5 }, // far from the 45° axis
      originPoint: { x: 0, y: 0 },
      dominantDirections,
      worldToScreen,
      screenSnapThresholdPx: 5,
    });
    expect(snap).toBeNull();
  });
});

describe('DirectionSnapStrategy - guide intersections', () => {
  it('snaps to the dual-guide intersection point when two origins project compatible axes', () => {
    const originPoint: Point2D = { x: 0, y: 0 };
    // Ray from (0,0) along 90° (vertical, x=0) crosses ray from (3,5) along 0° (horizontal, y=5) at (0,5).
    const secondaryOriginPoints: Point2D[] = [{ x: 3, y: 5 }];
    const snap = calculateDirectionSnap({
      currentMouseWorld: { x: 0.2, y: 5.1 },
      originPoint,
      secondaryOriginPoints,
      worldToScreen,
      screenSnapThresholdPx: 20,
    });
    expect(snap).not.toBeNull();
    expect(snap?.relationType).toBe('guide_intersection');
    expect(snap?.snappedPoint.x).toBeCloseTo(0, 1);
    expect(snap?.snappedPoint.y).toBeCloseTo(5, 1);
  });

  it('snaps to a guide × building-edge intersection and records intersectedSegment', () => {
    // The ray direction (45°) must come from a DIFFERENT building than the one it
    // intersects, since a candidate is excluded from intersecting its own source segment.
    const originPoint: Point2D = { x: 0, y: 0 };
    const wall = makeBuilding({ id: 'wall', segments: [makeSegment({ x: 5, y: -10 }, { x: 5, y: 10 }, 'wall-seg')] });
    const rad45 = (45 * Math.PI) / 180;
    const source = makeBuilding({
      id: 'source',
      segments: [makeSegment({ x: 50, y: 50 }, { x: 50 + 10 * Math.cos(rad45), y: 50 + 10 * Math.sin(rad45) }, 'source-seg')],
    });
    const snap = calculateDirectionSnap({
      currentMouseWorld: { x: 5.1, y: 5.1 },
      originPoint,
      buildings: [wall, source],
      worldToScreen,
      screenSnapThresholdPx: 20,
    });
    expect(snap).not.toBeNull();
    expect(snap?.relationType).toBe('guide_intersection');
    expect(snap?.intersectedSegment?.buildingId).toBe('wall');
    expect(snap?.snappedPoint.x).toBeCloseTo(5, 1);
    expect(snap?.snappedPoint.y).toBeCloseTo(5, 1);
  });
});
