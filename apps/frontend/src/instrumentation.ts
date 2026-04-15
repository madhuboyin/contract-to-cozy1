// Next.js instrumentation hook — loaded once per server process startup.
// Sentry is initialized here so it captures errors from all App Router
// server components, route handlers, and middleware.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}
