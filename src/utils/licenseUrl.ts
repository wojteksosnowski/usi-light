/**
 * Narzędzia do ekstrakcji i generowania linków aktywacyjnych z kluczem licencyjnym.
 */

/**
 * Wyodrębnia klucz licencyjny z adresu URL (zarówno z query params jak i hash).
 * Obsługiwane parametry: ?key=..., ?license=..., ?activate=..., #key=..., #license=...
 */
export function extractLicenseKeyFromUrl(url: string | Location = window.location): string | null {
  try {
    const loc = typeof url === 'string' ? new URL(url, 'http://localhost') : url;

    // 1. Sprawdzenie query params (?key=... / ?license=... / ?activate=...)
    const searchParams = new URLSearchParams(loc.search);
    const queryKey = searchParams.get('key') || searchParams.get('license') || searchParams.get('activate');
    if (queryKey && queryKey.trim().length > 0) {
      return queryKey.trim().toUpperCase();
    }

    // 2. Sprawdzenie hash (#key=... / #license=...)
    if (loc.hash) {
      const hashStr = loc.hash.startsWith('#') ? loc.hash.substring(1) : loc.hash;
      const hashParams = new URLSearchParams(hashStr);
      const hashKey = hashParams.get('key') || hashParams.get('license') || hashParams.get('activate');
      if (hashKey && hashKey.trim().length > 0) {
        return hashKey.trim().toUpperCase();
      }

      // Alternatywnie bezpośredni hash np. #USI-7D-ABCD-1234
      const directMatch = hashStr.match(/^USI-[A-Z0-9-]+$/i);
      if (directMatch) {
        return directMatch[0].trim().toUpperCase();
      }
    }
  } catch (err) {
    console.warn('[licenseUrl] Błąd parsowania klucza z adresu URL:', err);
  }
  return null;
}

/**
 * Usuwa parametry licencji z adresu URL w przeglądarce bez przeładowywania strony.
 */
export function stripLicenseFromUrl(): void {
  try {
    if (typeof window === 'undefined' || !window.history || !window.location) return;

    const url = new URL(window.location.href);
    let changed = false;

    // Usuwamy z search params
    for (const param of ['key', 'license', 'activate']) {
      if (url.searchParams.has(param)) {
        url.searchParams.delete(param);
        changed = true;
      }
    }

    // Usuwamy z hash jeśli hash zawierał parametry klucza
    if (url.hash) {
      const hashStr = url.hash.startsWith('#') ? url.hash.substring(1) : url.hash;
      if (hashStr.includes('key=') || hashStr.includes('license=') || hashStr.includes('activate=') || /^USI-[A-Z0-9-]+$/i.test(hashStr)) {
        const hashParams = new URLSearchParams(hashStr);
        for (const param of ['key', 'license', 'activate']) {
          hashParams.delete(param);
        }
        const remainingHash = hashParams.toString();
        url.hash = remainingHash ? `#${remainingHash}` : '';
        changed = true;
      }
    }

    if (changed) {
      const cleanUrl = url.pathname + (url.search ? url.search : '') + (url.hash ? url.hash : '');
      window.history.replaceState({}, document.title, cleanUrl || '/');
    }
  } catch (err) {
    console.warn('[licenseUrl] Błąd czyszczenia URL:', err);
  }
}

/**
 * Generuje gotowy link bezpośredni z dołączonym kodem aktywacyjnym.
 */
export function createActivationUrl(licenseKey: string, baseUrl?: string): string {
  const base = baseUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://usi-light.pl');
  const sanitizedKey = licenseKey.trim().toUpperCase();
  return `${base.replace(/\/+$/, '')}/?key=${encodeURIComponent(sanitizedKey)}`;
}
