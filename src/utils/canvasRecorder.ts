// src/utils/canvasRecorder.ts
// ⚠️ NARZĘDZIE MARKETINGOWE — TYLKO LOCAL DEV
// Plik importowany tylko przez useDemoRecorder.ts, który zawiera guard import.meta.env.DEV.

export interface RecorderOptions {
  fps?: number;
  bitrate?: number; // domyślnie 8 Mbps dla ostrych linii CAD
}

export class CanvasRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private options: RecorderOptions = {}
  ) {}

  start(): void {
    this.recordedChunks = [];
    const fps = this.options.fps ?? 60;
    const stream = this.canvas.captureStream(fps);

    // Preferencja VP9 z wysokim bitrate dla ostrych linii CAD
    const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9')
      ? 'video/webm; codecs=vp9'
      : 'video/webm';

    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: this.options.bitrate ?? 8_000_000,
    });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.mediaRecorder.start();
  }

  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        return reject(new Error('[DemoRecorder] Recorder nie został uruchomiony'));
      }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        resolve(blob);
      };

      this.mediaRecorder.stop();
    });
  }

  static downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
