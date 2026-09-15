import { BuildingLoop } from '../types/geometry';

const LEGACY_VALUES = new Set(['childcare', 'other']);

/**
 * Mapuje wsteczne wartości `buildingType` ('childcare' | 'other', usunięte wraz z podkategoriami
 * mieszkalny/usługowy/garaż) na 'residential' w scenach wczytanych z localStorage lub linku udostępniania.
 * Mutuje przekazaną tablicę budynków (i ich segmenty) w miejscu.
 */
export function normalizeLegacyBuildingTypes(buildings: BuildingLoop[] | undefined | null): void {
  if (!Array.isArray(buildings)) return;
  for (const b of buildings) {
    if (LEGACY_VALUES.has(b.buildingType as unknown as string)) {
      b.buildingType = 'residential';
    }
    if (Array.isArray(b.segments)) {
      for (const s of b.segments) {
        if (LEGACY_VALUES.has(s.buildingType as unknown as string)) {
          s.buildingType = 'residential';
        }
      }
    }
  }
}
