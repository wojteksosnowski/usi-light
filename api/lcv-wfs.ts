import { createWfsProxyHandler } from './_lib/wfsProxy';

/**
 * Proxy dla ogólnopolskiej usługi WFS GUGiK "pokrycie terenu" (INSPIRE Land Cover, wfsLCV).
 * Ten sam host (`mapy.geoportal.gov.pl`) co krajowy EGiB, który — sprawdzone — nie wysyła
 * nagłówków CORS, więc zakładamy ten sam wymóg proxy zamiast bezpośredniego fetch()
 * z przeglądarki (patrz `api/egib-wfs.ts`).
 */
export default createWfsProxyHandler(
  'https://mapy.geoportal.gov.pl/wss/service/wfsLCV/guest',
  new Set(['lcv:LandCoverUnit']),
  'typeName'
);
