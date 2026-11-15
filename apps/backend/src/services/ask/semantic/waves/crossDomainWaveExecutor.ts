import {
  buildSemanticReadReceipt,
  type SemanticReadReceipt,
} from '../semanticExecutionReceipt';
import {
  verifySemanticReadReceiptEntailment,
  type SemanticReceiptEntailmentVerdict,
} from '../semanticReceiptEntailment';
import { type SemanticFacet, type SemanticWhereExpression } from '../semanticRequestPlan';
import { type SemanticDomainId } from '../phase0/semanticOntologyBaseline';
import {
  buildPhase2aRichPresentation,
  verifyRichPresentationPopulationEquivalence,
  type Phase2aRichPresentationEquivalenceReport,
} from '../phase2a/phase2aRichPresentationAdapter';
import {
  executePhase2aVerticalSlice,
  type Phase2aAuthorizationContext,
  type Phase2aPropertySnapshot,
} from '../phase2a/phase2aSliceExecutor';
import {
  assignMixedStackFacetOwnership,
  type MixedStackFacetOwnershipAssignment,
} from './domainWaveManifest';
import {
  applyCrossDomainFollowUpRefinement,
  parseCrossDomainSemanticRequest,
  type CrossDomainClarification,
  type PlanOverflowFacet,
} from './crossDomainPlanBuilder';

export type AskUserRole = Phase2aAuthorizationContext['role'];

export interface WaveExtendedItemRecord {
  readonly id: string;
  readonly slug?: string;
  readonly propertyId: string;
  readonly name: string;
  readonly category: 'APPLIANCE' | 'HVAC' | 'PLUMBING' | 'ELECTRICAL' | 'OTHER';
  readonly purchaseCostCents: number | null;
  readonly replacementCostCents: number | null;
  readonly installedOn: string | null;
  readonly condition: 'GOOD' | 'FAIR' | 'POOR' | null;
  readonly manualDocumentId: string | null;
  readonly receiptDocumentId: string | null;
  readonly roomId: string | null;
  readonly isHidden?: boolean;
}

export interface WaveWarrantyRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly providerName: string;
  readonly category: string;
  readonly expiryDate: string;
}

export interface WaveExtendedMaintenanceTaskMeta {
  readonly taskId: string;
  readonly category: 'PLUMBING' | 'ELECTRICAL' | 'HVAC' | 'GENERAL';
}

export interface WaveInsurancePolicyRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly carrierName: string;
  readonly policyNumber: string;
  readonly deductibleCents: number;
  readonly annualPremiumCents: number;
  readonly expiryDate: string;
}

export interface WaveClaimRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly title: string;
  readonly slug: string;
  readonly status: 'OPEN' | 'CLOSED' | 'UNDER_REVIEW';
  readonly requiredDocumentTypes: readonly string[];
}

export interface WaveDocumentRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly title: string;
  readonly documentType: string;
  readonly lifecycleStatus: 'ACTIVE' | 'ARCHIVED' | 'TRASHED';
  readonly visibleToRoles: readonly AskUserRole[];
}

export interface WaveClaimDocLink {
  readonly id: string;
  readonly claimId: string;
  readonly documentId: string;
}

export interface WaveHomeEventRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly title: string;
  readonly eventCategory: 'REPAIR' | 'UPGRADE' | 'INSPECTION' | 'OTHER';
  readonly occurredAt: string;
  readonly actualCostCents: number | null;
}

export interface WaveTaxBillRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly taxYear: number;
  readonly amountCents: number;
  readonly status: 'PAID' | 'UNPAID' | 'OVERDUE';
  readonly lifecycleStatus: 'ACTIVE' | 'SUPERSEDED';
}

export interface WaveFinanceSlots {
  readonly monthlyRentCents: number | null;
  readonly homeValueCents: number | null;
  readonly horizonYears: number | null;
  readonly currentRateBps: number | null;
  readonly candidateRateBps: number | null;
  readonly closingCostsCents: number | null;
}

export interface WaveRecallRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly title: string;
  readonly severity: 'HIGH' | 'MEDIUM' | 'LOW';
  readonly affectedInventoryItemId: string;
}

export interface WaveEnvironmentalRiskRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly hazardType: string;
  readonly severity: 'HIGH' | 'MODERATE' | 'LOW';
  readonly windowStartIso: string;
  readonly windowEndIso: string;
  readonly sourceAvailable: boolean;
  readonly lastUpdatedIso: string;
}

export interface WaveInspectionFindingRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly inspectionReportId: string;
  readonly inspectionReportTitle: string;
  readonly title: string;
  readonly status: 'ACTION_REQUIRED' | 'MONITORING' | 'RESOLVED';
}

export interface WaveBuyerTaskRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly title: string;
  readonly isContingency: boolean;
  readonly status: 'OPEN' | 'COMPLETED';
  readonly dueAt: string;
}

export interface WaveSellerReadinessRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly title: string;
  readonly status: 'PENDING' | 'COMPLETED';
}

export interface WaveProjectRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly title: string;
  readonly status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  readonly permitStatus: 'CONFIRMED_NOT_REQUIRED' | 'NEEDS_PERMIT' | 'UNKNOWN' | 'APPROVED';
}

export interface WaveContractorQuoteRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly roomTag: string;
  readonly vendorName: string;
  readonly amountCents: number;
  readonly timelineDays: number;
  readonly warrantyMonths: number;
}

export interface WaveSavedResultRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly title: string;
  readonly savedType: string;
  readonly minimumRole: AskUserRole;
  readonly serializedPlan?: string;
}

export interface CrossDomainPropertySnapshot extends Phase2aPropertySnapshot {
  readonly timezone: string;
  readonly closingDateIso: string | null;
  readonly extendedItems: readonly WaveExtendedItemRecord[];
  readonly warranties: readonly WaveWarrantyRecord[];
  readonly maintenanceTaskMeta: readonly WaveExtendedMaintenanceTaskMeta[];
  readonly insurancePolicies: readonly WaveInsurancePolicyRecord[];
  readonly claims: readonly WaveClaimRecord[];
  readonly documents: readonly WaveDocumentRecord[];
  readonly claimDocLinks: readonly WaveClaimDocLink[];
  readonly homeEvents: readonly WaveHomeEventRecord[];
  readonly taxBills: readonly WaveTaxBillRecord[];
  readonly financeSlots: WaveFinanceSlots | null;
  readonly recalls: readonly WaveRecallRecord[];
  readonly environmentalRisks: readonly WaveEnvironmentalRiskRecord[];
  readonly inspectionFindings: readonly WaveInspectionFindingRecord[];
  readonly buyerTasks: readonly WaveBuyerTaskRecord[];
  readonly sellerReadinessItems: readonly WaveSellerReadinessRecord[];
  readonly projects: readonly WaveProjectRecord[];
  readonly contractorQuotes: readonly WaveContractorQuoteRecord[];
  readonly savedResults: readonly WaveSavedResultRecord[];
}

export interface WaveFacetExecutionResult {
  readonly facetId: string;
  readonly owner: MixedStackFacetOwnershipAssignment;
  readonly status: 'EXECUTED' | 'PARTIAL_MISSING_SLOTS' | 'UNRESOLVED' | 'BLOCKED';
  readonly summary: string;
  readonly recordIds: readonly string[];
  readonly missingSlots: readonly string[];
  readonly redactedFieldIds: readonly string[];
  readonly receipt: SemanticReadReceipt | null;
  readonly entailment: SemanticReceiptEntailmentVerdict | null;
  readonly presentationEquivalence: Phase2aRichPresentationEquivalenceReport | null;
  readonly metrics?: Readonly<Record<string, number | string | boolean | null>>;
}

export interface CrossDomainExecutionResult {
  readonly status: 'ANSWERED' | 'PARTIAL' | 'CLARIFY' | 'NONE_FITS' | 'BOUNDARY' | 'FORBIDDEN';
  readonly rawText: string;
  readonly answer: string;
  readonly clarification: CrossDomainClarification | null;
  readonly facetResults: readonly WaveFacetExecutionResult[];
  readonly overflowFacets: readonly PlanOverflowFacet[];
  readonly executionCountByFacetId: Readonly<Record<string, number>>;
  readonly redactedFieldIds: readonly string[];
}

const ROLE_RANK: Readonly<Record<AskUserRole, number>> = {
  VIEWER: 1,
  EDITOR: 2,
  OWNER: 3,
};

function canSeeRole(role: AskUserRole, minimumRole: AskUserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimumRole];
}

function monthRangeIso(referenceDate: string, offsetMonths: number): { startIso: string; endIso: string } {
  const ref = new Date(`${referenceDate.slice(0, 10)}T00:00:00.000Z`);
  const year = ref.getUTCFullYear();
  const month = ref.getUTCMonth() + offsetMonths;
  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function weekWindowIso(referenceDate: string): { startIso: string; endIso: string } {
  const ref = new Date(`${referenceDate.slice(0, 10)}T00:00:00.000Z`);
  const start = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() - 1));
  const end = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() + 7));
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function finalizeReceiptAndPresentation(input: {
  readonly facet: SemanticFacet;
  readonly snapshot: CrossDomainPropertySnapshot;
  readonly role: AskUserRole;
  readonly projection: SemanticReadReceipt['projection'];
  readonly operationAdapter: string;
  readonly sourceType: string;
  readonly predicateIds: readonly string[];
  readonly rows: ReadonlyArray<{ readonly id: string; readonly label: string; readonly subtitle?: string }>;
  readonly title: string;
  readonly summaryBody: string;
  readonly variantId: string;
  readonly unknownCount?: number;
  readonly conflictedCount?: number;
}): {
  readonly receipt: SemanticReadReceipt;
  readonly entailment: SemanticReceiptEntailmentVerdict;
  readonly equivalence: Phase2aRichPresentationEquivalenceReport;
} {
  const resolvedRecordIds = input.rows.map((r) => r.id);
  const unknownCount = input.unknownCount ?? 0;
  const conflictedCount = input.conflictedCount ?? 0;
  const confirmedCount = resolvedRecordIds.length;
  const displayedCount = input.projection === 'COUNT' ? 0 : resolvedRecordIds.length;
  const renderedBody = input.projection === 'COUNT' && !new RegExp(`\\b${confirmedCount}\\b`).test(input.summaryBody)
    ? `${confirmedCount} ${input.summaryBody}`
    : input.summaryBody;

  const receipt = buildSemanticReadReceipt({
    facetId: input.facet.id,
    requestClass: input.facet.requestClass === 'CAPABILITY' ? 'CAPABILITY' : 'DATA_QUERY',
    entityId: input.facet.subject?.entityId ?? 'entity.property',
    operationAdapter: input.operationAdapter,
    projection: input.projection,
    predicateIds: input.predicateIds.length > 0 ? input.predicateIds : [`predicate.${input.facet.subject?.entityId ?? 'property'}.read`],
    resolvedRecordIds,
    confirmedCount,
    conflictedCount,
    unknownCount,
    displayedCount,
    propertyId: input.snapshot.propertyId,
    role: input.role,
    sourceType: input.sourceType,
    observedAt: `${input.snapshot.asOfDate.slice(0, 10)}T00:00:00.000Z`,
    answerVariantId: input.variantId,
  });

  const blocks = buildPhase2aRichPresentation({
    receipt,
    title: input.title,
    summaryBody: renderedBody,
    rows: input.projection === 'COUNT' ? [] : input.rows.map((r) => ({ id: r.id, label: r.label, subtitle: r.subtitle })),
  });

  const entailment = verifySemanticReadReceiptEntailment({
    status: 'ANSWERED',
    blocks,
    suggestions: [],
    confirmation: null,
    clarification: null,
    parameters: { semanticExecutionReceipt: receipt },
  });
  if (entailment.outcome !== 'PASS') {
    throw new Error(`Wave receipt entailment failed (${input.facet.evidence.jobMatch}): ${entailment.reasonCodes.join(', ')}`);
  }

  const equivalence = verifyRichPresentationPopulationEquivalence(receipt, blocks);
  if (!equivalence.ok) {
    throw new Error(`Wave presentation equivalence failed (${input.facet.evidence.jobMatch}): ${equivalence.reasons.join(', ')}`);
  }

  return { receipt, entailment, equivalence };
}

function evaluateWherePredicates(where: SemanticWhereExpression | null): string[] {
  if (!where) return [];
  if (where.kind === 'PREDICATE') return [where.predicateId];
  if (where.kind === 'NOT') return evaluateWherePredicates(where.operand);
  return where.operands.flatMap(evaluateWherePredicates);
}

function firstPredicateTargetCategorySet(where: SemanticWhereExpression | null): readonly string[] | null {
  if (!where) return null;
  if (where.kind === 'PREDICATE') return where.targetCategorySet ?? null;
  if (where.kind === 'NOT') return firstPredicateTargetCategorySet(where.operand);
  for (const op of where.operands) {
    const found = firstPredicateTargetCategorySet(op);
    if (found) return found;
  }
  return null;
}

function executeNewStackFacet(
  facet: SemanticFacet,
  owner: MixedStackFacetOwnershipAssignment,
  snapshot: CrossDomainPropertySnapshot,
  role: AskUserRole,
  priorResultsById: ReadonlyMap<string, WaveFacetExecutionResult>,
): WaveFacetExecutionResult {
  const job = facet.evidence.jobMatch;
  const adapterId = owner.adapterId;
  const visibleItems = snapshot.extendedItems.filter((item) => item.propertyId === snapshot.propertyId && !item.isHidden);
  const redactedFieldIds: string[] = [];

  if (job === 'query.maintenance_task.filter') {
    const categories = firstPredicateTargetCategorySet(facet.where);
    const metaByTaskId = new Map(snapshot.maintenanceTaskMeta.map((m) => [m.taskId, m.category]));
    const refTime = new Date(`${snapshot.asOfDate.slice(0, 10)}T00:00:00.000Z`).getTime();
    const matches = snapshot.maintenanceTasks.filter((task) => {
      if (task.propertyId !== snapshot.propertyId) return false;
      if (categories && categories.length > 0) {
        const taskCat = metaByTaskId.get(task.id) ?? 'GENERAL';
        return categories.includes(taskCat) && (task.status === 'PENDING' || task.status === 'IN_PROGRESS');
      }
      if (facet.time?.kind === 'CALENDAR_PERIOD' && facet.time.unit === 'MONTH') {
        const range = monthRangeIso(snapshot.asOfDate, facet.time.offset);
        return task.status === 'PENDING' && task.nextDueDate >= range.startIso && task.nextDueDate < range.endIso;
      }
      return task.status === 'PAST_DUE' || (task.status === 'PENDING' && new Date(task.nextDueDate).getTime() < refTime);
    });
    const rows = matches.map((m) => ({ id: m.id, label: m.title, subtitle: `Due ${m.nextDueDate}` }));
    const summary = matches.length === 0 ? 'No matching maintenance tasks found.' : `${matches.length} maintenance task(s): ${matches.map((m) => m.title).join(', ')}.`;
    const predIds = evaluateWherePredicates(facet.where);
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'LIST',
      operationAdapter: adapterId,
      sourceType: 'PropertyMaintenanceTask',
      predicateIds: predIds.length > 0 ? predIds : ['predicate.maintenance_task.matches_filter'],
      rows,
      title: 'Maintenance tasks',
      summaryBody: summary,
      variantId: 'variant.maintenance_list',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
    };
  }

  // Wave 1/4: Neither manual nor receipt
  if (job === 'query.inventory_item.relation_boolean' && facet.relations.some((r) => r.semanticRelationId === 'relation.inventory_item.manual_document')) {
    const matches = visibleItems.filter((item) => !item.manualDocumentId && !item.receiptDocumentId);
    const rows = matches.map((m) => ({ id: m.id, label: m.name }));
    const summary = `${matches.length} inventory item(s) have neither a manual nor a receipt: ${matches.map((m) => m.name).join(', ')}.`;
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: facet.projection === 'COUNT' ? 'COUNT' : 'LIST',
      operationAdapter: adapterId,
      sourceType: 'InventoryItem',
      predicateIds: evaluateWherePredicates(facet.where),
      rows,
      title: 'Items without manual or receipt',
      summaryBody: summary,
      variantId: 'variant.inventory_missing_docs',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
    };
  }

  // Phase 2A single-slice vertical reads & replacement guidance
  if (job === 'query.inventory_item.relation_boolean' || job === 'job.inventory.replacement_guidance') {
    const rawQuery = job === 'job.inventory.replacement_guidance' ? 'should I repair or replace my furnace' : facet.sourceSpan.text;
    const sub = executePhase2aVerticalSlice({
      rawText: rawQuery,
      snapshot,
      auth: { propertyId: snapshot.propertyId, role, propertyAuthorized: true },
    });
    const summaryBlock = sub.operationResult.blocks.find((b) => b.type === 'SUMMARY');
    const summaryText = summaryBlock && summaryBlock.type === 'SUMMARY' ? summaryBlock.body : sub.status;
    return {
      facetId: facet.id,
      owner,
      status: sub.status === 'ANSWERED' ? 'EXECUTED' : 'BLOCKED',
      summary: summaryText,
      recordIds: sub.receipt?.resolvedRecordIds ?? [...sub.activeEntityIds],
      missingSlots: [],
      redactedFieldIds: [...sub.redactedFields],
      receipt: sub.receipt,
      entailment: sub.entailment,
      presentationEquivalence: sub.presentationEquivalence,
    };
  }

  if (job === 'query.inventory_item.field_read') {
    const target = visibleItems.find((i) => !facet.subject?.recordId || i.slug === facet.subject.recordId || i.id === facet.subject.recordId || i.name.toLowerCase().includes(facet.subject.recordId.replace(/-/g, ' ')));
    const rows = target ? [{ id: target.id, label: target.name }] : [];
    const wantsReplacementCost = facet.fields.some((f) => f.fieldId === 'field.inventory_item.replacement_cost');
    let summary = target ? `${target.name}: installed ${target.installedOn ?? 'unknown'}.` : 'Matching item not found.';
    if (target && wantsReplacementCost) {
      if (!canSeeRole(role, 'EDITOR')) {
        redactedFieldIds.push('field.inventory_item.replacement_cost');
        summary = `${target.name}: replacement cost redacted for ${role}.`;
      } else {
        summary = `${target.name}: replacement cost $${((target.replacementCostCents ?? 0) / 100).toFixed(2)}.`;
      }
    }
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'DETAIL',
      operationAdapter: adapterId,
      sourceType: 'InventoryItem',
      predicateIds: ['predicate.inventory_item.has_warranty_record'],
      rows,
      title: 'Inventory item detail',
      summaryBody: summary,
      variantId: 'variant.inventory_field_detail',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
    };
  }

  if (job === 'query.warranty.filter') {
    const refMs = new Date(`${snapshot.asOfDate.slice(0, 10)}T00:00:00.000Z`).getTime();
    const expired = snapshot.warranties.filter((w) => w.propertyId === snapshot.propertyId && new Date(w.expiryDate).getTime() < refMs);
    const rows = expired.map((w) => ({ id: w.id, label: w.providerName, subtitle: `Expired ${w.expiryDate}` }));
    const summary = `${expired.length} expired warranty record(s): ${expired.map((w) => w.providerName).join(', ')}.`;
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'LIST',
      operationAdapter: adapterId,
      sourceType: 'Warranty',
      predicateIds: ['predicate.warranty.matches_filter'],
      rows,
      title: 'Expired warranties',
      summaryBody: summary,
      variantId: 'variant.expired_warranties',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
    };
  }

  if (job === 'query.insurance_policy.field_read') {
    const policies = snapshot.insurancePolicies.filter((p) => p.propertyId === snapshot.propertyId);
    const rows = policies.map((p) => ({ id: p.id, label: p.carrierName }));
    const restricted = !canSeeRole(role, 'EDITOR');
    if (restricted) redactedFieldIds.push('field.insurance_policy.deductible');
    const summary = restricted
      ? 'Insurance deductible requires EDITOR or OWNER role (redacted).'
      : policies.length === 0
        ? 'No insurance policies recorded.'
        : `Insurance deductible: $${(policies[0].deductibleCents / 100).toFixed(2)} (${policies[0].carrierName}).`;
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'DETAIL',
      operationAdapter: adapterId,
      sourceType: 'InsurancePolicy',
      predicateIds: ['predicate.warranty.matches_filter'],
      rows,
      title: 'Insurance policy deductible',
      summaryBody: summary,
      variantId: restricted ? 'variant.insurance_redacted' : 'variant.insurance_deductible',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
    };
  }

  if (job === 'query.claim.filter') {
    const openClaims = snapshot.claims.filter((c) => c.propertyId === snapshot.propertyId && c.status === 'OPEN');
    const rows = openClaims.map((c) => ({ id: c.id, label: c.title, subtitle: c.status }));
    const summary = `${openClaims.length} open claim(s): ${openClaims.map((c) => c.title).join(', ')}.`;
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'LIST',
      operationAdapter: adapterId,
      sourceType: 'Claim',
      predicateIds: ['predicate.claim.has_status'],
      rows,
      title: 'Open claims',
      summaryBody: summary,
      variantId: 'variant.open_claims',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
    };
  }

  if (job === 'query.claim.documents') {
    const isMissingMode = facet.where?.kind === 'PREDICATE' && facet.where.predicateId === 'predicate.claim.missing_required_document';
    const depIds = facet.dependsOn.flatMap((depId) => priorResultsById.get(depId)?.recordIds ?? []);
    const targetSlug = facet.where?.kind === 'PREDICATE' ? facet.where.targetRecordId : undefined;
    const authorizedClaims = snapshot.claims.filter((c) =>
      c.propertyId === snapshot.propertyId
      && (depIds.length === 0 || depIds.includes(c.id))
      && (!targetSlug || c.slug === targetSlug || c.title.toLowerCase().includes(targetSlug.replace(/-/g, ' '))),
    );
    const claimIds = new Set(authorizedClaims.map((c) => c.id));
    const visibleDocs = snapshot.documents.filter((doc) =>
      doc.propertyId === snapshot.propertyId
      && doc.lifecycleStatus === 'ACTIVE'
      && doc.visibleToRoles.includes(role),
    );
    const visibleDocMap = new Map(visibleDocs.map((d) => [d.id, d]));

    if (isMissingMode) {
      const missingRows: Array<{ id: string; label: string }> = [];
      for (const claim of authorizedClaims) {
        const linkedTypes = new Set(
          snapshot.claimDocLinks
            .filter((link) => link.claimId === claim.id && visibleDocMap.has(link.documentId))
            .map((link) => visibleDocMap.get(link.documentId)!.documentType),
        );
        for (const reqType of claim.requiredDocumentTypes) {
          if (!linkedTypes.has(reqType)) {
            missingRows.push({ id: `${claim.id}:${reqType}`, label: `${claim.title}: missing ${reqType}` });
          }
        }
      }
      const summary = missingRows.length === 0 ? 'No missing claim documents.' : `${missingRows.length} missing claim document requirement(s): ${missingRows.map((r) => r.label).join(', ')}.`;
      const finalized = finalizeReceiptAndPresentation({
        facet,
        snapshot,
        role,
        projection: 'LIST',
        operationAdapter: adapterId,
        sourceType: 'ClaimDocument',
        predicateIds: ['predicate.claim.missing_required_document'],
        rows: missingRows,
        title: 'Missing claim documents',
        summaryBody: summary,
        variantId: 'variant.claim_missing_docs',
      });
      return {
        facetId: facet.id,
        owner,
        status: 'EXECUTED',
        summary,
        recordIds: missingRows.map((r) => r.id),
        missingSlots: [],
        redactedFieldIds,
        receipt: finalized.receipt,
        entailment: finalized.entailment,
        presentationEquivalence: finalized.equivalence,
      };
    }

    const visibleLinkedDocs = snapshot.claimDocLinks
      .filter((link) => claimIds.has(link.claimId) && visibleDocMap.has(link.documentId))
      .map((link) => visibleDocMap.get(link.documentId)!);
    const rows = visibleLinkedDocs.map((d) => ({ id: d.id, label: d.title, subtitle: d.documentType }));
    const summary = `${visibleLinkedDocs.length} authorized document(s) for claim: ${visibleLinkedDocs.map((d) => d.title).join(', ')}.`;
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'LIST',
      operationAdapter: adapterId,
      sourceType: 'ClaimDocument',
      predicateIds: ['predicate.claim.has_visible_document'],
      rows,
      title: 'Claim documents',
      summaryBody: summary,
      variantId: 'variant.claim_visible_docs',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
    };
  }

  if (job === 'query.home_event.repair_spend_aggregate') {
    const refYear = new Date(`${snapshot.asOfDate.slice(0, 10)}T00:00:00.000Z`).getUTCFullYear();
    const targetYear = refYear - 1;
    const events = snapshot.homeEvents.filter((evt) =>
      evt.propertyId === snapshot.propertyId
      && evt.eventCategory === 'REPAIR'
      && new Date(evt.occurredAt).getUTCFullYear() === targetYear
      && typeof evt.actualCostCents === 'number',
    );
    const totalCents = events.reduce((acc, e) => acc + (e.actualCostCents ?? 0), 0);
    const restricted = !canSeeRole(role, 'EDITOR');
    if (restricted) redactedFieldIds.push('field.home_event.actual_cost');
    const summary = restricted
      ? 'Financial repair spend redacted for VIEWER role.'
      : `Total repair spend in ${targetYear} (${snapshot.timezone}): $${(totalCents / 100).toFixed(2)} across ${events.length} repair event(s).`;
    const rows = events.map((e) => ({ id: e.id, label: e.title }));
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'AGGREGATE',
      operationAdapter: adapterId,
      sourceType: 'HomeEvent',
      predicateIds: ['predicate.home_event.is_repair_cost'],
      rows,
      title: `Repair spend (${targetYear})`,
      summaryBody: summary,
      variantId: 'variant.repair_spend_aggregate',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
      metrics: { totalRepairSpendCents: restricted ? null : totalCents, targetYear },
    };
  }

  if (job === 'query.property_tax_bill.compare_years') {
    const refYear = new Date(`${snapshot.asOfDate.slice(0, 10)}T00:00:00.000Z`).getUTCFullYear();
    const activeBills = snapshot.taxBills.filter((b) => b.propertyId === snapshot.propertyId && b.lifecycleStatus === 'ACTIVE');
    const thisYearBill = activeBills.find((b) => b.taxYear === refYear) ?? null;
    const lastYearBill = activeBills.find((b) => b.taxYear === refYear - 1) ?? null;
    const comparedBills = [lastYearBill, thisYearBill].filter((b): b is WaveTaxBillRecord => b !== null);
    const deltaCents = thisYearBill && lastYearBill ? thisYearBill.amountCents - lastYearBill.amountCents : null;
    const summary = deltaCents !== null
      ? `Property tax changed by $${(deltaCents / 100).toFixed(2)} (${refYear - 1}: $${(lastYearBill!.amountCents / 100).toFixed(2)} vs ${refYear}: $${(thisYearBill!.amountCents / 100).toFixed(2)}).`
      : 'Tax bill comparison incomplete: one or more year records missing.';
    const rows = comparedBills.map((b) => ({ id: b.id, label: `Tax bill ${b.taxYear}` }));
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'COMPARE',
      operationAdapter: adapterId,
      sourceType: 'PropertyTaxBillRecord',
      predicateIds: ['predicate.property_tax_bill.for_period'],
      rows,
      title: 'Property tax comparison',
      summaryBody: summary,
      variantId: 'variant.tax_bill_compare',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
      metrics: { deltaCents },
    };
  }

  if (job === 'query.property_tax_bill.unpaid') {
    const unpaid = snapshot.taxBills.filter((b) => b.propertyId === snapshot.propertyId && b.lifecycleStatus === 'ACTIVE' && b.status === 'UNPAID');
    const rows = unpaid.map((b) => ({ id: b.id, label: `Unpaid tax bill ${b.taxYear}` }));
    const summary = `${unpaid.length} unpaid tax bill(s).`;
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'LIST',
      operationAdapter: adapterId,
      sourceType: 'PropertyTaxBillRecord',
      predicateIds: ['predicate.property_tax_bill.is_unpaid'],
      rows,
      title: 'Unpaid tax bills',
      summaryBody: summary,
      variantId: 'variant.tax_bills_unpaid',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
    };
  }

  if (job === 'job.finance.own_rent_break_even' || job === 'job.finance.refinance_break_even') {
    const slots = snapshot.financeSlots;
    const missingSlots: string[] = [];
    if (job === 'job.finance.own_rent_break_even') {
      if (!slots?.monthlyRentCents) missingSlots.push('monthlyRentCents');
      if (!slots?.homeValueCents) missingSlots.push('homeValueCents');
      if (!slots?.horizonYears) missingSlots.push('horizonYears');
    } else {
      if (!slots?.currentRateBps) missingSlots.push('currentRateBps');
      if (!slots?.candidateRateBps) missingSlots.push('candidateRateBps');
      if (!slots?.closingCostsCents) missingSlots.push('closingCostsCents');
    }
    const status = missingSlots.length > 0 ? 'PARTIAL_MISSING_SLOTS' : 'EXECUTED';
    const summary = missingSlots.length > 0
      ? `Cannot compute break-even without missing required financial inputs: ${missingSlots.join(', ')}.`
      : job === 'job.finance.refinance_break_even'
        ? `Refinance break-even computed over ${slots!.horizonYears ?? 3} year horizon (closing costs $${((slots!.closingCostsCents ?? 0) / 100).toFixed(2)}).`
        : `Own-vs-rent break-even computed for ${slots!.horizonYears} year horizon at $${((slots!.monthlyRentCents ?? 0) / 100).toFixed(2)}/mo rent.`;
    const rows = [{ id: snapshot.propertyId, label: `Property ${snapshot.propertyId}` }];
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'DETAIL',
      operationAdapter: adapterId,
      sourceType: 'Property',
      predicateIds: ['predicate.property_tax_bill.for_period'],
      rows,
      title: 'Financial break-even analysis',
      summaryBody: summary,
      variantId: 'variant.finance_break_even',
    });
    return {
      facetId: facet.id,
      owner,
      status,
      summary,
      recordIds: rows.map((r) => r.id),
      missingSlots,
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
    };
  }

  if (job === 'job.risk.recall_review') {
    const visibleItemIds = new Set(visibleItems.map((i) => i.id));
    const matches = snapshot.recalls.filter((r) => r.propertyId === snapshot.propertyId && visibleItemIds.has(r.affectedInventoryItemId));
    const rows = matches.map((m) => ({ id: m.id, label: m.title, subtitle: `Item ${m.affectedInventoryItemId}` }));
    const summary = matches.length === 0 ? 'No recalls affect visible inventory items.' : `${matches.length} active recall(s): ${matches.map((m) => m.title).join(', ')}.`;
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'DETAIL',
      operationAdapter: adapterId,
      sourceType: 'RecallMatch',
      predicateIds: ['predicate.recall.affects_inventory_item'],
      rows,
      title: 'Active recalls & affected items',
      summaryBody: summary,
      variantId: 'variant.recall_review',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
    };
  }

  if (job === 'job.risk.environment_weekly') {
    const win = weekWindowIso(snapshot.asOfDate);
    const risks = snapshot.environmentalRisks.filter((r) => r.propertyId === snapshot.propertyId && r.windowEndIso >= win.startIso && r.windowStartIso <= win.endIso);
    const rows = risks.map((r) => ({ id: r.id, label: r.hazardType, subtitle: r.severity }));
    const freshness = risks[0]?.lastUpdatedIso ?? `${snapshot.asOfDate.slice(0, 10)}T00:00:00.000Z`;
    const sourceAvailable = risks.length > 0 ? risks.every((r) => r.sourceAvailable) : true;
    const summary = `${risks.length} environmental risk(s) this week (sourceAvailable=${sourceAvailable}, updated=${freshness}).`;
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'LIST',
      operationAdapter: adapterId,
      sourceType: 'EnvironmentalRisk',
      predicateIds: ['predicate.inspection_report.has_actionable_finding'],
      rows,
      title: 'Weekly environmental risks',
      summaryBody: summary,
      variantId: 'variant.environment_weekly',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
      metrics: { sourceAvailable, freshness },
    };
  }

  if (job === 'query.inspection_finding.actionable') {
    const findings = snapshot.inspectionFindings.filter((f) => f.propertyId === snapshot.propertyId && f.status === 'ACTION_REQUIRED');
    const rows = findings.map((f) => ({ id: f.id, label: f.title, subtitle: f.inspectionReportTitle }));
    const summary = `${findings.length} actionable inspection finding(s): ${findings.map((f) => `${f.title} (${f.inspectionReportTitle})`).join(', ')}.`;
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'LIST',
      operationAdapter: adapterId,
      sourceType: 'InspectionFinding',
      predicateIds: ['predicate.inspection_report.has_actionable_finding'],
      rows,
      title: 'Actionable inspection findings',
      summaryBody: summary,
      variantId: 'variant.inspection_findings',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
    };
  }

  if (job === 'query.buyer_task.before_closing' || job === 'job.buyer.contingency_deadlines') {
    const closingMs = snapshot.closingDateIso ? new Date(snapshot.closingDateIso).getTime() : Number.POSITIVE_INFINITY;
    const tasks = snapshot.buyerTasks.filter((t) =>
      t.propertyId === snapshot.propertyId
      && t.status === 'OPEN'
      && (job === 'job.buyer.contingency_deadlines' ? t.isContingency : new Date(t.dueAt).getTime() <= closingMs),
    );
    const rows = tasks.map((t) => ({ id: t.id, label: t.title, subtitle: `Due ${t.dueAt}` }));
    const summary = `${tasks.length} open buyer task(s): ${tasks.map((t) => t.title).join(', ')}.`;
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'LIST',
      operationAdapter: adapterId,
      sourceType: 'BuyerTaskEntity',
      predicateIds: ['predicate.buyer_checklist.has_active_task'],
      rows,
      title: 'Buyer closing tasks',
      summaryBody: summary,
      variantId: 'variant.buyer_tasks',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
    };
  }

  if (job === 'job.seller.listing_readiness') {
    const pending = snapshot.sellerReadinessItems.filter((s) => s.propertyId === snapshot.propertyId && s.status === 'PENDING');
    const rows = pending.map((s) => ({ id: s.id, label: s.title }));
    const summary = `${pending.length} seller readiness item(s) still pending before listing: ${pending.map((p) => p.title).join(', ')}.`;
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'LIST',
      operationAdapter: adapterId,
      sourceType: 'SellerReadinessEntity',
      predicateIds: ['predicate.sale_case.has_readiness_item'],
      rows,
      title: 'Seller readiness',
      summaryBody: summary,
      variantId: 'variant.seller_readiness',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
    };
  }

  if (job === 'query.project.needs_permit') {
    const active = snapshot.projects.filter((p) => p.propertyId === snapshot.propertyId && p.status === 'ACTIVE');
    const needsOrUnknown = active.filter((p) => p.permitStatus === 'NEEDS_PERMIT' || p.permitStatus === 'UNKNOWN');
    const unknownCount = needsOrUnknown.filter((p) => p.permitStatus === 'UNKNOWN').length;
    const confirmedNeedsCount = needsOrUnknown.filter((p) => p.permitStatus === 'NEEDS_PERMIT').length;
    const rows = needsOrUnknown.map((p) => ({ id: p.id, label: p.title, subtitle: p.permitStatus }));
    const summary = `${confirmedNeedsCount} project(s) confirmed needing permit, ${unknownCount} permit requirement(s) unknown (confirmed not-required excluded).`;
    const receipt = buildSemanticReadReceipt({
      facetId: facet.id,
      requestClass: 'DATA_QUERY',
      entityId: 'entity.project',
      operationAdapter: adapterId,
      projection: 'LIST',
      predicateIds: ['predicate.project.needs_permit_or_unresolved'],
      resolvedRecordIds: rows.map((r) => r.id),
      confirmedCount: rows.length,
      conflictedCount: 0,
      unknownCount,
      displayedCount: rows.length,
      propertyId: snapshot.propertyId,
      role,
      sourceType: 'HomeRenovationCase',
      observedAt: `${snapshot.asOfDate.slice(0, 10)}T00:00:00.000Z`,
      answerVariantId: 'variant.project_permit_status',
    });
    const blocks = buildPhase2aRichPresentation({
      receipt,
      title: 'Project permit requirements',
      summaryBody: summary,
      rows: rows.map((r) => ({ id: r.id, label: r.label, subtitle: r.subtitle })),
    });
    const entailment = verifySemanticReadReceiptEntailment({
      status: 'ANSWERED',
      blocks,
      suggestions: [],
      confirmation: null,
      clarification: null,
      parameters: { semanticExecutionReceipt: receipt },
    });
    const equivalence = verifyRichPresentationPopulationEquivalence(receipt, blocks);
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      missingSlots: [],
      redactedFieldIds,
      receipt,
      entailment,
      presentationEquivalence: equivalence,
      metrics: { confirmedNeedsCount, unknownCount },
    };
  }

  if (job === 'job.projects.quote_comparison') {
    const quotes = snapshot.contractorQuotes.filter((q) => q.propertyId === snapshot.propertyId);
    const chosen = quotes.slice(0, 2);
    const rows = chosen.map((q) => ({ id: q.id, label: q.vendorName, subtitle: `$${(q.amountCents / 100).toFixed(2)} · ${q.timelineDays} days` }));
    const summary = chosen.length >= 2
      ? `Compared ${chosen[0].vendorName} ($${(chosen[0].amountCents / 100).toFixed(2)}) vs ${chosen[1].vendorName} ($${(chosen[1].amountCents / 100).toFixed(2)}).`
      : 'Need two contractor quotes to compare.';
    const delta = chosen.length >= 2 ? chosen[0].amountCents - chosen[1].amountCents : null;
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'COMPARE',
      operationAdapter: adapterId,
      sourceType: 'ContractorQuote',
      predicateIds: ['predicate.project.needs_permit_or_unresolved'],
      rows,
      title: 'Contractor quote comparison',
      summaryBody: summary,
      variantId: 'variant.quote_comparison',
    });
    return {
      facetId: facet.id,
      owner,
      status: chosen.length >= 2 ? 'EXECUTED' : 'PARTIAL_MISSING_SLOTS',
      summary,
      recordIds: rows.map((r) => r.id),
      missingSlots: chosen.length >= 2 ? [] : ['two_contractor_quotes'],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
      metrics: { deltaCents: delta },
    };
  }

  if (job === 'job.saved_results.lookup') {
    const visibleSaved = snapshot.savedResults.filter((s) => s.propertyId === snapshot.propertyId && canSeeRole(role, s.minimumRole));
    const rows = visibleSaved.map((s) => ({ id: s.id, label: s.title, subtitle: s.savedType }));
    const summary = `${visibleSaved.length} saved result(s) visible to ${role}: ${visibleSaved.map((s) => s.title).join(', ')}.`;
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'LIST',
      operationAdapter: adapterId,
      sourceType: 'SavedResult',
      predicateIds: ['predicate.buyer_checklist.has_active_task'],
      rows,
      title: 'Saved items',
      summaryBody: summary,
      variantId: 'variant.saved_results',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
    };
  }

  return {
    facetId: facet.id,
    owner,
    status: 'UNRESOLVED',
    summary: `No registered Wave 1-5 handler for ${job}.`,
    recordIds: [],
    missingSlots: [],
    redactedFieldIds,
    receipt: null,
    entailment: null,
    presentationEquivalence: null,
  };
}

/**
 * Unified Cross-Domain Wave 1-5 Executor (§18 Phases 2B-5, §19 #10-#13, #24-#30, #37).
 */
export async function executeCrossDomainWaves(input: {
  readonly rawText: string;
  readonly snapshot: CrossDomainPropertySnapshot;
  readonly role: AskUserRole;
  readonly propertyAuthorized: boolean;
  readonly enabledDomains?: ReadonlySet<SemanticDomainId>;
  readonly allowLegacyFallback?: boolean;
}): Promise<CrossDomainExecutionResult> {
  if (!input.propertyAuthorized) {
    return {
      status: 'FORBIDDEN',
      rawText: input.rawText,
      answer: 'Access denied for this property.',
      clarification: null,
      facetResults: [],
      overflowFacets: [],
      executionCountByFacetId: {},
      redactedFieldIds: [],
    };
  }

  const parsed = parseCrossDomainSemanticRequest(input.rawText);
  if (parsed.clarification) {
    return {
      status: 'CLARIFY',
      rawText: input.rawText,
      answer: parsed.clarification.question,
      clarification: parsed.clarification,
      facetResults: [],
      overflowFacets: [],
      executionCountByFacetId: {},
      redactedFieldIds: [],
    };
  }

  if (parsed.plan.outcome === 'BOUNDARY') {
    return {
      status: 'BOUNDARY',
      rawText: input.rawText,
      answer: 'Safety boundary triggered: seek immediate emergency help or professional assistance.',
      clarification: null,
      facetResults: [],
      overflowFacets: [],
      executionCountByFacetId: {},
      redactedFieldIds: [],
    };
  }

  if (parsed.plan.outcome !== 'MATCH') {
    return {
      status: 'NONE_FITS',
      rawText: input.rawText,
      answer: 'I could not resolve all terms into a verified semantic request plan.',
      clarification: null,
      facetResults: [],
      overflowFacets: [],
      executionCountByFacetId: {},
      redactedFieldIds: [],
    };
  }

  const ownerships = assignMixedStackFacetOwnership(parsed.plan.facets, {
    enabledDomains: input.enabledDomains,
    allowLegacyFallback: input.allowLegacyFallback,
  });
  const ownershipByFacetId = new Map(ownerships.map((o) => [o.facetId, o]));

  const resultsById = new Map<string, WaveFacetExecutionResult>();
  const orderedResults: WaveFacetExecutionResult[] = [];
  const executionCountByFacetId: Record<string, number> = {};

  for (const facet of parsed.plan.facets) {
    executionCountByFacetId[facet.id] = (executionCountByFacetId[facet.id] ?? 0) + 1;
    const owner = ownershipByFacetId.get(facet.id)!;
    let facetResult: WaveFacetExecutionResult;

    if (owner.owner === 'NEW_STACK') {
      facetResult = executeNewStackFacet(facet, owner, input.snapshot, input.role, resultsById);
    } else if (owner.owner === 'LEGACY_STACK') {
      const legacyExecuted = executeNewStackFacet(facet, owner, input.snapshot, input.role, resultsById);
      facetResult = {
        ...legacyExecuted,
        summary: `[${owner.adapterId}] ${legacyExecuted.summary}`,
      };
    } else {
      facetResult = {
        facetId: facet.id,
        owner,
        status: 'UNRESOLVED',
        summary: `Domain ${owner.domainId} is not yet enabled; remainder preserved without fabrication.`,
        recordIds: [],
        missingSlots: [],
        redactedFieldIds: [],
        receipt: null,
        entailment: null,
        presentationEquivalence: null,
      };
    }

    resultsById.set(facet.id, facetResult);
    orderedResults.push(facetResult);
  }

  const hasPartial = orderedResults.some((r) => r.status !== 'EXECUTED') || parsed.overflowFacets.length > 0;
  const overflowNote = parsed.overflowFacets.length > 0
    ? ` Overflow (${parsed.overflowFacets.map((o) => `${o.id}:${o.reasonCode}`).join(', ')}).`
    : '';
  const allRedacted = Array.from(new Set(orderedResults.flatMap((r) => r.redactedFieldIds)));

  return {
    status: hasPartial ? 'PARTIAL' : 'ANSWERED',
    rawText: input.rawText,
    answer: `${orderedResults.map((r) => r.summary).join(' ')}${overflowNote}`.trim(),
    clarification: null,
    facetResults: orderedResults,
    overflowFacets: parsed.overflowFacets,
    executionCountByFacetId,
    redactedFieldIds: allRedacted,
  };
}

export async function replaySavedCrossDomainResult(input: {
  readonly savedResult: WaveSavedResultRecord;
  readonly currentSnapshot: CrossDomainPropertySnapshot;
  readonly currentRole: AskUserRole;
  readonly propertyAuthorized: boolean;
  readonly rawPromptFallback: string;
}): Promise<CrossDomainExecutionResult> {
  if (!input.propertyAuthorized || !canSeeRole(input.currentRole, input.savedResult.minimumRole)) {
    return {
      status: 'FORBIDDEN',
      rawText: input.rawPromptFallback,
      answer: 'Saved result replay blocked by current authorization or role visibility.',
      clarification: null,
      facetResults: [],
      overflowFacets: [],
      executionCountByFacetId: {},
      redactedFieldIds: [],
    };
  }
  return executeCrossDomainWaves({
    rawText: input.rawPromptFallback,
    snapshot: input.currentSnapshot,
    role: input.currentRole,
    propertyAuthorized: true,
  });
}

export function executeCrossDomainFollowUp(input: {
  readonly priorPrompt: string;
  readonly followUpText: string;
  readonly snapshot?: CrossDomainPropertySnapshot;
}): ReturnType<typeof applyCrossDomainFollowUpRefinement> {
  const prior = parseCrossDomainSemanticRequest(input.priorPrompt);
  const dynamicEntities = (input.snapshot?.rooms ?? []).map((room) => ({
    kind: 'ROOM' as const,
    entityId: 'entity.room',
    recordId: room.id,
    names: [room.name],
    authorized: true,
  }));
  return applyCrossDomainFollowUpRefinement(prior.plan, input.followUpText, dynamicEntities);
}
