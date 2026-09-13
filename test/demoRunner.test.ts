import { describe, it, expect } from 'vitest';
import { wait, animateValue } from '../src/utils/demoRunner';

describe('Demo Runner Helpers Integrity', () => {
  it('exports wait and animateValue functions', () => {
    expect(typeof wait).toBe('function');
    expect(typeof animateValue).toBe('function');
  });

  it('wait resolves correctly', async () => {
    const start = Date.now();
    await wait(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });
});
