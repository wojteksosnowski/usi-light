// src/utils/demoRunner.ts
// Helpery animacji i odtwarzania sesji

export const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Animuje wartość 0→1 z easingiem easeInOutCubic.
 * Wywołuje `onStep(eased)` przy każdej klatce animacji (requestAnimationFrame).
 */
export async function animateValue(
  durationMs: number,
  onStep: (eased: number) => void
): Promise<void> {
  const start = performance.now();
  return new Promise((resolve) => {
    function frame(now: number) {
      const p = Math.min((now - start) / durationMs, 1);
      const eased =
        p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      onStep(eased);
      if (p < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}