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
 * to place the camera.
 *
 * Scene coordinate convention (after solidGroup.rotation.x = -PI/2):
 * +X = East (CAD +X), -X = West
 * +Y = Height (Up)
 * -Z = North (CAD +Y), +Z = South (CAD -Y)
 */
export function getIsoCameraOffset(orientation: IsoOrientation, distance: number): Vec3Like {
  const azimuthRad = (AZIMUTH_DEG[orientation] * Math.PI) / 180;
  const horizontal = Math.cos(ISO_POLAR_ANGLE_RAD) * distance;
  const vertical = Math.sin(ISO_POLAR_ANGLE_RAD) * distance;
  return {
    x: horizontal * Math.sin(azimuthRad),
    y: vertical,
    z: -horizontal * Math.cos(azimuthRad),
  };
}

/**
 * Jednostkowy wektor w kierunku słońca (Y-up, +X=wschód, -Z=północ, +Z=południe), z
 * azymutu/elewacji (konwencja astronomiczna: 0°=Północ, 90°=Wschód, 180°=Południe, 270°=Zachód).
 *
 * Dla słońca w zenicie/południu (azymut 180°): wektor ma +Z (znajduje się na południu),
 * dzięki czemu promienie directional light świecą w stronę -Z (północ), a rzucany cień
 * pada na północ od bryły (CAD +Y), w 100% zgodnie z fizyką i rzutem 2D Masterplanu.
 */
export function getSunDirection3D(azimuthDeg: number, elevationDeg: number): Vec3Like {
  const azimuthRad = (azimuthDeg * Math.PI) / 180;
  const elevationRad = (elevationDeg * Math.PI) / 180;
  const horizontal = Math.cos(elevationRad);
  return {
    x: horizontal * Math.sin(azimuthRad),
    y: Math.sin(elevationRad),
    z: -horizontal * Math.cos(azimuthRad),
  };
}
