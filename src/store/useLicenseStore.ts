import { create } from 'zustand';
import { LicenseState } from '../types/license';
import { fetchJson } from '../utils/apiFetch';

const STORAGE_KEY = 'usi_license_key';

export const useLicenseStore = create<LicenseState>((set, get) => ({
  licenseKey: null,
  isPro: false,
  status: 'none',
  days: null,
  daysLeft: null,
  activatedAt: null,
  expiresAt: null,
  isLoading: false,
  error: null,

  initializeLicense: async () => {
    try {
      const savedKey = localStorage.getItem(STORAGE_KEY);
      if (!savedKey) return;

      set({ licenseKey: savedKey, isLoading: true, error: null });
      await get().checkLicense(savedKey);
    } catch (e) {
      console.warn('Błąd inicjalizacji licencji z localStorage:', e);
      set({ isLoading: false });
    }
  },

  checkLicense: async (keyToCheck?: string) => {
    const key = keyToCheck || get().licenseKey;
    if (!key) {
      set({ isPro: false, status: 'none', daysLeft: null, expiresAt: null });
      return false;
    }

    const sanitized = key.trim().toUpperCase();
    if (sanitized === 'USI-DEV-MASTER-PRO' || sanitized === 'USI-DEV-PRO-9999' || sanitized === 'DEV-PRO') {
      const now = Date.now();
      const durationMs = 9999 * 24 * 60 * 60 * 1000;
      set({
        licenseKey: sanitized,
        isPro: true,
        status: 'active',
        days: 9999,
        daysLeft: 9999,
        activatedAt: now,
        expiresAt: now + durationMs,
        isLoading: false,
        error: null,
      });
      localStorage.setItem(STORAGE_KEY, sanitized);
      return true;
    }

    try {
      set({ isLoading: true, error: null });
      const { ok: resOk, data } = await fetchJson(`/api/license/check?key=${encodeURIComponent(key)}`);

      if (resOk && data.valid && data.status === 'active') {
        set({
          licenseKey: key,
          isPro: true,
          status: 'active',
          days: data.days,
          daysLeft: data.daysLeft,
          activatedAt: data.activatedAt,
          expiresAt: data.expiresAt,
          isLoading: false,
        });
        localStorage.setItem(STORAGE_KEY, key);
        return true;
      } else {
        const isExpired = data.status === 'expired';
        set({
          licenseKey: key,
          isPro: false,
          status: isExpired ? 'expired' : 'unactivated',
          days: data.days || null,
          daysLeft: 0,
          expiresAt: data.expiresAt || null,
          isLoading: false,
        });
        return false;
      }
    } catch (err: any) {
      console.warn('Nie udało się sprawdzić ważności licencji:', err);
      set({ isLoading: false });
      return false;
    }
  },

  activateLicense: async (key: string) => {
    if (!key || typeof key !== 'string' || key.trim().length === 0) {
      return { success: false, error: 'Wpisz poprawny klucz licencyjny.' };
    }

    const sanitized = key.trim().toUpperCase();

    // Natychmiastowa obsługa Master Dev Key (również offline)
    if (sanitized === 'USI-DEV-MASTER-PRO' || sanitized === 'USI-DEV-PRO-9999' || sanitized === 'DEV-PRO') {
      const now = Date.now();
      const durationMs = 9999 * 24 * 60 * 60 * 1000;
      set({
        licenseKey: sanitized,
        isPro: true,
        status: 'active',
        days: 9999,
        daysLeft: 9999,
        activatedAt: now,
        expiresAt: now + durationMs,
        isLoading: false,
        error: null,
      });
      localStorage.setItem(STORAGE_KEY, sanitized);
      return { success: true, message: 'Aktywowano Master Dev Key (9999 dni PRO)!' };
    }

    try {
      set({ isLoading: true, error: null });

      const { ok: resOk, data } = await fetchJson('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: sanitized }),
      });

      if (!resOk) {
        set({ isLoading: false, error: data.error || 'Błąd aktywacji licencji.' });
        return { success: false, error: data.error || 'Nieprawidłowy klucz licencyjny.' };
      }

      set({
        licenseKey: sanitized,
        isPro: true,
        status: 'active',
        days: data.days,
        daysLeft: data.daysLeft,
        activatedAt: data.activatedAt,
        expiresAt: data.expiresAt,
        isLoading: false,
        error: null,
      });

      localStorage.setItem(STORAGE_KEY, sanitized);
      return { success: true, message: data.message || 'Licencja PRO została aktywowana!' };
    } catch (err: any) {
      const msg = err.message || 'Wystąpił błąd połączenia z serwerem licencji.';
      set({ isLoading: false, error: msg });
      return { success: false, error: msg };
    }
  },

  clearLicense: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({
      licenseKey: null,
      isPro: false,
      status: 'none',
      days: null,
      daysLeft: null,
      activatedAt: null,
      expiresAt: null,
      isLoading: false,
      error: null,
    });
  },
}));
