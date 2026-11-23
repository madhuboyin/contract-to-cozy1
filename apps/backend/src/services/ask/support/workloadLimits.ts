// BICC-TRN-005/006: Ask declares workload-aware limits by authenticated identity and by household/property scope, and a refusal says exactly when to try again. Pure
// and deterministic except for the clock-free counters; limits are held per process (a multi-pod fleet therefore allows up to limit x pods in total, which is a
// stated property of this version, not a hidden one). A refused request is rejected BEFORE anything is created, so its draft and client request id stay reusable.
export type WorkloadClass = 'EXECUTION' | 'MODEL_CALL' | 'ATTACHMENT_ANALYSIS' | 'EXPENSIVE_OPERATION';

export interface WorkloadLimit {
  /** Concurrent in-flight units one person may hold. */
  perUser: number;
  /** Concurrent in-flight units one household/property scope may hold across its members. */
  perScope: number;
  /** The wait suggested to a refused caller, in seconds: about one typical unit of this class, never zero. */
  retryAfterSeconds: number;
}

export const DEFAULT_WORKLOAD_LIMITS: Readonly<Record<WorkloadClass, WorkloadLimit>> = Object.freeze({
  EXECUTION: { perUser: 4, perScope: 8, retryAfterSeconds: 5 },
  MODEL_CALL: { perUser: 3, perScope: 6, retryAfterSeconds: 10 },
  ATTACHMENT_ANALYSIS: { perUser: 2, perScope: 4, retryAfterSeconds: 20 },
  EXPENSIVE_OPERATION: { perUser: 2, perScope: 4, retryAfterSeconds: 15 },
});

export type WorkloadGrant = { granted: true; release: () => void };
export type WorkloadRefusal = { granted: false; reason: 'USER_LIMIT' | 'SCOPE_LIMIT'; workloadClass: WorkloadClass; retryAfterSeconds: number };

const positiveInt = (value: unknown, fallback: number): number => {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : fallback;
};

/** Limits with optional environment overrides (ASK_MAX_<CLASS>_PER_USER / _PER_SCOPE); a malformed or non-positive override is ignored, never read as "unlimited". */
export function workloadLimitsFromEnv(env: Record<string, string | undefined> = process.env): Record<WorkloadClass, WorkloadLimit> {
  const out = {} as Record<WorkloadClass, WorkloadLimit>;
  for (const key of Object.keys(DEFAULT_WORKLOAD_LIMITS) as WorkloadClass[]) {
    const base = DEFAULT_WORKLOAD_LIMITS[key];
    out[key] = { perUser: positiveInt(env[`ASK_MAX_${key}_PER_USER`], base.perUser), perScope: positiveInt(env[`ASK_MAX_${key}_PER_SCOPE`], base.perScope), retryAfterSeconds: base.retryAfterSeconds };
  }
  return out;
}

export class AskWorkloadGate {
  private readonly users = new Map<string, number>();
  private readonly scopes = new Map<string, number>();
  constructor(private readonly limits: Record<WorkloadClass, WorkloadLimit> = workloadLimitsFromEnv()) {}

  /** In-flight units now, for tests and metrics. */
  inFlight(workloadClass: WorkloadClass, userId: string, scopeId?: string | null): { user: number; scope: number } {
    return { user: this.users.get(`${workloadClass}:${userId}`) ?? 0, scope: scopeId ? this.scopes.get(`${workloadClass}:${scopeId}`) ?? 0 : 0 };
  }

  /** Takes one unit, or refuses without taking anything. The returned release is idempotent, so a double release can never free another caller's unit. */
  acquire(workloadClass: WorkloadClass, userId: string, scopeId?: string | null): WorkloadGrant | WorkloadRefusal {
    const limit = this.limits[workloadClass];
    const userKey = `${workloadClass}:${userId}`;
    const scopeKey = scopeId ? `${workloadClass}:${scopeId}` : null;
    if ((this.users.get(userKey) ?? 0) >= limit.perUser) return { granted: false, reason: 'USER_LIMIT', workloadClass, retryAfterSeconds: limit.retryAfterSeconds };
    if (scopeKey && (this.scopes.get(scopeKey) ?? 0) >= limit.perScope) return { granted: false, reason: 'SCOPE_LIMIT', workloadClass, retryAfterSeconds: limit.retryAfterSeconds };
    this.users.set(userKey, (this.users.get(userKey) ?? 0) + 1);
    if (scopeKey) this.scopes.set(scopeKey, (this.scopes.get(scopeKey) ?? 0) + 1);
    let released = false;
    return {
      granted: true,
      release: () => {
        if (released) return;
        released = true;
        const drop = (map: Map<string, number>, key: string) => { const next = (map.get(key) ?? 1) - 1; if (next <= 0) map.delete(key); else map.set(key, next); };
        drop(this.users, userKey);
        if (scopeKey) drop(this.scopes, scopeKey);
      },
    };
  }
}

/** The person-facing sentence for a refusal: what happened, that the question is kept, and exactly how long to wait. */
export function workloadRefusalMessage(refusal: WorkloadRefusal): string {
  const wait = `${refusal.retryAfterSeconds} second${refusal.retryAfterSeconds === 1 ? '' : 's'}`;
  const who = refusal.reason === 'SCOPE_LIMIT' ? 'Ask is handling several requests for this home right now.' : 'Ask is still working on your earlier requests.';
  return `${who} Your question is kept, so nothing is lost. Try again in about ${wait}.`;
}

export const askWorkloadGate = new AskWorkloadGate();
