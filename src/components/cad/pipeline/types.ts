import {
  BuildingLoop,
  AnalysisPointResult,
  Point2D,
  DimensionItem,
  DimensionReference,
  DimensionType,
  CadLayerSettings,
} from '../../../types/geometry';
import { CadRenderContext } from '../types';
import { GoogleTileManager } from '../../../utils/googleTileManager';
import { CrsDetectionResult } from '../../../utils/geoTransform';
import {
  OsnapSnapResult,
  BuildingDragSnapResult,
  EdgeDragSnapResult,
  DirectionSnapResult,
} from '../../../engine/snapping';
import { SweepAlignment } from '@/utils/math2d/sweep';
import { EditingEdgeLengthState } from '../renderers/buildingsRenderer';

export interface CadRenderFrameContext {
  readonly renderContext: CadRenderContext;
  readonly buildings: BuildingLoop[];
  readonly visibleBuildings?: BuildingLoop[];
  readonly selectedBuildingId?: string | null;
  readonly selectedBuildingIds?: string[];
  readonly hoveredBuildingId?: string | null;
  readonly hoveredEdge?: { buildingId: string; edgeIndex: number } | null;
  readonly isEditMode?: boolean;
  readonly showNormals?: boolean;
  readonly analysisResults?: AnalysisPointResult[];
  readonly selectedPointResult?: AnalysisPointResult | null;
  readonly activePointMode?: 'shadowing' | 'sunlight';
  readonly isLinkingMode?: boolean;
  readonly linkingSourceId?: string | null;
  readonly layerSettings?: Record<string, CadLayerSettings>;
  readonly editingEdgeLength?: EditingEdgeLengthState | null;
  readonly hoveredEdgeLengthBadge?: { buildingId: string; edgeIndex: number } | null;
  readonly pinnedPointResults?: AnalysisPointResult[];
  readonly activePinnedPointId?: string | null;
  readonly liveFacadeSnap?: {
    point: Point2D;
    buildingId: string;
    segmentId: string;
    ratio: number;
  } | null;
  readonly facadePointMode?: boolean;
  readonly drawingMode?: 'none' | 'rectangle' | 'polyline' | 'sweep' | 'vertexEdit' | 'rotate' | 'union';
  readonly showAnalysisPoints?: boolean;
  readonly showShadowRange?: boolean;
  readonly showShadowFill?: boolean;
  readonly showShadowingLines?: boolean;
  readonly showSunlightLines?: boolean;
  readonly shadowRangeLoopsToRender?: Point2D[][];
  readonly hourlyShadowsToRender?: any[];
  readonly dimensions?: DimensionItem[];
  readonly isDimensionMode?: boolean;
  readonly dimensionPendingRef?: DimensionReference | null;
  readonly dimHoveredEdge?: { buildingId: string; segmentId: string } | null;
  readonly dimensionType?: DimensionType;
  readonly rotationHover?: any;
  readonly viewRotationMode?: boolean;
  readonly showSatelliteLayer?: boolean;
  readonly satelliteOpacity?: number;
  readonly tileManager?: GoogleTileManager | null;
  readonly crsInfo?: CrsDetectionResult;
  readonly draggedVertexIndex?: number | null;
  readonly dragVertexPreviewPt?: Point2D | null;

  // Overlay / Tool Preview context
  readonly effectivePivot?: Point2D | null;
  readonly isPivotHovered?: boolean;
  readonly isDraggingPivot?: boolean;
  readonly isRotating?: boolean;
  readonly rotStartAngleScreen?: number;
  readonly rotAngleDeg?: number;
  readonly hoveredRotateVertexIndex?: number | null;
  readonly activeRotateAngleSnap?: { angleDeg: number; isCardinal?: boolean; label?: string } | null;
  readonly drawingVertices?: Point2D[];
  readonly currentMouseWorld?: Point2D | null;
  readonly hoveredVertexIndex?: number | null;
  readonly hoveredMidpointIndex?: number | null;
  readonly activeDirectionSnap?: DirectionSnapResult | null;
  readonly selectedVertexIndex?: number | null;
  readonly activeOsnapSnap?: OsnapSnapResult | null;
  readonly activeBuildingDragSnap?: BuildingDragSnapResult | EdgeDragSnapResult | null;
  readonly sweepWidth?: number;
  readonly sweepAlignment?: SweepAlignment;
}

export interface CadRenderLayer {
  /** Unikalny identyfikator warstwy (np. 'grid', 'buildings', 'shadows') */
  readonly id: string;
  /** Kolejność rysowania (im mniejsza wartość, tym niżej na stosie) */
  readonly zIndex: number;
  /** Warunek uruchomienia renderera (np. sprawdzanie widoczności warstwy) */
  shouldRender(context: CadRenderFrameContext): boolean;
  /** Właściwa logika rysowania na Canvas 2D */
  render(context: CadRenderFrameContext): void;
}
