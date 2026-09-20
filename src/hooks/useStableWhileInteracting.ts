import React from 'react';

/**
 * Freezes `value` to its last non-interacting snapshot while `isInteracting` is true.
 * Prevents expensive downstream recomputation/re-render during high-frequency drag updates.
 */
export function useStableWhileInteracting<T>(value: T, isInteracting: boolean): T {
  const lastStableRef = React.useRef(value);
  if (!isInteracting && value) {
    lastStableRef.current = value;
  }
  return isInteracting ? lastStableRef.current || value : value;
}
