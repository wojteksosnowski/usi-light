import { describe, it, expect } from 'vitest';
import { generateEncryptionKey, encryptPayload, decryptPayload } from './shareCrypto';
import { serializeAndGzipPayload, gunzipAndDeserializePayload, createSharedPayloadFromState } from './shareSerializer';
import { createSampleBuildings } from './dxfParser';

describe('shareCrypto (AES-256-GCM)', () => {
  it('round-trip: encryptPayload -> decryptPayload odtwarza dane bajt po bajcie', async () => {
    const plaintext = new TextEncoder().encode('Hello, Encrypted World!');
    const { key, rawKeyBase64Url } = await generateEncryptionKey();

    const encrypted = await encryptPayload(plaintext, key);
    expect(encrypted.version).toBe(1);

    const decrypted = await decryptPayload(encrypted, rawKeyBase64Url);
    expect(decrypted).toEqual(plaintext);
  });

  it('każde szyfrowanie generuje inny IV i inny szyfrogram', async () => {
    const plaintext = new TextEncoder().encode('Same message');
    const { key } = await generateEncryptionKey();

    const enc1 = await encryptPayload(plaintext, key);
    const enc2 = await encryptPayload(plaintext, key);

    expect(enc1.iv).not.toBe(enc2.iv);
    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
  });

  it('deszyfrowanie z innym kluczem odrzuca (rejects)', async () => {
    const plaintext = new TextEncoder().encode('Secret');
    const { key } = await generateEncryptionKey();
    const { rawKeyBase64Url: wrongKey } = await generateEncryptionKey();

    const encrypted = await encryptPayload(plaintext, key);
    await expect(decryptPayload(encrypted, wrongKey)).rejects.toThrow();
  });

  it('uszkodzony (sfałszowany) szyfrogram odrzuca dzięki weryfikacji tagu GCM', async () => {
    const plaintext = new TextEncoder().encode('Secret');
    const { key, rawKeyBase64Url } = await generateEncryptionKey();
    const encrypted = await encryptPayload(plaintext, key);

    const tampered = { ...encrypted, ciphertext: encrypted.ciphertext.slice(0, -2) + (encrypted.ciphertext.slice(-2) === 'AA' ? 'BB' : 'AA') };
    await expect(decryptPayload(tampered, rawKeyBase64Url)).rejects.toThrow();
  });

  it('pełny round-trip: SharedProjectPayload -> gzip -> encrypt -> decrypt -> gunzip -> parse', async () => {
    const buildings = createSampleBuildings();
    const payload = createSharedPayloadFromState({
      buildings,
      settings: { latitude: 52.2297, longitude: 21.0122, equinoxDate: 'spring' },
    });

    const gzipped = serializeAndGzipPayload(payload);
    const { key, rawKeyBase64Url } = await generateEncryptionKey();
    const encrypted = await encryptPayload(gzipped, key);

    const decryptedGzipped = await decryptPayload(encrypted, rawKeyBase64Url);
    const restored = gunzipAndDeserializePayload(decryptedGzipped);

    expect(restored.v).toBe(payload.v);
    expect(restored.scene.buildings.length).toBe(buildings.length);
    expect(restored.solar.latitude).toBe(52.2297);
  });
});
