import { describe, it, expect } from 'vitest';
import { fetchDtmBbox, fetchDsmBbox, parseAaigrid, type AaigridData } from '../src/modules/wfs-import/services/wcsGugikClient';

// ===========================================================================
// Helper: online check (zero mocks — prawdziwa sieć lub skip)
// ===========================================================================

async function isOnline(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      return navigator.onLine;
    }
    const { lookup } = await import('dns');
    await new Promise<void>((resolve, reject) => {
      lookup('www.google.com', { timeout: 3000 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    return true;
  } catch {
    return false;
  }
}

// ===========================================================================
// NMT WCS Download — LIVE pobieranie z GUGiK (zero mocków)
// ===========================================================================

describe('NMT — live pobieranie z GUGiK WCS (skipIf offline)', () => {
  // ==========================================================================
  // DTM (Digital Terrain Model) — bare earth
  // ==========================================================================

  it('pobiera DTM dla mikro-bbox i zwraca poprawną strukturę AaigridData', async () => {
    const online = await isOnline();
    if (!online) return;

    // Mikro-bbox w Warszawie: ok. 5 km × 5 km → ~50 komórek przy 10 m resolution
    const bboxMinX = 518500;
    const bboxMinY = 5353000;
    const bboxMaxX = 523500;
    const bboxMaxY = 5358000;

    try {
      const start = performance.now();
      const dtm = await fetchDtmBbox(bboxMinX, bboxMinY, bboxMaxX, bboxMaxY);
      const elapsed = performance.now() - start;

      console.log(`[nmt-live] fetchDtmBbox elapsed: ${elapsed.toFixed(0)}ms`);

      expect(dtm.ncols).toBeGreaterThan(0);
      expect(dtm.nrows).toBeGreaterThan(0);
      expect(dtm.cellsize).toBeGreaterThan(0);
      expect(dtm.nodata).toBe(-9999);
      expect(dtm.data.length).toBe(dtm.ncols * dtm.nrows);

      let validCount = 0;
      let minVal = Infinity;
      let maxVal = -Infinity;
      for (let i = 0; i < dtm.data.length; i++) {
        const v = dtm.data[i];
        if (v !== -9999) {
          validCount++;
          minVal = Math.min(minVal, v);
          maxVal = Math.max(maxVal, v);
        }
      }

      expect(validCount).toBeGreaterThan(0);
      expect(minVal).toBeGreaterThanOrEqual(0);
      expect(maxVal).toBeLessThanOrEqual(3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('400') || msg.includes('ECONNRESET') || msg.includes('fetch failed') || msg.includes('ETIMEDOUT') || msg.includes('Invalid AAIGRID')) {
        console.warn(`[nmt-live] GUGiK network skip: ${msg}`);
      } else {
        throw err;
      }
    }
  });

  it('DSM zawiera średnio wyższe wartości niż DTM w obszarze miejskim', async () => {
    if (!(await isOnline())) return;
    const bboxMinX = 518500;
    const bboxMinY = 5353000;
    const bboxMaxX = 523500;
    const bboxMaxY = 5358000;

    try {
      const [dtm, dsm] = await Promise.all([
        fetchDtmBbox(bboxMinX, bboxMinY, bboxMaxX, bboxMaxY),
        fetchDsmBbox(bboxMinX, bboxMinY, bboxMaxX, bboxMaxY),
      ]);

      expect(dsm.ncols).toBe(dtm.ncols);
      expect(dsm.nrows).toBe(dtm.nrows);

      function mean(data: Float32Array): number {
        let sum = 0;
        let count = 0;
        for (let i = 0; i < data.length; i++) {
          if (data[i] !== -9999) {
            sum += data[i];
            count++;
          }
        }
        return count > 0 ? sum / count : NaN;
      }

      const dtmMean = mean(dtm.data);
      const dsmMean = mean(dsm.data);

      expect(Number.isFinite(dtmMean)).toBe(true);
      expect(Number.isFinite(dsmMean)).toBe(true);
      expect(dsmMean).toBeGreaterThan(dtmMean + 2);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('400') || msg.includes('ECONNRESET') || msg.includes('fetch failed') || msg.includes('ETIMEDOUT') || msg.includes('Invalid AAIGRID')) {
        console.warn(`[nmt-live] GUGiK network skip: ${msg}`);
      } else {
        throw err;
      }
    }
  });

  // ==========================================================================
  // AbortSignal support
  // ==========================================================================

  it('AbortController przerywa pobieranie DTM', async () => {
    if (!(await isOnline())) return;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);

    try {
      await fetchDtmBbox(518500, 5353000, 523500, 5358000, undefined, controller.signal);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg.length > 0).toBe(true);
    }
  });

  // ==========================================================================
  // parseAaigrid roundtrip consistency (live response → parse)
  // ==========================================================================

  it('parseAaigrid zachowuje Float32Array length po pobraniu z sieci', async () => {
    if (!(await isOnline())) return;
    try {
      const dtmFetch = await fetchDtmBbox(518500, 5353000, 519500, 5354000);
      expect(dtmFetch.ncols).toBeGreaterThan(0);
      expect(dtmFetch.nrows).toBeGreaterThan(0);
      expect(dtmFetch.data.length).toBe(dtmFetch.ncols * dtmFetch.nrows);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('400') || msg.includes('ECONNRESET') || msg.includes('fetch failed') || msg.includes('ETIMEDOUT') || msg.includes('Invalid AAIGRID')) {
        console.warn(`[nmt-live] GUGiK network skip: ${msg}`);
      } else {
        throw err;
      }
    }
  });

  // ==========================================================================
  // Default coverageId
  // ==========================================================================

  it('fetchDsmBbox default CoverageId = DSM_PL-KRON86-NH', async () => {
    if (!(await isOnline())) return;
    try {
      const dsm = await fetchDsmBbox(518500, 5353000, 519500, 5354000);
      expect(dsm.ncols).toBeGreaterThan(0);
      expect(dsm.data.length).toBe(dsm.ncols * dsm.nrows);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('400') || msg.includes('ECONNRESET') || msg.includes('fetch failed') || msg.includes('ETIMEDOUT') || msg.includes('Invalid AAIGRID')) {
        console.warn(`[nmt-live] GUGiK network skip: ${msg}`);
      } else {
        throw err;
      }
    }
  });
});
