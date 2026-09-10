export type IsoOrientation = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Fixed isometric polar angle from the vertical axis (true isometric: atan(1/sqrt(2))). */
export const ISO_POLAR_ANGLE_RAD = Math.atan(1 / Math.sqrt(2));

const AZIMUTH_DEG: Record<IsoOrientation, number> = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315,
};

/**
 * Camera position (offset from the framed target) for a given isometric
 * corner orientation, at unit distance. Multiply by the desired distance
 * to place the camera. Scene convention: X = east, Z = north (ground plane),
 * Y = up (three.js Y-up), matching a CAD scene rotated once onto Y-up.
 */
export function getIsoCameraOffset(orientation: IsoOrientation, distance: number): Vec3Like {
  const azimuthRad = (AZIMUTH_DEG[orientation] * Math.PI) / 180;
  const horizontal = Math.cos(ISO_POLAR_ANGLE_RAD) * distance;
  const vertical = Math.sin(ISO_POLAR_ANGLE_RAD) * distance;
  return {
    x: horizontal * Math.sin(azimuthRad),
    y: vertical,
    z: horizontal * Math.cos(azimuthRad),
  };
}
