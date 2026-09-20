import React from 'react';

/**
 * Throttles `value` to at most one update per `throttleMs` while `isInteracting` is true
 * (instead of freezing it completely), so downstream expensive recomputation (e.g. 3D preview
 * rebuilds) stays live during drag without re-running on every single high-frequency update.
 */
export function useStableWhileInteracting<T>(value: T, isInteracting: boolean, throttleMs = 120): T {
  const lastStableRef = React.useRef(value);
  const lastUpdateTimeRef = React.useRef(0);
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

  if (!isInteracting && value) {
    lastStableRef.current = value;
    lastUpdateTimeRef.current = now;
  } else if (isInteracting && value && now - lastUpdateTimeRef.current >= throttleMs) {
    lastStableRef.current = value;
    lastUpdateTimeRef.current = now;
  }

  return isInteracting ? lastStableRef.current || value : value;
}
