/**
 * ⚠️ NIEUŻYWANE (świadomie) — patrz komentarz przy `ensureOvertureContextLoaded()` w
 * `ProjectGroup.tsx`. Ten moduł działa poprawnie (glob-bug z `*` na HTTPS naprawiony,
 * listing plików przez REST API S3 zamiast wildcarda), ale w praktyce zacinał aplikację:
 * paczki `mvp`/`eh` DuckDB-WASM są jednowątkowe, więc ~32 (wody) do ~128 (drogi/koleje)
 * plików Parquet jest otwieranych SEKWENCYJNIE, każdy z round-tripem do `us-west-2` (USA) —
 * dziesiątki sekund do ponad minuty bez wskaźnika postępu. Zostaje w repo dla kogoś, kto
 * podejmie ten temat później (np. z wielowątkową paczką `coi` + nagłówkami COOP/COEP, albo
 * z realnym wskaźnikiem postępu + limitem czasu) — nie trzeba tego odkrywać od nowa.
 *
 * Silnik zapytań SQL nad surowymi danymi Overture Maps (GeoParquet na S3), uruchomiony
 * w całości w przeglądarce przez DuckDB-WASM — bez serverless, bez natywnych binarek.
 *
 * Historia decyzji (patrz plan implementacji Overture):
 * - `duckdb` (natywny pakiet Node) nie ma prebuilt binarki dla Node v26/arm64 — kompilacja
 *   ze źródeł wisiała godzinami przy próbie stworzenia własnego endpointu serverless.
 * - `@motherduck/wasm-client` to klient powiązany z kontem MotherDuck, nie ogólny silnik SQL.
 * - `@duckdb/duckdb-wasm` to oficjalny, ogólny silnik DuckDB skompilowany do WASM — działa
 *   w Web Workerze, nie wymaga konta/tokenu, i może czytać dowolne pliki Parquet po HTTP(S)
 *   przez rozszerzenie `httpfs`. Zweryfikowano empirycznie (curl), że bucket S3
 *   `overturemaps-us-west-2` ma w pełni otwarty CORS (`Access-Control-Allow-Origin: *`,
 *   `Access-Control-Expose-Headers: ... Content-Range, Accept-Ranges`), więc ranged HTTP
 *   reads (fragmenty Parquet) działają wprost z przeglądarki.
 *
 * `api.overturemapsapi.com` (wrapper REST, `overtureMapsApiClient.ts`) zostaje dla zieleni
 * (`/base` land_use+land_cover — działa poprawnie), ale nie ma geometrii dla dróg/kolei poza
 * kilkoma miastami demo, i w ogóle nie eksponuje wód — stąd ten moduł czyta je bezpośrednio
 * z surowych partycji Overture (`theme=transportation/type=segment`, `theme=base/type=water`).
 */

import { GeoJsonFeatureCollection } from './wfsWarsawClient';

// Nazwa aktualnego wydania Overture — zweryfikowana listingiem S3 (`?list-type=2&prefix=release/`).
// Overture wypuszcza nowe wydania co ok. miesiąc; tę wartość trzeba wtedy zbumpować.
const OVERTURE_RELEASE = '2026-08-19.0';
const OVERTURE_S3_BUCKET = 'https://overturemaps-us-west-2.s3.amazonaws.com';

/**
 * DuckDB-WASM nie rozwija `*` na końcu zwykłego adresu `https://` jako glob (to działa tylko
 * przy schemacie `s3://` ze skonfigurowanym regionem) — zweryfikowane empirycznie: próba
 * `read_parquet('https://.../type=segment/*')` kończyła się 404 (żądanie leciało z dosłowną
 * gwiazdką w URL-u). Listujemy więc pliki sami przez zwykłe REST API S3 (ten sam bucket ma
 * otwarty CORS, zweryfikowane wcześniej) i przekazujemy do `read_parquet` jawną tablicę URL-i.
 */
async function listOvertureParquetFiles(theme: string, type: string): Promise<string[]> {
  const prefix = `release/${OVERTURE_RELEASE}/theme=${theme}/type=${type}/`;
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const params = new URLSearchParams({ 'list-type': '2', prefix, 'max-keys': '1000' });
    if (continuationToken) params.set('continuation-token', continuationToken);

    const res = await fetch(`${OVERTURE_S3_BUCKET}/?${params}`);
    if (!res.ok) throw new Error(`Listowanie plików Overture (${theme}/${type}): ${res.status}`);
    const xml = await res.text();

    const keyMatches = xml.matchAll(/<Key>(.*?)<\/Key>/g);
    for (const m of keyMatches) keys.push(m[1]);

    const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
    const tokenMatch = xml.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/);
    continuationToken = truncated ? tokenMatch?.[1] : undefined;
  } while (continuationToken);

  if (keys.length === 0) {
    throw new Error(`Brak plików Overture dla ${theme}/${type} (release ${OVERTURE_RELEASE}) — sprawdź czy nazwa wydania jest aktualna.`);
  }

  return keys.map((key) => `${OVERTURE_S3_BUCKET}/${key}`);
}

// Ograniczamy zapytania do rozsądnego zasięgu (promień projektu jest i tak max. kilkaset metrów) —
// zabezpieczenie przed przypadkowym zeskanowaniem całego globalnego zbioru.
const MAX_BBOX_DEGREES = 0.5;

type DuckDbModule = typeof import('@duckdb/duckdb-wasm');

let dbPromise: Promise<{ db: import('@duckdb/duckdb-wasm').AsyncDuckDB; mod: DuckDbModule }> | null = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const duckdb = await import('@duckdb/duckdb-wasm');
      // Zasoby (.wasm/.worker.js) hostowane lokalnie przez nasz bundler (import ?url) —
      // brak zależności od CDN, zgodnie z zasadą samowystarczalnej aplikacji.
      const [mvpWasm, mvpWorker, ehWasm, ehWorker] = await Promise.all([
        import('@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'),
        import('@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'),
        import('@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'),
        import('@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'),
      ]);

      const bundles: import('@duckdb/duckdb-wasm').DuckDBBundles = {
        mvp: { mainModule: mvpWasm.default, mainWorker: mvpWorker.default },
        eh: { mainModule: ehWasm.default, mainWorker: ehWorker.default },
      };

      const bundle = await duckdb.selectBundle(bundles);
      const worker = new Worker(bundle.mainWorker!);
      const logger = new duckdb.VoidLogger();
      const db = new duckdb.AsyncDuckDB(logger, worker);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

      const conn = await db.connect();
      await conn.query(`INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;`);
      await conn.close();

      return { db, mod: duckdb };
    })();
  }
  return dbPromise;
}

export interface OvertureBboxQuery {
  theme: 'transportation' | 'base';
  type: 'segment' | 'water';
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  /** Kolumny do wybrania (poza geometrią) — trzymamy wąskie, żeby uniknąć złożonych typów Arrow (struct/list). */
  columns: string[];
}

async function queryOvertureBbox(params: OvertureBboxQuery): Promise<GeoJsonFeatureCollection> {
  const { theme, type, minLon, minLat, maxLon, maxLat, columns } = params;

  if (maxLon - minLon > MAX_BBOX_DEGREES || maxLat - minLat > MAX_BBOX_DEGREES) {
    throw new Error(`Zbyt duży zasięg zapytania Overture (maks. ${MAX_BBOX_DEGREES}° na bok).`);
  }

  const fileUrls = await listOvertureParquetFiles(theme, type);
  const { db } = await getDb();
  const conn = await db.connect();
  try {
    const fileList = fileUrls.map((u) => `'${u}'`).join(', ');
    const columnList = columns.map((c) => `"${c}"`).join(', ');
    const sql = `
      SELECT ${columnList}, ST_AsGeoJSON(geometry) AS geom_json
      FROM read_parquet([${fileList}])
      WHERE bbox.xmin <= ${maxLon} AND bbox.xmax >= ${minLon}
        AND bbox.ymin <= ${maxLat} AND bbox.ymax >= ${minLat}
    `;
    const result = await conn.query(sql);
    const rows = result.toArray().map((row) => row.toJSON());

    const features = rows
      .map((row: Record<string, unknown>) => {
        const { geom_json, ...properties } = row;
        if (!geom_json) return null;
        return {
          type: 'Feature' as const,
          geometry: JSON.parse(geom_json as string),
          properties,
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);

    return { type: 'FeatureCollection', features };
  } finally {
    await conn.close();
  }
}

/** Segmenty transportu (drogi, koleje) — `theme=transportation/type=segment`, z realną geometrią. */
export function fetchOvertureTransportationRaw(
  minLon: number,
  minLat: number,
  maxLon: number,
  maxLat: number
): Promise<GeoJsonFeatureCollection> {
  return queryOvertureBbox({
    theme: 'transportation',
    type: 'segment',
    minLon,
    minLat,
    maxLon,
    maxLat,
    columns: ['id', 'subtype', 'class'],
  });
}

/** Wody powierzchniowe — `theme=base/type=water`. Niedostępne przez `api.overturemapsapi.com`. */
export function fetchOvertureWaterRaw(
  minLon: number,
  minLat: number,
  maxLon: number,
  maxLat: number
): Promise<GeoJsonFeatureCollection> {
  return queryOvertureBbox({
    theme: 'base',
    type: 'water',
    minLon,
    minLat,
    maxLon,
    maxLat,
    columns: ['id', 'subtype', 'class'],
  });
}
