/**
 * Centralna mapa funkcji zależnych od licencji PRO.
 * Pojedyncze źródło prawdy do gate'owania UI oraz wywołań serwisów w module geo/eksportów.
 */
import { useLicenseStore } from '../store/useLicenseStore';

export type FeatureFlag = 'geoImport' | 'dxfExport' | 'geoOverlays';

export const FEATURE_FLAGS: Record<FeatureFlag, { pro: boolean; label: string }> = {
  geoImport: { pro: true, label: 'Import działek geodezyjnych i obrysów budynków (ULDK/WFS)' },
  dxfExport: { pro: true, label: 'Eksport geometrii do DXF' },
  geoOverlays: { pro: true, label: 'Podkłady geodezyjne i plany (GESUT, BDOT10k, MPZP, Overture, Pokrycie terenu)' },
};

export function isFeaturePro(feature: FeatureFlag): boolean {
  return FEATURE_FLAGS[feature].pro;
}

/** Zwraca true, jeśli użytkownik ma dostęp do danej funkcji przy obecnym stanie licencji. */
export function useFeatureAccess(feature: FeatureFlag): boolean {
  const isPro = useLicenseStore((s) => s.isPro);
  return !isFeaturePro(feature) || isPro;
}
