import type { Point2D, Vector2D } from './geometry';

export interface Point3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Polygon2D {
  readonly exterior: readonly Point2D[];
  readonly holes: readonly (readonly Point2D[])[];
}

export interface Face3D {
  readonly id: string;
  readonly sourceObjectId: string;
  readonly type: 'roof' | 'wall' | 'terrace' | 'ground' | 'cutout';
  readonly vertices: readonly Point3D[];
  readonly normal: Point3D;
  readonly floorIndex?: number;
  readonly edgeOriginIndex?: number | null;
  readonly zoneFunction?: string;
  readonly buildingType?: string;
}

export interface ShadowCastingEdge {
  readonly p1: Point3D;
  readonly p2: Point3D;
  readonly isRidgeOrRoofEdge: boolean;
  readonly normal2D?: Vector2D;
}

export interface StorySlice {
  readonly storyIndex: number;
  readonly elevationBottom: number;
  readonly elevationTop: number;
  readonly height: number;
  readonly footprint: Polygon2D;
  readonly edgeOrigins?: (number | null)[];
}

export interface CompiledMetrics {
  /** Powierzchnia zabudowy netto w m² (obrys zewnętrzny minus dziury/dziedzińce) */
  readonly footprintArea: number;
  /** Powierzchnia całkowita / PUM wszystkich kondygnacji w m² */
  readonly grossFloorArea: number;
  /** Kubatura brutto w m³ */
  readonly volume: number;
  /** Obwód obrysu zewnętrznego przyziemia w m */
  readonly perimeter: number;
  /** Bezwzględna maksymalna rzędna najwyższego punktu w m */
  readonly heightMax: number;
}

export interface LabelPlacementInfo {
  readonly labelAnchor: Point2D;
  readonly dominantAngleRad: number;
  readonly spanX: number;
  readonly spanY: number;
}

export interface CardinalAABB2D {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export interface PrecomputedMasterplanTier {
  readonly storyIndex: number;
  readonly polygon: readonly Point2D[];
  readonly holes: readonly (readonly Point2D[])[];
  readonly hBottom: number;
  readonly hTop: number;
  readonly geomFingerprint: string;
  readonly holesFingerprint?: string;
  readonly isConvex: boolean;
  readonly buildingType?: string;
  readonly bounds2D?: {
    readonly min: Point2D;
    readonly max: Point2D;
  };
}

export interface CompiledObjectGeometry {
  /** Deterministyczny hash stanu wejściowego (wierzchołki, otwory, wysokości, modyfikatory) */
  readonly geometryHash: string;
  readonly computedAt: number;

  /** Reprezentacja 2D dla rzutów CADCanvas i Masterplan */
  readonly representation2D: {
    readonly footprintBase: Polygon2D;
    readonly footprintRoof: Polygon2D;
    readonly storySlices: readonly StorySlice[];
    readonly masterplanTiers?: readonly PrecomputedMasterplanTier[];
    readonly bounds2D: {
      readonly min: Point2D;
      readonly max: Point2D;
    };
    readonly labelInfo?: LabelPlacementInfo;
    readonly isConvex?: boolean;
    readonly geomFingerprint?: string;
  };

  /** Reprezentacja siatki 3D dla podglądu izometrycznego / perspektywicznego */
  readonly representation3D: {
    readonly faces: readonly Face3D[];
    readonly bounds3D: {
      readonly min: Point3D;
      readonly max: Point3D;
    };
  };

  /** Wyekstrahowane dane analityczne dla silników cieniowania i nasłonecznienia */
  readonly analysis: {
    readonly castingEdges: readonly ShadowCastingEdge[];
    readonly heightMin: number;
    readonly heightMax: number;
    readonly simplifiedEnvelope2D: Polygon2D;
    readonly shadowReachAABB?: CardinalAABB2D;
  };

  /** Zbuforowane metryki geometryczne */
  readonly metrics: CompiledMetrics;
}

