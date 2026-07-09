'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';

const ACTIVITY_KEY = 'ctc.admin.idle.lastActivityAt';
const LOGGED_OUT_KEY = 'ctc.admin.idle.loggedOut';
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;
const ACTIVITY_WRITE_THROTTLE_MS = 250;
const TICK_MS = 1000;

export interface UseIdleTimeoutOptions {
  /** Total idle duration before logout. Defaults to 15 minutes. */
  idleMs?: number;
  /** How long before the timeout the warning modal appears. Defaults to 60 seconds. */
  warningMs?: number;
}

export interface UseIdleTimeoutResult {
  showWarning: boolean;
  secondsRemaining: number;
  stayActive: () => void;
}

/**
 * Client-side inactivity timeout, currently scoped to ADMIN sessions only.
 * Self no-ops (no listeners, no timer) for any other role or while auth is
 * still resolving, so it's safe to call unconditionally from any component.
 *
 * Cross-tab aware via localStorage 'storage' events — activity in one tab
 * resets the clock in all tabs, and a timeout in one tab logs out every
 * other open tab. No leader election: logout() is idempotent per tab.
 */
export function useIdleTimeout(options?: UseIdleTimeoutOptions): UseIdleTimeoutResult {
  const idleMs = options?.idleMs ?? 15 * 60 * 1000;
  const warningMs = options?.warningMs ?? 60 * 1000;

  const { user, loading, logout } = useAuth();
  const armed = !loading && user?.role === 'ADMIN';

  const [showWarning, setShowWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  const lastActivityAtRef = useRef(Date.now());
  const lastWriteAtRef = useRef(0);
  const hasLoggedOutRef = useRef(false);

  const stayActive = useCallback(() => {
    const now = Date.now();
    lastActivityAtRef.current = now;
    setShowWarning(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ACTIVITY_KEY, String(now));
    }
  }, []);

  useEffect(() => {
    if (!armed || typeof window === 'undefined') return;

    hasLoggedOutRef.current = false;
    lastActivityAtRef.current = Date.now();

    const recordActivity = () => {
      const now = Date.now();
      lastActivityAtRef.current = now;
      if (now - lastWriteAtRef.current >= ACTIVITY_WRITE_THROTTLE_MS) {
        lastWriteAtRef.current = now;
        window.localStorage.setItem(ACTIVITY_KEY, String(now));
      }
    };

    const doLogout = () => {
      if (hasLoggedOutRef.current) return;
      hasLoggedOutRef.current = true;
      window.localStorage.setItem(LOGGED_OUT_KEY, String(Date.now()));
      void logout();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === ACTIVITY_KEY && event.newValue) {
        const ts = Number(event.newValue);
        if (!Number.isNaN(ts) && ts > lastActivityAtRef.current) {
          lastActivityAtRef.current = ts;
        }
      }
      if (event.key === LOGGED_OUT_KEY && event.newValue) {
        doLogout();
      }
    };

    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, recordActivity, { passive: true }));
    window.addEventListener('storage', handleStorage);

    const tick = window.setInterval(() => {
      const elapsed = Date.now() - lastActivityAtRef.current;

      if (elapsed >= idleMs) {
        doLogout();
        return;
      }

      if (elapsed >= idleMs - warningMs) {
        setShowWarning(true);
        setSecondsRemaining(Math.max(0, Math.ceil((idleMs - elapsed) / 1000)));
      } else {
        setShowWarning(false);
      }
    }, TICK_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, recordActivity));
      window.removeEventListener('storage', handleStorage);
      window.clearInterval(tick);
    };
  }, [armed, idleMs, warningMs, logout]);

  return {
    showWarning: armed && showWarning,
    secondsRemaining,
    stayActive,
  };
}
