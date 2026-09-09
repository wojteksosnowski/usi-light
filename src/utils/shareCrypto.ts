import { bytesToBase64Url, base64UrlToBytes } from './base64url';

/**
 * Zaszyfrowany rekord projektu (AES-256-GCM) — bez klucza, klucz żyje wyłącznie w URL.
 */
export interface EncryptedSharePayload {
  version: 1;
  iv: string; // base64url, 12 bajtów
  ciphertext: string; // base64url, zawiera wbudowany 128-bitowy tag GCM
}

export async function generateEncryptionKey(): Promise<{ key: CryptoKey; rawKeyBase64Url: string }> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const raw = await crypto.subtle.exportKey('raw', key);
  return { key, rawKeyBase64Url: bytesToBase64Url(new Uint8Array(raw)) };
}

export async function encryptPayload(gzippedBytes: Uint8Array, key: CryptoKey): Promise<EncryptedSharePayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    gzippedBytes.slice()
  );
  return {
    version: 1,
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
  };
}

/**
 * Deszyfruje payload. Rzuca błąd przy złym kluczu lub uszkodzonym/sfałszowanym szyfrogramie
 * (weryfikacja tagu GCM) — wywołujący powinien pokazać ogólny komunikat błędu.
 */
export async function decryptPayload(enc: EncryptedSharePayload, keyBase64Url: string): Promise<Uint8Array> {
  const rawKey = base64UrlToBytes(keyBase64Url);
  const key = await crypto.subtle.importKey('raw', rawKey.slice(), { name: 'AES-GCM' }, false, ['decrypt']);
  const iv = base64UrlToBytes(enc.iv);
  const ciphertext = base64UrlToBytes(enc.ciphertext);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    ciphertext as unknown as BufferSource
  );
  return new Uint8Array(plaintext);
}
