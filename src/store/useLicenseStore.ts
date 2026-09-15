import { create } from 'zustand';
import { LicenseState } from '../types/license';
import { fetchJson } from '../utils/apiFetch';

const STORAGE_KEY = 'usi_license_key';
const STORAGE_DATA_KEY = 'usi_license_cache';

interface CachedLicenseData {
  key: string;
  isPro: boolean;
  status: 'unactivated' | 'active' | 'expired' | 'none';
  days: number | null;
  daysLeft: number | null;
  activatedAt: number | null;
  expiresAt: number | null;
}

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
      const savedCacheRaw = localStorage.getItem(STORAGE_DATA_KEY);

      if (savedCacheRaw) {
        try {
          const cache: CachedLicenseData = JSON.parse(savedCacheRaw);
          const now = Date.now();
          const isStillValid = cache.expiresAt ? now <= cache.expiresAt : cache.isPro;
          const daysLeft = cache.expiresAt
            ? Math.max(1, Math.ceil((cache.expiresAt - now) / (1000 * 60 * 60 * 24)))
            : cache.daysLeft;

          set({
            licenseKey: cache.key || savedKey,
            isPro: isStillValid,
            status: isStillValid ? 'active' : 'expired',
            days: cache.days,
            daysLeft: isStillValid ? daysLeft : 0,
            activatedAt: cache.activatedAt,
            expiresAt: cache.expiresAt,
            isLoading: false,
            error: null,
          });
        } catch (parseErr) {
          console.warn('Nie udało się sparsować pamięci podręcznej licencji:', parseErr);
        }
      }

      const keyToVerify = savedKey || get().licenseKey;
      if (!keyToVerify) return;

      // Cicha weryfikacja w tle z serwerem
      await get().checkLicense(keyToVerify);
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
      const stateObj = {
        licenseKey: sanitized,
        isPro: true,
        status: 'active' as const,
        days: 9999,
        daysLeft: 9999,
        activatedAt: now,
        expiresAt: now + durationMs,
        isLoading: false,
        error: null,
      };
      set(stateObj);
      localStorage.setItem(STORAGE_KEY, sanitized);
      localStorage.setItem(
        STORAGE_DATA_KEY,
        JSON.stringify({
          key: sanitized,
          isPro: true,
          status: 'active',
          days: 9999,
          daysLeft: 9999,
          activatedAt: now,
          expiresAt: now + durationMs,
        })
      );
      return true;
    }

    try {
      set({ isLoading: true, error: null });
      const { ok: resOk, data } = await fetchJson(`/api/license/check?key=${encodeURIComponent(key)}`);

      if (resOk && data.valid && data.status === 'active') {
        const stateObj = {
          licenseKey: key,
          isPro: true,
          status: 'active' as const,
          days: data.days,
          daysLeft: data.daysLeft,
          activatedAt: data.activatedAt,
          expiresAt: data.expiresAt,
          isLoading: false,
        };
        set(stateObj);
        localStorage.setItem(STORAGE_KEY, key);
        localStorage.setItem(
          STORAGE_DATA_KEY,
          JSON.stringify({
            key,
            isPro: true,
            status: 'active',
            days: data.days,
            daysLeft: data.daysLeft,
            activatedAt: data.activatedAt,
            expiresAt: data.expiresAt,
          })
        );
        return true;
      } else {
        const isExpired = data?.status === 'expired';
        const newStatus: 'expired' | 'unactivated' = isExpired ? 'expired' : 'unactivated';
        const stateObj = {
          licenseKey: key,
          isPro: false,
          status: newStatus,
          days: data?.days || null,
          daysLeft: 0,
          expiresAt: data?.expiresAt || null,
          isLoading: false,
        };
        set(stateObj);
        localStorage.setItem(
          STORAGE_DATA_KEY,
          JSON.stringify({
            key,
            isPro: false,
            status: stateObj.status,
            days: stateObj.days,
            daysLeft: 0,
            activatedAt: null,
            expiresAt: stateObj.expiresAt,
          })
        );
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
      const stateObj = {
        licenseKey: sanitized,
        isPro: true,
        status: 'active' as const,
        days: 9999,
        daysLeft: 9999,
        activatedAt: now,
        expiresAt: now + durationMs,
        isLoading: false,
        error: null,
      };
      set(stateObj);
      localStorage.setItem(STORAGE_KEY, sanitized);
      localStorage.setItem(
        STORAGE_DATA_KEY,
        JSON.stringify({
          key: sanitized,
          isPro: true,
          status: 'active',
          days: 9999,
          daysLeft: 9999,
          activatedAt: now,
          expiresAt: now + durationMs,
        })
      );
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

      const stateObj = {
        licenseKey: sanitized,
        isPro: true,
        status: 'active' as const,
        days: data.days,
        daysLeft: data.daysLeft,
        activatedAt: data.activatedAt,
        expiresAt: data.expiresAt,
        isLoading: false,
        error: null,
      };
      set(stateObj);

      localStorage.setItem(STORAGE_KEY, sanitized);
      localStorage.setItem(
        STORAGE_DATA_KEY,
        JSON.stringify({
          key: sanitized,
          isPro: true,
          status: 'active',
          days: data.days,
          daysLeft: data.daysLeft,
          activatedAt: data.activatedAt,
          expiresAt: data.expiresAt,
        })
      );

      return { success: true, message: data.message || 'Licencja PRO została aktywowana!' };
    } catch (err: any) {
      const msg = err.message || 'Wystąpił błąd połączenia z serwerem licencji.';
      set({ isLoading: false, error: msg });
      return { success: false, error: msg };
    }
  },

  clearLicense: () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_DATA_KEY);
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
