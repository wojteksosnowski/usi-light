import { describe, it } from 'vitest';
import fs from 'fs';
import DxfParser from 'dxf-parser';
import { parseDxfWithMetadata } from '../src/utils/dxfParser';

describe('Diagnose test.dxf', () => {
  it('prints all entities and their coordinates in test.dxf', () => {
    const raw = fs.readFileSync('test.dxf', 'utf-8');
    const parser = new DxfParser();
    const parsed = parser.parseSync(raw);

    console.log('--- HEADER ---');
    console.log('$INSUNITS:', parsed?.header?.['$INSUNITS']);
    console.log('$MEASUREMENT:', parsed?.header?.['$MEASUREMENT']);
    console.log('$EXTMIN:', parsed?.header?.['$EXTMIN']);
    console.log('$EXTMAX:', parsed?.header?.['$EXTMAX']);

    console.log('\n--- ENTITIES TOTAL:', parsed?.entities?.length);
    const polyEntities = parsed?.entities?.filter((e: any) => e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') || [];
    console.log('Polylines count:', polyEntities.length);

    for (let i = 0; i < polyEntities.length; i++) {
      const e = polyEntities[i];
      const xs = e.vertices.map((v: any) => v.x);
      const ys = e.vertices.map((v: any) => v.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const width = maxX - minX;
      const height = maxY - minY;
      console.log(`Poly #${i+1} [layer: ${e.layer}]: vertices=${e.vertices.length}, bbox=[X: ${minX.toFixed(2)}..${maxX.toFixed(2)} (${width.toFixed(2)}m/j), Y: ${minY.toFixed(2)}..${maxY.toFixed(2)} (${height.toFixed(2)}m/j)]`);
    }

    const resM = parseDxfWithMetadata(raw, 'm');
    console.log('\nParsed in "m" mode: buildings count =', resM.buildings.length);
    for (const b of resM.buildings) {
      console.log(`Building "${b.name}": vertices count = ${b.vertices.length}, first vertex = (${b.vertices[0].x.toFixed(2)}, ${b.vertices[0].y.toFixed(2)}), defaultHeight = ${b.defaultHeight}`);
    }
  });
});
