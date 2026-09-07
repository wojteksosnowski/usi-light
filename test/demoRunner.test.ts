import { describe, it, expect } from 'vitest';
import {
  runSolarDemo,
  runShadowingComplianceDemo,
  runRealtimeShadowEnvelopeDemo,
  runPatioSunlightDemo,
  runGeoSolarComparisonDemo,
} from '../src/utils/demoRunner';

describe('Demo Recorder & Runner Integrity', () => {
  it('exports all 5 demo scenarios as functions', () => {
    expect(typeof runSolarDemo).toBe('function');
    expect(typeof runShadowingComplianceDemo).toBe('function');
    expect(typeof runRealtimeShadowEnvelopeDemo).toBe('function');
    expect(typeof runPatioSunlightDemo).toBe('function');
    expect(typeof runGeoSolarComparisonDemo).toBe('function');
  });
});
