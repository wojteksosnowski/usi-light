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
import { ISatelliteTileManager } from '../../../utils/googleTileManager';
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
  readonly openGroupId?: string | null;
  readonly hoveredBuildingId?: string | null;
  readonly hoveredLabelBuildingId?: string | null;
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
  readonly drawingMode?: 'none' | 'rectangle' | 'polyline' | 'sweep' | 'vertexEdit' | 'align';
  readonly hideOtherLabelsInLinkingMode?: boolean;
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
  readonly ucsMode?: 'world' | 'user' | 'edge';
  readonly showSatelliteLayer?: boolean;
  readonly satelliteOpacity?: number;
  readonly tileManager?: ISatelliteTileManager | null;
  readonly crsInfo?: CrsDetectionResult;
  readonly draggedVertexIndex?: number | null;
  readonly dragVertexPreviewPt?: Point2D | null;
  readonly projectCirclePulse?: { radius: number; opacity: number } | null;
  readonly projectRadius?: number;

  // Overlay / Tool Preview context
  readonly effectivePivot?: Point2D | null;
  readonly isRotateHandleHovered?: boolean;
  readonly isRotating?: boolean;
  readonly rotAngleDeg?: number;
  readonly activeRotateAngleSnap?: { angleDeg: number; isCardinal?: boolean; label?: string } | null;
  readonly alignPendingRef?: DimensionReference | null;
  readonly alignHoveredEdge?: { buildingId: string; segmentId: string } | null;
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

/**
 * Warstwa bufora renderowania, do którego trafia dana `CadRenderLayer`:
 * - `background`: treść statyczna (kafle satelitarne/WMS, siatka) — przerysowywana tylko
 *   przy zmianie viewportu, załadowaniu kafla lub przełączeniu widoczności warstwy geo.
 * - `scene`: geometria sceny (budynki, cienie, pasma analizy) — przerysowywana przy zmianie
 *   danych sceny, nie przy samym hover/drag.
 * - `hud`: nakładka interaktywna (kursor, snapping, podgląd przeciągania) — przerysowywana
 *   przy każdej zmianie stanu interakcji.
 */
export type CadRenderTier = 'background' | 'scene' | 'hud';

export interface CadRenderLayer {
  /** Unikalny identyfikator warstwy (np. 'grid', 'buildings', 'shadows') */
  readonly id: string;
  /** Kolejność rysowania (im mniejsza wartość, tym niżej na stosie) */
  readonly zIndex: number;
  /** Bufor renderowania, do którego należy warstwa (patrz {@link CadRenderTier}) */
  readonly tier: CadRenderTier;
  /** Warunek uruchomienia renderera (np. sprawdzanie widoczności warstwy) */
  shouldRender(context: CadRenderFrameContext): boolean;
  /** Właściwa logika rysowania na Canvas 2D */
  render(context: CadRenderFrameContext): void;
}
