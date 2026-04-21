'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Controls visibility of the post-login transition screen.
 *
 * Starts showing the transition only if auth was loading on mount.
 * Gives the exit animation time to complete before fully unmounting.
 */
export function usePostLoginTransition(
  authLoading: boolean,
  exitDelayMs = 600
): { showTransition: boolean } {
  const startedLoading = useRef(authLoading);
  const [showTransition, setShowTransition] = useState(startedLoading.current);

  useEffect(() => {
    if (!authLoading && showTransition) {
      const t = setTimeout(() => setShowTransition(false), exitDelayMs);
      return () => clearTimeout(t);
    }
  }, [authLoading, showTransition, exitDelayMs]);

  return { showTransition };
}
