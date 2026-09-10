import { Point2D } from '../../types/geometry';

export interface RoadSolveInput {
  pointA: Point2D;
  pointB: Point2D;
  width: number;
  obstacles: Point2D[][];
  plot: Point2D[] | null;
}

export interface RoadSolveResult {
  centerline: Point2D[];
  polygon: Point2D[];
  success: boolean;
  reason?: 'no_path' | 'point_blocked';
}
