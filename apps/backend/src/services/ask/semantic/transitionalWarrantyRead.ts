import { prisma } from '../../../lib/prisma';
import { logger } from '../../../lib/logger';
import { askWarrantyReconciliationCasesTotal } from '../../../lib/metrics';

export type TransitionalWarrantyState =
  | 'ITEM_WARRANTY_LINKED'
  | 'PROPERTY_PLAN_LINKED'
  | 'BOTH_CONSISTENT'
  | 'CONFLICTED_LINKS'
  | 'NO_LINK_RECORDED'
  | 'EXPLICIT_NO_COVERAGE'
  | 'UNKNOWN';

export interface TransitionalWarrantyLinkInput {
  readonly inventoryItemId: string;
  readonly label?: string;
  /** Property-plan warranties explicitly applicable to this item. */
  readonly propertyPlanWarrantyId: string | null;
  /** Legacy Warranty.inventoryItemId path; more than one row is preserved. */
  readonly itemWarrantyIds: readonly string[];
  readonly coverageEvidenceStatus: 'NONE' | 'NOT_SURE' | 'UNKNOWN' | string;
}

export interface TransitionalWarrantyRead {
  readonly inventoryItemId: string;
  readonly label: string;
  readonly state: TransitionalWarrantyState;
  readonly warrantyIds: readonly string[];
  readonly reconciliationRequired: boolean;
}

export interface WarrantyRelationBusinessMeaning {
  readonly relationKind: 'ITEM_SPECIFIC_WARRANTY' | 'PROPERTY_WHOLE_HOME_PLAN';
  readonly semanticRelationId: string;
  readonly cardinality: 'ONE_ITEM_TO_MANY_WARRANTIES' | 'ONE_PLAN_TO_MANY_ITEMS_BY_APPLICABILITY';
  readonly canonicalStoragePath: string;
  readonly legacyStoragePath: string;
  readonly newWriteStatus: 'CANONICAL_ALLOWED' | 'PROHIBITED_LEGACY_AMBIGUOUS_LINK';
  readonly businessMeaning: string;
  readonly coverageProofRule: string;
}

/**
 * Phase 1 deliverable (§18 Phase 1 / §22.1 / FR-QUERY-7):
 * Defines business meanings and cardinalities of item-specific warranties vs
 * property/whole-home coverage plans before selecting final storage migration,
 * and governs transitional reads, writes, and reconciliation.
 */
export const WARRANTY_RELATION_MEANINGS: Readonly<Record<WarrantyRelationBusinessMeaning['relationKind'], WarrantyRelationBusinessMeaning>> = Object.freeze({
  ITEM_SPECIFIC_WARRANTY: {
    relationKind: 'ITEM_SPECIFIC_WARRANTY',
    semanticRelationId: 'relation.inventory_item.warranty',
    cardinality: 'ONE_ITEM_TO_MANY_WARRANTIES',
    canonicalStoragePath: 'Warranty.inventoryItemId -> InventoryItem.id (InventoryItem.linkedWarranties)',
    legacyStoragePath: 'Warranty.inventoryItemId',
    newWriteStatus: 'CANONICAL_ALLOWED',
    businessMeaning: 'A manufacturer, retailer, or extended warranty contract tied to a specific InventoryItem.',
    coverageProofRule: 'A linked Warranty row establishes a recorded warranty link only; coverage of a failure depends on active dates and contract terms.',
  },
  PROPERTY_WHOLE_HOME_PLAN: {
    relationKind: 'PROPERTY_WHOLE_HOME_PLAN',
    semanticRelationId: 'relation.property.home_warranty_plan',
    cardinality: 'ONE_PLAN_TO_MANY_ITEMS_BY_APPLICABILITY',
    canonicalStoragePath: 'WarrantyApplicability.warrantyId + inventoryItemId with status=COVERED',
    legacyStoragePath: 'Retired InventoryItem.warrantyId',
    newWriteStatus: 'CANONICAL_ALLOWED',
    businessMeaning: 'A property-level or whole-home service plan linked to the Property that may apply to eligible systems or appliances.',
    coverageProofRule: 'An applicability row establishes recorded applicability only; coverage of a failure still depends on active dates and contract terms.',
  },
});

export type WarrantyReconciliationReason =
  | 'CONFLICTED_LINKS'
  | 'MULTIPLE_ITEM_WARRANTIES'
  | 'LEGACY_PROPERTY_PLAN_POINTER_ONLY'
  | 'UNKNOWN_COVERAGE_EVIDENCE';

export interface WarrantyLinkReconciliationCase {
  readonly inventoryItemId: string;
  readonly label: string;
  readonly state: TransitionalWarrantyState;
  readonly warrantyIds: readonly string[];
  readonly reason: WarrantyReconciliationReason;
  readonly recommendedAction: string;
}

export interface TransitionalWarrantyLinkWriteCandidate {
  readonly targetModel: 'Warranty' | 'InventoryItem';
  readonly targetField: 'inventoryItemId' | 'warrantyId';
  readonly inventoryItemId: string;
  readonly warrantyId: string | null;
  readonly existingPropertyPlanWarrantyId?: string | null;
  readonly existingItemWarrantyIds?: readonly string[];
  readonly coverageEvidenceStatus?: 'NONE' | 'NOT_SURE' | 'UNKNOWN' | string;
}

export interface TransitionalWarrantyWriteVerdict {
  readonly allowed: boolean;
  readonly reasonCode:
    | 'CANONICAL_ITEM_WARRANTY_WRITE_ALLOWED'
    | 'AMBIGUOUS_LEGACY_INVENTORY_WARRANTY_ID_WRITE_PROHIBITED'
    | 'CONFLICTING_LEGACY_WARRANTY_LINK'
    | 'CONTRADICTS_EXPLICIT_NO_COVERAGE';
  readonly remediation: string;
}

/**
 * FR-QUERY-7 write containment: prohibits new writes through ambiguous legacy
 * InventoryItem.warrantyId links or writes that create un-reconciled link conflicts.
 */
export function validateTransitionalWarrantyLinkWrite(
  candidate: TransitionalWarrantyLinkWriteCandidate,
): TransitionalWarrantyWriteVerdict {
  if (candidate.targetModel === 'InventoryItem' && candidate.targetField === 'warrantyId' && candidate.warrantyId !== null) {
    return {
      allowed: false,
      reasonCode: 'AMBIGUOUS_LEGACY_INVENTORY_WARRANTY_ID_WRITE_PROHIBITED',
      remediation: 'Write item-specific warranty links via Warranty.inventoryItemId instead of the ambiguous legacy InventoryItem.warrantyId pointer.',
    };
  }
  if (candidate.coverageEvidenceStatus === 'NONE' && candidate.warrantyId !== null) {
    return {
      allowed: false,
      reasonCode: 'CONTRADICTS_EXPLICIT_NO_COVERAGE',
      remediation: 'Clear or update coverageEvidenceStatus=NONE before linking a warranty record to this inventory item.',
    };
  }
  if (
    candidate.warrantyId !== null
    && candidate.existingPropertyPlanWarrantyId
    && candidate.existingPropertyPlanWarrantyId !== candidate.warrantyId
  ) {
    return {
      allowed: false,
      reasonCode: 'CONFLICTING_LEGACY_WARRANTY_LINK',
      remediation: 'Reconcile the existing legacy InventoryItem.warrantyId pointer before linking a different Warranty record.',
    };
  }
  return {
    allowed: true,
    reasonCode: 'CANONICAL_ITEM_WARRANTY_WRITE_ALLOWED',
    remediation: 'Canonical Warranty.inventoryItemId write is permitted.',
  };
}

export function assertValidTransitionalWarrantyLinkWrite(candidate: TransitionalWarrantyLinkWriteCandidate): void {
  const verdict = validateTransitionalWarrantyLinkWrite(candidate);
  if (!verdict.allowed) {
    const error = new Error(`Transitional warranty write rejected (${verdict.reasonCode}): ${verdict.remediation}`);
    (error as Error & { code?: string }).code = verdict.reasonCode;
    throw error;
  }
}

/**
 * Captures reconciliation cases across transitional warranty reads so conflicted,
 * multi-warranty, and legacy-pointer-only rows are surfaced deterministically.
 */
export function extractWarrantyReconciliationCases(
  reads: readonly TransitionalWarrantyRead[],
): readonly WarrantyLinkReconciliationCase[] {
  const cases: WarrantyLinkReconciliationCase[] = [];
  for (const row of reads) {
    if (row.state === 'CONFLICTED_LINKS') {
      cases.push({
        inventoryItemId: row.inventoryItemId,
        label: row.label,
        state: row.state,
        warrantyIds: row.warrantyIds,
        reason: 'CONFLICTED_LINKS',
        recommendedAction: 'Reconcile conflicting InventoryItem.warrantyId and Warranty.inventoryItemId links or contradicting NONE coverage evidence.',
      });
    } else if (row.state === 'ITEM_WARRANTY_LINKED' && row.reconciliationRequired) {
      cases.push({
        inventoryItemId: row.inventoryItemId,
        label: row.label,
        state: row.state,
        warrantyIds: row.warrantyIds,
        reason: 'MULTIPLE_ITEM_WARRANTIES',
        recommendedAction: 'Verify whether multiple Warranty.inventoryItemId rows represent distinct sequential/extended warranties or duplicate records.',
      });
    } else if (row.state === 'PROPERTY_PLAN_LINKED') {
      cases.push({
        inventoryItemId: row.inventoryItemId,
        label: row.label,
        state: row.state,
        warrantyIds: row.warrantyIds,
        reason: 'LEGACY_PROPERTY_PLAN_POINTER_ONLY',
        recommendedAction: 'Migrate the retired InventoryItem.warrantyId pointer to canonical Warranty.inventoryItemId or evidence-backed property-plan applicability.',
      });
    } else if (row.state === 'UNKNOWN') {
      cases.push({
        inventoryItemId: row.inventoryItemId,
        label: row.label,
        state: row.state,
        warrantyIds: row.warrantyIds,
        reason: 'UNKNOWN_COVERAGE_EVIDENCE',
        recommendedAction: 'Confirm whether the item has a warranty record or explicit no-coverage status.',
      });
    }
  }
  return cases;
}

/**
 * FR-QUERY-7 transitional classifier. It describes recorded link topology only;
 * it never claims that policy terms cover the item.
 */
export function classifyTransitionalWarrantyLinks(input: TransitionalWarrantyLinkInput): TransitionalWarrantyRead {
  const itemWarrantyIds = [...new Set(input.itemWarrantyIds.filter(Boolean))].sort();
  const propertyPlanWarrantyId = input.propertyPlanWarrantyId || null;
  const warrantyIds = [...new Set([...(propertyPlanWarrantyId ? [propertyPlanWarrantyId] : []), ...itemWarrantyIds])].sort();
  if (input.coverageEvidenceStatus === 'NONE') {
    return {
      inventoryItemId: input.inventoryItemId,
      label: input.label ?? 'inventory item',
      state: warrantyIds.length ? 'CONFLICTED_LINKS' : 'EXPLICIT_NO_COVERAGE',
      warrantyIds,
      reconciliationRequired: warrantyIds.length > 0,
    };
  }
  if (!propertyPlanWarrantyId && itemWarrantyIds.length === 0) {
    return {
      inventoryItemId: input.inventoryItemId,
      label: input.label ?? 'inventory item',
      state: input.coverageEvidenceStatus === 'NOT_SURE' ? 'UNKNOWN' : 'NO_LINK_RECORDED',
      warrantyIds: [],
      reconciliationRequired: false,
    };
  }
  if (propertyPlanWarrantyId && itemWarrantyIds.length === 0) return { inventoryItemId: input.inventoryItemId, label: input.label ?? 'inventory item', state: 'PROPERTY_PLAN_LINKED', warrantyIds, reconciliationRequired: false };
  if (!propertyPlanWarrantyId) return { inventoryItemId: input.inventoryItemId, label: input.label ?? 'inventory item', state: 'ITEM_WARRANTY_LINKED', warrantyIds, reconciliationRequired: itemWarrantyIds.length > 1 };
  const consistent = itemWarrantyIds.length === 1 && itemWarrantyIds[0] === propertyPlanWarrantyId;
  return { inventoryItemId: input.inventoryItemId, label: input.label ?? 'inventory item', state: consistent ? 'BOTH_CONSISTENT' : 'CONFLICTED_LINKS', warrantyIds, reconciliationRequired: !consistent };
}

/** Property-scoped canonical reader; the classifier name remains stable for historical reconciliation receipts. */
export async function readTransitionalWarrantyLinks(propertyId: string): Promise<readonly TransitionalWarrantyRead[]> {
  const items = await prisma.inventoryItem.findMany({
    where: { propertyId },
    select: {
      id: true,
      name: true,
      coverageEvidenceStatus: true,
      linkedWarranties: { where: { propertyId }, select: { id: true } },
      warrantyApplicabilities: {
        where: { propertyId, status: 'COVERED', warranty: { scopeKind: 'PROPERTY_PLAN' } },
        select: { warrantyId: true },
      },
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  const reads = items.map((item) => classifyTransitionalWarrantyLinks({
    inventoryItemId: item.id,
    label: item.name,
    propertyPlanWarrantyId: item.warrantyApplicabilities[0]?.warrantyId ?? null,
    itemWarrantyIds: item.linkedWarranties.map((warranty) => warranty.id),
    coverageEvidenceStatus: item.coverageEvidenceStatus,
  }));
  const cases = extractWarrantyReconciliationCases(reads);
  for (const reconciliationCase of cases) {
    askWarrantyReconciliationCasesTotal.inc({ reason: reconciliationCase.reason });
    logger.warn({
      propertyId,
      inventoryItemId: reconciliationCase.inventoryItemId,
      state: reconciliationCase.state,
      reason: reconciliationCase.reason,
      warrantyIds: reconciliationCase.warrantyIds,
    }, 'Transitional warranty-link reconciliation case recorded');
  }
  return reads;
}
