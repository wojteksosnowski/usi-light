/**
 * Izolowany mikrobenchmark: koszt ctx.imageSmoothingQuality='high' vs domyślnej ('low')
 * przy powiększaniu (upscaling) realnego kafla satelitarnego JPEG na Canvas 2D, w realnej
 * przeglądarce (headless Chromium i/lub Edge przez Playwright).
 *
 * Kontekst: `git diff main` pokazuje, że branch `geo` DODAŁ `ctx.imageSmoothingQuality = 'high'`
 * w satelliteMapRenderer.ts/wmsOverlayRenderer.ts — main (działający płynnie na produkcji) tego
 * nie ustawia (zostaje domyślna, najszybsza jakość). To jedyna realna różnica w logice rysowania
 * kafli między działającą a laggy wersją. Ten mikrobenchmark izoluje TYLKO tę jedną zmienną.
 *
 * Uruchomienie: npx tsx test/run_playwright_smoothing_quality_microbench.ts [--channel=msedge]
 */
import { chromium } from 'playwright';

const PAGE_SCRIPT = `
(async () => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  const url = 'https://mt1.google.com/vt/lyrs=s&x=18000&y=10800&z=15';
  await new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('tile load failed'));
    img.src = url;
  });

  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 900;
  const ctx = canvas.getContext('2d');

  function benchQuality(quality, destSize, iterations) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = quality;
    for (let i = 0; i < 5; i++) ctx.drawImage(img, 0, 0, destSize, destSize);
    const t0 = performance.now();
    for (let i = 0; i < iterations; i++) {
      ctx.drawImage(img, 0, 0, destSize, destSize);
    }
    const total = performance.now() - t0;
    return { quality, destSize, iterations, totalMs: total, msPerDraw: total / iterations };
  }

  const rows = [];
  for (const destSize of [256, 360, 512]) {
    for (const quality of ['low', 'high']) {
      rows.push(benchQuality(quality, destSize, 300));
    }
  }
  return rows;
})()
`;

async function run() {
  const channelArg = process.argv.find((a) => a.startsWith('--channel='));
  const channel = channelArg ? channelArg.split('=')[1] : undefined;

  console.log(`\n=== imageSmoothingQuality microbench — channel=${channel ?? 'chromium'} ===\n`);

  const browser = await chromium.launch({
    headless: true,
    channel,
    args: ['--enable-webgl', '--enable-gpu-rasterization', '--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.goto('about:blank');

  const result = await page.evaluate(PAGE_SCRIPT);

  console.table(result);

  await browser.close();
}

run().catch((err) => {
  console.error('[ERROR]', err);
  process.exit(1);
});
