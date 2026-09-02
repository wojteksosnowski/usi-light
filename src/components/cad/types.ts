import {
  BuildingLoop,
  AnalysisPointResult,
  Point2D,
  DimensionItem,
  DimensionReference,
  DimensionType,
  CadLayerSettings,
} from '../../types/geometry';
import { DominantDirection } from '../../utils/segmentStatistics';


export interface ViewportState {
  panX: number;
  panY: number;
  scale: number;
}

export interface CadRenderContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  viewState: ViewportState;
  viewRotationDeg: number;
  worldToScreen: (wx: number, wy: number) => { sx: number; sy: number };
  screenToWorld: (sx: number, sy: number) => { wx: number; wy: number };
  latitude: number;
  longitude: number;
  equinoxDate: 'spring' | 'autumn';
  sunlightMethod?: 'raycasting' | 'segments';
}

export interface CadCanvasProps {
  buildings: BuildingLoop[];
  selectedBuildingId: string | null;
  onSelectBuilding: (id: string | null) => void;
  onBuildingMove: (id: string, dx: number, dy: number) => void;
  analysisResults: AnalysisPointResult[];
  selectedPointResult: AnalysisPointResult | null;
  activePointMode?: 'shadowing' | 'sunlight';
  onSelectPointResult: (res: AnalysisPointResult | null) => void;
  showNormals: boolean;
  showShadowingLines: boolean;
  showSunlightLines: boolean;
  showShadowRange?: boolean;
  shadowAnalysis?: import('../../types/geometry').ShadowAnalysisResult;
  sunlightMethod?: 'raycasting' | 'segments';

  latitude?: number;
  longitude?: number;
  equinoxDate?: 'spring' | 'autumn';
  fitTrigger?: number;
  onInteractionChange?: (isInteracting: boolean) => void;
  isLinkingMode?: boolean;
  linkingSourceId?: string | null;
  drawingMode?: 'none' | 'rectangle' | 'polyline' | 'vertexEdit' | 'rotate' | 'union';
  onFinishDrawing?: (vertices: Point2D[], shapeType: 'rectangle' | 'polyline') => void;

  onCancelDrawing?: () => void;
  onDrawingVerticesCountChange?: (count: number) => void;
  onUpdateBuildingVertices?: (buildingId: string, newVertices: Point2D[]) => void;
  onBuildingRotate?: (buildingId: string, pivot: Point2D, deltaAngleRad: number) => void;
  onBooleanUnion?: (bldgIdA: string, bldgIdB: string) => void;
  pinnedPoints?: import('../../types/geometry').PinnedFacadePoint[];

  pinnedPointResults?: AnalysisPointResult[];
  activePinnedPointId?: string | null;
  onSelectPinnedPoint?: (id: string | null) => void;
  onAddPinnedPoint?: (point: { buildingId: string; segmentId: string; offsetRatio: number }) => void;
  onDeletePinnedPoint?: (id: string) => void;
  onUpdatePinnedPoint?: (id: string, buildingId: string, segmentId: string, offsetRatio: number) => void;
  facadePointMode?: boolean;
  onFacadePointMove?: (buildingId: string, segmentId: string, offsetRatio: number) => void;
  isEditMode?: boolean;
  onBuildingEdgeMove?: (buildingId: string, edgeIndex: number, dx: number, dy: number) => void;
  dimensions?: DimensionItem[];
  isDimensionMode?: boolean;
  dimensionType?: DimensionType;
  dimensionPendingRef?: DimensionReference | null;
  onDimensionClickEdge?: (buildingId: string, segmentId: string) => void;
  onDeleteDimension?: (id: string) => void;
  layerSettings?: Record<string, CadLayerSettings>;
  viewRotationMode?: boolean;
  viewRotationDeg?: number;
  onViewRotationChange?: (deg: number) => void;
  onEndViewRotationMode?: () => void;
  isDirectionSnappingActive?: boolean;
  isOsnapActive?: boolean;
  onToggleOsnap?: () => void;
  dominantDirections?: DominantDirection[];
}


