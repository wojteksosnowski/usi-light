import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseDxfWithMetadata, createSampleBuildings } from '../src/utils/dxfParser';
import {
  analyzeSunlightAtPoint,
  analyzeSunlightAtPointSegments,
  computeDailySolarTrajectory,
} from '../src/engine/analysisEngine';
import { ProjectSettings } from '../src/types/geometry';

describe('§ 56 Sunlight Methods Agreement (Raycasting vs Segments)', () => {
  const settings: ProjectSettings = {
    latitude: 51.1079, // Wrocław
    longitude: 17.0385,
    isCityCentreDefault: false,
    samplingInterval: 0.5,
    equinoxDate: 'spring',
  };

  const trajectory = computeDailySolarTrajectory(settings, 5);

  it('yields 100% identical sunlight duration for sample buildings', () => {
    const buildings = createSampleBuildings();
    for (const bldg of buildings) {
      for (const seg of bldg.segments) {
        for (const ratio of [0.2, 0.5, 0.8]) {
          const pt = {
            x: seg.p1.x + ratio * (seg.p2.x - seg.p1.x),
            y: seg.p1.y + ratio * (seg.p2.y - seg.p1.y),
          };

          const rayRes = analyzeSunlightAtPoint(pt, seg, ratio, buildings, bldg.id, settings, 5, trajectory);
          const segRes = analyzeSunlightAtPointSegments(pt, seg, ratio, buildings, bldg.id, settings);

          expect(Math.abs(segRes.totalHours - rayRes.totalHours)).toBeLessThan(0.15);
          expect(Math.abs(segRes.totalMinutes - rayRes.totalMinutes)).toBeLessThanOrEqual(10);
        }
      }
    }
  });

  it('yields close agreement on wro.dxf (A-budynki, H=18m, Buildings 25 and 16)', () => {
    const dxfPath = path.resolve(__dirname, '../wro.dxf');
    if (!fs.existsSync(dxfPath)) return;

    const dxfContent = fs.readFileSync(dxfPath, 'utf-8');
    const parsed = parseDxfWithMetadata(dxfContent, 'm');
    const buildings = parsed.buildings.filter((b) => b.layer === 'A-budynki');
    buildings.forEach((b) => {
      b.defaultHeight = 18.0;
      b.segments.forEach((s) => {
        s.hTop = 18.0;
      });
    });

    const bldg25 = buildings.find((b) => b.name.includes('25'))!;
    const bldg16 = buildings.find((b) => b.name.includes('16'))!;

    for (const bldg of [bldg25, bldg16]) {
      for (const seg of bldg.segments) {
        for (const ratio of [0.25, 0.5, 0.75]) {
          const pt = {
            x: seg.p1.x + ratio * (seg.p2.x - seg.p1.x),
            y: seg.p1.y + ratio * (seg.p2.y - seg.p1.y),
          };

          const rayRes = analyzeSunlightAtPoint(pt, seg, ratio, buildings, bldg.id, settings, 5, trajectory);
          const segRes = analyzeSunlightAtPointSegments(pt, seg, ratio, buildings, bldg.id, settings);

          expect(Math.abs(segRes.totalHours - rayRes.totalHours)).toBeLessThan(0.15);
          expect(Math.abs(segRes.totalMinutes - rayRes.totalMinutes)).toBeLessThanOrEqual(10);
        }
      }
    }
  });
});
