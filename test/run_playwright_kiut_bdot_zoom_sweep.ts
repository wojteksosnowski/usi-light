/**
 * Diagnostyka: użytkownik zgłosił, że po zmianie zoomu z 17 na 23, kafle GESUT (KIUT) i BDOT
 * ani razu się nie wymieniły — wygląda jakby renderer utknął na jednej wersji kafla, tylko
 * przeskalowanej. Ten test odtwarza to w REALNEJ przeglądarce (Playwright + Chromium), z
 * realnymi żądaniami sieciowymi do serwerów GUGiK, i loguje:
 *   - każde żądanie sieciowe do KIUT/BDOT (URL z bbox, z którego można odczytać z/x/y) i jego
 *     status/czas odpowiedzi,
 *   - jaki `targetZoom`/cache-key faktycznie trafia na ekran w danym kroku (przez instrumentację
 *     getTile/getTileFromMemory).
 *
 * Uruchomienie: npx tsx test/run_playwright_kiut_bdot_zoom_sweep.ts
 */
import { chromium, Request } from 'playwright';
import { createServer, ViteDevServer } from 'vite';
import path from 'path';

async function run() {
  console.log('\n=== KIUT/BDOT zoom sweep 17 -> 23 (real network, real Chromium) ===\n');

  const server: ViteDevServer = await createServer({
    configFile: path.resolve(process.cwd(), 'vite.config.ts'),
    server: { port: 5197, strictPort: true },
  });
  await server.listen();
  const serverUrl = 'http://localhost:5197/test/zoom_profile_runner.html';

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  const requests: { url: string; z: string | null }[] = [];
  page.on('request', (req: Request) => {
    const url = req.url();
    if (url.includes('KrajowaIntegracjaUzbrojeniaTerenu') || url.includes('KrajowaIntegracjaBazDanychObiektowTopograficznych')) {
      requests.push({ url, z: null });
    }
  });
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('KrajowaIntegracjaUzbrojeniaTerenu') || url.includes('KrajowaIntegracjaBazDanychObiektowTopograficznych')) {
      const which = url.includes('Uzbrojenia') ? 'KIUT' : 'BDOT';
      let size = 0;
      try {
        const body = await res.body();
        size = body.length;
      } catch {}
      console.log(`[NET] ${which} status=${res.status()} size=${size}B url=${url.slice(0, 140)}`);
    }
  });

  await page.goto(serverUrl, { waitUntil: 'networkidle' });

  const results: any[] = await page.evaluate(`
    window.__runZoomProfile({
      startSpanM: 712,
      endSpanM: 3,
      steps: 40,
      settleMsPerStep: 300,
      framesPerStep: 3,
      lat: 52.2297,
      lon: 21.0122,
      projectRadius: 200,
      enableOrtho: false,
      enableKiut: true,
      enableBdot: true,
      enableSatellite: false,
    })
  `);

  console.table(
    results.map((r: any) => ({
      step: r.step,
      exactZoom: r.exactZoom,
      targetZoom: r.targetZoom,
      flip: r.zoomFlip ? 'YES' : '',
      kiutDraws: r.kiutDraws,
      bdotDraws: r.bdotDraws,
    }))
  );

  console.log(`\nTotal KIUT/BDOT network requests observed: ${requests.length}`);

  await browser.close();
  await server.close();
}

run().catch((err) => {
  console.error('[ERROR]', err);
  process.exit(1);
});
