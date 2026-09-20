import { BuildingLoop } from '../types/geometry';

/**
 * Zachowana dla zgodności z licznymi miejscami wywołania — obiekt logiczny (grupa `groupId`)
 * nie gromadzi już wariantów A/B, więc każdy obiekt jest zawsze aktywny.
 */
export function isBuildingVariantActive(bldg: BuildingLoop | null | undefined): boolean {
  return !!bldg;
}

/**
 * Filtruje tablicę budynków, zwracając wyłącznie elementy aktywnego wariantu.
 */
export function filterActiveVariantBuildings(buildings: BuildingLoop[]): BuildingLoop[] {
  if (!buildings || buildings.length === 0) return [];
  return buildings.filter(isBuildingVariantActive);
}

/**
 * Znajduje jawnie zaznaczony budynek NIEZALEŻNIE od tego, czy należy do aktywnego wariantu A/B -
 * jawne zaznaczenie użytkownika ma zawsze pierwszeństwo przed filtrowaniem wariantu, żeby podglądy
 * 3D nigdy nie podmieniały w ciszy pokazywanego obiektu. Używane przez BuildingPreviewPanel i
 * Recording3DPipWindow przed zastosowaniem ich własnej logiki fallbacku.
 */
export function findSelectedBuilding(
  buildings: BuildingLoop[],
  selectedBuildingId: string | null | undefined
): BuildingLoop | null {
  if (!selectedBuildingId) return null;
  return buildings.find((b) => b.id === selectedBuildingId && b.category !== 'boundary') || null;
}

/**
 * Sprawdza, czy budynek powinien być przygaszony, ponieważ nie wchodzi w skład
 * aktualnie otwartej grupy (tryb edycji grupy) i nie jest zaznaczony.
 */
export function isBuildingDimmedInGroupMode(
  bldg: BuildingLoop,
  openGroupId: string | null | undefined,
  isSelected: boolean
): boolean {
  return !!openGroupId && bldg.groupId !== openGroupId && !isSelected;
}
