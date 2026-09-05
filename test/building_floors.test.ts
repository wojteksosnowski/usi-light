import { describe, it, expect } from 'vitest';
import { toRomanNumeral, calculateBuildingFloors } from '../src/utils/buildingFloorCalculator';

describe('Building Floor Calculator & Roman Numerals', () => {
  it('converts integers to Roman numerals properly', () => {
    expect(toRomanNumeral(1)).toBe('I');
    expect(toRomanNumeral(2)).toBe('II');
    expect(toRomanNumeral(3)).toBe('III');
    expect(toRomanNumeral(4)).toBe('IV');
    expect(toRomanNumeral(5)).toBe('V');
    expect(toRomanNumeral(8)).toBe('VIII');
    expect(toRomanNumeral(9)).toBe('IX');
    expect(toRomanNumeral(10)).toBe('X');
    expect(toRomanNumeral(14)).toBe('XIV');
    expect(toRomanNumeral(15)).toBe('XV');
  });

  it('calculates building storeys and attic correctly without attic remainder', () => {
    // Total H = 15.0m, H1 = 3.0m, Ht = 3.0m -> N = 1 + (15 - 3)/3 = 5 (V storeys), attic = 0.0m
    const res = calculateBuildingFloors(15.0, 3.0, 3.0);
    expect(res.storeysCount).toBe(5);
    expect(res.storeysRoman).toBe('V');
    expect(res.storeysHeightSum).toBe(15.0);
    expect(res.atticHeight).toBe(0.0);
    expect(res.intervals.length).toBe(5);
    expect(res.intervals[4].hTop).toBe(15.0);
  });

  it('calculates building storeys and attic with remainder', () => {
    // Total H = 15.6m, H1 = 3.5m, Ht = 3.0m
    // N = 1 + floor((15.6 - 3.5)/3) = 1 + floor(12.1/3) = 1 + 4 = 5 (V)
    // storeysHeightSum = 3.5 + 4*3.0 = 15.5m
    // atticHeight = 15.6 - 15.5 = 0.1m
    const res = calculateBuildingFloors(15.6, 3.5, 3.0);
    expect(res.storeysCount).toBe(5);
    expect(res.storeysRoman).toBe('V');
    expect(res.storeysHeightSum).toBe(15.5);
    expect(res.atticHeight).toBeCloseTo(0.1, 2);
  });

  it('handles low building (H <= H1) as 1 storey with attic if H > H1', () => {
    const res1 = calculateBuildingFloors(3.0, 3.0, 3.0);
    expect(res1.storeysCount).toBe(1);
    expect(res1.storeysRoman).toBe('I');
    expect(res1.atticHeight).toBe(0.0);

    const res2 = calculateBuildingFloors(3.8, 3.0, 3.0);
    expect(res2.storeysCount).toBe(1);
    expect(res2.storeysRoman).toBe('I');
    expect(res2.atticHeight).toBeCloseTo(0.8, 2);
  });
});
