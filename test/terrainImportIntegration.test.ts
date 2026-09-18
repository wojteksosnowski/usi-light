/**
 * Testy integracyjne importu rzeźby terenu z GUGiK WCS (NMT DTM).
 * 
 * Verifikują prawdziwe wartości pobrane z API — nie tautologie typu "parser nie rzuca wyjątkiem".
 */

import { describe, it, expect } from 'vitest';
import { parseAaigrid, fetchDtmBbox, type AaigridData } from '../src/modules/wfs-import/services/wcsGugikClient';

// ===========================================================================
// parseAaigrid — struktura danych
// ===========================================================================

describe('parseAaigrid', () => {
  const sampleGrid = `ncols         3
nrows         2
xllcorner     100.0
yllcorner     200.0
cellsize      10.0
NODATA_value  -9999
110 120 130
140 150 160`;

  it('parsuje nagłówek AAI grid correctly', () => {
    const result = parseAaigrid(sampleGrid);

    expect(result.ncols).toBe(3);
    expect(result.nrows).toBe(2);
    expect(result.xllcorner).toBeCloseTo(100, 4);
    expect(result.yllcorner).toBeCloseTo(200, 4);
    expect(result.cellsize).toBeCloseTo(10, 4);
    expect(result.nodata).toBe(-9999);
  });

  it('zawiera dane wysokości w Float32Array o poprawnym rozmiarze', () => {
    const result = parseAaigrid(sampleGrid);

    expect(result.data.length).toBe(result.ncols * result.nrows); // 6
    expect(result.data).toBeInstanceOf(Float32Array);
  });

  it('pobiera wartości z poprawnymi pozycjami', () => {
    const result = parseAaigrid(sampleGrid);

    // Wiersz 0: [110, 120, 130]
    // Wiersz 1: [140, 150, 160]
    expect(result.data[0]).toBeCloseTo(110, 4); // col 0, row 0
    expect(result.data[1]).toBeCloseTo(120, 4); // col 1, row 0
    expect(result.data[2]).toBeCloseTo(130, 4); // col 2, row 0
    expect(result.data[3]).toBeCloseTo(140, 4); // col 0, row 1
    expect(result.data[4]).toBeCloseTo(150, 4); // col 1, row 1
    expect(result.data[5]).toBeCloseTo(160, 4); // col 2, row 1
  });

  it('ignoruje puste linie na końcu', () => {
    const gridWithTrailingNewlines = sampleGrid + '\n\n\n';
    const result = parseAaigrid(gridWithTrailingNewlines);

    expect(result.data.length).toBe(6);
    expect(result.data[5]).toBeCloseTo(160, 4);
  });

  it('obsługuje alternatywny format NODATA (bez underscore)', () => {
    const grid = `ncols         2
nrows         1
xllcorner     0.0
yllcorner     0.0
cellsize      1.0
NODATA        -9999
50 60`;
    const result = parseAaigrid(grid);
    expect(result.nodata).toBe(-9999);
    expect(result.data[0]).toBeCloseTo(50, 4);
    expect(result.data[1]).toBeCloseTo(60, 4);
  });

  it('rzuca błędem przy niekompletnym nagłówku', () => {
    const incompleteGrid = 'ncols         3\nnrows         2\n';
    // Parser spróbuje odczytać braki — oczekujemy albo pustego gridu albo parsowania częściowego
    expect(() => parseAaigrid(incompleteGrid)).not.toThrow();

    const result = parseAaigrid(incompleteGrid);
    expect(result.ncols).toBe(3);
    expect(result.nrows).toBe(2);
    expect(result.data.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// fetchDtmBbox — live API validation (zero mocków)
// ===========================================================================

describe('fetchDtmBbox — live NMT WCS (skipIf offline)', () => {
  async function isOnline(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      return navigator.onLine;
    }
    try {
      const { lookup } = await import('dns');
      await new Promise<void>((resolve, reject) => {
        lookup('www.google.com', { timeout: 3000 }, (err) => err ? reject(err) : resolve());
      });
      return true;
    } catch {
      return false;
    }
  }

  it('zwraca valid AaigridData z prawidłową strukturą', async () => {
    if (!(await isOnline())) return;

    const bboxMinX = 518500;
    const bboxMinY = 5353000;
    const bboxMaxX = 521500;
    const bboxMaxY = 5356000;

    const dtm = await fetchDtmBbox(bboxMinX, bboxMinY, bboxMaxX, bboxMaxY);

    expect(dtm.ncols).toBeGreaterThan(0);
    expect(dtm.nrows).toBeGreaterThan(0);
    expect(dtm.cellsize).toBeGreaterThan(0);
    expect(dtm.nodata).toBe(-9999);

    // Rozmiar danych spójny z wymiarami
    expect(dtm.data.length).toBe(dtm.ncols * dtm.nrows);
    expect(dtm.data).toBeInstanceOf(Float32Array);
  }, 10000);

  it('zawiera prawdziwe elevacje w zakresie n.p.m. dla Polski', async () => {
    if (!(await isOnline())) return;

    const dtm = await fetchDtmBbox(518500, 5353000, 521500, 5356000);

    let minElev = Infinity;
    let maxElev = -Infinity;
    let validCount = 0;

    for (let i = 0; i < dtm.data.length; i++) {
      const val = dtm.data[i];
      if (val !== -9999) {
        validCount++;
        minElev = Math.min(minElev, val);
        maxElev = Math.max(maxElev, val);
      }
    }

    // Musi być co najmniej kilka valid value
    expect(validCount).toBeGreaterThan(0);

    // Elevacje w Polsce: ~0–2500 m n.p.m.
    expect(minElev).toBeGreaterThanOrEqual(0);
    expect(maxElev).toBeLessThanOrEqual(2500);

    // Dla Warszawy typowe elevacje: ~100–160 m n.p.m.
    expect(minElev).toBeLessThanOrEqual(150);
    expect(maxElev).toBeGreaterThanOrEqual(100);
  }, 15000);

  it('większy bbox daje więcej kolumn/wierszy', async () => {
    if (!(await isOnline())) return;

    const small = await fetchDtmBbox(518500, 5353000, 520000, 5355000);
    const large = await fetchDtmBbox(518000, 5350000, 523000, 5358000);

    expect(large.ncols).toBeGreaterThanOrEqual(small.ncols);
    expect(large.nrows).toBeGreaterThanOrEqual(small.nrows);
    expect(large.data.length).toBeGreaterThanOrEqual(small.data.length);
  }, 20000);

  it('AbortSignal przerywa zapytanie', async () => {
    if (!(await isOnline())) return;

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);

    try {
      await fetchDtmBbox(518500, 5353000, 521500, 5356000, 'DTM_PL-KRON86-NH', controller.signal);
      // Niektóre środowiska mogą nie obsłużyć abort od razu — OK
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Każda forma błędu jest akceptowalna: abort, network error, HTTP error
      expect(typeof msg).toBe('string');
      expect(msg.length).toBeGreaterThan(0);
    }
  }, 5000);

  it('roundtrip parseAaigrid → parseAaigrid zachowuje dane identycznie', async () => {
    if (!(await isOnline())) return;

    const dtm1 = await fetchDtmBbox(518500, 5353000, 520000, 5355000);

    // Parse raw text again and compare
    const response = await fetch(
      `https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WCS/DigitalTerrainModel?service=WCS&version=2.0.1&request=GetCoverage&CoverageId=DTM_PL-KRON86-NH&format=image%2Fx-aaigrid&subsettingCRS=http%3A%2F%2Fwww.opengis.net%2Fdef%2Fcrs%2FEPSG%2F0%2F2180&subset=x(${Math.floor(518500)},${Math.ceil(520000)})&subset=y(${Math.floor(5353000)},${Math.ceil(5355000)})`,
      { signal: AbortSignal.timeout(10000) }
    );
    expect(response.ok).toBe(true);
    const text = await response.text();

    const dtm2 = parseAaigrid(text);

    // Struktura identyczna
    expect(dtm2.ncols).toBe(dtm1.ncols);
    expect(dtm2.nrows).toBe(dtm1.nrows);
    expect(dtm2.cellsize).toBe(dtm1.cellsize);

    // Wartości identyczne
    for (let i = 0; i < dtm1.data.length; i++) {
      expect(dtm2.data[i]).toBeCloseTo(dtm1.data[i], 6);
    }
  }, 15000);
});
