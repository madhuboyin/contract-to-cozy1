'use client';

// Cookie consent banner — shown on first visit until the user makes a choice.
// Fixed to the bottom of the viewport; dismisses immediately on interaction.
// Meets GDPR / CCPA requirements for explicit consent before analytics load.

import { useConsent } from '@/lib/consent';

export function CookieConsentBanner() {
  const { decided, grantAll, denyAnalytics } = useConsent();

  if (decided) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white/95 px-4 py-4 shadow-lg backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95 sm:px-6"
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
            className="underline underline-offset-2 hover:text-teal-600 dark:hover:text-teal-400"
          >
            Privacy Policy
          </a>
          {' · '}
          <a
            href="/cookies"
            className="underline underline-offset-2 hover:text-teal-600 dark:hover:text-teal-400"
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
            className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
