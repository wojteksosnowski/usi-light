import { ShadowingSector } from '../types/geometry';

export interface ShadowingEvaluationResult {
  isCompliant: boolean;
  maxContinuousFreeSpanDeg: number;
  totalFreeSpanDeg: number;
  hasContinuous60: boolean;
  hasComposite75: boolean;
  legalBasis: string;
}

export interface SunlightEvaluationResult {
  isCompliant: boolean;
  totalMinutes: number;
  requiredMinutes: number;
  hasContinuousHour: boolean;
  legalBasis: string;
}

/**
 * RegulationEvaluator - Ewaluator zgodności z Warunkami Technicznymi (§ 12 i § 56).
 *
 * 100% ochrona obecnej, sprawdzonej logiki orzekania zgodności:
 * - § 12: Ciągły kąt >= 60° (ust. 1 pkt 1) lub złożony >= 75° z przeszkodą <= 15° (ust. 2).
 * - § 56: Min. 180 min (lub 90 min dla śródmieścia) w oknie równonocy.
 */
export class RegulationEvaluator {
  /**
   * Ewaluacja § 12 (Przesłanianie) na podstawie sektorów kątowych
   */
  public static evaluateShadowing(sectors: ShadowingSector[]): ShadowingEvaluationResult {
    let maxContinuousFreeSpanDeg = 0;

    for (const s of sectors) {
      if (s.isFree) {
        if (s.spanDeg > maxContinuousFreeSpanDeg) {
          maxContinuousFreeSpanDeg = s.spanDeg;
        }
      }
    }

    const hasContinuous60 = maxContinuousFreeSpanDeg >= 60.0;

    let hasComposite75 = false;
    let maxBridgedFreeSpanDeg = maxContinuousFreeSpanDeg;
    let maxCompositeWindowDeg = maxContinuousFreeSpanDeg;

    // Search across adjacent sector triplets [Free, Blocked, Free]
    for (let i = 0; i < sectors.length - 2; i++) {
      const s1 = sectors[i];
      const sObst = sectors[i + 1];
      const s2 = sectors[i + 2];

      if (s1.isFree && !sObst.isFree && s2.isFree) {
        if (sObst.spanDeg <= 15.0) {
          const totalWindow = s1.spanDeg + sObst.spanDeg + s2.spanDeg;
          const totalFree = s1.spanDeg + s2.spanDeg;

          if (totalWindow > maxCompositeWindowDeg) {
            maxCompositeWindowDeg = totalWindow;
          }
          if (totalFree > maxBridgedFreeSpanDeg) {
            maxBridgedFreeSpanDeg = totalFree;
          }

          if (totalWindow >= 75.0 && totalFree >= 60.0) {
            hasComposite75 = true;
            sObst.isTolerated = true;
          }
        }
      }
    }

    const isCompliant = hasContinuous60 || hasComposite75;
    const legalBasis = hasContinuous60
      ? '§ 12 ust. 1 pkt 1 (ciągły kąt >= 60°)'
      : hasComposite75
      ? '§ 12 ust. 2 (kąt złożony >= 75° z przeszkodą <= 15°)'
      : '§ 12 (niespełniony)';

    return {
      isCompliant,
      maxContinuousFreeSpanDeg,
      totalFreeSpanDeg: maxBridgedFreeSpanDeg,
      hasContinuous60,
      hasComposite75,
      legalBasis,
    };
  }

  /**
   * Ewaluacja § 56 (Nasłonecznienie) na podstawie minut nasłonecznienia
   */
  public static evaluateSunlight(
    totalMinutes: number,
    isCityCentre: boolean = false
  ): SunlightEvaluationResult {
    const requiredMinutes = isCityCentre ? 90 : 180; // 1.5h vs 3h
    const isCompliant = totalMinutes >= requiredMinutes;
    const legalBasis = isCityCentre
      ? '§ 56 ust. 3 (zabudowa śródmiejska: min. 1.5h)'
      : '§ 56 ust. 1 (min. 3h)';

    return {
      isCompliant,
      totalMinutes,
      requiredMinutes,
      hasContinuousHour: totalMinutes >= 60,
      legalBasis,
    };
  }
}
