import { createWfsProxyHandler } from './_lib/wfsProxy';

/**
 * Proxy dla krakowskiego serwisu WFS MPZP:
 * Upstream: https://msip3.um.krakow.pl/server/services/Pobieranie/BP_MPZP_POBIERANIE/MapServer/WFSServer
 */
export default createWfsProxyHandler(
  'https://msip3.um.krakow.pl/server/services/Pobieranie/BP_MPZP_POBIERANIE/MapServer/WFSServer',
  new Set([
    'BP_MPZP_POBIERANIE:Przeznaczenia_MPZP',
    'BP_MPZP_POBIERANIE:Plany_obowiązujące',
    'BP_MPZP_POBIERANIE:Plany_sporządzane',
    'BP_MPZP_POBIERANIE:Plany_uchwalone_-_przed_wejściem_w_życie',
  ]),
  'TYPENAME'
);
