/**
 * Baseline (i po fixie: porównanie) rzeczywistego kosztu renderu Canvas 2D dla samego
 * satelity Google, w zakresie zoomu przecinającym kilka pełnych pasm całkowitego zoomu
 * (np. 17.3 -> 20.3), żeby zweryfikować w PRAWDZIWEJ przeglądarce (Playwright + Chromium,
 * realny <canvas> 2D, realne żądania sieciowe) hipotezę: kafle rysowane w powiększeniu
 * (offset = exactZoom - targetZoom > 0, tj. "Z.01"-"Z.49") kosztują istotnie więcej niż
 * kafle pomniejszane (offset < 0, "Z.50"-"Z.99") z powodu ctx.imageSmoothingQuality='high'
 * zastosowanego bez warunku do powiększanych kafli.
 *
 * Uruchomienie: npx tsx test/run_playwright_satellite_zoom_baseline.ts
 */
import { chromium } from 'playwright';
import { createServer, ViteDevServer } from 'vite';
import path from 'path';

async function run() {
  const channelArg = process.argv.find((a) => a.startsWith('--channel='));
  const channel = channelArg ? channelArg.split('=')[1] : undefined; // undefined = bundled Chromium

  console.log('\n===============================================================');
  console.log(`SATELLITE-ONLY ZOOM BAND PROFILE (real canvas, real network) — channel=${channel ?? 'chromium'}`);
  console.log('===============================================================\n');

  const server: ViteDevServer = await createServer({
    configFile: path.resolve(process.cwd(), 'vite.config.ts'),
    server: { port: 5198, strictPort: true },
  });
  await server.listen();
  const serverUrl = 'http://localhost:5198/test/zoom_profile_runner.html';

  const browser = await chromium.launch({
    headless: true,
    channel,
    args: ['--enable-webgl', '--enable-gpu-rasterization', '--no-sandbox', '--disable-setuid-sandbox'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1024 } });
  const page = await context.newPage();

  await page.goto(serverUrl, { waitUntil: 'networkidle' });

  // startSpanM/endSpanM chosen so exactZoom sweeps roughly 17.3 -> 20.3 (crosses 3 full
  // integer bands: 18, 19, 20), see plan math: exactZoom = log2(114832031 / spanM) at
  // lat=52.2297, viewport width 1200.
  const results: any[] = await page.evaluate(`
    window.__runZoomProfile({
      startSpanM: 712,
      endSpanM: 89,
      steps: 120,
      settleMsPerStep: 60,
      framesPerStep: 6,
      lat: 52.2297,
      lon: 21.0122,
      projectRadius: 200,
      enableOrtho: false,
      enableKiut: false,
      enableBdot: false,
      enableSatellite: true,
    })
  `);

  const rows = results.map((r: any) => {
    const offset = Number((r.exactZoom - r.targetZoom).toFixed(3));
    return { ...r, offset, magnified: offset > 0 };
  });

  console.table(
    rows.map((r) => ({
      step: r.step,
      exactZoom: r.exactZoom,
      targetZoom: r.targetZoom,
      offset: r.offset,
      'mag?': r.magnified ? 'YES' : '',
      avgFrameMs: r.avgFrameMs,
      maxFrameMs: r.maxFrameMs,
      drawCalls: r.drawCalls,
      longTasks: r.longTasksCount,
      longTasksMs: r.longTasksTotalMs,
    }))
  );

  const magnified = rows.filter((r) => r.magnified);
  const minified = rows.filter((r) => !r.magnified);
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  console.log('\n=== MAGNIFIED (offset > 0, "Z.01"-"Z.49") vs MINIFIED (offset < 0, "Z.50"-"Z.99") ===');
  console.log(`magnified steps: ${magnified.length}, minified steps: ${minified.length}`);
  console.log(`avg(avgFrameMs)  magnified=${avg(magnified.map((r) => r.avgFrameMs)).toFixed(3)}  minified=${avg(minified.map((r) => r.avgFrameMs)).toFixed(3)}`);
  console.log(`avg(maxFrameMs)  magnified=${avg(magnified.map((r) => r.maxFrameMs)).toFixed(3)}  minified=${avg(minified.map((r) => r.maxFrameMs)).toFixed(3)}`);
  console.log(`total longTasksMs  magnified=${magnified.reduce((a, r) => a + r.longTasksTotalMs, 0).toFixed(1)}  minified=${minified.reduce((a, r) => a + r.longTasksTotalMs, 0).toFixed(1)}`);

  await browser.close();
  await server.close();
}

run().catch((err) => {
  console.error('[ERROR]', err);
  process.exit(1);
});
