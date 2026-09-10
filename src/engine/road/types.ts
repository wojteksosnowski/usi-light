import { Point2D } from '../../types/geometry';

export type RoadStrategy = 'shortest' | 'centered_smooth';

export interface RoadSolveInput {
  pointA: Point2D;
  pointB: Point2D;
  width: number;
  obstacles: Point2D[][];
  plot: Point2D[] | null;
  strategy?: RoadStrategy;
  /** Promień skrętu (m) egzekwowany przez strategię 'centered_smooth'; ignorowany przy 'shortest'. */
  minTurnRadius?: number;
}

export interface RoadSolveResult {
  centerline: Point2D[];
  polygon: Point2D[];
  success: boolean;
  reason?: 'no_path' | 'point_blocked';
  /** false gdy strategia 'centered_smooth' musiała lokalnie zmniejszyć lub pominąć promień
   * skrętu w co najmniej jednym załamaniu, bo pełny promień kolidował z przeszkodami. */
  radiusFullyMet?: boolean;
}
