import React from 'react';

/**
 * Wykrywa bezczynność użytkownika (brak ruchu myszy/klawiatury/scrolla) i zwraca
 * `true` przez `flashDurationMs` po upływie każdego z podanych opóźnień `delaysMs`,
 * licząc od ostatniej aktywności. Każda instancja hooka nasłuchuje niezależnie.
 */
export function useIdleGlint(delaysMs: number[], flashDurationMs = 1000): boolean {
  const [isGlinting, setIsGlinting] = React.useState(false);

  React.useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let glintOffTimer: ReturnType<typeof setTimeout> | null = null;

    const triggerGlint = () => {
      setIsGlinting(true);
      if (glintOffTimer) clearTimeout(glintOffTimer);
      glintOffTimer = setTimeout(() => {
        setIsGlinting(false);
      }, flashDurationMs);
    };

    const resetIdleTimers = () => {
      timers.forEach((t) => clearTimeout(t));
      timers.length = 0;
      setIsGlinting(false);

      delaysMs.forEach((delay) => {
        timers.push(setTimeout(triggerGlint, delay));
      });
    };

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'pointermove'];
    const handleActivity = () => {
      resetIdleTimers();
    };

    activityEvents.forEach((evt) => {
      window.addEventListener(evt, handleActivity, { passive: true });
    });

    resetIdleTimers();

    return () => {
      timers.forEach((t) => clearTimeout(t));
      if (glintOffTimer) clearTimeout(glintOffTimer);
      activityEvents.forEach((evt) => {
        window.removeEventListener(evt, handleActivity);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return isGlinting;
}
