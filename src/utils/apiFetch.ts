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
