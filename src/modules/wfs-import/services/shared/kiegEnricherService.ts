/**
 * kiegEnricherService.ts
 *
 * Serwis wzbogacania danych działek ewidencyjnych (EGiB) informacjami o przeznaczeniu
 * i klasoużytkach gruntowych (Krajowa Integracja Ewidencji Gruntów - KIEG / GUGiK).
 *
 * Wykorzystuje operację WMS GetFeatureInfo na warstwach: dzialki, uzytki, kontury.
 */

export interface KiegParcelEnrichment {
  id?: string;
  voivodeship?: string;
  county?: string;
  commune?: string;
  region?: string;
  plotNumber?: string;
  areaHa?: number;
  registryGroup?: string;
  landUseClass?: string; // np. "dr", "B", "Bi", "RIVa", "Ls", "Bz", "Ł"
  landUseType?: 'residential' | 'commercial' | 'road' | 'agricultural' | 'forest' | 'recreational' | 'other';
  classificationContour?: string;
}

const KIEG_WMS_URL = 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow';

/**
 * Mapuje kod klasoużytku EGiB (np. "dr", "B", "Bi", "RIVa") na ustandaryzowany typ przeznaczenia.
 */
export function classifyLandUseType(rawCode?: string): 'residential' | 'commercial' | 'road' | 'agricultural' | 'forest' | 'recreational' | 'other' {
  if (!rawCode) return 'other';
  const code = rawCode.trim().toUpperCase();

  // Drogi i komunikacja
  if (code.startsWith('DR') || code === 'TK' || code === 'TI' || code === 'TP') {
    return 'road';
  }

  // Tereny mieszkaniowe i zabudowane
  if (code === 'B' || code === 'BP' || code === 'MW' || code === 'MN') {
    return 'residential';
  }

  // Tereny przemysłowe, kopaliny, inne tereny zabudowane
  if (code === 'BI' || code === 'BA' || code === 'U' || code === 'P' || code === 'PU' || code === 'KS') {
    return 'commercial';
  }

  // Lasy i grunty leśne
  if (code.startsWith('LS') || code.startsWith('LZ')) {
    return 'forest';
  }

  // Rekreacja i wypoczynek
  if (code === 'BZ' || code === 'ZP' || code === 'US') {
    return 'recreational';
  }

  // Grunty rolne, łąki, pastwiska, sady
  if (
    code.startsWith('R') ||
    code.startsWith('Ł') ||
    code.startsWith('L') ||
    code.startsWith('PS') ||
    code.startsWith('S') ||
    code.startsWith('BR') ||
    code.startsWith('WSR')
  ) {
    return 'agricultural';
  }

  return 'other';
}

/**
 * Parsuje odpowiedź HTML z KIEG GetFeatureInfo.
 */
export function parseKiegFeatureInfoHtml(html: string): KiegParcelEnrichment | null {
  if (!html || !html.includes('getfeatureinfo-egib')) return null;

  const getTableValue = (labelPattern: RegExp): string | undefined => {
    const match = html.match(new RegExp(`<tr><td>${labelPattern.source}<\\/td><td>(.*?)<\\/td><\\/tr>`, 'i'));
    if (!match || !match[1]) return undefined;
    const val = match[1].trim();
    return val.length > 0 ? val : undefined;
  };

  const id = getTableValue(/Identyfikator działki/i);
  const voivodeship = getTableValue(/Wojew[oó]dztwo/i);
  const county = getTableValue(/Powiat/i);
  const commune = getTableValue(/Nazwa gminy/i);
  const region = getTableValue(/Nazwa obr[eę]bu/i);
  const plotNumber = getTableValue(/Numer działki/i);
  const areaRaw = getTableValue(/Pole pow\..*?\(ha\)/i);
  const registryGroup = getTableValue(/Grupa rejestrowa/i);
  const landUseClassRaw = getTableValue(/Oznaczenie u[zż]ytku/i);
  const contourRaw = getTableValue(/Oznaczenie konturu/i);

  const effectiveUseClass = landUseClassRaw || contourRaw || undefined;
  const landUseType = effectiveUseClass ? classifyLandUseType(effectiveUseClass) : undefined;
  const areaHa = areaRaw ? parseFloat(areaRaw.replace(',', '.')) : undefined;

  return {
    id,
    voivodeship,
    county,
    commune,
    region,
    plotNumber,
    areaHa: Number.isFinite(areaHa) ? areaHa : undefined,
    registryGroup,
    landUseClass: effectiveUseClass,
    landUseType,
    classificationContour: contourRaw,
  };
}

/**
 * Odpytuje usługę KIEG (GetFeatureInfo) dla zadanego punktu w układzie EPSG:2180.
 */
export async function fetchKiegParcelDetails(
  x2180: number,
  y2180: number,
  signal?: AbortSignal
): Promise<KiegParcelEnrichment | null> {
  const delta = 10;
  const minX = x2180 - delta;
  const maxX = x2180 + delta;
  const minY = y2180 - delta;
  const maxY = y2180 + delta;

  // WMS 1.3.0 w EPSG:2180: BBOX = minX,minY,maxX,maxY (northing, easting)
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetFeatureInfo',
    LAYERS: 'dzialki,uzytki,kontury',
    QUERY_LAYERS: 'dzialki,uzytki,kontury',
    CRS: 'EPSG:2180',
    BBOX: `${minY.toFixed(2)},${minX.toFixed(2)},${maxY.toFixed(2)},${maxX.toFixed(2)}`,
    WIDTH: '101',
    HEIGHT: '101',
    I: '50',
    J: '50',
    INFO_FORMAT: 'text/html',
  });

  try {
    const res = await fetch(`${KIEG_WMS_URL}?${params}`, { signal });
    if (!res.ok) return null;
    const html = await res.text();
    return parseKiegFeatureInfoHtml(html);
  } catch {
    return null;
  }
}
