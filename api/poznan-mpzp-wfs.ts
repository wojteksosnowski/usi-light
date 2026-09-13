import { createWfsProxyHandler } from './_lib/wfsProxy';

/**
 * Proxy dla poznańskiego serwisu WFS MPZP (Miejska Pracownia Urbanistyczna):
 * Upstream: https://gis.mpu.pl/server/services/Hosted/ZbiorDanychPrzestrzennychMPZP/MapServer/WFSServer
 */
export default createWfsProxyHandler(
  'https://gis.mpu.pl/server/services/Hosted/ZbiorDanychPrzestrzennychMPZP/MapServer/WFSServer',
  new Set([
    'ZbiorDanychPrzestrzennychMPZP:app.WydzieleniePlanistyczne.MPZP',
    'ZbiorDanychPrzestrzennychMPZP:app.LinieZabudowy.MPZP',
    'ZbiorDanychPrzestrzennychMPZP:app.AktPlanowaniaPrzestrzennego.MPZP',
  ]),
  'TYPENAME'
);
