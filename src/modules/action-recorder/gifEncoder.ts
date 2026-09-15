// src/modules/action-recorder/gifEncoder.ts
// Lekki enkoder animowanego GIF dla przeglądarki (Pure TypeScript / Canvas)

export interface GifFrame {
  imageData: ImageData;
  delayMs: number;
}

export class SimpleGifEncoder {
  private width: number;
  private height: number;
  private frames: GifFrame[] = [];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  addFrame(imageData: ImageData, delayMs = 100): void {
    this.frames.push({ imageData, delayMs });
  }

  encode(): Blob {
    const bytes: number[] = [];

    // Header: GIF89a
    const header = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
    bytes.push(...header);

    // Logical Screen Descriptor
    bytes.push(this.width & 0xff, (this.width >> 8) & 0xff);
    bytes.push(this.height & 0xff, (this.height >> 8) & 0xff);
    // GCT Flag: 0, Color Resolution: 7 (8 bits), Sort: 0, GCT Size: 0
    bytes.push(0x70, 0x00, 0x00);

    // Netscape 2.0 Application Extension (for infinite loop)
    bytes.push(
      0x21,
      0xff,
      0x0b,
      0x4e,
      0x45,
      0x54,
      0x53,
      0x43,
      0x41,
      0x50,
      0x45,
      0x32,
      0x2e,
      0x30,
      0x03,
      0x01,
      0x00,
      0x00,
      0x00
    );

    for (const frame of this.frames) {
      this.encodeFrame(frame, bytes);
    }

    // GIF Trailer
    bytes.push(0x3b);

    return new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
  }

  private encodeFrame(frame: GifFrame, bytes: number[]): void {
    const { imageData, delayMs } = frame;
    const data = imageData.data;
    const delayHundredths = Math.max(2, Math.round(delayMs / 10));

    // Paleta 256 kolorów (Uniform Color Quantization 6x6x6 + 40 odcieni szarości)
    const palette: number[][] = [];
    const colorMap = new Map<number, number>();

    // Generuj paletę 216 kolorów RGB
    for (let r = 0; r < 6; r++) {
      for (let g = 0; g < 6; g++) {
        for (let b = 0; b < 6; b++) {
          palette.push([
            Math.round((r * 255) / 5),
            Math.round((g * 255) / 5),
            Math.round((b * 255) / 5),
          ]);
        }
      }
    }
    // Dodaj 40 odcieni szarości
    for (let i = 0; i < 40; i++) {
      const val = Math.round((i * 255) / 39);
      palette.push([val, val, val]);
    }

    // Graphics Control Extension
    bytes.push(
      0x21,
      0xf9,
      0x04,
      0x04, // Disposal: do not dispose
      delayHundredths & 0xff,
      (delayHundredths >> 8) & 0xff,
      0x00, // Transparent color index
      0x00 // Block terminator
    );

    // Image Descriptor with Local Color Table (256 colors)
    bytes.push(0x2c);
    bytes.push(0x00, 0x00, 0x00, 0x00); // x, y = 0, 0
    bytes.push(this.width & 0xff, (this.width >> 8) & 0xff);
    bytes.push(this.height & 0xff, (this.height >> 8) & 0xff);
    bytes.push(0x87); // Local Color Table flag + 8 bits (256 colors)

    // Zapisz paletę kolorów LCT (768 bajtów)
    for (let i = 0; i < 256; i++) {
      const col = palette[i] || [0, 0, 0];
      bytes.push(col[0], col[1], col[2]);
    }

    // Mapowanie pikseli do indeksów palety
    const indexedPixels = new Uint8Array(this.width * this.height);
    for (let i = 0; i < indexedPixels.length; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];

      const key = (r << 16) | (g << 8) | b;
      let idx = colorMap.get(key);
      if (idx === undefined) {
        idx = this.findNearestPaletteIndex(r, g, b, palette);
        colorMap.set(key, idx);
      }
      indexedPixels[i] = idx;
    }

    // LZW Encoding
    this.encodeLzw(indexedPixels, bytes);
  }

  private findNearestPaletteIndex(
    r: number,
    g: number,
    b: number,
    palette: number[][]
  ): number {
    let bestDist = Infinity;
    let bestIdx = 0;
    for (let i = 0; i < palette.length; i++) {
      const p = palette[i];
      const dr = r - p[0];
      const dg = g - p[1];
      const db = b - p[2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
        if (dist === 0) break;
      }
    }
    return bestIdx;
  }

  private encodeLzw(pixels: Uint8Array, bytes: number[]): void {
    const minCodeSize = 8;
    bytes.push(minCodeSize);

    const clearCode = 1 << minCodeSize; // 256
    const eoiCode = clearCode + 1; // 257

    let codeSize = minCodeSize + 1;
    let nextCode = eoiCode + 1;

    const dictionary = new Map<string, number>();
    const resetDictionary = () => {
      dictionary.clear();
      codeSize = minCodeSize + 1;
      nextCode = eoiCode + 1;
    };

    const outputBits: number[] = [];
    let bitPos = 0;

    const writeBits = (code: number, length: number) => {
      for (let b = 0; b < length; b++) {
        const bit = (code >> b) & 1;
        const byteIndex = bitPos >> 3;
        const bitOffset = bitPos & 7;

        if (outputBits.length <= byteIndex) {
          outputBits.push(0);
        }
        outputBits[byteIndex] |= bit << bitOffset;
        bitPos++;
      }
    };

    resetDictionary();
    writeBits(clearCode, codeSize);

    let prefix = String.fromCharCode(pixels[0]);

    for (let i = 1; i < pixels.length; i++) {
      const k = String.fromCharCode(pixels[i]);
      const combined = prefix + k;

      if (dictionary.has(combined)) {
        prefix = combined;
      } else {
        const code =
          prefix.length === 1
            ? prefix.charCodeAt(0)
            : dictionary.get(prefix)!;
        writeBits(code, codeSize);

        if (nextCode < 4096) {
          dictionary.set(combined, nextCode++);
          if (nextCode > (1 << codeSize) && codeSize < 12) {
            codeSize++;
          }
        } else {
          writeBits(clearCode, codeSize);
          resetDictionary();
        }

        prefix = k;
      }
    }

    const lastCode =
      prefix.length === 1 ? prefix.charCodeAt(0) : dictionary.get(prefix)!;
    writeBits(lastCode, codeSize);
    writeBits(eoiCode, codeSize);

    // Zapisz bloki po 255 bajtów
    let offset = 0;
    while (offset < outputBits.length) {
      const chunkSize = Math.min(255, outputBits.length - offset);
      bytes.push(chunkSize);
      for (let j = 0; j < chunkSize; j++) {
        bytes.push(outputBits[offset + j]);
      }
      offset += chunkSize;
    }

    // Blok kończący
    bytes.push(0x00);
  }
}
