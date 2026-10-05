// Plan §6: the ordered, pure eligibility evaluator. Each rule returns a verdict with a bounded reason code; nothing here mutates a
// candidate or reads a database. The impure finalizer batches every read into one `EligibilityContext` first (plan §7.4), so a
// rule can never trigger a per-candidate query. Selection later repeats the authoritative checks through the normal invocation
// path, so this evaluator decides *display*, never *authorization*.
import type { AskOperationUnavailableReason } from '../support/answerGuards';
import type { SuggestedNextActionCandidate } from './suggestedNextActionCandidate';
import { candidateIdentityFields } from './suggestedNextActionCandidate';
import { suggestedNextActionSemanticKeyHash } from './suggestedNextActionIdentity';
import { DOMAIN_FRESHNESS_MATRIX, isPromptHistoryExemptOutcome, isRegisteredOutcome, isRepeatableOutcome, missingFactCaptureFor } from './suggestedNextActionRegistry';

export type SuggestedNextActionMode = 'NORMAL' | 'SAFE_RECOVERY_ONLY';

export type EligibilityRule =
  | 'REGISTRY' | 'HEALTH' | 'PROPERTY_SCOPE' | 'AUTHORIZATION' | 'AUDIENCE' | 'ENTITY' | 'FRESHNESS' | 'CONTEXT_READINESS'
  | 'INTERACTION_CONFLICT' | 'HISTORY' | 'SAFETY_BOUNDARY';

export const ELIGIBILITY_RULE_ORDER: readonly EligibilityRule[] = [
  'REGISTRY', 'HEALTH', 'PROPERTY_SCOPE', 'AUTHORIZATION', 'AUDIENCE', 'ENTITY', 'FRESHNESS', 'CONTEXT_READINESS',
  'INTERACTION_CONFLICT', 'HISTORY', 'SAFETY_BOUNDARY',
];

export interface EntityRecordState {
  exists: boolean;
  /** The property the record belongs to (null when the record is not property-scoped). */
  propertyId: string | null;
  /** The domain's current deterministic version for the record, when it has one. */
  currentContextVersion: string | null;
}

export interface EligibilityContext {
  mode: SuggestedNextActionMode;
  /** The property the source execution ran against (null for a property-less turn). */
  sourcePropertyId: string | null;
  /** Per-operation first failing availability reason (null/absent entry = available). Absent operation = not registered. */
  operationAvailability: ReadonlyMap<string, AskOperationUnavailableReason | null>;
  /** Whether the operation requires a property scope (from the operation definition). */
  operationRequiresProperty: (operationId: string) => boolean;
  /** The entity type the operation requires as its target, or null when it targets none. */
  operationTargetEntityType: (operationId: string) => string | null;
  /** `${entityType}:${entityId}` -> record state. An entity type with no validator never appears here. */
  entities: ReadonlyMap<string, EntityRecordState>;
  /** Entity types that have a registered batch validator in this load; others fail closed. */
  validatedEntityTypes: ReadonlySet<string>;
  /** True while a clarification, capture, or confirmation is open on this turn. */
  pendingInteractionActive: boolean;
  /** Semantic-key hashes of outcomes this session already completed (plus the current turn's own selection). */
  completedSemanticKeyHashes: ReadonlySet<string>;
  /** Normalized message keys already asked or completed recently (string-history suppression). */
  askedMessageKeys: ReadonlySet<string>;
  /** Normalizes a candidate message into the same key space as `askedMessageKeys`. */
  messageKey: (message: string) => string;
  /** Semantic-key hash of the outcome the source operation itself just produced (never re-offer "what you just did"). */
  currentOutcomeKeyHashes: ReadonlySet<string>;
}

export type EligibilityVerdict =
  | { state: 'ELIGIBLE'; rule: null; reasonCodes: string[]; missingFactKeys: [] }
  | { state: 'NEEDS_CONTEXT'; rule: 'CONTEXT_READINESS'; reasonCodes: string[]; missingFactKeys: string[] }
  | { state: 'UNAVAILABLE' | 'SUPPRESSED'; rule: EligibilityRule; reasonCodes: string[]; missingFactKeys: [] };

const unavailable = (rule: EligibilityRule, code: string): EligibilityVerdict => ({ state: 'UNAVAILABLE', rule, reasonCodes: [code], missingFactKeys: [] });
const suppressed = (rule: EligibilityRule, code: string): EligibilityVerdict => ({ state: 'SUPPRESSED', rule, reasonCodes: [code], missingFactKeys: [] });

const AVAILABILITY_RULE: Record<AskOperationUnavailableReason, { rule: EligibilityRule; code: string }> = {
  BOUNDARY: { rule: 'REGISTRY', code: 'OPERATION_IS_BOUNDARY' },
  HEALTH: { rule: 'HEALTH', code: 'OPERATION_UNHEALTHY' },
  AUTHORIZATION: { rule: 'AUTHORIZATION', code: 'ROLE_BELOW_FLOOR' },
  AUDIENCE: { rule: 'AUDIENCE', code: 'AUDIENCE_INAPPLICABLE' },
};

/** Runs the plan §6 rules in order and returns the first failing verdict, or ELIGIBLE / NEEDS_CONTEXT. */
export function evaluateSuggestedNextActionEligibility(candidate: SuggestedNextActionCandidate, ctx: EligibilityContext): EligibilityVerdict {
  const { operationId, entityContext } = candidate;

  // 1. Registry validity: the operation exists and the outcome key is declared on it.
  if (!ctx.operationAvailability.has(operationId)) return unavailable('REGISTRY', 'OPERATION_NOT_REGISTERED');
  if (!isRegisteredOutcome(operationId, candidate.outcomeKey)) return unavailable('REGISTRY', 'OUTCOME_NOT_REGISTERED');

  // 2-5 are read from the shared availability map so each stays a distinct, audited rule: health, property scope,
  // authorization, audience. Property scope sits between health and authorization to match the plan's order.
  const availability = ctx.operationAvailability.get(operationId) ?? null;
  if (availability === 'BOUNDARY') return unavailable(AVAILABILITY_RULE.BOUNDARY.rule, AVAILABILITY_RULE.BOUNDARY.code);
  if (availability === 'HEALTH') return unavailable(AVAILABILITY_RULE.HEALTH.rule, AVAILABILITY_RULE.HEALTH.code);

  // 3. Property scope: required property exists and matches the source execution.
  if (ctx.operationRequiresProperty(operationId) && !entityContext.propertyId) return unavailable('PROPERTY_SCOPE', 'PROPERTY_REQUIRED');
  if (entityContext.propertyId && entityContext.propertyId !== ctx.sourcePropertyId) return unavailable('PROPERTY_SCOPE', 'PROPERTY_MISMATCH');

  if (availability === 'AUTHORIZATION') return unavailable(AVAILABILITY_RULE.AUTHORIZATION.rule, AVAILABILITY_RULE.AUTHORIZATION.code);
  if (availability === 'AUDIENCE') return unavailable(AVAILABILITY_RULE.AUDIENCE.rule, AVAILABILITY_RULE.AUDIENCE.code);

  // 6. Entity validity: exists, belongs to the property, and the operation supports its type. Fails closed.
  const target = ctx.operationTargetEntityType(operationId);
  if (entityContext.entityId) {
    if (!entityContext.entityType) return unavailable('ENTITY', 'ENTITY_TYPE_MISSING');
    if (target && target !== entityContext.entityType) return unavailable('ENTITY', 'ENTITY_TYPE_UNSUPPORTED');
    if (!ctx.validatedEntityTypes.has(entityContext.entityType) || !(entityContext.entityType in DOMAIN_FRESHNESS_MATRIX)) return unavailable('ENTITY', 'ENTITY_VALIDATOR_MISSING');
    const record = ctx.entities.get(`${entityContext.entityType}:${entityContext.entityId}`);
    if (!record || !record.exists) return unavailable('ENTITY', 'ENTITY_NOT_FOUND');
    if (record.propertyId !== null && record.propertyId !== entityContext.propertyId) return unavailable('ENTITY', 'ENTITY_PROPERTY_MISMATCH');
  } else if (target) {
    return unavailable('ENTITY', 'ENTITY_REQUIRED');
  }

  // 7. Freshness: where the domain has a version, the action's version must still be current. A mismatch is not a display
  // failure the homeowner can fix; the action is simply not offered (selection would recover through the stale path).
  if (entityContext.entityId && entityContext.entityType && entityContext.contextVersion) {
    const record = ctx.entities.get(`${entityContext.entityType}:${entityContext.entityId}`);
    if (record?.currentContextVersion && record.currentContextVersion !== entityContext.contextVersion) return unavailable('FRESHNESS', 'CONTEXT_VERSION_STALE');
  }

  // 8. Context readiness: required facts are present, or every missing fact resolves through the registered
  // fact -> capture -> operation mapping *to this action's own operation*.
  if (candidate.requiredFacts.length > 0) {
    const unresolved = candidate.requiredFacts.filter((factKey) => {
      const mapping = missingFactCaptureFor(factKey);
      return !mapping || mapping.operationId !== operationId || mapping.outcomeKey !== candidate.outcomeKey;
    });
    if (unresolved.length > 0) return unavailable('CONTEXT_READINESS', 'MISSING_FACT_WITHOUT_CAPTURE');
  }

  // 9. Interaction conflict: do not compete with an open clarification/capture/confirmation unless explicitly continuing it.
  if (ctx.pendingInteractionActive && !candidate.traits.continuesPending) return suppressed('INTERACTION_CONFLICT', 'PENDING_INTERACTION_ACTIVE');

  // 10. History: the outcome the source just produced, an equivalent outcome already completed, or an equivalent prompt already asked.
  const hash = suggestedNextActionSemanticKeyHash(candidateIdentityFields(candidate));
  if (ctx.currentOutcomeKeyHashes.has(hash)) return suppressed('HISTORY', 'CURRENT_OUTCOME');
  if (ctx.completedSemanticKeyHashes.has(hash) && !isRepeatableOutcome(operationId, candidate.outcomeKey)) return suppressed('HISTORY', 'EQUIVALENT_COMPLETED');
  // A recently asked identical prompt is suppressed unless this outcome is explicitly registered as prompt-history exempt (starters only,
  // D-O10). Repeatable COMPLETION is a different concept and does not exempt a prompt.
  if (ctx.askedMessageKeys.has(ctx.messageKey(candidate.message)) && !isPromptHistoryExemptOutcome(operationId, candidate.outcomeKey)) return suppressed('HISTORY', 'EQUIVALENT_PROMPT_ASKED');

  // 11. Safety/boundary: in recovery mode only recovery-trait, non-promotional candidates survive.
  if (ctx.mode === 'SAFE_RECOVERY_ONLY' && (!candidate.traits.recovery || candidate.traits.promotional)) return suppressed('SAFETY_BOUNDARY', 'SAFE_RECOVERY_ONLY');

  if (candidate.requiredFacts.length > 0) {
    return { state: 'NEEDS_CONTEXT', rule: 'CONTEXT_READINESS', reasonCodes: [], missingFactKeys: [...candidate.requiredFacts] };
  }
  return { state: 'ELIGIBLE', rule: null, reasonCodes: [], missingFactKeys: [] };
}
