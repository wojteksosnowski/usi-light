import { createWfsProxyHandler } from './_lib/wfsProxy';

/**
 * Proxy dla krakowskiego serwisu WFS EGiB — serwer nie wysyła nagłówków CORS,
 * więc przeglądarka blokuje bezpośredni fetch() z frontendu ("Failed to fetch").
 */
export default createWfsProxyHandler(
  'https://geodezja.eco.um.krakow.pl/krakow-egib',
  new Set(['ms:budynki', 'ms:dzialki']),
  'TYPENAME'
);
