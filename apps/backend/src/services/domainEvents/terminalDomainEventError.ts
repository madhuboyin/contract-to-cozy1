// A handler error that must not be retried: the worker dead-letters the event at once instead of spending its attempts (an integrity failure that
// no retry can fix). Detected by the `terminal` flag, not `instanceof`, so a copy of this class loaded through the worker alias is still recognized.
export class TerminalDomainEventError extends Error {
  readonly terminal = true as const;
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'TerminalDomainEventError';
  }
}

export const isTerminalDomainEventError = (error: unknown): boolean => (error as { terminal?: unknown } | null)?.terminal === true;
