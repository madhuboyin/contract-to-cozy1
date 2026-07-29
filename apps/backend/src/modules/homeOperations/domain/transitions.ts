import type { OperationalWorkItemAcceptanceState, OperationalWorkItemDisposition, OperationalWorkItemState } from '@prisma/client';

/**
 * Legal transitions for OperationalWorkItem.state, flattened from the
 * parent plan's lifecycle tree (section 7.4):
 *
 *   CANDIDATE
 *     ├─ NOT_RELEVANT / DUPLICATE / EXPIRED   (→ CLOSED with a disposition)
 *     └─ ACCEPTED
 *          ├─ SCHEDULED / IN_PROGRESS / IN_GUIDANCE / IN_PROJECT / BLOCKED / DEFERRED
 *          └─ REPORTED_COMPLETE
 *                 ├─ REOPENED
 *                 └─ VERIFIED
 *                       ├─ FOLLOW_UP_DUE
 *                       └─ CLOSED
 *
 * "State and disposition are separate. DISMISSED should not mean the same
 * thing as COMPLETED, NOT_RELEVANT, DUPLICATE, or DEFERRED." — disposition
 * is therefore not a state value at all; it is a sibling nullable column,
 * only ever set when state === CLOSED (see OperationalWorkItemDisposition
 * in schema.prisma and assertClosurePairing below). Genuine completion is
 * state ∈ {VERIFIED, CLOSED} with disposition = null — completion is the
 * absence of a disposition, not a disposition value.
 */
export const LEGAL_TRANSITIONS: Record<OperationalWorkItemState, OperationalWorkItemState[]> = {
  CANDIDATE: ['ACCEPTED', 'CLOSED'],
  ACCEPTED: ['SCHEDULED', 'IN_PROGRESS', 'IN_GUIDANCE', 'IN_PROJECT', 'BLOCKED', 'DEFERRED', 'REPORTED_COMPLETE', 'CLOSED'],
  SCHEDULED: ['IN_PROGRESS', 'BLOCKED', 'DEFERRED', 'REPORTED_COMPLETE', 'CLOSED'],
  // ACCEPTED here too, same Slice 4 cancel-project reconciliation edge —
  // work may have already started under IN_PROJECT before cancellation.
  IN_PROGRESS: ['BLOCKED', 'DEFERRED', 'REPORTED_COMPLETE', 'ACCEPTED', 'CLOSED'],
  IN_GUIDANCE: ['IN_PROGRESS', 'IN_PROJECT', 'BLOCKED', 'DEFERRED', 'REPORTED_COMPLETE', 'CLOSED'],
  // ACCEPTED here too (Home Operations Slice 4): cancelling a Project that
  // took over a guidance journey's work item must be able to hand the same
  // item back to the active backlog rather than leave it stuck showing
  // IN_PROJECT for a project that no longer exists.
  IN_PROJECT: ['IN_PROGRESS', 'BLOCKED', 'DEFERRED', 'REPORTED_COMPLETE', 'ACCEPTED', 'CLOSED'],
  BLOCKED: ['SCHEDULED', 'IN_PROGRESS', 'DEFERRED', 'CLOSED'],
  DEFERRED: ['SCHEDULED', 'IN_PROGRESS', 'CLOSED'],
  REPORTED_COMPLETE: ['VERIFIED', 'REOPENED', 'CLOSED'],
  REOPENED: ['SCHEDULED', 'IN_PROGRESS', 'BLOCKED', 'DEFERRED', 'REPORTED_COMPLETE', 'CLOSED'],
  // REOPENED here too: verified/follow-up-due work must be reversible when a
  // reported completion turns out to be wrong (Home Operations Slice 3 —
  // uncompleting a maintenance task that was already verified needs this
  // edge; the doc's own control table implies reopen is a general capability
  // on completed/verified work, not only on not-yet-verified REPORTED_COMPLETE).
  VERIFIED: ['FOLLOW_UP_DUE', 'REOPENED', 'CLOSED'],
  FOLLOW_UP_DUE: ['ACCEPTED', 'SCHEDULED', 'REOPENED', 'CLOSED'],
  CLOSED: [],
};

/** States reached only via VERIFIED (or FOLLOW_UP_DUE, itself reached only via VERIFIED). */
const VERIFIED_CLOSE_ORIGINS = new Set<OperationalWorkItemState>(['VERIFIED', 'FOLLOW_UP_DUE']);

export class IllegalWorkItemTransitionError extends Error {
  constructor(
    public readonly from: OperationalWorkItemState,
    public readonly to: OperationalWorkItemState,
  ) {
    super(`Illegal Operational Work Item transition: ${from} -> ${to}`);
    this.name = 'IllegalWorkItemTransitionError';
  }
}

export function canTransition(from: OperationalWorkItemState, to: OperationalWorkItemState): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: OperationalWorkItemState, to: OperationalWorkItemState): void {
  if (!canTransition(from, to)) {
    throw new IllegalWorkItemTransitionError(from, to);
  }
}

/**
 * disposition is required when closing straight from CANDIDATE (the
 * NOT_RELEVANT/DUPLICATE/EXPIRED/DISMISSED branch) and forbidden when
 * closing from a verified-completion path (VERIFIED/FOLLOW_UP_DUE) — that
 * path's "closed with no disposition" already means genuine completion.
 */
export function assertClosurePairing(
  from: OperationalWorkItemState,
  disposition: OperationalWorkItemDisposition | null,
): void {
  if (from === 'CANDIDATE' && !disposition) {
    throw new Error('Closing an OperationalWorkItem from CANDIDATE requires a disposition.');
  }
  if (VERIFIED_CLOSE_ORIGINS.has(from) && disposition) {
    throw new Error(`Closing an OperationalWorkItem from ${from} must not carry a disposition — that path is genuine completion.`);
  }
}

/**
 * Only a CANDIDATE work item's presentation fields (title/reason/expected
 * outcome/priority/safetyTier/due window/confidence/missingContext) may be
 * silently rewritten on source recalculation. Once accepted, recalculation
 * must stop overwriting homeowner-visible state — see
 * resolveWorkItem.usecase.ts.
 */
export function canRefreshFromSource(state: OperationalWorkItemState): boolean {
  return state === 'CANDIDATE';
}

const TIMESTAMP_FIELD_BY_STATE: Partial<Record<OperationalWorkItemState, TransitionResult['timestampField']>> = {
  ACCEPTED: 'acceptedAt',
  IN_PROGRESS: 'startedAt',
  REPORTED_COMPLETE: 'reportedCompletedAt',
  VERIFIED: 'verifiedAt',
  DEFERRED: 'deferredUntil',
  CLOSED: 'closedAt',
};

export interface TransitionResult {
  state: OperationalWorkItemState;
  acceptanceState: OperationalWorkItemAcceptanceState;
  disposition: OperationalWorkItemDisposition | null;
  timestampField: 'acceptedAt' | 'startedAt' | 'reportedCompletedAt' | 'verifiedAt' | 'deferredUntil' | 'dismissedAt' | 'closedAt' | null;
}

export function applyTransition(
  current: { state: OperationalWorkItemState; acceptanceState: OperationalWorkItemAcceptanceState },
  to: OperationalWorkItemState,
  opts: { disposition?: OperationalWorkItemDisposition } = {},
): TransitionResult {
  assertTransition(current.state, to);
  const disposition = opts.disposition ?? null;
  if (to === 'CLOSED') {
    assertClosurePairing(current.state, disposition);
  } else if (disposition) {
    throw new Error(`disposition may only be set when transitioning to CLOSED, not ${to}.`);
  }

  const acceptanceState: OperationalWorkItemAcceptanceState =
    to === 'ACCEPTED'
      ? 'ACCEPTED'
      : to === 'CLOSED' && current.state === 'CANDIDATE' && disposition
        ? 'DECLINED'
        : current.acceptanceState;

  const timestampField = disposition === 'DISMISSED' ? 'dismissedAt' : (TIMESTAMP_FIELD_BY_STATE[to] ?? null);

  return { state: to, acceptanceState, disposition: to === 'CLOSED' ? disposition : null, timestampField };
}
