import { wgs84ToCadPoint, CrsDetectionResult } from '../../../utils/geoTransform';

const EPSG_2180: CrsDetectionResult = {
  crs: 'EPSG:2180',
  description: 'PL-1992',
  isGeodetic: true,
};

export function wgs84ToEpsg2180(lat: number, lon: number): { x: number; y: number } {
  return wgs84ToCadPoint({ lat, lon }, EPSG_2180);
}
