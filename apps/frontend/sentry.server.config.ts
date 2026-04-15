// Server-side (Node.js runtime) Sentry configuration for Next.js App Router.
// Loaded via src/instrumentation.ts when the Node.js runtime is used.
// Server-side error tracking is always-on — it captures only stack traces /
// request paths, never user-identifying data, so no consent gate is needed.

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Don't send events from the dev server
  beforeSend(event) {
    if (process.env.NODE_ENV === 'development') return null;
    return event;
  },
});
