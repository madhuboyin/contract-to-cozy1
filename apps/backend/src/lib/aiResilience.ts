export class AITimeoutError extends Error {
  readonly code = 'AI_TIMEOUT';
  readonly timeoutMs: number;
  readonly operation: string;

  constructor(operation: string, timeoutMs: number) {
    super(`AI operation "${operation}" timed out after ${timeoutMs}ms`);
    this.name = 'AITimeoutError';
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

export class AICircuitOpenError extends Error {
  readonly code = 'AI_CIRCUIT_OPEN';
  readonly breakerName: string;
  readonly retryAfterMs: number;

  constructor(breakerName: string, retryAfterMs: number) {
    super(`AI circuit "${breakerName}" is open`);
    this.name = 'AICircuitOpenError';
    this.breakerName = breakerName;
    this.retryAfterMs = Math.max(0, retryAfterMs);
  }
}

interface WithTimeoutOptions {
  timeoutMs: number;
  operation: string;
}

export async function withTimeout<T>(
  work: () => Promise<T>,
  options: WithTimeoutOptions
): Promise<T> {
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 10_000;

  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new AITimeoutError(options.operation, timeoutMs));
    }, timeoutMs);

    if (typeof (timer as NodeJS.Timeout).unref === 'function') {
      (timer as NodeJS.Timeout).unref();
    }

    work()
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface AICircuitBreakerOptions {
  failureThreshold: number;
  openMs: number;
  halfOpenMaxConcurrent?: number;
}

interface AICircuitSnapshot {
  state: CircuitState;
  failures: number;
  opensAtMs: number;
}

export class AICircuitBreaker {
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly openMs: number;
  private readonly halfOpenMaxConcurrent: number;

  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private opensAtMs = 0;
  private halfOpenInFlight = 0;

  constructor(name: string, options: AICircuitBreakerOptions) {
    this.name = name;
    this.failureThreshold = Math.max(1, Math.floor(options.failureThreshold));
    this.openMs = Math.max(100, Math.floor(options.openMs));
    this.halfOpenMaxConcurrent = Math.max(1, Math.floor(options.halfOpenMaxConcurrent ?? 1));
  }

  getSnapshot(): AICircuitSnapshot {
    return {
      state: this.state,
      failures: this.failures,
      opensAtMs: this.opensAtMs,
    };
  }

  async execute<T>(work: () => Promise<T>): Promise<T> {
    this.beforeExecutionGate();

    const enteredHalfOpen = this.state === 'HALF_OPEN';
    if (enteredHalfOpen) {
      this.halfOpenInFlight += 1;
    }

    try {
      const result = await work();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    } finally {
      if (enteredHalfOpen) {
        this.halfOpenInFlight = Math.max(0, this.halfOpenInFlight - 1);
      }
    }
  }

  private beforeExecutionGate(): void {
    if (this.state !== 'OPEN') {
      if (this.state === 'HALF_OPEN' && this.halfOpenInFlight >= this.halfOpenMaxConcurrent) {
        throw new AICircuitOpenError(this.name, Math.max(0, this.opensAtMs - Date.now()));
      }
      return;
    }

    const now = Date.now();
    if (now < this.opensAtMs) {
      throw new AICircuitOpenError(this.name, this.opensAtMs - now);
    }

    this.state = 'HALF_OPEN';
    this.failures = 0;
    this.halfOpenInFlight = 0;
  }

  private onSuccess(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.opensAtMs = 0;
    this.halfOpenInFlight = 0;
  }

  private onFailure(error: unknown): void {
    if (this.state === 'HALF_OPEN') {
      this.openCircuit();
      return;
    }

    this.failures += 1;
    if (this.failures >= this.failureThreshold) {
      this.openCircuit();
    }
  }

  private openCircuit(): void {
    this.state = 'OPEN';
    this.failures = 0;
    this.opensAtMs = Date.now() + this.openMs;
    this.halfOpenInFlight = 0;
  }
}
