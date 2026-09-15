import { describe, it, expect } from 'vitest';
import { calculateBuildingFloors } from './buildingFloorCalculator';

describe('calculateBuildingFloors', () => {
  it('returns storeysCount = N when height is exactly h1 + (N-1)*ht, for several N', () => {
    const h1 = 3.0;
    const ht = 3.0;
    for (let n = 1; n <= 10; n++) {
      const totalHeight = h1 + (n - 1) * ht;
      const result = calculateBuildingFloors(totalHeight, h1, ht);
      expect(result.storeysCount).toBe(n);
    }
  });

  it('does not flip storeysCount due to floating-point noise at the exact boundary (no jitter)', () => {
    const h1 = 3.0;
    const ht = 3.0;
    const n = 5;
    const exactHeight = h1 + (n - 1) * ht;

    // Szum rzędu 1e-9 imituje typową niedokładność reprezentacji zmiennoprzecinkowej
    // (np. wynik wcześniejszych operacji arytmetycznych), nie realną, zamierzoną różnicę wysokości.
    const noisyBelow = calculateBuildingFloors(exactHeight - 1e-9, h1, ht);
    const exact = calculateBuildingFloors(exactHeight, h1, ht);
    const noisyAbove = calculateBuildingFloors(exactHeight + 1e-9, h1, ht);

    expect(exact.storeysCount).toBe(n);
    expect(noisyBelow.storeysCount).toBe(n);
    expect(noisyAbove.storeysCount).toBe(n);
  });

  it('still returns N-1 for a height meaningfully below the Nth story boundary', () => {
    const h1 = 3.0;
    const ht = 3.0;
    const n = 5;
    const exactHeight = h1 + (n - 1) * ht;

    const result = calculateBuildingFloors(exactHeight - 1.0, h1, ht);
    expect(result.storeysCount).toBe(n - 1);
  });

  it('last story interval reaches exactly the total height', () => {
    const result = calculateBuildingFloors(12, 3, 3);
    const last = result.intervals[result.intervals.length - 1];
    expect(last.hTop).toBe(12);
    expect(result.storeysCount).toBe(4);
  });
});
