// Composition FRD §5.2 and FR-PER-2/10/13/15/16: child keys, attempts, deterministic selection, assembly-version compare-and-set, and the retry-near-expiry
// rule. Pure: the persistence layer calls these and never re-implements them.
import { createHash } from 'node:crypto';
import { componentStateOf, isTerminalState } from './compositeResult';

export type AttemptKind = 'INITIAL' | 'RETRY' | 'REFRESH';

export interface Attempt {
  /** The child execution id. */
  executionId: string;
  /** Stable component identity: the operation plus its normalized slot set (FR-PER-2). */
  componentKey: string;
  /** Allocated by the parent inside the compare-and-set that records it: unique and totally ordered per component. */
  number: number;
  kind: AttemptKind;
  /** The child's own execution status. */
  status: string;
}

export type SelectionReason = 'LOWEST_SUCCESSFUL' | 'EXPLICIT_REFRESH' | 'ONLY_TERMINAL_LIMITED';
export interface Selection { attempt: Attempt | null; reason: SelectionReason | null; pending: boolean }

/** FR-PER-2: stable across array order and retries; never the array position alone. */
export function componentKeyOf(operationId: string, slots: Record<string, unknown> = {}): string {
  const normalized = Object.keys(slots).sort().map((key) => `${key}=${String(slots[key]).trim().toLowerCase()}`).join('&');
  return `${operationId}|${normalized}`;
}

/** FR-PER-2/FR-PER-11: the child's `clientRequestId`, unique per (user, parent request, component, attempt), so a retry of the parent recomputes the same keys. */
export function childClientRequestId(parentClientRequestId: string, componentKey: string, attempt: number): string {
  const digest = createHash('sha256').update(`${parentClientRequestId}\u0000${componentKey}`).digest('hex').slice(0, 24);
  return `ask-component:${digest}:attempt:${attempt}`;
}

const isSuccess = (attempt: Attempt): boolean => {
  const state = componentStateOf(attempt.status);
  return state === 'ANSWERED' || state === 'LIMITED' && attempt.status === 'READY_WITH_LIMITATIONS';
};

/**
 * FR-PER-15: the selected attempt is DERIVED from the complete attempt set, never by moving a pointer to the most recent completion, so the result is the
 * same whatever order attempts complete in. Only successful attempts are candidates; the highest-numbered successful REFRESH wins (an explicit supersession),
 * otherwise the lowest-numbered successful INITIAL or RETRY. With no success, the highest-numbered terminal limited attempt; with none terminal, pending.
 */
export function selectAttempt(attempts: readonly Attempt[]): Selection {
  const successful = attempts.filter(isSuccess);
  const refresh = successful.filter((a) => a.kind === 'REFRESH').sort((a, b) => b.number - a.number)[0];
  if (refresh) return { attempt: refresh, reason: 'EXPLICIT_REFRESH', pending: false };
  const lowest = successful.filter((a) => a.kind !== 'REFRESH').sort((a, b) => a.number - b.number)[0];
  if (lowest) return { attempt: lowest, reason: 'LOWEST_SUCCESSFUL', pending: false };
  const terminal = attempts.filter((a) => isTerminalState(componentStateOf(a.status))).sort((a, b) => b.number - a.number)[0];
  if (terminal) return { attempt: terminal, reason: 'ONLY_TERMINAL_LIMITED', pending: false };
  return { attempt: null, reason: null, pending: attempts.length > 0 };
}

// ---- the authoritative attempt set and the assembly-version compare-and-set (FR-PER-13) ----------------------------------------------------------------
export interface AssemblyState {
  /** null on a non-composite execution; 0 at creation of a composite parent; +1 for every accepted attempt-set mutation. */
  version: number | null;
  attempts: Attempt[];
}

export class AssemblyInvariantError extends Error { constructor(message: string) { super(message); this.name = 'AssemblyInvariantError'; } }
export const MAX_ASSEMBLY_VERSION = 1_000_000;

/** A composite parent with a null version is an invariant failure, never silently 0 (FR-PER-13). */
export function requireVersion(state: AssemblyState): number {
  if (state.version == null) throw new AssemblyInvariantError('a composite parent has no assembly version');
  return state.version;
}

/** Allocates the next attempt number for a component from the attempt set (unique per component). */
export function nextAttemptNumber(attempts: readonly Attempt[], componentKey: string): number {
  return attempts.filter((a) => a.componentKey === componentKey).reduce((max, a) => Math.max(max, a.number), 0) + 1;
}

export type MutationResult = { applied: true; state: AssemblyState } | { applied: false; state: AssemblyState; reason: 'DUPLICATE' | 'STALE_VERSION' };

/**
 * One accepted mutation: records or updates an attempt and increments the version EXACTLY once. `expectedVersion` is the compare-and-set value the caller
 * read; if the state moved, nothing is applied and the caller re-reads and retries (bounded). Recording an attempt already in the set with the same
 * status is an idempotent no-op that leaves the version unchanged.
 */
export function applyAttemptMutation(state: AssemblyState, expectedVersion: number, attempt: Attempt): MutationResult {
  const current = requireVersion(state);
  if (current !== expectedVersion) return { applied: false, state, reason: 'STALE_VERSION' };
  const existing = state.attempts.find((a) => a.executionId === attempt.executionId);
  if (existing && existing.status === attempt.status && existing.number === attempt.number) return { applied: false, state, reason: 'DUPLICATE' };
  if (current >= MAX_ASSEMBLY_VERSION) throw new AssemblyInvariantError('assembly version overflow');
  const attempts = existing ? state.attempts.map((a) => (a.executionId === attempt.executionId ? attempt : a)) : [...state.attempts, attempt];
  return { applied: true, state: { version: current + 1, attempts } };
}

/** Before a parent becomes terminal, both selected attempts must still match the version the assembler claimed (FR-PER-13e). */
export function claimStillValid(claimedVersion: number, state: AssemblyState): boolean {
  return state.version === claimedVersion;
}

// ---- retry near family expiration (FR-PER-16) ---------------------------------------------------------------------------------------------------------
export type RetryDecision = { allowed: true } | { allowed: false; reason: 'FAMILY_EXPIRED' | 'INSUFFICIENT_TIME' };

/** Retries are rejected, never extended: the family is expired or has less than one execution timeout left. */
export function retryAllowed(input: { parentExpiresAt: Date | null; now: Date; executionTimeoutMs: number }): RetryDecision {
  if (!input.parentExpiresAt) return { allowed: true };
  const remaining = input.parentExpiresAt.getTime() - input.now.getTime();
  if (remaining <= 0) return { allowed: false, reason: 'FAMILY_EXPIRED' };
  if (remaining < input.executionTimeoutMs) return { allowed: false, reason: 'INSUFFICIENT_TIME' };
  return { allowed: true };
}

/** FR-PER-14: a child's `expiresAt` is the parent's, never later. */
export const childExpiresAt = (parentExpiresAt: Date): Date => new Date(parentExpiresAt.getTime());
