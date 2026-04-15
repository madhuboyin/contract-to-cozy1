// Client-side (browser) Sentry configuration.
// Loaded by Next.js automatically when the file is present at the project root.
// This runs in the browser — only after the user grants analytics consent
// (see apps/frontend/src/app/providers.tsx → initAnalytics).

import * as Sentry from '@sentry/nextjs';

export function initSentryClient(): void {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return; // No DSN → stay silent (dev / staging without Sentry)

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',

    // Sample 100 % of errors, 10 % of performance transactions in production.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Session replays: capture 0 % normally, 100 % when an error occurs.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,

    integrations: [
      Sentry.replayIntegration({
        // Mask all text and block all media by default (GDPR-safe)
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    // Strip PII from breadcrumbs automatically
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'xhr' || breadcrumb.category === 'fetch') {
        // Remove Authorization headers from network breadcrumbs
        if (breadcrumb.data?.['Authorization']) {
          delete breadcrumb.data['Authorization'];
        }
      }
      return breadcrumb;
    },

    // Never send events from localhost
    beforeSend(event) {
      if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
        return null;
      }
      return event;
    },
  });
}
