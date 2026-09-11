/**
 * fetch() wrapper, ktory bezpiecznie parsuje odpowiedz jako JSON.
 * Gdy serwer (np. platforma hostingowa przy awarii funkcji serverless) zwroci
 * HTML/tekst zamiast JSON-a, rzuca jeden czytelny blad zamiast surowego
 * SyntaxError z JSON.parse ("Unexpected token 'A'..." itp.).
 */
export async function fetchJson<T = any>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(url, init);
  const text = await res.text();

  let data: T;
  try {
    data = text.length > 0 ? JSON.parse(text) : ({} as T);
  } catch {
    throw new Error(`Serwer zwrócił nieprawidłową odpowiedź (status ${res.status}). Spróbuj ponownie za chwilę.`);
  }

  return { ok: res.ok, status: res.status, data };
}

/**
 * Narzędzie do generowania i pobierania pliku tekstowego (.txt) z kluczem licencyjnym.
 */
export function downloadLicenseKeyFile(key: string, days: number, planTitle?: string) {
  if (!key) return;

  const dateStr = new Date().toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const content = [
    '==================================================',
    '        SWIATLO 2.5D - KLUCZ ROZSZERZENIA (PRO)   ',
    '==================================================',
    '',
    `Klucz licencyjny: ${key}`,
    `Okres waznosci:   ${days} dni od momentu aktywacji`,
    `Typ dostepu:      ${planTitle || `Pakiet ${days} Dni`}`,
    `Data utworzenia:  ${dateStr}`,
    '',
    '--------------------------------------------------',
    'JAK UZYC KLUCZA:',
    '1. Wejdz na https://swiatlo.warstadt.pl lub uruchom aplikacje.',
    '2. W lewym gornym rogu kliknij przycisk „Rozszerz”.',
    '3. Wklej powyzszy klucz i kliknij „Aktywuj dostep”.',
    '--------------------------------------------------',
    '',
    'Zachowaj ten plik w bezpiecznym miejscu.',
    '==================================================',
  ].join('\r\n');

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `klucz-licencyjny-swiatlo-${days}d-${key.slice(-4)}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
