// DecisionThread transition contract — Ask Intelligence FRD §10.2/§10.3.
// lifecycleStatus and contextStatus are independent fields with separate
// transition tables (FRD §10.1 intro paragraph). This module is the single
// source of truth for which transitions are legal; it holds no DB access —
// pure data + pure functions, so it is testable without a live database
// (see tests/unit/decisionPlatform/decisionThreadTransitions.test.js, the
// FRD §25 Phase 7A "P0 negative tests designed" exit criterion).

import type {
  DecisionThreadContextStatus,
  DecisionThreadLifecycleStatus,
} from '../../productFramework/decisionPlatform/decisionPlatform.contract';

export interface LifecycleTransition {
  from: DecisionThreadLifecycleStatus;
  to: DecisionThreadLifecycleStatus;
  trigger: string;
}

export interface ContextTransition {
  from: DecisionThreadContextStatus;
  to: DecisionThreadContextStatus;
  trigger: string;
}

const ALL_LIFECYCLE_STATUSES: DecisionThreadLifecycleStatus[] = [
  'OPEN',
  'GATHERING_CONTEXT',
  'READY_TO_COMPARE',
  'RECOMMENDATION_AVAILABLE',
  'ACTION_IN_PROGRESS',
  'DECIDED',
  'COMPLETED',
  'ABANDONED',
  'ARCHIVED',
];

// FRD §10.2: "Any nonterminal state -> ABANDONED". ABANDONED, COMPLETED, and
// ARCHIVED are the terminal states for this purpose (a completed or archived
// thread is not "abandoned"; an already-abandoned thread cannot be
// abandoned again).
const NONTERMINAL_FOR_ABANDON: DecisionThreadLifecycleStatus[] = ALL_LIFECYCLE_STATUSES.filter(
  (status) => status !== 'ABANDONED' && status !== 'COMPLETED' && status !== 'ARCHIVED',
);

// FRD §10.2 lifecycle transition table, with "Any state"/"Any nonterminal
// state" wildcards expanded into explicit pairs so the table is directly
// checkable and testable (no wildcard-matching logic at read time).
export const LIFECYCLE_TRANSITIONS: LifecycleTransition[] = [
  { from: 'OPEN', to: 'GATHERING_CONTEXT', trigger: 'Required context is missing' },
  { from: 'OPEN', to: 'READY_TO_COMPARE', trigger: 'Minimum registered context is satisfied' },
  { from: 'GATHERING_CONTEXT', to: 'READY_TO_COMPARE', trigger: 'Minimum registered context is satisfied' },
  { from: 'READY_TO_COMPARE', to: 'RECOMMENDATION_AVAILABLE', trigger: 'Canonical engine produces a material result' },
  { from: 'RECOMMENDATION_AVAILABLE', to: 'ACTION_IN_PROGRESS', trigger: 'User confirms or launches a governed action' },
  { from: 'RECOMMENDATION_AVAILABLE', to: 'DECIDED', trigger: 'Homeowner records selected option' },
  { from: 'ACTION_IN_PROGRESS', to: 'DECIDED', trigger: 'Homeowner records selected option' },
  { from: 'DECIDED', to: 'COMPLETED', trigger: 'Verified completion/outcome is linked' },
  ...NONTERMINAL_FOR_ABANDON.map((from): LifecycleTransition => ({
    from,
    to: 'ABANDONED',
    trigger: 'Authorized explicit abandon action or approved inactivity policy',
  })),
  { from: 'ABANDONED', to: 'OPEN', trigger: 'Explicit authorized reopen creates a new version/event' },
  { from: 'DECIDED', to: 'OPEN', trigger: 'Explicit authorized reopen creates a new version/event' },
  { from: 'COMPLETED', to: 'OPEN', trigger: 'Explicit authorized reopen creates a new version/event' },
  ...ALL_LIFECYCLE_STATUSES.filter((from) => from !== 'ARCHIVED').map((from): LifecycleTransition => ({
    from,
    to: 'ARCHIVED',
    trigger: 'Authorized archival; no further evaluation until reopened',
  })),
  { from: 'ARCHIVED', to: 'OPEN', trigger: 'Explicit authorized reopen creates a new version/event and re-evaluates context health' },
];

// FRD §10.3 context-health transition table.
export const CONTEXT_TRANSITIONS: ContextTransition[] = [
  { from: 'CURRENT', to: 'STALE', trigger: 'A referenced fact, preference, policy, engine, evidence item, or source-freshness requirement materially changes or expires' },
  { from: 'CURRENT', to: 'CONFLICTED', trigger: 'Entity resolution, household plan, canonical sources, or a concurrent edit cannot be reconciled safely' },
  { from: 'STALE', to: 'CONFLICTED', trigger: 'Entity resolution, household plan, canonical sources, or a concurrent edit cannot be reconciled safely' },
  { from: 'CONFLICTED', to: 'STALE', trigger: 'Authorized clarification resolves the conflict but one or more retained dependencies still require recomputation' },
  { from: 'CONFLICTED', to: 'CURRENT', trigger: 'Authorized clarification resolves the conflict and all dependencies remain valid' },
  { from: 'STALE', to: 'CURRENT', trigger: 'Registered recomputation succeeds against current permitted dependencies' },
];

export function isLifecycleTransitionAllowed(
  from: DecisionThreadLifecycleStatus,
  to: DecisionThreadLifecycleStatus,
): boolean {
  return LIFECYCLE_TRANSITIONS.some((transition) => transition.from === from && transition.to === to);
}

export function isContextTransitionAllowed(
  from: DecisionThreadContextStatus,
  to: DecisionThreadContextStatus,
): boolean {
  return CONTEXT_TRANSITIONS.some((transition) => transition.from === from && transition.to === to);
}

// FRD §10.3: "When stale and conflicted conditions coexist, the externally
// visible contextStatus shall be CONFLICTED... Resolving the conflict shall
// restore STALE, not CURRENT, when any stale reason remains." This is the
// single function that should ever set DecisionThread.contextStatus, so the
// precedence rule cannot be reimplemented incorrectly at call sites.
export function computeContextStatus(reasons: {
  hasUnresolvedConflict: boolean;
  hasUnresolvedStale: boolean;
}): DecisionThreadContextStatus {
  if (reasons.hasUnresolvedConflict) return 'CONFLICTED';
  if (reasons.hasUnresolvedStale) return 'STALE';
  return 'CURRENT';
}

export function validateDecisionThreadTransitionContract(): string[] {
  const issues: string[] = [];
  const seenLifecyclePairs = new Set<string>();
  for (const transition of LIFECYCLE_TRANSITIONS) {
    const pairKey = `${transition.from}->${transition.to}`;
    if (seenLifecyclePairs.has(pairKey)) issues.push(`lifecycle: duplicate transition ${pairKey}`);
    seenLifecyclePairs.add(pairKey);
    if (!transition.trigger) issues.push(`lifecycle: ${pairKey} has no trigger description`);
  }
  const seenContextPairs = new Set<string>();
  for (const transition of CONTEXT_TRANSITIONS) {
    const pairKey = `${transition.from}->${transition.to}`;
    if (seenContextPairs.has(pairKey)) issues.push(`context: duplicate transition ${pairKey}`);
    seenContextPairs.add(pairKey);
    if (!transition.trigger) issues.push(`context: ${pairKey} has no trigger description`);
  }
  // Every non-ARCHIVED lifecycle status must have at least one outbound
  // transition, or a thread could enter that state and never leave it
  // through a registered operation (fail-closed principle, FRD §3.8).
  for (const status of ALL_LIFECYCLE_STATUSES) {
    if (status === 'ARCHIVED') continue;
    const hasOutbound = LIFECYCLE_TRANSITIONS.some((transition) => transition.from === status);
    if (!hasOutbound) issues.push(`lifecycle: ${status} has no outbound transition`);
  }
  return issues;
}
