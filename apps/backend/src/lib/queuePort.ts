// apps/backend/src/lib/queuePort.ts
//
// Small interface (W4 item 1) that a real BullMQ Queue satisfies
// structurally, plus a lazy-construction wrapper that replaces eager
// `export const xQueue = new Queue(...)` module-scope singletons.
//
// Why: every eager `new Queue(...)` at module scope opens a real ioredis
// connection the instant the file is `require()`d — not at first use. This
// is the exact, twice-documented hang-trap (diyAiGuide.service.ts,
// JobQueue.service.ts) that forced every prior test touching these modules
// to stub `require.cache['bullmq']` before the first require. A lazy
// getter defers construction to first call, and `__setForTesting` lets a
// test swap in an in-memory fake before that first call ever happens — so
// importing (or even fully exercising, once a fake is set) these modules
// in a test never opens Redis at all.

import type { Job, JobsOptions } from 'bullmq';

export interface QueuePort<T = unknown> {
  add(name: string, data: T, opts?: JobsOptions): Promise<Job<T>>;
  getJob(jobId: string): Promise<Job<T> | undefined>;
  close?(): Promise<void>;
}

export interface LazyQueue<T> {
  (): QueuePort<T>;
  /** Test-only: inject a fake, or pass undefined to restore real construction. */
  __setForTesting(fake: QueuePort<T> | undefined): void;
}

export function createLazyQueue<T>(factory: () => QueuePort<T>): LazyQueue<T> {
  let real: QueuePort<T> | undefined;
  let fake: QueuePort<T> | undefined;

  const getter = (() => {
    if (fake) return fake;
    if (!real) real = factory();
    return real;
  }) as LazyQueue<T>;

  getter.__setForTesting = (q: QueuePort<T> | undefined) => {
    fake = q;
  };

  return getter;
}

/** In-memory fake for tests — records every add() call, no I/O. */
export function createFakeQueue<T>(): QueuePort<T> & { added: Array<{ name: string; data: T; opts?: JobsOptions }> } {
  const added: Array<{ name: string; data: T; opts?: JobsOptions }> = [];
  return {
    added,
    async add(name: string, data: T, opts?: JobsOptions) {
      added.push({ name, data, opts });
      return { id: opts?.jobId ?? `fake-${added.length}` } as unknown as Job<T>;
    },
    async getJob() {
      return undefined;
    },
    async close() {},
  };
}
