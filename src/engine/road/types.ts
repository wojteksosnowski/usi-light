import { Point2D } from '../../types/geometry';

export type RoadStrategy = 'centered_smooth';
export type RoadSolveStatus = 'pending' | 'solved' | 'partial_radius' | 'no_path';

export interface RoadSolveInput {
  pointA: Point2D;
  pointB: Point2D;
  width: number;
  obstacles: Point2D[][];
  plot: Point2D[] | null;
  strategy?: RoadStrategy;
  /** Minimalny promień skrętu (m). Zmniejszanie promienia poniżej tej wartości jest niedopuszczalne. */
  minTurnRadius?: number;
}

export interface RoadSolveResult {
  centerline: Point2D[];
  polygon: Point2D[];
  success: boolean;
  reason?: 'no_path' | 'point_blocked';
  /** false gdy promień skrętu w co najmniej jednym załamaniu nie mógł osiągnąć R_min */
  radiusFullyMet?: boolean;
}
