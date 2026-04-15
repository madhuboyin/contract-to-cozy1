'use client';

// Consent context — persists user's cookie/analytics preference in localStorage.
// Consuming code should call useConsent() to read state and grant/deny consent.
//
// Consent categories:
//   analytics — Faro RUM + Sentry client-side error tracking
//
// "Necessary" cookies (auth session, CSRF token) are always allowed and are
// NOT gated behind this consent — they are required for the app to function.

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';

const STORAGE_KEY = 'c2c_consent_v1';

interface ConsentState {
  /** User has explicitly made a choice (accept or deny). */
  decided: boolean;
  /** Analytics / error-tracking consent (Faro + Sentry client). */
  analytics: boolean;
}

interface ConsentContextValue extends ConsentState {
  /** Accept all optional categories. */
  grantAll: () => void;
  /** Accept necessary cookies only; deny analytics. */
  denyAnalytics: () => void;
}

const ConsentContext = createContext<ConsentContextValue | null>(null);

function readStorage(): ConsentState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    if (typeof parsed.decided !== 'boolean' || typeof parsed.analytics !== 'boolean') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStorage(state: ConsentState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private browsing or storage full — ignore; banner will re-appear next visit
  }
}

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConsentState>({ decided: false, analytics: false });

  // Hydrate from storage once on mount (avoids SSR mismatch)
  useEffect(() => {
    const stored = readStorage();
    if (stored) setState(stored);
  }, []);

  const grantAll = useCallback(() => {
    const next: ConsentState = { decided: true, analytics: true };
    setState(next);
    writeStorage(next);
  }, []);

  const denyAnalytics = useCallback(() => {
    const next: ConsentState = { decided: true, analytics: false };
    setState(next);
    writeStorage(next);
  }, []);

  return (
    <ConsentContext.Provider value={{ ...state, grantAll, denyAnalytics }}>
      {children}
    </ConsentContext.Provider>
  );
}

export function useConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error('useConsent must be used inside <ConsentProvider>');
  return ctx;
}
