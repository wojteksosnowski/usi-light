import { describe, it, expect } from 'vitest';
import { parseKiegFeatureInfoHtml, classifyLandUseType } from '../src/modules/wfs-import/services/shared/kiegEnricherService';

describe('kiegEnricherService', () => {
  it('poprawnie klasyfikuje oznaczenia klasoużytków EGiB', () => {
    expect(classifyLandUseType('dr')).toBe('road');
    expect(classifyLandUseType('DR')).toBe('road');
    expect(classifyLandUseType('tk')).toBe('road');
    expect(classifyLandUseType('B')).toBe('residential');
    expect(classifyLandUseType('Bp')).toBe('residential');
    expect(classifyLandUseType('Bi')).toBe('commercial');
    expect(classifyLandUseType('Ba')).toBe('commercial');
    expect(classifyLandUseType('RIVa')).toBe('agricultural');
    expect(classifyLandUseType('ŁIII')).toBe('agricultural');
    expect(classifyLandUseType('PsV')).toBe('agricultural');
    expect(classifyLandUseType('LsIV')).toBe('forest');
    expect(classifyLandUseType('Bz')).toBe('recreational');
    expect(classifyLandUseType(undefined)).toBe('other');
  });

  it('poprawnie parsuje odpowiedź HTML z KIEG GetFeatureInfo', () => {
    const sampleHtml = `
      <html>
      <head><meta http-equiv="Content-Type" content="text/html; charset=utf-8">
      <title>146511_8.1007.57/5</title>
      <style>.getfeatureinfo-egib {font-family: sans-serif;}</style>
      </head>
      <body>
      <table class="getfeatureinfo-egib">
        <tr><td>Identyfikator działki</td><td>146511_8.1007.57/5</td></tr>
        <tr><td>Województwo</td><td>mazowieckie</td></tr>
        <tr><td>Powiat</td><td>powiat Warszawa</td></tr>
        <tr><td>Nazwa gminy</td><td>Dzielnica Wola</td></tr>
        <tr><td>Nazwa obrębu</td><td>6-10-07</td></tr>
        <tr><td>Numer działki</td><td>57/5</td></tr>
        <tr><td>Pole pow. w ewidencji gruntów (ha)</td><td>0.1420</td></tr>
        <tr><td>Grupa rejestrowa</td><td>1</td></tr>
        <tr><td>Oznaczenie użytku</td><td>dr</td></tr>
        <tr><td>Oznaczenie konturu</td><td></td></tr>
      </table>
      </body>
      </html>
    `;

    const result = parseKiegFeatureInfoHtml(sampleHtml);
    expect(result).not.toBeNull();
    expect(result?.id).toBe('146511_8.1007.57/5');
    expect(result?.plotNumber).toBe('57/5');
    expect(result?.voivodeship).toBe('mazowieckie');
    expect(result?.county).toBe('powiat Warszawa');
    expect(result?.commune).toBe('Dzielnica Wola');
    expect(result?.region).toBe('6-10-07');
    expect(result?.areaHa).toBe(0.142);
    expect(result?.landUseClass).toBe('dr');
    expect(result?.landUseType).toBe('road');
  });
});
