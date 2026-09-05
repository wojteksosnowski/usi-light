import {
  Point2D,
  BuildingLoop,
  FacadeSegment,
  ProjectSettings,
} from '../../types/geometry';
import { isPointInPolygon } from '@/utils/math2d';
import { buildShadowRangeLUT, ShadowRangeLut } from '../shadowRangeLut';
import { buildSingleHourShadowPolygon } from '../shadowRangeBuilder';
import { RegulationEvaluator } from '../regulationEvaluator';
import { ISolarEngine, SolarAnalysisContext, SunlightIntervalResult } from './types';

export class LutSolarEngine implements ISolarEngine {
  readonly id = 'lut' as const;
  private cachedLut?: ShadowRangeLut;
  private cachedLat?: number;
  private cachedLon?: number;

  private getLut(lat: number, lon: number): ShadowRangeLut {
    if (this.cachedLut && this.cachedLat === lat && this.cachedLon === lon) {
      return this.cachedLut;
    }
    const lut = buildShadowRangeLUT('ASTRONOMICAL', { latitude: lat, longitude: lon });
    this.cachedLut = lut;
    this.cachedLat = lat;
    this.cachedLon = lon;
    return lut;
  }

  public calculatePointSunlight(
    point: Point2D,
    segment: FacadeSegment,
    offsetRatio: number,
    buildings: BuildingLoop[],
    targetBuildingId: string,
    settings: ProjectSettings,
    ctx?: Partial<SolarAnalysisContext>
  ): SunlightIntervalResult {
    const lat = ctx?.latitude ?? settings.latitude;
    const lon = ctx?.longitude ?? settings.longitude;
    const lut = this.getLut(lat, lon);
    const isCityCentre = ctx?.isCityCentre ?? segment.isCityCentre ?? settings.isCityCentreDefault ?? false;

    // Build obstacle shadow polygons per ray
    let directRayCount = 0;
    const totalRays = lut.rays.length; // Typically 11 hourly slots

    for (const ray of lut.rays) {
      let isBlocked = false;

      for (const bldg of buildings) {
        if (bldg.id === targetBuildingId || bldg.isIncluded === false || bldg.category === 'boundary') {
          continue;
        }

        const height = bldg.defaultHeight ?? 15;
        const shadowPoly = buildSingleHourShadowPolygon(bldg.vertices, height, ray);

        if (shadowPoly && shadowPoly.length >= 3 && isPointInPolygon(point, shadowPoly)) {
          isBlocked = true;
          break;
        }
      }

      if (!isBlocked) {
        directRayCount++;
      }
    }

    const totalMinutes = directRayCount * 60; // 1 hour per ray slot
    const totalHours = totalMinutes / 60;
    const evaluation = RegulationEvaluator.evaluateSunlight(totalMinutes, isCityCentre);

    return {
      totalMinutes,
      totalHours,
      isCompliant: evaluation.isCompliant,
      evaluation,
    };
  }
}
