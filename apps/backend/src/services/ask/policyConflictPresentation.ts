import type { ConflictedInsurancePolicyTerm } from '../coverageConflict.service';
import { POLICY_FACT_LABELS, formatPolicyFactValue } from '../homeActionSourcePromotion.service';

/**
 * Gap audit §17 (FRD v1.171): a policy-fact conflict Home Action is resolved inside Ask through the existing
 * confirmation-gated DOCUMENT_PROMOTION_CONFIRM. Each conflicting fact is presented on its own, keyed by the exact
 * pending fact id (the operation resolves its target from that id), with the two choices the Coverage tool's
 * PolicyRecordReadinessPanel offers: "Keep existing" (rejects the pending value) and "Use extracted value" (confirms it).
 *
 * The messages must satisfy documentPromotionConfirmPattern on their own (confirm|reject ... extracted) and carry the
 * decision words the handler reads (`reject` -> REJECT, `confirm` -> CONFIRM); a test pins both.
 */
export const POLICY_CONFLICT_LINEAGE_PREFIX = 'insurance-fact-conflict:';
export const POLICY_CONFLICT_SECTION_ID = 'policy-conflicts';
export const POLICY_FACT_KEEP_MESSAGE = 'Reject this extracted policy value.';
export const POLICY_FACT_USE_MESSAGE = 'Confirm this extracted policy value.';
export const POLICY_FACT_ENTITY_TYPE = 'INSURANCE_POLICY_FACT';

export function policyConflictTermIdFromLineage(lineageId: string): string | null {
  if (!lineageId.startsWith(POLICY_CONFLICT_LINEAGE_PREFIX)) return null;
  const termId = lineageId.slice(POLICY_CONFLICT_LINEAGE_PREFIX.length);
  return termId || null;
}

export function buildPolicyConflictSection(term: ConflictedInsurancePolicyTerm, canContribute: boolean) {
  const items = term.conflicts.map(({ factKey, pending, confirmed }) => ({
    id: pending.id,
    title: POLICY_FACT_LABELS[factKey] ?? factKey,
    description: `Newly extracted: ${formatPolicyFactValue(pending)}. Currently confirmed: ${formatPolicyFactValue(confirmed)}.`,
    meta: [term.carrierName],
    status: null,
    href: null,
    entityType: POLICY_FACT_ENTITY_TYPE,
    // A viewer may read the conflict but not resolve it (the operation's floor is CONTRIBUTOR).
    ...(canContribute ? {
      actions: [
        { id: `policy-fact-keep-${pending.id}`, label: 'Keep existing', message: POLICY_FACT_KEEP_MESSAGE, style: 'SECONDARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'DOCUMENT_PROMOTION_CONFIRM' },
        { id: `policy-fact-use-${pending.id}`, label: 'Use extracted value', message: POLICY_FACT_USE_MESSAGE, style: 'PRIMARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'DOCUMENT_PROMOTION_CONFIRM' },
      ],
    } : {}),
  }));
  return {
    id: POLICY_CONFLICT_SECTION_ID,
    title: 'Conflicting policy details',
    count: items.length,
    items,
  };
}
