'use client';

import { useCallback, useEffect, useState } from 'react';

export type CoordinatedPostLoginTransition = {
  transitionVisible: boolean;
  transitionTimedOut: boolean;
  markTransitionReady: () => void;
};

/**
 * Coordinates the branded post-login surface with actual Home readiness.
 *
 * A short minimum prevents a distracting flash for cached responses. The
 * surface then stays in place until the Home route reports that its initial
 * payload has settled. A maximum duration prevents a missing signal from
 * trapping the user.
 */
export function useCoordinatedPostLoginTransition(
  initiallyVisible: boolean,
  minimumDurationMs: number,
  maximumDurationMs: number,
): CoordinatedPostLoginTransition {
  const [transitionVisible, setTransitionVisible] = useState(initiallyVisible);
  const [transitionTimedOut, setTransitionTimedOut] = useState(false);
  const [minimumElapsed, setMinimumElapsed] = useState(!initiallyVisible);
  const [contentReady, setContentReady] = useState(!initiallyVisible);

  useEffect(() => {
    if (!transitionVisible) return;

    const minimumTimer = window.setTimeout(
      () => setMinimumElapsed(true),
      minimumDurationMs,
    );
    const maximumTimer = window.setTimeout(
      () => setTransitionTimedOut(true),
      maximumDurationMs,
    );

    return () => {
      window.clearTimeout(minimumTimer);
      window.clearTimeout(maximumTimer);
    };
  }, [maximumDurationMs, minimumDurationMs, transitionVisible]);

  useEffect(() => {
    if (transitionVisible && minimumElapsed && contentReady) {
      setTransitionVisible(false);
    }
  }, [contentReady, minimumElapsed, transitionVisible]);

  const markTransitionReady = useCallback(() => {
    setContentReady(true);
  }, []);

  return { transitionVisible, transitionTimedOut, markTransitionReady };
}
