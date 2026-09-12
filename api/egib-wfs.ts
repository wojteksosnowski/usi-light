import { createWfsProxyHandler } from './_lib/wfsProxy';

/**
 * Proxy dla krajowej zbiorczej usługi WFS EGiB (GUGiK) — używany jako ogólnopolski
 * fallback pobierania budynków dla miast bez własnego dedykowanego serwisu WFS
 * (np. Wrocław, Gdańsk, Poznań). Serwer wymaga parametru `typeNames` (WFS 2.0.0,
 * małe litery) i nie wysyła nagłówków CORS.
 */
export default createWfsProxyHandler(
  'https://mapy.geoportal.gov.pl/wss/service/PZGIK/EGIB/WFS/UslugaZbiorcza',
  new Set(['ms:budynki', 'ms:dzialki']),
  'typeNames'
);
