import type { VercelRequest, VercelResponse } from '@vercel/node';

// Proxy dla kafli WMS GESUT/BDOT z serwisu miejskiego Poznania — serwer
// (portal.geopoz.poznan.pl) zwraca zdublowany, niepoprawny nagłówek
// Access-Control-Allow-Origin ("<origin>, *"), który przeglądarka odrzuca jako
// CORS-niezgodny (błąd widoczny w konsoli, kafle nigdy się nie ładują).
// Ten proxy pobiera kafel po stronie serwera (fetch() w Node nie podlega CORS)
// i zwraca go z jednym, poprawnym nagłówkiem — analogicznie do api/wfs.ts,
// ale dla binarnych obrazów WMS zamiast tekstowych odpowiedzi WFS/GML.
const WMS_TARGETS: Record<string, string> = {
  gesut: 'https://portal.geopoz.poznan.pl/wmsgesut',
  bdot: 'https://portal.geopoz.poznan.pl/wmsbdot',
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

  const targetKey = req.query.target as string;
  const upstreamUrl = targetKey ? WMS_TARGETS[targetKey] : undefined;
  if (!upstreamUrl) {
    return res.status(400).json({
      error: `Nieznany cel WMS: "${targetKey}". Dostępne: ${Object.keys(WMS_TARGETS).join(', ')}`,
    });
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'target') continue;
    if (typeof value === 'string') params.set(key, value);
  }

  try {
    const upstreamRes = await fetch(`${upstreamUrl}?${params}`);
    const buffer = Buffer.from(await upstreamRes.arrayBuffer());
    res.setHeader('Content-Type', upstreamRes.headers.get('content-type') || 'image/png');
    return res.status(upstreamRes.status).send(buffer);
  } catch (err) {
    console.error(`Błąd proxy WMS (${upstreamUrl}):`, err);
    return res.status(502).json({ error: 'Nie udało się połączyć z serwisem WMS.' });
  }
}
