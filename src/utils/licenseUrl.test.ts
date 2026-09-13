import { describe, it, expect, beforeEach, vi } from 'vitest';
import { extractLicenseKeyFromUrl, stripLicenseFromUrl, createActivationUrl } from './licenseUrl';

describe('licenseUrl utilities', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('extractLicenseKeyFromUrl', () => {
    it('wyciąga klucz z query parametru ?key=', () => {
      const url = 'https://usi-light.pl/?key=USI-7D-ABCD-1234';
      expect(extractLicenseKeyFromUrl(url)).toBe('USI-7D-ABCD-1234');
    });

    it('wyciąga klucz z query parametru ?license=', () => {
      const url = 'https://usi-light.pl/?license=USI-30D-XYZ9-8765';
      expect(extractLicenseKeyFromUrl(url)).toBe('USI-30D-XYZ9-8765');
    });

    it('wyciąga klucz z query parametru ?activate=', () => {
      const url = 'https://usi-light.pl/?activate=USI-DEV-MASTER-PRO';
      expect(extractLicenseKeyFromUrl(url)).toBe('USI-DEV-MASTER-PRO');
    });

    it('wyciąga klucz z hash #key=', () => {
      const url = 'https://usi-light.pl/#key=USI-7D-TEST-9999';
      expect(extractLicenseKeyFromUrl(url)).toBe('USI-7D-TEST-9999');
    });

    it('wyciąga klucz z bezpośredniego hash #USI-7D-...', () => {
      const url = 'https://usi-light.pl/#USI-7D-TEST-9999';
      expect(extractLicenseKeyFromUrl(url)).toBe('USI-7D-TEST-9999');
    });

    it('zwraca null gdy w URL nie ma klucza', () => {
      const url = 'https://usi-light.pl/?foo=bar#section';
      expect(extractLicenseKeyFromUrl(url)).toBeNull();
    });
  });

  describe('createActivationUrl', () => {
    it('tworzy poprawny link aktywacyjny z domyślnym lub podanym originem', () => {
      const link = createActivationUrl('USI-7D-ABCD-1234', 'https://usi-light.pl');
      expect(link).toBe('https://usi-light.pl/?key=USI-7D-ABCD-1234');
    });
  });

  describe('stripLicenseFromUrl', () => {
    it('usuwa parametry licencji z adresu URL w historii przeglądarki', () => {
      const replaceStateSpy = vi.fn();
      const mockWindow = {
        history: { replaceState: replaceStateSpy },
        location: {
          href: 'https://usi-light.pl/?key=USI-7D-ABCD-1234&foo=bar#something',
        },
      };
      (globalThis as any).window = mockWindow;
      (globalThis as any).document = { title: 'USI Light' };

      stripLicenseFromUrl();
      expect(replaceStateSpy).toHaveBeenCalledWith({}, 'USI Light', '/?foo=bar#something');
    });
  });
});
