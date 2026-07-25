'use client';

// Cookie consent banner — shown on first visit until the user makes a choice.
// Fixed to the bottom of the viewport; dismisses immediately on interaction.
// Meets GDPR / CCPA requirements for explicit consent before analytics load.

import { useConsent } from '@/lib/consent';
import { useEffect, useRef, useState } from 'react';

export function CookieConsentBanner() {
  const { hydrated, decided, grantAll, denyAnalytics } = useConsent();
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const [clearance, setClearance] = useState(0);
  const visible = hydrated && !decided;

  // Fixed positioning takes the banner out of document flow, so on short
  // pages (e.g. /signup) it permanently covers whatever content happens to
  // sit at the bottom of the viewport with no way to scroll it into view.
  // Reserve a matching gap in normal flow (below) so that content can
  // always scroll clear of the banner, on every page, at any viewport size.
  useEffect(() => {
    if (!visible || !bannerRef.current) {
      setClearance(0);
      return;
    }

    const el = bannerRef.current;
    const recompute = () => {
      setClearance(window.innerHeight - el.getBoundingClientRect().top);
    };

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(el);
    window.addEventListener('resize', recompute);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', recompute);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <>
      <div
        ref={bannerRef}
        role="dialog"
        aria-live="polite"
        aria-label="Cookie consent"
        className="fixed bottom-[calc(60px+env(safe-area-inset-bottom))] left-0 right-0 z-50 border-t border-gray-200 bg-white/95 px-4 py-4 shadow-lg backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95 sm:px-6 lg:bottom-0"
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            We use{' '}
            <strong className="font-medium">essential cookies</strong>{' '}
            to keep you signed in, and optional{' '}
            <strong className="font-medium">analytics cookies</strong>{' '}
            to track errors and improve performance.{' '}
            <a
              href="/privacy"
              className="!text-slate-700 underline underline-offset-2 hover:!text-teal-800 dark:!text-slate-200 dark:hover:!text-teal-300"
            >
              Privacy Policy
            </a>
            {' · '}
            <a
              href="/cookies"
              className="!text-slate-700 underline underline-offset-2 hover:!text-teal-800 dark:!text-slate-200 dark:hover:!text-teal-300"
            >
              Cookie Policy
            </a>
          </p>

          <div className="flex shrink-0 gap-2">
            <button
              onClick={denyAnalytics}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Essential only
            </button>
            <button
              onClick={grantAll}
              className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
            >
              Accept all
            </button>
          </div>
        </div>
      </div>
      <div aria-hidden="true" style={{ height: clearance }} />
    </>
  );
}
