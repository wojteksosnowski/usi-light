// src/components/cad/pipeline/layers/RecorderVisualsLayer.ts
// Warstwa potoku renderowania rysująca wirtualny kursor, fale kliknięć, HUD skrótów i indykator REC

import { CadRenderLayer, CadRenderFrameContext } from '../types';
import { useActionRecorderStore } from '../../../../modules/action-recorder/useActionRecorderStore';

export class RecorderVisualsLayer implements CadRenderLayer {
  readonly id = 'recorder_visuals';
  readonly zIndex = 999; // Najwyższa warstwa w potoku, aby była widoczna na nagraniu
  readonly tier = 'hud' as const;

  shouldRender(_context: CadRenderFrameContext): boolean {
    const state = useActionRecorderStore.getState();
    return state.isRecording || state.replayerStatus.isPlaying || state.isCountingDown;
  }

  render(context: CadRenderFrameContext): void {
    const { renderContext } = context;
    const { ctx } = renderContext;
    const state = useActionRecorderStore.getState();
    const { settings, virtualPointer, activeKeys, isRecording, recordingTimeMs, replayerStatus } = state;

    ctx.save();
    // Reset ewentualnych transformacji kamery - rysujemy bezpośrednio w przestrzeni ekranu
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const now = performance.now();

    // ── 1. Wskaźnik nagrywania (REC Badge) ───────────────────────────
    if (isRecording && settings.showRecBadge) {
      const isBlinkOn = Math.floor(now / 500) % 2 === 0;
      const totalSec = Math.floor(recordingTimeMs / 1000);
      const tenths = Math.floor((recordingTimeMs % 1000) / 100);
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;

      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const textWidth = ctx.measureText(`REC ${timeStr}`).width;
      const badgeW = textWidth + 36;
      const badgeH = 26;
      const badgeX = 16;
      const badgeY = 16;

      // Tło badge'a
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6);
      ctx.fill();
      ctx.stroke();

      // Czerwona kropka
      ctx.beginPath();
      ctx.arc(badgeX + 13, badgeY + 13, 5, 0, Math.PI * 2);
      ctx.fillStyle = isBlinkOn ? '#ef4444' : 'rgba(239, 68, 68, 0.4)';
      ctx.fill();

      // Tekst czasu
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(`REC ${timeStr}`, badgeX + 24, badgeY + 17);
    }

    // ── 2. HUD wciśniętych klawiszy (Keystroke Badge) ─────────────────
    if (settings.showKeystrokes && activeKeys.length > 0) {
      const keysText = activeKeys.join(' + ');
      ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const keyWidth = ctx.measureText(keysText).width;
      const khW = keyWidth + 24;
      const khH = 28;
      const khX = renderContext.width - khW - 16;
      const khY = 16;

      // Ciemne tło pigułki
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(khX, khY, khW, khH, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.fillText(keysText, khX + 12, khY + 18);
    }

    // ── 3. Wirtualny kursor i fale kliknięć (Pointer & Ripples) ───────
    if (settings.showVirtualCursor && (virtualPointer.visible || replayerStatus.isPlaying)) {
      const px = virtualPointer.x;
      const py = virtualPointer.y;

      // Fale po kliknięciu (Ripples)
      const clickElapsed = now - virtualPointer.lastClickMs;
      if (clickElapsed < 400 && virtualPointer.lastClickMs > 0) {
        const progress = clickElapsed / 400;
        const radius = 6 + progress * 24;
        const alpha = (1 - progress) * 0.7;

        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.strokeStyle =
          virtualPointer.button === 2
            ? `rgba(245, 158, 11, ${alpha})`
            : `rgba(56, 189, 248, ${alpha})`;
        ctx.lineWidth = 2.5 * (1 - progress * 0.5);
        ctx.stroke();
      }

      // Kursor - stylizowany punkt z obwódką
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 2;

      // Zewnętrzny pierścień kursora
      ctx.beginPath();
      ctx.arc(px, py, virtualPointer.isDown ? 7 : 8, 0, Math.PI * 2);
      ctx.fillStyle = virtualPointer.isDown
        ? 'rgba(56, 189, 248, 0.95)'
        : 'rgba(255, 255, 255, 0.95)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#020617';
      ctx.stroke();

      // Wewnętrzny punkt
      ctx.shadowColor = 'transparent';
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fillStyle = virtualPointer.isDown ? '#ffffff' : '#38bdf8';
      ctx.fill();
    }

    // ── 4. Podgląd 3D (Picture-in-Picture wbudowany w nagranie wideo) ──
    if (settings.show3DPreview && state.pipCanvas && (isRecording || replayerStatus.isPlaying)) {
      const dim = {
        small: { w: 360, h: 270 },
        medium: { w: 440, h: 330 },
        large: { w: 520, h: 390 },
      }[settings.pipSize || 'medium'];

      let px = renderContext.width - dim.w - 24;
      let py = renderContext.height - dim.h - 24;

      if (settings.pipPosition === 'top-right') {
        px = renderContext.width - dim.w - 24;
        py = 60;
      } else if (settings.pipPosition === 'bottom-left') {
        px = 24;
        py = renderContext.height - dim.h - 24;
      }

      // Tło i cień okna 3D (czysta karta #eeeeee, zaokrąglenie 12px)
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 25;
      ctx.shadowOffsetY = 10;

      ctx.fillStyle = '#eeeeee';
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.9)';
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.roundRect(px, py, dim.w, dim.h, 12);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Kopiowanie zawartości Canvasu WebGL Three.js do wnętrza karty
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(px, py, dim.w, dim.h, 12);
      ctx.clip();

      try {
        ctx.drawImage(state.pipCanvas, px, py, dim.w, dim.h);
      } catch {
        // canvas may not be ready yet
      }
      ctx.restore();

      // Zewnętrzny obrys
      ctx.save();
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(px, py, dim.w, dim.h, 12);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }
}
