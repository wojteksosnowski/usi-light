import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WFS_TARGETS } from './wfs';

/**
 * Zapobiega regresji z commita f69fd8e3 ("consolidate WFS proxies..."), który usunął
 * dedykowane pliki proxy (api/egib-wfs.ts, api/krakow-wfs.ts, itd.) i skonsolidował je w
 * api/wfs.ts z routingiem przez ?target=<klucz> — ale ŻADEN klient WFS nie został
 * zaktualizowany, więc wszystkie dalej wołały martwe ścieżki (zawsze 404, niezależnie od
 * BBOX/miasta). Ten test statycznie sprawdza, że każdy bazowy URL proxy używany przez
 * klientów WFS albo wskazuje na istniejący plik `api/<name>.ts`, albo na istniejący klucz
 * w `WFS_TARGETS` (jeśli używa wzorca `/api/wfs?target=<klucz>`) — dokładnie replikując
 * logikę `api-dev-middleware` w `vite.config.ts` (mapowanie ścieżka -> plik, existsSync).
 *
 * Lista poniżej musi być aktualizowana ręcznie, gdy dochodzi nowy klient WFS z własnym
 * bazowym URL-em proxy — to świadomy koszt, w zamian za zerowe zależności od fragile
 * parsowania źródeł innych plików.
 */

const API_DIR = fileURLToPath(new URL('.', import.meta.url));

const PROXY_URLS: { file: string; url: string }[] = [
  { file: 'wfsEgibClient.ts', url: '/api/wfs?target=egib-wfs' },
  { file: 'wfsKrakowClient.ts', url: '/api/wfs?target=krakow-wfs' },
  { file: 'wfsLcvClient.ts', url: '/api/wfs?target=lcv-wfs' },
  { file: 'wfsMpzpPoznanClient.ts', url: '/api/wfs?target=poznan-mpzp-wfs' },
  { file: 'wfsMpzpKrakowClient.ts', url: '/api/wfs?target=krakow-mpzp-wfs' },
  { file: 'wfsMpzpGdyniaClient.ts', url: '/api/wfs?target=gdynia-mpzp-wfs' },
  { file: 'wfsMpzpWroclawClient.ts', url: '/api/wfs?target=wroclaw-mpzp-wfs' },
  { file: 'wfsPoznanClient.ts', url: '/api/wfs?target=poznan-egib' },
];

function resolveRoutePath(url: string): { kind: 'file'; routePath: string } | { kind: 'target'; target: string } {
  const [pathname, query] = url.split('?');
  if (pathname === '/api/wfs' && query) {
    const params = new URLSearchParams(query);
    const target = params.get('target');
    if (!target) throw new Error(`URL ${url} wskazuje na /api/wfs, ale brakuje parametru target`);
    return { kind: 'target', target };
  }
  return { kind: 'file', routePath: pathname.replace(/^\/api\//, '') };
}

describe('proxy WFS — brak martwych tras API (regresja f69fd8e3)', () => {
  for (const { file, url } of PROXY_URLS) {
    it(`${file}: "${url}" wskazuje na żywy endpoint`, () => {
      const resolved = resolveRoutePath(url);
      if (resolved.kind === 'file') {
        const absolutePath = path.join(API_DIR, `${resolved.routePath}.ts`);
        expect(
          existsSync(absolutePath),
          `Plik ${absolutePath} nie istnieje — "${url}" jest martwą trasą (404 w dev i w produkcji).`
        ).toBe(true);
      } else {
        expect(
          Object.prototype.hasOwnProperty.call(WFS_TARGETS, resolved.target),
          `Klucz "${resolved.target}" nie istnieje w WFS_TARGETS (api/wfs.ts) — "${url}" jest martwą trasą.`
        ).toBe(true);
      }
    });
  }
});
