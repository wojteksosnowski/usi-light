import { describe, it, expect, beforeEach, vi } from 'vitest';
import { formatLicenseKey } from '../api/lib/serverStripe';
import { useLicenseStore } from '../src/store/useLicenseStore';

const mockStorage: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => mockStorage[key] || null,
  setItem: (key: string, val: string) => { mockStorage[key] = val; },
  removeItem: (key: string) => { delete mockStorage[key]; },
  clear: () => { Object.keys(mockStorage).forEach((k) => delete mockStorage[k]); },
};
globalThis.localStorage = localStorageMock as any;

describe('License & Stripe Unit Tests', () => {
  beforeEach(() => {
    localStorageMock.clear();
    useLicenseStore.getState().clearLicense();
    vi.restoreAllMocks();
  });

  describe('formatLicenseKey', () => {
    it('poprawnie formatuje klucze dla planu 7D i 30D', () => {
      const key7 = formatLicenseKey(7, 'abc12345');
      expect(key7).toBe('USI-7D-ABC1-2345');

      const key30 = formatLicenseKey(30, 'xyz98765');
      expect(key30).toBe('USI-30D-XYZ9-8765');
    });

    it('usuwa znaki specjalne i obcina do 8 znaków', () => {
      const key = formatLicenseKey(30, 'a-b_c!d?e.f#g-h');
      expect(key).toBe('USI-30D-ABCD-EFGH');
    });
  });

  describe('useLicenseStore', () => {
    it('początkowo użytkownik ma status isPro === false', () => {
      const state = useLicenseStore.getState();
      expect(state.isPro).toBe(false);
      expect(state.status).toBe('none');
      expect(state.licenseKey).toBeNull();
    });

    it('poprawnie aktywuje poprawny klucz licencyjny', async () => {
      const mockResponse = {
        success: true,
        licenseKey: 'USI-30D-TEST-1234',
        status: 'active',
        days: 30,
        daysLeft: 30,
        activatedAt: Date.now(),
        expiresAt: Date.now() + 30 * 86400000,
        message: 'Klucz aktywny',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const result = await useLicenseStore.getState().activateLicense('USI-30D-TEST-1234');
      expect(result.success).toBe(true);

      const state = useLicenseStore.getState();
      expect(state.isPro).toBe(true);
      expect(state.licenseKey).toBe('USI-30D-TEST-1234');
      expect(state.daysLeft).toBe(30);
      expect(localStorage.getItem('usi_license_key')).toBe('USI-30D-TEST-1234');
    });

    it('obsługuje błąd nieprawidłowego klucza', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Nie znaleziono klucza.' }),
      } as any);

      const result = await useLicenseStore.getState().activateLicense('INVALID_KEY');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Nie znaleziono klucza.');

      const state = useLicenseStore.getState();
      expect(state.isPro).toBe(false);
    });

    it('natychmiast aktywuje Master Dev Key bez konieczności połączenia z API', async () => {
      const result = await useLicenseStore.getState().activateLicense('USI-DEV-MASTER-PRO');
      expect(result.success).toBe(true);

      const state = useLicenseStore.getState();
      expect(state.isPro).toBe(true);
      expect(state.licenseKey).toBe('USI-DEV-MASTER-PRO');
      expect(state.daysLeft).toBe(9999);
      expect(localStorage.getItem('usi_license_key')).toBe('USI-DEV-MASTER-PRO');
    });

    it('czyści stan po wywołaniu clearLicense()', () => {
      localStorage.setItem('usi_license_key', 'USI-30D-TEST-1234');
      useLicenseStore.setState({ isPro: true, licenseKey: 'USI-30D-TEST-1234' });

      useLicenseStore.getState().clearLicense();

      const state = useLicenseStore.getState();
      expect(state.isPro).toBe(false);
      expect(state.licenseKey).toBeNull();
      expect(localStorage.getItem('usi_license_key')).toBeNull();
    });
  });
});
