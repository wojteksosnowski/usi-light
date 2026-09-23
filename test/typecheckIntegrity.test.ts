import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';

describe('Project Integrity & Typecheck Guard', () => {
  it('passes TypeScript compilation with zero errors across all files (tsc --noEmit)', () => {
    try {
      const output = execSync('npx tsc --noEmit', {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      expect(output.trim()).toBe('');
    } catch (err: any) {
      const stdout = err.stdout ? String(err.stdout) : '';
      const stderr = err.stderr ? String(err.stderr) : '';
      const message = err.message || '';
      throw new Error(
        `TypeScript compilation failed (tsc --noEmit)!\n` +
        `This test guards against broken imports, missing exports, and type errors that cause blank screen crashes.\n` +
        `Errors:\n${stdout}\n${stderr}\n${message}`
      );
    }
  });

  it('verifies that all CadRenderLayers can be imported and instantiated without missing exports', async () => {
    const layerModules = await import('../src/components/cad/pipeline/layers');
    expect(layerModules).toBeDefined();
    expect(layerModules.BuildingsDragPreviewLayer).toBeDefined();
    expect(layerModules.BuildingsLayer).toBeDefined();
    expect(layerModules.ShadowingLayer).toBeDefined();
    expect(layerModules.ShadowRangeLayer).toBeDefined();
    expect(layerModules.SunlightLayer).toBeDefined();
    expect(layerModules.DrawingToolLayer).toBeDefined();

    // Verify instantiation
    const previewLayer = new layerModules.BuildingsDragPreviewLayer();
    expect(previewLayer.id).toBe('buildings_drag_preview');
  });
});
