import { describe, it, expect } from 'vitest';
import { bytesToBase64Url, base64UrlToBytes } from './base64url';

describe('base64url', () => {
  it('round-trip dla pustych bajtów', () => {
    const bytes = new Uint8Array(0);
    expect(base64UrlToBytes(bytesToBase64Url(bytes))).toEqual(bytes);
  });

  it('round-trip dla 1/2/3-bajtowych wejść (różne warianty paddingu)', () => {
    for (let len = 1; len <= 3; len++) {
      const original = new Uint8Array(len).map((_, i) => (i * 37 + len) % 256);
      const encoded = bytesToBase64Url(original);
      expect(base64UrlToBytes(encoded)).toEqual(original);
    }
  });

  it('nie zawiera znaków niebezpiecznych dla URL i nie ma paddingu', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const encoded = bytesToBase64Url(bytes);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]*$/);
    expect(encoded).not.toContain('=');
  });

  it('round-trip dla większego losowego bufora (klucz 256-bit)', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    expect(base64UrlToBytes(bytesToBase64Url(bytes))).toEqual(bytes);
  });
});
