import React from 'react';
import { Point2D, BuildingLoop, CadLayerSettings } from '../../../types/geometry';
import { ViewportState, CadRenderContext } from '../types';
import { SnapCoordinator, SnapResult } from '../../../utils/snapping';

export interface ToolActionDispatchers {
  onSelectBuilding: (id: string | null) => void;
  onBuildingMove: (id: string, dx: number, dy: number) => void;
  onFinishDrawing?: (vertices: Point2D[], shapeType: 'rectangle' | 'polyline') => void;
  onCancelDrawing?: () => void;
  onUpdateBuildingVertices?: (buildingId: string, newVertices: Point2D[]) => void;
  onBuildingRotate?: (buildingId: string, pivot: Point2D, deltaAngleRad: number) => void;
  onBooleanUnion?: (bldgIdA: string, bldgIdB: string) => void;
  onAddPinnedPoint?: (point: { buildingId: string; segmentId: string; offsetRatio: number }) => void;
  onDeletePinnedPoint?: (id: string) => void;
  onUpdatePinnedPoint?: (id: string, buildingId: string, segmentId: string, offsetRatio: number) => void;
  onDimensionClickEdge?: (buildingId: string, segmentId: string) => void;
  onInteractionChange?: (isInteracting: boolean) => void;
}

export interface ToolContext {
  viewport: ViewportState;
  buildings: BuildingLoop[];
  selectedBuildingId: string | null;
  layerSettings?: Record<string, CadLayerSettings>;
  snapCoordinator: SnapCoordinator;
  worldToScreen: (wx: number, wy: number) => { sx: number; sy: number };
  screenToWorld: (sx: number, sy: number) => { wx: number; wy: number };
  actions: ToolActionDispatchers;
}

export interface CadInteractionTool {
  readonly id: string;
  readonly cursor?: string;
  onActivate?(ctx: ToolContext): void;
  onDeactivate?(ctx: ToolContext): void;
  onPointerDown(e: React.PointerEvent<HTMLCanvasElement>, ctx: ToolContext): boolean | void;
  onPointerMove(e: React.PointerEvent<HTMLCanvasElement>, ctx: ToolContext): boolean | void;
  onPointerUp(e: React.PointerEvent<HTMLCanvasElement>, ctx: ToolContext): boolean | void;
  onKeyDown?(e: KeyboardEvent, ctx: ToolContext): boolean | void;
  renderFeedback?(ctx: CanvasRenderingContext2D, renderCtx: CadRenderContext): void;
}
