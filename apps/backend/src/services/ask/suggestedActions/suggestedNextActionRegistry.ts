// ASK_COZY_SUGGESTED_NEXT_ACTIONS_IMPLEMENTATION_PLAN §7.2 / §9 Phase 2: the one registry for everything the pipeline treats as
// reviewed configuration rather than inferred behaviour: ranking weights and policy version, display limits, source
// precedence, per-operation outcome vocabularies, the missing-fact -> capture -> operation mapping, and the domain freshness
// matrix. Static validation (`validateSuggestedNextActionRegistry`) runs in CI/tests, never at boot, so registry drift cannot
// create a startup crash loop (plan §5.3).
//
// Self-contained on purpose: it must not import handlers (import-graph guardrail), so domain field names are plain strings that
// a test cross-checks against the handlers' own exports.
import type { SuggestedNextAction } from '../../../productFramework/ask/ask.contract';
import { ASK_OPERATION_DEFINITIONS } from '../askOperationRegistry';

export type SuggestedNextActionTier = SuggestedNextAction['priority']['tier'];
export type SuggestedNextActionSource = SuggestedNextAction['provenance']['source'];

// ---- limits (plan §3.3, §7.3, §7.4) ---------------------------------------------------------------------------------------

export const SUGGESTED_NEXT_ACTION_LIMITS = {
  /** The calm surface never renders more than this. */
  maxShown: 4,
  /** Each producer may nominate at most this many candidates; extras are dropped (and counted), not silently kept. */
  perProducerCandidates: 12,
  /** Hard cap across producers before deduplication. */
  totalCandidates: 60,
  /** At most this many DISCOVERY actions survive when a CONTINUE/RECORD_ACTION action exists. */
  discoveryWhenStrongerExists: 1,
} as const;

/**
 * Pipeline budget (plan §7.4). The thresholds are encoded here and asserted by tests/telemetry; "nonessential producer
 * failure or budget overrun returns a safe answer with fewer actions rather than delaying or failing the execution".
 * Initial values are deliberately conservative for the Raspberry Pi deployment (batched reads only, no model call).
 */
export const SUGGESTED_NEXT_ACTION_BUDGET = {
  /** Wall-clock budget for the whole finalization (candidates -> persisted ledger). Exceeding it drops the remaining producers. */
  pipelineMs: 250,
  /** Max database round trips the finalizer's own context load may issue (property/entity/health batched). */
  contextQueries: 6,
} as const;

// ---- ranking (plan §7.2) ---------------------------------------------------------------------------------------------------

export const SUGGESTED_NEXT_ACTION_RANKING_POLICY_VERSION = 'sna-rank-1';

/**
 * How candidates are ordered.
 *  - TIER_ONLY (shipping default): order by tier (continue > record action > related > discovery), then the deterministic tie-break
 *    sequence below. No boosts, no penalties, no minimum score. Simple and predictable for a first version.
 *  - WEIGHTED: adds the signal weights, penalties and minimum display score below. Built, tested and deliberately switched off;
 *    turn it on only if real chips feel wrong in practice, then bump the policy version.
 */
export type SuggestedNextActionRankingMode = 'TIER_ONLY' | 'WEIGHTED';
export const RANKING_MODE: SuggestedNextActionRankingMode = 'TIER_ONLY';

/** Used in both modes. Tier bases are 1000 apart; bounded adjustments below can never carry a candidate across a tier boundary. */
export const TIER_BASE_SCORE: Readonly<Record<SuggestedNextActionTier, number>> = {
  CONTINUE: 4000,
  RECORD_ACTION: 3000,
  RELATED: 2000,
  DISCOVERY: 1000,
};

/** WEIGHTED mode only. */
export const SCORE_WEIGHTS = {
  exactEntityMatch: 100,
  currentResultOwnership: 60,
  activeGoalMatch: 80,
  /** Indexed by materiality 0..3 (missing-detail materiality). */
  materiality: [0, 20, 40, 60],
  readinessEligible: 40,
  /** sourceConfidence in [0,1] contributes up to this many points. */
  sourceConfidenceMax: 40,
  /** Applied once when an equivalent outcome was completed or asked recently but is not a hard suppression. */
  recencyPenalty: -150,
  /** Per additional candidate already chosen for the same operation/domain destination, capped. */
  diversityPenaltyPerRepeat: -50,
  diversityPenaltyCap: -150,
} as const;

/**
 * WEIGHTED mode only. Candidates scoring below this after adjustments are omitted rather than used as filler (plan §3.3). Set so a DISCOVERY action must
 * earn at least 60 points of readiness/confidence/signal above its tier base (ready + confidence >= 0.5 passes; a discovery action
 * with no signal, or a repeat of an already-chosen destination, does not). Every higher tier clears it with room to spare.
 */
export const MIN_DISPLAY_SCORE = 1060;

export function maxPositiveAdjustment(): number {
  return SCORE_WEIGHTS.exactEntityMatch + SCORE_WEIGHTS.currentResultOwnership + SCORE_WEIGHTS.activeGoalMatch
    + Math.max(...SCORE_WEIGHTS.materiality) + SCORE_WEIGHTS.readinessEligible + SCORE_WEIGHTS.sourceConfidenceMax;
}

export function maxNegativeAdjustment(): number {
  return SCORE_WEIGHTS.recencyPenalty + SCORE_WEIGHTS.diversityPenaltyCap;
}

/**
 * Lower index wins an exact score tie (plan §7.2 tie-break: score, producer precedence, operationId, outcomeKey, entity type,
 * entity id, action id). Pending work first (it is the thing the homeowner is mid-way through).
 */
export const SOURCE_PRECEDENCE: readonly SuggestedNextActionSource[] = [
  'PENDING_WORK', 'PLATFORM_STATE', 'ENTITY_ACTION', 'MISSING_DETAIL', 'OPERATION_RESULT',
  'SKILL_HANDOFF', 'ACTIVE_GOAL', 'CAPABILITY_RECOMMENDATION',
];

// ---- outcome vocabularies (plan §5.2) --------------------------------------------------------------------------------------

/**
 * Bounded outcome keys per target operation. A candidate's `outcomeKey` is valid only if its operation declares it here; this is
 * the "normalized intended outcome" half of the deduplication identity and is never derived from label/message. Domains are
 * added as they migrate (Phase 3); an operation with no entry cannot nominate a typed action.
 */
export const SUGGESTED_ACTION_OUTCOMES: Readonly<Record<string, readonly string[]>> = {
  INVENTORY_ITEM_CORRECT: [
    'ADD_NAME', 'ADD_INSTALL_DATE', 'ADD_PURCHASE_DATE', 'ADD_LAST_SERVICED_DATE', 'ADD_CONDITION', 'ADD_BRAND', 'ADD_MODEL',
    'ADD_SERIAL_NUMBER', 'ADD_PURCHASE_COST', 'ADD_REPLACEMENT_COST', 'ADD_NOTES', 'ADD_CATEGORY', 'ADD_ROOM',
  ],
  HOME_DEADLINE_MONITOR: ['MONITOR_WARRANTY_EXPIRY'],
  HOME_EVENT_CORRECT: ['LINK_INVENTORY_ITEM', 'ADD_AMOUNT'],
  INVENTORY_ITEM_CREATE: ['ADD_ITEM_TO_ROOM'],
  MAINTENANCE_TASK_UPDATE: ['REOPEN_TASK', 'RESUME_REMINDERS'],
  CAPTURE_FACT_CONFIRM: ['CAPTURE_PROPERTY_FACT'],
};

export function isRegisteredOutcome(operationId: string, outcomeKey: string): boolean {
  return (SUGGESTED_ACTION_OUTCOMES[operationId] ?? []).includes(outcomeKey);
}

/** Outcomes the operation registry explicitly allows to be offered again after completion (plan §4.1). None yet. */
export const REPEATABLE_OUTCOMES: ReadonlySet<string> = new Set<string>();

export function isRepeatableOutcome(operationId: string, outcomeKey: string): boolean {
  return REPEATABLE_OUTCOMES.has(`${operationId}:${outcomeKey}`);
}

// ---- TTL (plan §4) -----------------------------------------------------------------------------------------------------------

/** Per-`operationId:outcomeKey` override of the interaction-type default; always capped at the source execution expiry. None yet. */
export const OUTCOME_TTL_OVERRIDES_MS: Readonly<Record<string, number>> = {};

// ---- missing-fact -> capture -> operation (plan §5.1.3) ---------------------------------------------------------------------

export interface MissingFactCaptureMapping {
  /** Registered missing-fact token (a SCREAMING_SNAKE token, never homeowner data). */
  missingFactKey: string;
  /** The typed capture path that can supply it. */
  capture:
    | { kind: 'CORRECTION_FIELD'; field: string }
    | { kind: 'CONTEXT_CAPTURE'; captureKey: string };
  /** Operation that owns the capture/review turn. */
  operationId: string;
  /** Outcome key the resulting action declares on that operation. */
  outcomeKey: string;
}

const inventoryField = (missingFactKey: string, field: string, outcomeKey: string): MissingFactCaptureMapping => (
  { missingFactKey, capture: { kind: 'CORRECTION_FIELD', field }, operationId: 'INVENTORY_ITEM_CORRECT', outcomeKey }
);

const homeEventField = (missingFactKey: string, field: string, outcomeKey: string): MissingFactCaptureMapping => (
  { missingFactKey, capture: { kind: 'CORRECTION_FIELD', field }, operationId: 'HOME_EVENT_CORRECT', outcomeKey }
);

export const MISSING_FACT_CAPTURES: readonly MissingFactCaptureMapping[] = [
  homeEventField('HOME_EVENT_INVENTORY_ITEM', 'inventoryItemId', 'LINK_INVENTORY_ITEM'),
  homeEventField('HOME_EVENT_AMOUNT', 'amount', 'ADD_AMOUNT'),
  inventoryField('INVENTORY_ITEM_NAME', 'name', 'ADD_NAME'),
  inventoryField('INVENTORY_ITEM_INSTALL_DATE', 'installedOn', 'ADD_INSTALL_DATE'),
  inventoryField('INVENTORY_ITEM_PURCHASE_DATE', 'purchasedOn', 'ADD_PURCHASE_DATE'),
  inventoryField('INVENTORY_ITEM_LAST_SERVICED_DATE', 'lastServicedOn', 'ADD_LAST_SERVICED_DATE'),
  inventoryField('INVENTORY_ITEM_CONDITION', 'condition', 'ADD_CONDITION'),
  inventoryField('INVENTORY_ITEM_BRAND', 'brand', 'ADD_BRAND'),
  inventoryField('INVENTORY_ITEM_MODEL', 'model', 'ADD_MODEL'),
  inventoryField('INVENTORY_ITEM_SERIAL_NUMBER', 'serialNo', 'ADD_SERIAL_NUMBER'),
  inventoryField('INVENTORY_ITEM_PURCHASE_COST', 'purchaseCostCents', 'ADD_PURCHASE_COST'),
  inventoryField('INVENTORY_ITEM_REPLACEMENT_COST', 'replacementCostCents', 'ADD_REPLACEMENT_COST'),
  inventoryField('INVENTORY_ITEM_NOTES', 'notes', 'ADD_NOTES'),
  inventoryField('INVENTORY_ITEM_CATEGORY', 'category', 'ADD_CATEGORY'),
  inventoryField('INVENTORY_ITEM_ROOM', 'roomId', 'ADD_ROOM'),
];

export function missingFactCaptureFor(missingFactKey: string): MissingFactCaptureMapping | undefined {
  return MISSING_FACT_CAPTURES.find((mapping) => mapping.missingFactKey === missingFactKey);
}

/** The correction field an outcome maps to on its operation (e.g. INVENTORY_ITEM_CORRECT + ADD_BRAND -> 'brand'), or null. */
export function correctionFieldForOutcome(operationId: string, outcomeKey: string | null | undefined): string | null {
  if (!outcomeKey) return null;
  const mapping = MISSING_FACT_CAPTURES.find((m) => m.operationId === operationId && m.outcomeKey === outcomeKey);
  return mapping?.capture.kind === 'CORRECTION_FIELD' ? mapping.capture.field : null;
}

// ---- domain freshness matrix (plan §6 rule 7) --------------------------------------------------------------------------------

export type FreshnessStrategy =
  /** The domain owns a deterministic version function over the record; compare it with the action's contextVersion. */
  | { kind: 'CONTEXT_VERSION'; versionFunction: string; derivedFrom: string }
  /** No version today: re-read the current record at selection and let the operation's own checks decide. */
  | { kind: 'REQUERY'; rule: string };

/**
 * Per entity type, how a stale target is detected. Sourced from the handlers' own version helpers (listed by name so a test can
 * confirm they still exist). Entity types absent here cannot appear in a typed action (the evaluator fails closed).
 */
export const DOMAIN_FRESHNESS_MATRIX: Readonly<Record<string, FreshnessStrategy>> = {
  INVENTORY_ITEM: { kind: 'CONTEXT_VERSION', versionFunction: 'inventoryItemContextVersion', derivedFrom: 'id + updatedAt' },
  INVENTORY_ROOM: { kind: 'CONTEXT_VERSION', versionFunction: 'roomContextVersion', derivedFrom: 'id + updatedAt' },
  MAINTENANCE_TASK: { kind: 'CONTEXT_VERSION', versionFunction: 'maintenanceTaskVersion', derivedFrom: 'id + status + updatedAt + snoozedUntil' },
  WARRANTY: { kind: 'CONTEXT_VERSION', versionFunction: 'warrantyContextVersion', derivedFrom: 'id + updatedAt' },
  HOME_EVENT: { kind: 'CONTEXT_VERSION', versionFunction: 'homeEventContextVersion', derivedFrom: 'id + revision' },
  RADAR_MATCH: { kind: 'CONTEXT_VERSION', versionFunction: 'radarStateContextVersion', derivedFrom: 'matchId + userState' },
  CLAIM: { kind: 'REQUERY', rule: 'claims.handler derives its version inline (sha256 of id + status + updatedAt) with no exported helper; requery the claim and compare status/updatedAt until a helper is extracted in the Claims migration step' },
  INSPECTION_FINDING: { kind: 'CONTEXT_VERSION', versionFunction: 'inspectionFindingVersion', derivedFrom: 'finding record' },
};

// ---- static validation (CI/tests only) --------------------------------------------------------------------------------------

export function validateSuggestedNextActionRegistry(): string[] {
  const problems: string[] = [];
  const tiers = Object.entries(TIER_BASE_SCORE).sort((a, b) => b[1] - a[1]);
  for (let i = 1; i < tiers.length; i += 1) {
    const higher = tiers[i - 1]!;
    const lower = tiers[i]!;
    if (lower[1] + maxPositiveAdjustment() >= higher[1] + maxNegativeAdjustment()) problems.push(`tier ${lower[0]} can overlap ${higher[0]} after adjustments`);
  }
  if (MIN_DISPLAY_SCORE <= TIER_BASE_SCORE.DISCOVERY + maxNegativeAdjustment()) problems.push('MIN_DISPLAY_SCORE never omits anything');
  if (new Set(SOURCE_PRECEDENCE).size !== SOURCE_PRECEDENCE.length) problems.push('SOURCE_PRECEDENCE has duplicates');
  for (const [operationId, outcomes] of Object.entries(SUGGESTED_ACTION_OUTCOMES)) {
    if (!(operationId in ASK_OPERATION_DEFINITIONS)) problems.push(`outcomes: unknown operation ${operationId}`);
    if (new Set(outcomes).size !== outcomes.length) problems.push(`outcomes: duplicate key on ${operationId}`);
    for (const outcome of outcomes) if (!/^[A-Z][A-Z0-9_]{2,79}$/.test(outcome)) problems.push(`outcomes: ${operationId}.${outcome} is not a bounded token`);
  }
  const seenFacts = new Set<string>();
  for (const mapping of MISSING_FACT_CAPTURES) {
    if (seenFacts.has(mapping.missingFactKey)) problems.push(`capture: duplicate ${mapping.missingFactKey}`);
    seenFacts.add(mapping.missingFactKey);
    if (!/^[A-Z][A-Z0-9_]{2,79}$/.test(mapping.missingFactKey)) problems.push(`capture: ${mapping.missingFactKey} is not a bounded token`);
    if (!(mapping.operationId in ASK_OPERATION_DEFINITIONS)) problems.push(`capture: ${mapping.missingFactKey} -> unknown operation ${mapping.operationId}`);
    if (!isRegisteredOutcome(mapping.operationId, mapping.outcomeKey)) problems.push(`capture: ${mapping.missingFactKey} -> outcome ${mapping.outcomeKey} not declared on ${mapping.operationId}`);
  }
  for (const key of REPEATABLE_OUTCOMES) {
    const [operationId, outcomeKey] = key.split(':');
    if (!operationId || !outcomeKey || !isRegisteredOutcome(operationId, outcomeKey)) problems.push(`repeatable: ${key} is not a registered outcome`);
  }
  for (const key of Object.keys(OUTCOME_TTL_OVERRIDES_MS)) {
    const [operationId, outcomeKey] = key.split(':');
    if (!operationId || !outcomeKey || !isRegisteredOutcome(operationId, outcomeKey)) problems.push(`ttl: ${key} is not a registered outcome`);
  }
  return problems;
}
