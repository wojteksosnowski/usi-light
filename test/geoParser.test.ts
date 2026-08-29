import { describe, it, expect } from 'vitest';
import { parseGoogleMapsCoordinates } from '../src/utils/geoParser';

describe('Google Maps & Coordinates Parser', () => {
  it('should parse standard Google Maps URL with @lat,lon', () => {
    const url = 'https://www.google.com/maps/@52.22977,21.01178,15z';
    const res = parseGoogleMapsCoordinates(url);
    expect(res).not.toBeNull();
    expect(res?.latitude).toBeCloseTo(52.22977, 4);
    expect(res?.longitude).toBeCloseTo(21.01178, 4);
  });

  it('should parse Google Maps place URL with metadata and name', () => {
    const url = 'https://www.google.com/maps/place/Warszawa/@52.2330653,20.9211132,11z/data=!3d52.2296756!4d21.0122287';
    const res = parseGoogleMapsCoordinates(url);
    expect(res).not.toBeNull();
    expect(res?.latitude).toBeCloseTo(52.2296756, 4);
    expect(res?.longitude).toBeCloseTo(21.0122287, 4);
    expect(res?.label).toBe('Warszawa');
  });

  it('should parse search query URL with coordinates', () => {
    const url = 'https://www.google.com/maps/search/54.3520,+18.6466';
    const res = parseGoogleMapsCoordinates(url);
    expect(res).not.toBeNull();
    expect(res?.latitude).toBeCloseTo(54.3520, 4);
    expect(res?.longitude).toBeCloseTo(18.6466, 4);
  });

  it('should parse query parameters ?q=lat,lon', () => {
    const url = 'https://maps.google.com/?q=50.0647,19.9450';
    const res = parseGoogleMapsCoordinates(url);
    expect(res).not.toBeNull();
    expect(res?.latitude).toBeCloseTo(50.0647, 4);
    expect(res?.longitude).toBeCloseTo(19.9450, 4);
  });

  it('should parse raw decimal coordinates string', () => {
    const raw = '51.1079, 17.0385';
    const res = parseGoogleMapsCoordinates(raw);
    expect(res).not.toBeNull();
    expect(res?.latitude).toBeCloseTo(51.1079, 4);
    expect(res?.longitude).toBeCloseTo(17.0385, 4);
  });

  it('should parse coordinates with degree symbols and hemisphere letters', () => {
    const str = '52.4064° N, 16.9252° E';
    const res = parseGoogleMapsCoordinates(str);
    expect(res).not.toBeNull();
    expect(res?.latitude).toBeCloseTo(52.4064, 4);
    expect(res?.longitude).toBeCloseTo(16.9252, 4);
  });

  it('should parse DMS format (degrees, minutes, seconds)', () => {
    const dms = '52°13\'47.1"N 21°00\'44.0"E';
    const res = parseGoogleMapsCoordinates(dms);
    expect(res).not.toBeNull();
    expect(res?.latitude).toBeCloseTo(52.22975, 4);
    expect(res?.longitude).toBeCloseTo(21.01222, 4);
  });

  it('should return null for invalid inputs', () => {
    expect(parseGoogleMapsCoordinates('')).toBeNull();
    expect(parseGoogleMapsCoordinates('not a link')).toBeNull();
    expect(parseGoogleMapsCoordinates('https://example.com')).toBeNull();
  });
});
