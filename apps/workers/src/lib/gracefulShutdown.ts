// apps/workers/src/lib/gracefulShutdown.ts
//
// W5 item 7 (worker audit): worker.ts previously had no SIGTERM/SIGINT
// handling at all — a pod termination (deploy rollout, autoscaling,
// eviction) killed the process immediately, abandoning whatever BullMQ
// jobs were mid-flight and leaving Redis/HTTP connections to be torn down
// uncleanly by the OS instead of closed properly. BullMQ's own
// Worker.close()/Queue.close() already implement the right semantics
// (stop accepting new jobs, let the current job finish, then disconnect)
// — this module just makes sure every long-lived resource actually gets
// that call on shutdown, with a bounded timeout so a stuck close() can
// never hang the process indefinitely.

import { logger } from './logger';

type ShutdownHandler = { name: string; close: () => Promise<void> | void };

const handlers: ShutdownHandler[] = [];
let shuttingDown = false;

/** Register a resource to be closed on SIGTERM/SIGINT. Order doesn't matter — all handlers run concurrently. */
export function registerShutdownHandler(name: string, close: () => Promise<void> | void): void {
  handlers.push({ name, close });
}

export function installGracefulShutdown(opts?: { timeoutMs?: number }): void {
  const timeoutMs = opts?.timeoutMs ?? 30_000;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info(
      `[SHUTDOWN] Received ${signal} — closing ${handlers.length} resource(s), ` +
        `in-flight jobs get up to ${timeoutMs}ms to finish before a forced exit`,
    );

    const forceExitTimer = setTimeout(() => {
      logger.error(`[SHUTDOWN] Graceful shutdown exceeded ${timeoutMs}ms — forcing exit`);
      process.exit(1);
    }, timeoutMs);
    // Never let this timer itself keep the process alive if everything
    // else closes cleanly well before the deadline.
    forceExitTimer.unref();

    const results = await Promise.allSettled(
      handlers.map(async (h) => {
        try {
          await h.close();
          logger.info(`[SHUTDOWN] Closed "${h.name}"`);
        } catch (err) {
          logger.error({ err }, `[SHUTDOWN] Failed to close "${h.name}"`);
          throw err;
        }
      }),
    );

    clearTimeout(forceExitTimer);
    const failed = results.filter((r) => r.status === 'rejected').length;
    logger.info(`[SHUTDOWN] Closed ${handlers.length - failed}/${handlers.length} resource(s)`);
    process.exit(failed > 0 ? 1 : 0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

/** Test-only: reset registered handlers and shutdown state between test files. */
export function __resetForTesting(): void {
  handlers.length = 0;
  shuttingDown = false;
}

/** Test-only: read the currently registered handler names without triggering shutdown. */
export function __getRegisteredHandlerNames(): string[] {
  return handlers.map((h) => h.name);
}
