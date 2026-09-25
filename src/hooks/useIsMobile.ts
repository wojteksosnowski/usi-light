import { useState, useEffect } from 'react';

export const SIDEBAR_WIDTH_PX = 380;

/**
 * Szerokość roboczą canvasu, uwzględniając otwarty sidebar (poza trybem kiosk).
 */
export function getCanvasWorkingWidth(isSidebarActive: boolean, win: typeof window | null = typeof window !== 'undefined' ? window : null): number {
  if (!win) return 1200;
  return isSidebarActive ? Math.max(100, win.innerWidth - SIDEBAR_WIDTH_PX) : win.innerWidth;
}

/**
 * Funkcja pomocnicza sprawdzająca, czy bieżące środowisko/okno spełnia kryteria urządzenia mobilnego.
 */
export function checkIsMobile(breakpoint = 768, win: typeof window | null = typeof window !== 'undefined' ? window : null): boolean {
  if (!win) return false;
  const isSmallScreen = typeof win.innerWidth === 'number' && win.innerWidth <= breakpoint;
  const isCoarsePointer =
    typeof win.matchMedia === 'function' && win.matchMedia('(pointer: coarse)').matches;
  return Boolean(isSmallScreen || isCoarsePointer);
}

/**
 * Hook detekcji urządzeń mobilnych i ekranów dotykowych.
 * Zwraca true, jeśli szerokość okna <= breakpoint lub wskaźnik to pointer: coarse (ekran dotykowy).
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => checkIsMobile(breakpoint));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint}px), (pointer: coarse)`);
    const update = (e: MediaQueryListEvent | MediaQueryList) => setIsMobile(e.matches);

    update(mediaQuery);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', update);
      return () => mediaQuery.removeEventListener('change', update);
    } else if (typeof (mediaQuery as any).addListener === 'function') {
      // Fallback dla starszych przeglądarek / środowisk testowych
      (mediaQuery as any).addListener(update);
      return () => (mediaQuery as any).removeListener(update);
    }
  }, [breakpoint]);

  return isMobile;
}
