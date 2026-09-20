import type { VercelRequest, VercelResponse } from '@vercel/node';

interface WfsTargetConfig {
  upstreamUrl: string;
  allowedTypeNames: Set<string>;
  typeNameParam: string;
}

export const WFS_TARGETS: Record<string, WfsTargetConfig> = {
  // GUGiK EGiB
  egib: {
    upstreamUrl: 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/EGIB/WFS/UslugaZbiorcza',
    allowedTypeNames: new Set(['ms:budynki', 'ms:dzialki']),
    typeNameParam: 'typeNames',
  },
  'egib-wfs': {
    upstreamUrl: 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/EGIB/WFS/UslugaZbiorcza',
    allowedTypeNames: new Set(['ms:budynki', 'ms:dzialki']),
    typeNameParam: 'typeNames',
  },

  // Kraków EGiB
  krakow: {
    upstreamUrl: 'https://geodezja.eco.um.krakow.pl/krakow-egib',
    allowedTypeNames: new Set(['ms:budynki', 'ms:dzialki']),
    typeNameParam: 'TYPENAME',
  },
  'krakow-wfs': {
    upstreamUrl: 'https://geodezja.eco.um.krakow.pl/krakow-egib',
    allowedTypeNames: new Set(['ms:budynki', 'ms:dzialki']),
    typeNameParam: 'TYPENAME',
  },

  // GUGiK Pokrycie Terenu (LCV)
  lcv: {
    upstreamUrl: 'https://mapy.geoportal.gov.pl/wss/service/wfsLCV/guest',
    allowedTypeNames: new Set(['lcv:LandCoverUnit']),
    typeNameParam: 'typeName',
  },
  'lcv-wfs': {
    upstreamUrl: 'https://mapy.geoportal.gov.pl/wss/service/wfsLCV/guest',
    allowedTypeNames: new Set(['lcv:LandCoverUnit']),
    typeNameParam: 'typeName',
  },

  // Gdynia MPZP
  gdynia: {
    upstreamUrl: 'https://geo.bppmg.pl/server/services/MPZP/ZbiorDanychPrzestrzennychMPZP/MapServer/WFSServer',
    allowedTypeNames: new Set(['MPZP_ZbiorDanychPrzestrzennychMPZP:AktPlanowaniaPrzestrzennego.MPZP']),
    typeNameParam: 'TYPENAME',
  },
  'gdynia-mpzp': {
    upstreamUrl: 'https://geo.bppmg.pl/server/services/MPZP/ZbiorDanychPrzestrzennychMPZP/MapServer/WFSServer',
    allowedTypeNames: new Set(['MPZP_ZbiorDanychPrzestrzennychMPZP:AktPlanowaniaPrzestrzennego.MPZP']),
    typeNameParam: 'TYPENAME',
  },
  'gdynia-mpzp-wfs': {
    upstreamUrl: 'https://geo.bppmg.pl/server/services/MPZP/ZbiorDanychPrzestrzennychMPZP/MapServer/WFSServer',
    allowedTypeNames: new Set(['MPZP_ZbiorDanychPrzestrzennychMPZP:AktPlanowaniaPrzestrzennego.MPZP']),
    typeNameParam: 'TYPENAME',
  },

  // Kraków MPZP
  'krakow-mpzp': {
    upstreamUrl: 'https://msip3.um.krakow.pl/server/services/Pobieranie/BP_MPZP_POBIERANIE/MapServer/WFSServer',
    allowedTypeNames: new Set([
      'BP_MPZP_POBIERANIE:Przeznaczenia_MPZP',
      'BP_MPZP_POBIERANIE:Plany_obowiązujące',
      'BP_MPZP_POBIERANIE:Plany_sporządzane',
      'BP_MPZP_POBIERANIE:Plany_uchwalone_-_przed_wejściem_w_życie',
    ]),
    typeNameParam: 'TYPENAME',
  },
  'krakow-mpzp-wfs': {
    upstreamUrl: 'https://msip3.um.krakow.pl/server/services/Pobieranie/BP_MPZP_POBIERANIE/MapServer/WFSServer',
    allowedTypeNames: new Set([
      'BP_MPZP_POBIERANIE:Przeznaczenia_MPZP',
      'BP_MPZP_POBIERANIE:Plany_obowiązujące',
      'BP_MPZP_POBIERANIE:Plany_sporządzane',
      'BP_MPZP_POBIERANIE:Plany_uchwalone_-_przed_wejściem_w_życie',
    ]),
    typeNameParam: 'TYPENAME',
  },

  // Poznań MPZP
  poznan: {
    upstreamUrl: 'https://gis.mpu.pl/server/services/Hosted/ZbiorDanychPrzestrzennychMPZP/MapServer/WFSServer',
    allowedTypeNames: new Set([
      'ZbiorDanychPrzestrzennychMPZP:app.WydzieleniePlanistyczne.MPZP',
      'ZbiorDanychPrzestrzennychMPZP:app.LinieZabudowy.MPZP',
      'ZbiorDanychPrzestrzennychMPZP:app.AktPlanowaniaPrzestrzennego.MPZP',
    ]),
    typeNameParam: 'TYPENAME',
  },
  'poznan-mpzp': {
    upstreamUrl: 'https://gis.mpu.pl/server/services/Hosted/ZbiorDanychPrzestrzennychMPZP/MapServer/WFSServer',
    allowedTypeNames: new Set([
      'ZbiorDanychPrzestrzennychMPZP:app.WydzieleniePlanistyczne.MPZP',
      'ZbiorDanychPrzestrzennychMPZP:app.LinieZabudowy.MPZP',
      'ZbiorDanychPrzestrzennychMPZP:app.AktPlanowaniaPrzestrzennego.MPZP',
    ]),
    typeNameParam: 'TYPENAME',
  },
  'poznan-mpzp-wfs': {
    upstreamUrl: 'https://gis.mpu.pl/server/services/Hosted/ZbiorDanychPrzestrzennychMPZP/MapServer/WFSServer',
    allowedTypeNames: new Set([
      'ZbiorDanychPrzestrzennychMPZP:app.WydzieleniePlanistyczne.MPZP',
      'ZbiorDanychPrzestrzennychMPZP:app.LinieZabudowy.MPZP',
      'ZbiorDanychPrzestrzennychMPZP:app.AktPlanowaniaPrzestrzennego.MPZP',
    ]),
    typeNameParam: 'TYPENAME',
  },

  // Poznań EGiB (budynki/działki z wierzchołkami)
  'poznan-egib': {
    upstreamUrl: 'https://sipuslugiogc1.geopoz.poznan.pl/WFS_SIP_EWIDENCJA/service.svc/get',
    allowedTypeNames: new Set(['gmgml:Budynki_ewidencyjne', 'gmgml:Działki_ewidencyjne']),
    typeNameParam: 'typeNames',
  },

  // Wrocław MPZP
  wroclaw: {
    upstreamUrl: 'http://gis1.um.wroc.pl/arcgis/services/ogc/OGC_mpzp/MapServer/WFSServer',
    allowedTypeNames: new Set([
      'OGC_mpzp:tereny',
      'OGC_mpzp:przeznaczenie_terenu_-_uproszczona_klasyfikacja',
      'OGC_mpzp:linie_zabudowy',
      'OGC_mpzp:linie_rozgraniczajace',
      'OGC_mpzp:obowiazujace_plany_miejscowe',
    ]),
    typeNameParam: 'TYPENAME',
  },
  'wroclaw-mpzp': {
    upstreamUrl: 'http://gis1.um.wroc.pl/arcgis/services/ogc/OGC_mpzp/MapServer/WFSServer',
    allowedTypeNames: new Set([
      'OGC_mpzp:tereny',
      'OGC_mpzp:przeznaczenie_terenu_-_uproszczona_klasyfikacja',
      'OGC_mpzp:linie_zabudowy',
      'OGC_mpzp:linie_rozgraniczajace',
      'OGC_mpzp:obowiazujace_plany_miejscowe',
    ]),
    typeNameParam: 'TYPENAME',
  },
  'wroclaw-mpzp-wfs': {
    upstreamUrl: 'http://gis1.um.wroc.pl/arcgis/services/ogc/OGC_mpzp/MapServer/WFSServer',
    allowedTypeNames: new Set([
      'OGC_mpzp:tereny',
      'OGC_mpzp:przeznaczenie_terenu_-_uproszczona_klasyfikacja',
      'OGC_mpzp:linie_zabudowy',
      'OGC_mpzp:linie_rozgraniczajace',
      'OGC_mpzp:obowiazujace_plany_miejscowe',
    ]),
    typeNameParam: 'TYPENAME',
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Niedozwolona metoda HTTP.' });
  }

  const targetKey = (req.query.target as string) || (req.query.service_type as string);
  if (!targetKey || !WFS_TARGETS[targetKey]) {
    return res.status(400).json({
      error: `Nieznany cel WFS: "${targetKey}". Dostępne: ${Object.keys(WFS_TARGETS).filter((k) => !k.endsWith('-wfs')).join(', ')}`,
    });
  }

  const config = WFS_TARGETS[targetKey];
  const serviceParam = req.query.SERVICE ?? req.query.service;
  const typeNameValue = req.query[config.typeNameParam] || req.query[config.typeNameParam.toLowerCase()] || req.query[config.typeNameParam.toUpperCase()];

  if (
    typeof serviceParam !== 'string' ||
    serviceParam.toUpperCase() !== 'WFS' ||
    typeof typeNameValue !== 'string' ||
    !config.allowedTypeNames.has(typeNameValue)
  ) {
    return res.status(400).json({ error: 'Nieprawidłowe parametry zapytania WFS.' });
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'target' || key === 'service_type') continue;
    if (typeof value === 'string') params.set(key, value);
  }

  try {
    const upstreamRes = await fetch(`${config.upstreamUrl}?${params}`);
    const body = await upstreamRes.text();
    res.setHeader('Content-Type', upstreamRes.headers.get('content-type') || 'text/xml; charset=UTF-8');
    return res.status(upstreamRes.status).send(body);
  } catch (err) {
    console.error(`Błąd proxy WFS (${config.upstreamUrl}):`, err);
    return res.status(502).json({ error: 'Nie udało się połączyć z serwisem WFS.' });
  }
}
