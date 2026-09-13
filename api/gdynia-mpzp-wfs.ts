import { createWfsProxyHandler } from './_lib/wfsProxy';

/**
 * Proxy dla gdyńskiego serwisu WFS MPZP (Biuro Planowania Przestrzennego Miasta Gdyni):
 * Upstream: https://geo.bppmg.pl/server/services/MPZP/ZbiorDanychPrzestrzennychMPZP/MapServer/WFSServer
 */
export default createWfsProxyHandler(
  'https://geo.bppmg.pl/server/services/MPZP/ZbiorDanychPrzestrzennychMPZP/MapServer/WFSServer',
  new Set([
    'MPZP_ZbiorDanychPrzestrzennychMPZP:AktPlanowaniaPrzestrzennego.MPZP',
  ]),
  'TYPENAME'
);
