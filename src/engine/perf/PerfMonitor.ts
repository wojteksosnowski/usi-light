/**
 * Lekkie narzędzie dev do pomiaru wydajności renderowania CAD i snappingu.
 * Aktywowane wyłącznie przez `?perf=1` w URL - zero narzutu gdy wyłączone.
 */

interface CategoryStats {
  count: number;
  sum: number;
  min: number;
  max: number;
  samples: number[];
}

const MAX_SAMPLES = 120;
const FLUSH_INTERVAL_MS = 1000;

function readEnabledFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('perf') === '1';
  } catch {
    return false;
  }
}

class PerfMonitorImpl {
  private enabled = readEnabledFlag();
  private categories = new Map<string, CategoryStats>();
  private lastFlush = 0;
  private frameCount = 0;

  public isEnabled(): boolean {
    return this.enabled;
  }

  public mark(category: string, ms: number): void {
    if (!this.enabled) return;
    let stats = this.categories.get(category);
    if (!stats) {
      stats = { count: 0, sum: 0, min: Infinity, max: -Infinity, samples: [] };
      this.categories.set(category, stats);
    }
    stats.count++;
    stats.sum += ms;
    stats.min = Math.min(stats.min, ms);
    stats.max = Math.max(stats.max, ms);
    stats.samples.push(ms);
    if (stats.samples.length > MAX_SAMPLES) stats.samples.shift();
  }

  public time<T>(category: string, fn: () => T): T {
    if (!this.enabled) return fn();
    const start = performance.now();
    const result = fn();
    this.mark(category, performance.now() - start);
    return result;
  }

  public count(category: string): void {
    if (!this.enabled) return;
    this.mark(category, 0);
  }

  public noteFrame(): void {
    if (!this.enabled) return;
    this.frameCount++;
  }

  public flushIfDue(): void {
    if (!this.enabled) return;
    this.noteFrame();
    const now = performance.now();
    if (this.lastFlush === 0) {
      this.lastFlush = now;
      return;
    }
    const elapsed = now - this.lastFlush;
    if (elapsed < FLUSH_INTERVAL_MS) return;

    const summary: Record<string, { avgMs: number; p95Ms: number; maxMs: number; count: number }> = {};
    for (const [name, stats] of this.categories) {
      const sorted = [...stats.samples].sort((a, b) => a - b);
      const p95idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
      summary[name] = {
        avgMs: Number((stats.sum / stats.count).toFixed(3)),
        p95Ms: sorted.length > 0 ? Number(sorted[p95idx].toFixed(3)) : 0,
        maxMs: Number(stats.max.toFixed(3)),
        count: stats.count,
      };
    }

    const fps = Number(((this.frameCount * 1000) / elapsed).toFixed(1));

    // eslint-disable-next-line no-console
    console.log('[PERF] ' + JSON.stringify({ ts: Date.now(), fps, frameCount: this.frameCount, categories: summary }));

    this.categories.clear();
    this.frameCount = 0;
    this.lastFlush = now;
  }
}

export const PerfMonitor = new PerfMonitorImpl();
