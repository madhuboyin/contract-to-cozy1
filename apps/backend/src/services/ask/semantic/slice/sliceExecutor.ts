import { buildPayloadClarification } from '../../support/clarificationContract';
import { missingCorrectableFields } from '../../support/inventoryMissingFields';
import type { AskClarification } from '../../../../productFramework/ask/ask.contract';
import { prisma } from '../../../../lib/prisma';
import { AskConfirmationSchema } from '../../../../productFramework/ask/ask.contract';
import { visibleInventoryItemWhere } from '../../../riskAssetApplicability';
import type { AskOperationResult } from '../../askOperationRegistry';
import type { AskEntityResolutionResult } from '../../askEntityResolution';
import { describeNegativeOrAmbiguity, extractSemanticFollowUpDelta, parseDeterministicSemanticRequest, type NegativeOrReading } from '../deterministicSemanticParser';
import { ASK_SEMANTIC_RELATION_REGISTRY } from '../semanticRelationRegistry';
import { SemanticRequestPlanSchema, type SemanticRequestPlan, type SemanticWhereExpression } from '../semanticRequestPlan';
import { resolvePropertyEntityReference, type PropertyEntityCandidate, type PropertyEntityResolution } from '../propertyEntityResolver';
import { classifyTransitionalWarrantyLinks, type TransitionalWarrantyRead } from '../transitionalWarrantyRead';
import { buildSemanticReadReceipt, type SemanticReadReceipt } from '../semanticExecutionReceipt';
import { verifySemanticReadReceiptEntailment, type SemanticReceiptEntailmentVerdict } from '../semanticReceiptEntailment';
import { gateUncertifiedCommandPreview } from '../containment/commandPreviewAdmission';
import { enrichRowActions } from '../../actionEnrichment/actionEnrichmentRows';
import { actionEnrichmentOverflowCopy } from '../../actionEnrichment/actionEnrichmentRegistry';
import {
  buildSemanticTextEnvelope,
  verifyPlaceholderSpanMapRoundTrip,
  type DynamicPlaceholderEntityCandidate,
  type SemanticTextEnvelope,
} from './placeholderSpanMap';
import {
  buildSliceRichPresentation,
  verifyRichPresentationPopulationEquivalence,
  type SlicePresentationRow,
  type SliceRichPresentationEquivalenceReport,
} from './richPresentationAdapter';

export interface SliceAuthorizationContext {
  readonly propertyId: string;
  readonly role: 'VIEWER' | 'EDITOR' | 'OWNER';
  readonly propertyAuthorized: boolean;
  readonly restrictedItemIds?: readonly string[];
  readonly allowSensitiveFields?: boolean;
}

export interface SliceRoomRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly name: string;
}

export interface SliceInventoryItemRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly name: string;
  readonly category: string;
  readonly brand?: string;
  readonly modelNumber?: string;
  readonly serialNumber?: string;
  readonly purchaseCostCents?: number | null;
  readonly replacementCostCents?: number | null;
  readonly installedOn?: string | null;
  /** Recorded purchase date (YYYY-MM-DD); null/absent = not recorded. Read only by the shared missing-details judgement. */
  readonly purchasedOn?: string | null;
  readonly condition?: 'GOOD_CONDITION' | 'FAIR_CONDITION' | 'POOR_CONDITION' | 'REPLACE_SOON' | string;
  readonly roomId?: string | null;
  readonly propertyPlanWarrantyId?: string | null;
  readonly itemWarrantyIds: readonly string[];
  readonly receiptDocumentId?: string | null;
  readonly coverageEvidenceStatus: 'NONE' | 'NOT_SURE' | 'UNKNOWN' | string;
}

export interface SliceMaintenanceTaskRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly title: string;
  readonly status: 'PENDING' | 'IN_PROGRESS' | 'PAST_DUE' | 'COMPLETED' | string;
  readonly priority: 'LOW_PRIORITY' | 'MEDIUM_PRIORITY' | 'HIGH_PRIORITY' | string;
  readonly nextDueDate: string;
  readonly inventoryItemId?: string | null;
  /** Recorded cost of finished work, in whole cents; null/absent means no cost is recorded (unknown, never zero). */
  readonly actualCostCents?: number | null;
  /** The estimate recorded before the work; used only when no actual cost is recorded, and always labelled as an estimate. */
  readonly estimatedCostCents?: number | null;
  readonly completedOn?: string | null;
}

export interface SlicePropertySnapshot {
  readonly propertyId: string;
  readonly asOfDate: string;
  readonly maintenanceWorkflowVersion?: string;
  readonly rooms: readonly SliceRoomRecord[];
  readonly items: readonly SliceInventoryItemRecord[];
  readonly maintenanceTasks: readonly SliceMaintenanceTaskRecord[];
}

export interface SliceExecutionResult {
  readonly status: 'ANSWERED' | 'NEEDS_CLARIFICATION' | 'NEEDS_CONFIRMATION' | 'BLOCKED' | 'OUT_OF_SCOPE';
  readonly envelope: SemanticTextEnvelope;
  readonly spanRoundTripOk: boolean;
  readonly plan: SemanticRequestPlan;
  readonly entityResolution: PropertyEntityResolution | null;
  readonly receipt: SemanticReadReceipt | null;
  readonly entailment: SemanticReceiptEntailmentVerdict | null;
  readonly presentationEquivalence: SliceRichPresentationEquivalenceReport | null;
  readonly operationResult: AskOperationResult;
  readonly redactedFields: readonly string[];
  readonly traversalDepthUsed: number;
  readonly activeEntityIds: readonly string[];
}

function buildItemCandidates(
  snapshot: SlicePropertySnapshot,
  auth: SliceAuthorizationContext
): PropertyEntityCandidate[] {
  const restricted = new Set(auth.restrictedItemIds ?? []);
  return snapshot.items.map((item) => ({
    entityId: 'entity.inventory_item',
    recordId: item.id,
    safeDisplayLabel: item.name,
    identityLabels: [item.name, item.category, ...(item.brand ? [`${item.brand} ${item.name}`] : [])],
    authorization: auth.propertyAuthorized && !restricted.has(item.id) ? 'AUTHORISED' : 'UNAUTHORISED',
  }));
}

function detectMentionedItem(rawText: string, snapshot: SlicePropertySnapshot): string {
  const lower = rawText.toLocaleLowerCase('en-US');
  for (const item of snapshot.items) {
    if (lower.includes(item.name.toLocaleLowerCase('en-US'))) {
      return item.name;
    }
  }
  return '';
}

function evaluateWarrantyState(item: SliceInventoryItemRecord): TransitionalWarrantyRead {
  return classifyTransitionalWarrantyLinks({
    inventoryItemId: item.id,
    label: item.name,
    propertyPlanWarrantyId: item.propertyPlanWarrantyId ?? null,
    itemWarrantyIds: item.itemWarrantyIds,
    coverageEvidenceStatus: item.coverageEvidenceStatus,
  });
}

export interface TraversalBoundVerdict {
  readonly ok: boolean;
  readonly depth: number;
  readonly reason?: string;
}

/**
 * Validates a sequential multi-hop relation chain against every registered edge's
 * maximumTraversalDepth and cyclePolicy.
 */
export function checkRelationChainBound(
  relationPathIds: readonly string[],
  visitedNodes: readonly string[]
): TraversalBoundVerdict {
  if (relationPathIds.length === 0) {
    return { ok: true, depth: 0 };
  }
  const uniqueNodes = new Set(visitedNodes);
  if (uniqueNodes.size !== visitedNodes.length) {
    return { ok: false, depth: relationPathIds.length, reason: 'TRAVERSAL_CYCLE_DETECTED' };
  }
  const registrations = relationPathIds.map((pathId) =>
    ASK_SEMANTIC_RELATION_REGISTRY.find((entry) => entry.relationPathId === pathId)
  );
  if (registrations.some((reg) => !reg)) {
    return { ok: false, depth: relationPathIds.length, reason: 'UNREGISTERED_RELATION_PATH' };
  }
  const minAllowedDepth = Math.min(...registrations.map((reg) => reg!.maximumTraversalDepth));
  const depth = relationPathIds.length;
  if (depth > minAllowedDepth) {
    return { ok: false, depth, reason: 'TRAVERSAL_DEPTH_EXCEEDED' };
  }
  return { ok: true, depth };
}

/**
 * Validates sibling depth-1 predicates originating from the root entity
 * (e.g. warranty + room on entity.inventory_item), checking each path independently
 * against its own registered maximumTraversalDepth.
 */
function validateSiblingDepthOnePredicates(relationPathIds: readonly string[]): TraversalBoundVerdict {
  if (relationPathIds.length === 0) {
    return { ok: true, depth: 0 };
  }
  for (const pathId of relationPathIds) {
    const reg = ASK_SEMANTIC_RELATION_REGISTRY.find((entry) => entry.relationPathId === pathId);
    if (!reg) {
      return { ok: false, depth: 1, reason: 'UNREGISTERED_RELATION_PATH' };
    }
    if (reg.maximumTraversalDepth < 1) {
      return { ok: false, depth: 1, reason: 'TRAVERSAL_DEPTH_EXCEEDED' };
    }
  }
  return { ok: true, depth: 1 };
}

function buildDynamicPlaceholderCandidates(
  snapshot: SlicePropertySnapshot,
  auth: SliceAuthorizationContext
): DynamicPlaceholderEntityCandidate[] {
  const restricted = new Set(auth.restrictedItemIds ?? []);
  const itemCandidates: DynamicPlaceholderEntityCandidate[] = snapshot.items.map((item) => ({
    kind: 'ITEM',
    entityId: 'entity.inventory_item',
    recordId: item.id,
    names: [item.name, ...(item.brand ? [`${item.brand} ${item.name}`] : [])],
    authorized: auth.propertyAuthorized && !restricted.has(item.id),
    safeDisplayLabel: item.name,
  }));
  const roomCandidates: DynamicPlaceholderEntityCandidate[] = snapshot.rooms.map((room) => ({
    kind: 'ROOM',
    entityId: 'entity.room',
    recordId: room.id,
    names: [room.name],
    authorized: auth.propertyAuthorized,
    safeDisplayLabel: room.name,
  }));
  return [...itemCandidates, ...roomCandidates];
}

/** How an item whose install date is not recorded is treated while evaluating an age condition: it is evaluated both ways, and an item whose result differs is unknown. */
type AgeMode = 'RECORDED' | 'ASSUME_OLDER' | 'ASSUME_NOT_OLDER';

/**
 * Whether the item is older than `years` whole years on its recorded install date: strictly before the same calendar day `years` years before `asOfDate`.
 * Null when no usable install date is recorded, so an item with no date is never counted as old or as not old.
 */
function isOlderThanYears(item: SliceInventoryItemRecord, years: number, asOfDate: string): boolean | null {
  const installed = /^(\d{4})-(\d{2})-(\d{2})/.exec(item.installedOn ?? '');
  const asOf = /^(\d{4})-(\d{2})-(\d{2})/.exec(asOfDate);
  if (!installed || !asOf) return null;
  const cutoff = `${String(Number(asOf[1]) - years).padStart(4, '0')}-${asOf[2]}-${asOf[3]}`;
  return `${installed[1]}-${installed[2]}-${installed[3]}` < cutoff;
}

/** Whole calendar years since the recorded install date, for the result row's user-facing age label. */
function installedAgeYears(item: SliceInventoryItemRecord, asOfDate: string): number | null {
  const installed = /^(\d{4})-(\d{2})-(\d{2})/.exec(item.installedOn ?? '');
  const asOf = /^(\d{4})-(\d{2})-(\d{2})/.exec(asOfDate);
  if (!installed || !asOf) return null;
  let years = Number(asOf[1]) - Number(installed[1]);
  if (`${asOf[2]}-${asOf[3]}` < `${installed[2]}-${installed[3]}`) years -= 1;
  return Math.max(0, years);
}

/** The condition tree in the homeowner's words, so an either-or answer says what each match satisfied instead of describing only the warranty half. */
function describeWhere(expr: SemanticWhereExpression, snapshot: SlicePropertySnapshot, negated = false): string {
  if (expr.kind === 'NOT') return describeWhere(expr.operand, snapshot, !negated);
  if ('operands' in expr) {
    // A list of rooms reads as one place phrase: "in Kitchen or Laundry Room".
    if (!negated && expr.kind === 'OR' && expr.operands.every((o) => o.kind === 'PREDICATE' && o.predicateId === 'predicate.inventory_item.in_room' && o.targetRecordId)) {
      const names = expr.operands.map((o) => (o.kind === 'PREDICATE' ? snapshot.rooms.find((r) => r.id === o.targetRecordId)?.name : null) ?? 'a room');
      return `in ${names.join(' or ')}`;
    }
    // De Morgan: a negated AND is an OR of negations and the reverse; the words follow the structure that is actually evaluated.
    const joinAsAnd = (expr.kind === 'AND') !== negated;
    // A group joined differently from its parent is parenthesised so "A and (B or C)" is never read as "(A and B) or C".
    const parts = expr.operands.map((operand) => {
      const text = describeWhere(operand, snapshot, negated);
      const childJoinsAsAnd = 'operands' in operand ? (operand.kind === 'AND') !== negated : joinAsAnd;
      return 'operands' in operand && childJoinsAsAnd !== joinAsAnd && !text.startsWith('in ') ? `(${text})` : text;
    });
    return parts.join(joinAsAnd ? ' and ' : ', or ');
  }
  const years = expr.thresholdYears;
  switch (expr.predicateId) {
    case 'predicate.inventory_item.has_no_warranty_record': return negated ? 'a warranty linked in your home record' : 'no warranty linked in your home record';
    case 'predicate.inventory_item.has_no_receipt_record': return negated ? 'a receipt linked in your home record' : 'no receipt linked in your home record';
    case 'predicate.inventory_item.has_receipt_record': return negated ? 'no receipt linked in your home record' : 'a receipt linked in your home record';
    case 'predicate.inventory_item.has_warranty_record': return negated ? 'no warranty linked in your home record' : 'a warranty linked in your home record';
    case 'predicate.inventory_item.warranty_state_unknown': return negated ? 'a known warranty state' : 'an unknown warranty state';
    case 'predicate.inventory_item.has_due_maintenance': return negated ? 'no maintenance due' : 'maintenance due';
    case 'predicate.inventory_item.has_no_due_maintenance': return negated ? 'maintenance due' : 'no maintenance due';
    case 'predicate.inventory_item.has_overdue_maintenance': return negated ? 'no overdue maintenance' : 'overdue maintenance';
    case 'predicate.inventory_item.in_room': {
      const room = expr.targetRecordId ? snapshot.rooms.find((r) => r.id === expr.targetRecordId)?.name : null;
      return `${negated ? 'not ' : ''}in ${room ?? 'a room'}`;
    }
    case 'predicate.inventory_item.older_than_years': return `${negated ? 'not ' : ''}older than ${years} ${years === 1 ? 'year' : 'years'} (by recorded install date)`;
    default: return expr.predicateId;
  }
}

function hasAgePredicate(expr: SemanticWhereExpression | null | undefined): boolean {
  if (!expr) return false;
  if (expr.kind === 'PREDICATE') return expr.predicateId === 'predicate.inventory_item.older_than_years';
  if (expr.kind === 'NOT') return hasAgePredicate(expr.operand);
  return expr.operands.some(hasAgePredicate);
}

/** Whole-year thresholds of the age predicates the homeowner asked for POSITIVELY ("older than N years"); one under a NOT is a different question and is not returned. */
function positiveAgeThresholds(expr: SemanticWhereExpression | null | undefined, negated = false): number[] {
  if (!expr) return [];
  if (expr.kind === 'PREDICATE') return expr.predicateId === 'predicate.inventory_item.older_than_years' && !negated && expr.thresholdYears ? [expr.thresholdYears] : [];
  if (expr.kind === 'NOT') return positiveAgeThresholds(expr.operand, !negated);
  return expr.operands.flatMap((operand) => positiveAgeThresholds(operand, negated));
}

function evaluateWherePredicate(
  expr: Extract<SemanticWhereExpression, { kind: 'PREDICATE' }>,
  item: SliceInventoryItemRecord,
  warranty: TransitionalWarrantyRead,
  snapshot: SlicePropertySnapshot,
  ageMode: AgeMode = 'RECORDED'
): boolean {
  const linkedTasks = snapshot.maintenanceTasks.filter((task) => task.inventoryItemId === item.id);
  const dueTasks = linkedTasks.filter((task) => task.status !== 'COMPLETED');
  const overdueTasks = linkedTasks.filter(
    (task) => task.status === 'PAST_DUE' || (task.status !== 'COMPLETED' && Boolean(task.nextDueDate) && task.nextDueDate < snapshot.asOfDate)
  );

  switch (expr.predicateId) {
    case 'predicate.inventory_item.has_warranty_record':
      return warranty.state === 'ITEM_WARRANTY_LINKED'
        || warranty.state === 'PROPERTY_PLAN_LINKED'
        || warranty.state === 'BOTH_CONSISTENT';
    case 'predicate.inventory_item.has_no_warranty_record':
      return warranty.state === 'NO_LINK_RECORDED' || warranty.state === 'EXPLICIT_NO_COVERAGE';
    case 'predicate.inventory_item.has_receipt_record':
      return Boolean(item.receiptDocumentId);
    case 'predicate.inventory_item.has_no_receipt_record':
      return !item.receiptDocumentId;
    case 'predicate.inventory_item.warranty_state_unknown':
      return warranty.state === 'UNKNOWN' || warranty.state === 'CONFLICTED_LINKS';
    case 'predicate.inventory_item.has_due_maintenance':
      return dueTasks.length > 0;
    case 'predicate.inventory_item.has_overdue_maintenance':
      return overdueTasks.length > 0;
    case 'predicate.inventory_item.has_no_due_maintenance':
      return dueTasks.length === 0;
    case 'predicate.inventory_item.in_room':
      return expr.targetRecordId ? item.roomId === expr.targetRecordId : Boolean(item.roomId);
    case 'predicate.inventory_item.older_than_years': {
      if (!expr.thresholdYears) return false;
      const older = isOlderThanYears(item, expr.thresholdYears, snapshot.asOfDate);
      return older !== null ? older : ageMode === 'ASSUME_OLDER';
    }
    default:
      return false;
  }
}

function evaluateWhereExpression(
  expr: SemanticWhereExpression,
  item: SliceInventoryItemRecord,
  warranty: TransitionalWarrantyRead,
  snapshot: SlicePropertySnapshot,
  ageMode: AgeMode = 'RECORDED'
): boolean {
  switch (expr.kind) {
    case 'PREDICATE':
      return evaluateWherePredicate(expr, item, warranty, snapshot, ageMode);
    case 'NOT':
      return !evaluateWhereExpression(expr.operand, item, warranty, snapshot, ageMode);
    case 'AND':
      return expr.operands.every((operand) => evaluateWhereExpression(operand, item, warranty, snapshot, ageMode));
    case 'OR':
      return expr.operands.some((operand) => evaluateWhereExpression(operand, item, warranty, snapshot, ageMode));
  }
}

function formatMoneyCents(cents: number | null | undefined, redacted: boolean): string {
  if (redacted) return '[redacted for current role]';
  if (cents === null || cents === undefined) return 'not recorded';
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildBlockedResult(
  rawText: string,
  envelope: SemanticTextEnvelope,
  spanRoundTripOk: boolean,
  plan: SemanticRequestPlan,
  entityResolution: PropertyEntityResolution | null,
  reason: string
): SliceExecutionResult {
  const operationResult: AskOperationResult = {
    status: 'BLOCKED',
    reasonCode: 'ASK_PROPERTY_AUTHORIZATION_BLOCKED',
    blocks: [
      {
        type: 'BOUNDARY',
        id: 'phase2a-auth-boundary',
        title: 'Access restricted',
        body: reason,
        severity: 'CAUTION',
        suggestions: [],
      },
    ],
    suggestions: [],
    parameters: { retryable: false, actions: [], operationId: 'INVENTORY_ITEMS_READ', summary: reason },
    confirmation: null,
    clarification: null,
  };
  return {
    status: 'BLOCKED',
    envelope,
    spanRoundTripOk,
    plan,
    entityResolution,
    receipt: null,
    entailment: null,
    presentationEquivalence: null,
    operationResult,
    redactedFields: ['serialNumber', 'purchaseCostCents', 'replacementCostCents'],
    traversalDepthUsed: 0,
    activeEntityIds: [],
  };
}

/**
 * Executes the complete Phase 2A vertical slice:
 * text envelope -> deterministic plan -> entity resolution -> bounded traversal /
 * Boolean evaluation / capability / command preview -> typed receipt -> entailment
 * verification -> rich presentation equivalence.
 */
export function executeSemanticSlice(input: {
  readonly rawText: string;
  readonly snapshot: SlicePropertySnapshot;
  readonly auth: SliceAuthorizationContext;
  readonly filterEntityIds?: readonly string[];
  readonly planOverride?: SemanticRequestPlan;
  /** The homeowner's answer to the "no A or B" question, applied to this same message (see parseDeterministicSemanticRequest). */
  readonly coordinationReading?: NegativeOrReading;
}): SliceExecutionResult {
  const { rawText, snapshot, auth } = input;
  const dynamicEntities = buildDynamicPlaceholderCandidates(snapshot, auth);
  const envelope = buildSemanticTextEnvelope(rawText, { dynamicEntities });
  const spanRoundTripOk = verifyPlaceholderSpanMapRoundTrip(envelope).ok;
  const plan = SemanticRequestPlanSchema.parse(
    input.planOverride ?? parseDeterministicSemanticRequest(rawText, { dynamicEntities, ...(input.coordinationReading ? { coordinationReading: input.coordinationReading } : {}) }),
  );
  return executeValidatedSlicePlan({
    rawText,
    envelope,
    spanRoundTripOk,
    plan,
    snapshot,
    auth,
    filterEntityIds: input.filterEntityIds,
  });
}

/** The two conditions of a "no A or B" question in plain words: "no X" for the one the negation applies to, "X" for the one that stands on its own. */
const NO_PHRASE = { warranty: 'no warranty', maintenance: 'no maintenance due' } as const;
const HAS_PHRASE = { warranty: 'a warranty', maintenance: 'maintenance due' } as const;

/**
 * The card for a bare "no A or B" (FR-PLAN-5: a question with two readings is asked, never guessed). Each button is a typed reading of the SAME message, with a plain label
 * built from the two conditions ("Items with no warranty, and items with maintenance due" / "Items with no warranty and no maintenance due"); pressing one re-runs the
 * data-point read with that reading, and the payload stays on the server. A question whose shape cannot be labelled safely (a room is also named, or the conditions are not
 * warranty and maintenance) is asked as a plain free-text question, with no buttons that could mislabel it.
 */
function negativeOrCard(envelope: SemanticTextEnvelope): { clarification: AskClarification; parameters: Record<string, unknown> } {
  const described = envelope.spanMap.some((entry) => entry.kind === 'ROOM') ? null : describeNegativeOrAmbiguity(envelope.rawText);
  if (!described) {
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    return {
      clarification: { version: 1, question: 'Your question can be read more than one way. Tell me which conditions you want, for example “no warranty and no maintenance due”.', options: [], allowFreeText: true, expiresAt },
      parameters: { clarification: { version: 1, expiresAt, candidateOperationIds: ['DATA_POINT_READ'] } },
    };
  }
  const [first, second] = described.operands;
  return buildPayloadClarification({
    question: 'Your question can be read two ways. Which do you mean?',
    options: [
      { operationId: 'DATA_POINT_READ', label: `Items with ${NO_PHRASE[first]}, and items with ${HAS_PHRASE[second]}`, payload: { kind: 'BOOLEAN_READING', reading: 'EITHER_OR' } },
      { operationId: 'DATA_POINT_READ', label: `Items with ${NO_PHRASE[first]} and ${NO_PHRASE[second]}`, payload: { kind: 'BOOLEAN_READING', reading: 'NEITHER_NOR' } },
    ],
  });
}

function buildNonExecutableResult(input: {
  readonly envelope: SemanticTextEnvelope;
  readonly spanRoundTripOk: boolean;
  readonly plan: SemanticRequestPlan;
}): SliceExecutionResult {
  const { envelope, spanRoundTripOk, plan } = input;
  const isBoundary = plan.outcome === 'BOUNDARY';
  const card = isBoundary ? negativeOrCard(envelope) : null;
  const operationResult: AskOperationResult = {
    status: isBoundary ? 'NEEDS_CLARIFICATION' : 'OUT_OF_SCOPE',
    reasonCode: isBoundary ? 'ASK_AMBIGUOUS_NEGATIVE_COORDINATION' : 'ASK_OUT_OF_SCOPE',
    blocks: [],
    suggestions: [],
    // The typed read that runs the chosen reading is the data-point read; the card's stored clarification (written by the card builder) is what a press is checked against.
    parameters: { retryable: false, actions: [], operationId: 'DATA_POINT_READ', ...(card?.parameters ?? {}) },
    confirmation: null,
    clarification: card?.clarification ?? null,
  };
  return {
    status: isBoundary ? 'NEEDS_CLARIFICATION' : 'OUT_OF_SCOPE',
    envelope,
    spanRoundTripOk,
    plan,
    entityResolution: null,
    receipt: null,
    entailment: null,
    presentationEquivalence: null,
    operationResult,
    redactedFields: [],
    traversalDepthUsed: 0,
    activeEntityIds: [],
  };
}

function executeValidatedSlicePlan(input: {
  readonly rawText: string;
  readonly envelope: SemanticTextEnvelope;
  readonly spanRoundTripOk: boolean;
  readonly plan: SemanticRequestPlan;
  readonly snapshot: SlicePropertySnapshot;
  readonly auth: SliceAuthorizationContext;
  readonly filterEntityIds?: readonly string[];
}): SliceExecutionResult {
  const { rawText, envelope, spanRoundTripOk, plan, snapshot, auth } = input;

  if (!auth.propertyAuthorized || auth.propertyId !== snapshot.propertyId) {
    return buildBlockedResult(
      rawText,
      envelope,
      spanRoundTripOk,
      plan,
      null,
      'You are not authorized to access records for this property.'
    );
  }

  if (
    plan.outcome !== 'MATCH'
    || plan.facets.length === 0
    || !plan.facets[0].confidenceSignals.grammarComplete
    || plan.unresolvedSpans.length > 0
  ) {
    return buildNonExecutableResult({ envelope, spanRoundTripOk, plan });
  }

  const facet = plan.facets[0];
  const canReadSensitive = auth.allowSensitiveFields ?? (auth.role === 'OWNER' || auth.role === 'EDITOR');
  const redactedFields = canReadSensitive ? [] : ['serialNumber', 'purchaseCostCents', 'replacementCostCents'];
  const restricted = new Set(auth.restrictedItemIds ?? []);

  // Resolve explicit item mention if present
  const mentionedItem = detectMentionedItem(rawText, snapshot);
  let entityResolution: PropertyEntityResolution | null = null;
  if (mentionedItem) {
    entityResolution = resolvePropertyEntityReference({
      entityId: 'entity.inventory_item',
      mention: mentionedItem,
      applicable: true,
      candidates: buildItemCandidates(snapshot, auth),
    });
    if (
      entityResolution.outcome === 'UNAUTHORISED'
      || entityResolution.outcome === 'MISSING'
      || entityResolution.outcome === 'NOT_APPLICABLE'
    ) {
      const operationResult: AskOperationResult = {
        status: 'NEEDS_CLARIFICATION',
        reasonCode: 'ASK_ENTITY_MISSING',
        blocks: [],
        suggestions: [],
        parameters: { retryable: false, operationId: 'INVENTORY_ITEMS_READ' },
        confirmation: null,
        clarification: null,
      };
      return {
        status: 'NEEDS_CLARIFICATION',
        envelope,
        spanRoundTripOk,
        plan,
        entityResolution,
        receipt: null,
        entailment: null,
        presentationEquivalence: null,
        operationResult,
        redactedFields,
        traversalDepthUsed: 0,
        activeEntityIds: [],
      };
    }
  }

  // 1. CAPABILITY: Replacement guidance
  if (facet.requestClass === 'CAPABILITY' && facet.evidence.jobMatch === 'job.inventory.replacement_guidance') {
    const boundSubjectItemId = facet.subject?.entityId === 'entity.inventory_item' ? facet.subject.recordId : null;
    const targetItem = entityResolution?.outcome === 'RESOLVED'
      ? snapshot.items.find((item) => item.id === entityResolution.recordId)
      : boundSubjectItemId
        ? snapshot.items.find((item) => item.id === boundSubjectItemId)
        : snapshot.items.find((item) => !restricted.has(item.id));
    if (!targetItem || restricted.has(targetItem.id)) {
      return buildBlockedResult(rawText, envelope, spanRoundTripOk, plan, entityResolution, 'Target item is not accessible.');
    }
    const warranty = evaluateWarrantyState(targetItem);
    const hasActiveWarranty = warranty.state === 'ITEM_WARRANTY_LINKED' || warranty.state === 'BOTH_CONSISTENT';
    const recommendation = targetItem.condition === 'REPLACE_SOON' || targetItem.condition === 'POOR_CONDITION'
      ? (hasActiveWarranty ? 'Check warranty claim eligibility before scheduling replacement.' : 'Plan replacement based on condition and estimated cost.')
      : 'Repair and routine maintenance are recommended before replacement.';
    const costText = formatMoneyCents(targetItem.replacementCostCents, !canReadSensitive);
    const answerVariantId = 'phase2a-replacement-guidance-summary';
    const receipt = buildSemanticReadReceipt({
      facetId: facet.id,
      requestClass: 'CAPABILITY',
      entityId: 'entity.inventory_item',
      operationAdapter: 'phase2a-replacement-guidance',
      projection: 'DETAIL',
      predicateIds: ['capability.inventory.replacement_guidance'],
      resolvedRecordIds: [targetItem.id],
      confirmedCount: 1,
      displayedCount: 1,
      propertyId: snapshot.propertyId,
      role: auth.role,
      sourceType: 'PROPERTY_INVENTORY_AND_WARRANTY',
      observedAt: `${snapshot.asOfDate}T00:00:00.000Z`,
      answerVariantId,
    });
    const rows: SlicePresentationRow[] = [{
      id: targetItem.id,
      label: targetItem.name,
      subtitle: `${recommendation} Estimated replacement: ${costText}.`,
      description: `${recommendation} Estimated replacement: ${costText}.`,
      meta: [targetItem.category, [targetItem.brand, targetItem.modelNumber].filter(Boolean).join(' ') || 'Not recorded'],
      stateCode: targetItem.condition ?? 'GOOD_CONDITION',
      groupKey: 'Replacement Guidance',
    }];
    const blocks = buildSliceRichPresentation({
      receipt,
      title: `Replacement guidance for ${targetItem.name}`,
      summaryBody: `${recommendation} Estimated replacement cost: ${costText}.`,
      rows,
      listId: 'inventory-results',
      listTitle: `${targetItem.name} details`,
      listDescription: 'Open the item for its full home-record details',
    });
    const operationResult: AskOperationResult = {
      status: 'ANSWERED',
      blocks,
      suggestions: [],
      parameters: { semanticExecutionReceipt: receipt, redactedFields, operationId: 'REPLACEMENT_GUIDANCE' },
      confirmation: null,
      clarification: null,
    };
    return {
      status: 'ANSWERED',
      envelope,
      spanRoundTripOk,
      plan,
      entityResolution,
      receipt,
      entailment: verifySemanticReadReceiptEntailment(operationResult),
      presentationEquivalence: verifyRichPresentationPopulationEquivalence(receipt, blocks),
      operationResult,
      redactedFields,
      traversalDepthUsed: 1,
      activeEntityIds: [targetItem.id],
    };
  }

  // 2. COMMAND: Maintenance task creation preview
  if (facet.requestClass === 'COMMAND' && facet.evidence.jobMatch === 'job.maintenance.create') {
    if (auth.role === 'VIEWER') {
      return buildBlockedResult(
        rawText,
        envelope,
        spanRoundTripOk,
        plan,
        entityResolution,
        'Viewer role cannot create or schedule maintenance tasks.'
      );
    }
    const targetItem = entityResolution?.outcome === 'RESOLVED'
      ? snapshot.items.find((item) => item.id === entityResolution.recordId)
      : undefined;
    const dueDate = facet.time?.kind === 'EXACT_DATE' ? facet.time.isoDate : null;
    const missingSlots: string[] = [];
    if (!targetItem) missingSlots.push('inventoryItemId');
    if (!dueDate) missingSlots.push('dueDate');

    const candidateEntityResolution: AskEntityResolutionResult | null = targetItem
      ? ({
          resolvedEntity: { entityType: 'INVENTORY_ITEM', entityId: targetItem.id, label: targetItem.name },
          missingSlots,
        } as unknown as AskEntityResolutionResult)
      : ({ missingSlots } as unknown as AskEntityResolutionResult);

    const previewTitle = targetItem ? `Service ${targetItem.name}` : 'Maintenance task';
    const confirmationVersion = 1;
    const confirmationExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const previewParams = targetItem && dueDate
      ? {
          propertyId: snapshot.propertyId,
          inventoryItemId: targetItem.id,
          maintenanceWorkflowVersion: snapshot.maintenanceWorkflowVersion ?? 'phase2a-snapshot-v1',
          maintenanceTitle: previewTitle,
          maintenanceDescription: `Scheduled via Ask for ${targetItem.name}`,
          maintenancePriority: 'MEDIUM',
          maintenanceNextDueDate: dueDate,
          maintenanceIsRecurring: false,
          confirmationVersion,
          confirmationExpiresAt,
        }
      : {};

    const validConfirmation = targetItem && dueDate
      ? AskConfirmationSchema.parse({
          confirmationId: 'phase2a-maint-preview-1',
          version: confirmationVersion,
          title: `Create maintenance task: ${previewTitle}?`,
          description: 'This command creates a task in the canonical Maintenance record.',
          fields: [
            { label: 'Task', value: previewTitle },
            { label: 'Item', value: targetItem.name },
            { label: 'Due date', value: dueDate },
            { label: 'Priority', value: 'Medium' },
          ],
          editableFields: [],
          confirmLabel: 'Create maintenance task',
          consentText: 'I authorize creating this maintenance task in the shared Maintenance record.',
          expiresAt: confirmationExpiresAt,
        })
      : null;

    const draftResult: AskOperationResult = {
      status: 'NEEDS_CONFIRMATION',
      blocks: [],
      suggestions: [],
      parameters: previewParams,
      confirmation: validConfirmation,
      clarification: null,
    };

    const gated = gateUncertifiedCommandPreview({
      operationId: 'MAINTENANCE_TASK_CREATE',
      message: rawText,
      routedDeterministically: true,
      operationConfirmedByUser: false,
      entityResolution: candidateEntityResolution,
      result: draftResult,
    });

    return {
      status: gated.result.status === 'NEEDS_CONFIRMATION' ? 'NEEDS_CONFIRMATION' : 'NEEDS_CLARIFICATION',
      envelope,
      spanRoundTripOk,
      plan,
      entityResolution,
      receipt: null,
      entailment: null,
      presentationEquivalence: null,
      operationResult: gated.result,
      redactedFields,
      traversalDepthUsed: targetItem ? 1 : 0,
      activeEntityIds: targetItem ? [targetItem.id] : [],
    };
  }

  // 3. DATA_QUERY: Maintenance task list / due-date queries
  if (facet.subject?.entityId === 'entity.maintenance_task') {
    const accessibleItemsById = new Map(
      snapshot.items.filter((item) => !restricted.has(item.id)).map((item) => [item.id, item])
    );
    const isNegative = facet.polarity === 'NEGATIVE';
    const dueStatus = facet.time?.kind === 'DUE_STATUS' ? facet.time.status : null;
    const matchingTasks = snapshot.maintenanceTasks.filter((task) => {
      if (task.inventoryItemId && restricted.has(task.inventoryItemId)) return false;
      if (entityResolution?.outcome === 'RESOLVED' && task.inventoryItemId !== entityResolution.recordId) return false;
      if (dueStatus === 'OVERDUE') {
        const isOverdue = task.status === 'PAST_DUE'
          || (task.status !== 'COMPLETED' && Boolean(task.nextDueDate) && task.nextDueDate < snapshot.asOfDate);
        return isNegative ? !isOverdue : isOverdue;
      }
      if (dueStatus === 'DUE') {
        const isDue = task.status !== 'COMPLETED';
        return isNegative ? !isDue : isDue;
      }
      return true;
    });

    const projection = facet.projection === 'COUNT' ? 'COUNT' : 'LIST';
    const answerVariantId = 'phase2a-maintenance-summary';
    const receipt = buildSemanticReadReceipt({
      facetId: facet.id,
      requestClass: 'DATA_QUERY',
      entityId: 'entity.maintenance_task',
      operationAdapter: 'phase2a-slice-executor',
      projection,
      predicateIds: ['predicate.maintenance_task.for_inventory_item'],
      resolvedRecordIds: matchingTasks.map((task) => task.id),
      confirmedCount: matchingTasks.length,
      displayedCount: projection === 'COUNT' ? 0 : matchingTasks.length,
      propertyId: snapshot.propertyId,
      role: auth.role,
      sourceType: 'PROPERTY_MAINTENANCE_TASKS',
      observedAt: `${snapshot.asOfDate}T00:00:00.000Z`,
      answerVariantId,
    });
    // Action Enrichment FRD: an open task gets Complete and Reschedule from the registry (a viewer gets neither; confirmation re-authorizes either way).
    const taskEnrichment = projection === 'COUNT' ? null : enrichRowActions({
      sourceOperationId: 'DATA_POINT_READ',
      role: auth.role,
      presentation: 'MAINTENANCE_RESULT_LIST',
      rows: matchingTasks.map((task) => ({
        id: task.id, label: task.title, entityType: 'MAINTENANCE_TASK',
        states: task.status === 'PENDING' || task.status === 'IN_PROGRESS' || task.status === 'PAST_DUE' ? ['maintenance:OPEN'] : [],
      })),
    });
    const rows: SlicePresentationRow[] = projection === 'COUNT'
      ? []
      : matchingTasks.map((task) => {
          const item = task.inventoryItemId ? accessibleItemsById.get(task.inventoryItemId) : undefined;
          const taskActions = taskEnrichment?.actionsByRowId.get(task.id);
          return {
            ...(taskActions ? { entityType: 'MAINTENANCE_TASK', actions: taskActions } : {}),
            id: task.id,
            label: task.title,
            subtitle: `Due ${task.nextDueDate}${item ? ` · Item: ${item.name}` : ''}`,
            description: item ? `Linked to ${item.name}` : undefined,
            meta: [
              `Due ${task.nextDueDate}`,
              `${task.priority.toLowerCase()} priority`,
              task.estimatedCostCents != null ? `Estimated cost ${formatMoneyCents(task.estimatedCostCents, false)}` : 'Estimated cost not recorded',
            ],
            stateCode: task.status,
            groupKey: task.priority,
          };
        });
    const blocks = buildSliceRichPresentation({
      receipt,
      title: projection === 'COUNT' ? `${matchingTasks.length} maintenance tasks matched` : 'Maintenance tasks',
      summaryBody: `Found ${matchingTasks.length} matching maintenance task${matchingTasks.length === 1 ? '' : 's'}.`,
      rows,
      listId: 'maintenance-groups',
      listTitle: `${matchingTasks.length} matching maintenance ${matchingTasks.length === 1 ? 'task' : 'tasks'}`,
      listDescription: 'Open a task to review its schedule, cost, status, and actions',
    });
    const operationResult: AskOperationResult = {
      status: 'ANSWERED',
      blocks,
      suggestions: [],
      parameters: { semanticExecutionReceipt: receipt, redactedFields, operationId: 'MAINTENANCE_STATUS' },
      confirmation: null,
      clarification: null,
    };
    return {
      status: 'ANSWERED',
      envelope,
      spanRoundTripOk,
      plan,
      entityResolution,
      receipt,
      entailment: verifySemanticReadReceiptEntailment(operationResult),
      presentationEquivalence: verifyRichPresentationPopulationEquivalence(receipt, blocks),
      operationResult,
      redactedFields,
      traversalDepthUsed: entityResolution?.outcome === 'RESOLVED' ? 1 : 0,
      activeEntityIds: matchingTasks.map((task) => task.id),
    };
  }

  // 4. DATA_QUERY: Inventory item facts, counts, Boolean expressions, and bounded relations
  const relationPathIds = facet.relations.map((rel) =>
    rel.semanticRelationId === 'relation.inventory_item.warranty'
      ? 'path.inventory_item.warranty'
      : rel.semanticRelationId === 'relation.inventory_item.maintenance_task'
        ? 'path.inventory_item.maintenance_task'
        : rel.semanticRelationId === 'relation.inventory_item.age'
          ? 'path.inventory_item.age'
          : 'path.inventory_item.room'
  );
  const effectiveTraversalCheck = validateSiblingDepthOnePredicates(relationPathIds);
  if (!effectiveTraversalCheck.ok) {
    return buildBlockedResult(
      rawText,
      envelope,
      spanRoundTripOk,
      plan,
      entityResolution,
      `Relation traversal rejected (${effectiveTraversalCheck.reason}).`
    );
  }

  const filterSet = input.filterEntityIds ? new Set(input.filterEntityIds) : null;
  const boundSubjectItemId = facet.subject?.entityId === 'entity.inventory_item' ? facet.subject.recordId : null;

  const authorisedItems = snapshot.items.filter((item) => {
    if (restricted.has(item.id)) return false;
    if (filterSet && !filterSet.has(item.id)) return false;
    if (entityResolution?.outcome === 'RESOLVED' && item.id !== entityResolution.recordId) return false;
    if (boundSubjectItemId && item.id !== boundSubjectItemId) return false;
    return true;
  });

  const evaluated = authorisedItems.map((item) => ({
    item,
    warranty: evaluateWarrantyState(item),
  }));

  // An item with no recorded install date is evaluated as old and as not old; if the answer differs it depends on the missing date, so the item is unknown:
  // not matched, and counted apart, never silently treated as "not old" (which would match "not older than 10 years" for every undated item).
  const ageUnknownIds = new Set<string>();
  const ageInPlay = hasAgePredicate(facet.where);
  const matched = facet.where
    ? evaluated.filter(({ item, warranty }) => {
        if (ageInPlay && isOlderThanYears(item, 1, snapshot.asOfDate) === null) {
          const ifOlder = evaluateWhereExpression(facet.where!, item, warranty, snapshot, 'ASSUME_OLDER');
          const ifNot = evaluateWhereExpression(facet.where!, item, warranty, snapshot, 'ASSUME_NOT_OLDER');
          if (ifOlder !== ifNot) { ageUnknownIds.add(item.id); return false; }
          return ifOlder;
        }
        return evaluateWhereExpression(facet.where!, item, warranty, snapshot);
      })
    : evaluated;

  const conflictedCount = facet.relations.some((r) => r.semanticRelationId === 'relation.inventory_item.warranty')
    ? evaluated.filter(({ warranty }) => warranty.state === 'CONFLICTED_LINKS').length
    : 0;
  const warrantyUnknownIds = facet.relations.some((r) => r.semanticRelationId === 'relation.inventory_item.warranty')
    ? new Set(evaluated.filter(({ warranty }) => warranty.state === 'UNKNOWN').map(({ item }) => item.id))
    : new Set<string>();
  const unknownCount = new Set([...warrantyUnknownIds, ...ageUnknownIds]).size;

  const projection = facet.projection === 'COUNT' ? 'COUNT'
    : facet.projection === 'DETAIL' ? 'DETAIL'
    : 'LIST';
  const predicateIds = facet.relations.length > 0
    ? facet.relations.map((rel) => rel.predicateId)
    : facet.fields.length > 0
      ? facet.fields.map((field) => field.fieldId)
      : ['predicate.entity.inventory_item.read'];

  const answerVariantId = 'phase2a-inventory-summary';
  const receipt = buildSemanticReadReceipt({
    facetId: facet.id,
    requestClass: 'DATA_QUERY',
    entityId: 'entity.inventory_item',
    operationAdapter: 'phase2a-slice-executor',
    projection,
    predicateIds,
    resolvedRecordIds: matched.map(({ item }) => item.id),
    confirmedCount: matched.length,
    conflictedCount,
    unknownCount,
    displayedCount: projection === 'COUNT' ? 0 : matched.length,
    propertyId: snapshot.propertyId,
    role: auth.role,
    sourceType: 'PROPERTY_INVENTORY_AND_RELATIONS',
    observedAt: `${snapshot.asOfDate}T00:00:00.000Z`,
    answerVariantId,
  });

  const requestedFields = new Set(facet.fields.map((field) => field.fieldId));
  const rows: SlicePresentationRow[] = projection === 'COUNT'
    ? []
    : matched.map(({ item, warranty }) => {
        const room = snapshot.rooms.find((r) => r.id === item.roomId);
        const parts: string[] = [];
        if (room) parts.push(`Room: ${room.name}`);
        if (requestedFields.has('field.inventory_item.serial_number')) {
          parts.push(`Serial: ${canReadSensitive ? (item.serialNumber ?? 'not recorded') : '[redacted for current role]'}`);
        }
        if (requestedFields.has('field.inventory_item.purchase_cost')) {
          parts.push(`Purchase cost: ${formatMoneyCents(item.purchaseCostCents, !canReadSensitive)}`);
        }
        if (requestedFields.has('field.inventory_item.replacement_cost')) {
          parts.push(`Replacement cost: ${formatMoneyCents(item.replacementCostCents, !canReadSensitive)}`);
        }
        if (requestedFields.has('field.inventory_item.installed_on')) {
          parts.push(`Installed: ${item.installedOn ?? 'not recorded'}`);
        }
        if (parts.length === 0) {
          parts.push(`Category: ${item.category}`);
        }
        return {
          id: item.id,
          label: item.name,
          subtitle: parts.join(' · '),
          description: ageInPlay
            ? (() => {
              const age = installedAgeYears(item, snapshot.asOfDate);
              return age === null ? 'Age not recorded' : `${age} ${age === 1 ? 'year' : 'years'} old · Installed ${item.installedOn}`;
            })()
            : undefined,
          meta: [
            room?.name ?? item.category,
            [item.brand, item.modelNumber].filter(Boolean).join(' ') || 'Not recorded',
          ],
          stateCode: facet.relations.some((r) => r.semanticRelationId === 'relation.inventory_item.warranty')
            ? warranty.state
            : item.condition,
          groupKey: room?.name ?? item.category,
        };
      });

  const isWarrantyRelation = facet.relations.some((r) => r.semanticRelationId === 'relation.inventory_item.warranty');
  // Action Enrichment FRD: each row whose warranty state establishes "no linked warranty recorded" gets the governed next step, decided per row by the
  // registry. A row in another state (explicit no coverage, unknown, conflicted) gets none, and a viewer gets no write action.
  // An aging row (installed longer ago than the age the homeowner asked about, with a recorded install date) is also offered "Review replacement".
  const askedAges = positiveAgeThresholds(facet.where);
  const youngestAskedAge = askedAges.length > 0 ? Math.min(...askedAges) : null;
  // Every row-bearing list is enriched: the same grounded item state yields the same next step whatever the question mentioned.
  const enrichment = projection !== 'COUNT'
    ? enrichRowActions({
      sourceOperationId: 'DATA_POINT_READ',
      role: auth.role,
      presentation: 'INVENTORY_RESULT_LIST',
      rows: matched.map(({ item, warranty }) => ({
        id: item.id,
        label: item.name,
        entityType: 'INVENTORY_ITEM',
        states: [
          ...(isWarrantyRelation ? [`warranty:${warranty.state}`] : []),
          ...(youngestAskedAge !== null && isOlderThanYears(item, youngestAskedAge, snapshot.asOfDate) === true ? ['age:OLDER_THAN_ASKED'] : []),
          // The one shared judgement of fields INVENTORY_ITEM_CORRECT can fill (brand, model, serial number, purchase date).
          ...(missingCorrectableFields(item).length > 0 ? ['details:MISSING'] : []),
        ],
      })),
    })
    : null;
  const presentedRows: SlicePresentationRow[] = enrichment
    ? rows.map((row) => {
      const actions = enrichment.actionsByRowId.get(row.id);
      return actions ? { ...row, entityType: 'INVENTORY_ITEM', actions } : row;
    })
    : rows;
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
  let title = projection === 'COUNT'
    ? `${matched.length} matching inventory items`
    : matched.length === 1 && projection === 'DETAIL'
      ? `${matched[0].item.name} details`
      : 'Inventory results';
  let summaryBody = projection === 'COUNT'
    ? `Confirmed count: ${matched.length} matching item${matched.length === 1 ? '' : 's'}.`
    : `Found ${matched.length} matching inventory item${matched.length === 1 ? '' : 's'}.`;
  if ((ageInPlay || facet.relations.length > 1) && facet.where) {
    // A condition tree with more than one condition is described as a whole: warranty wording alone would call old items "unwarranted" and would not say that the
    // answer was also limited to certain rooms.
    const n = matched.length;
    const names = `${matched.slice(0, 10).map(({ item }) => item.name).join('; ')}${n > 10 ? `; and ${n - 10} more` : ''}`;
    const condition = describeWhere(facet.where, snapshot);
    const lines: string[] = [`Matching: ${condition}.`];
    if (facet.projection === 'EXISTS') {
      lines.push(n > 0 ? `Yes. ${n} ${plural(n, 'item matches', 'items match')}.` : ageUnknownIds.size > 0 ? 'Missing install dates could change the answer, so I cannot give a plain yes or no.' : 'No. No item matches.');
    } else if (n === 0) {
      lines.push('No inventory item is confirmed as matching.');
    } else if (projection === 'COUNT') {
      lines.push(`${n} of your items ${plural(n, 'matches', 'match')}.`);
    } else {
      lines.push(`${names} ${plural(n, 'matches', 'match')}.`);
    }
    if (ageUnknownIds.size > 0) lines.push(`${ageUnknownIds.size} ${plural(ageUnknownIds.size, 'item has', 'items have')} no install date recorded, so I couldn’t tell whether ${plural(ageUnknownIds.size, 'it matches', 'they match')} and ${plural(ageUnknownIds.size, 'it is', 'they are')} not counted either way.`);
    if (warrantyUnknownIds.size > 0) lines.push(`${warrantyUnknownIds.size} ${plural(warrantyUnknownIds.size, 'item has', 'items have')} an unknown warranty state and ${plural(warrantyUnknownIds.size, 'is', 'are')} not counted either way.`);
    if (facet.relations.some((r) => r.semanticRelationId === 'relation.inventory_item.warranty')) lines.push('Warranty conditions describe links recorded for each item; they do not decide whether warranty terms cover the item.');
    summaryBody = lines.join(' ');
    title = facet.projection === 'EXISTS'
      ? (n > 0 ? `Yes, ${plural(n, 'one item matches', `${n} items match`)}` : 'No item is confirmed as matching')
      : projection === 'COUNT' ? `${n} ${plural(n, 'item matches', 'items match')}` : n === 0 ? 'No items confirmed as matching' : 'Items that match your question';
  } else if (isWarrantyRelation) {
    // FR-QUERY-3/7 wording: a linked record is not proof of coverage, absence of a link is not proof there is none, and conflicted
    // or unknown records are named separately instead of being added to the confirmed answer.
    const negative = facet.polarity === 'NEGATIVE';
    const linkPhrase = negative ? 'no warranty linked in your home record' : 'a warranty linked in your home record';
    const n = matched.length;
    const names = `${matched.slice(0, 10).map(({ item }) => item.name).join('; ')}${n > 10 ? `; and ${n - 10} more` : ''}`;
    const lines: string[] = [];
    if (facet.projection === 'EXISTS') {
      lines.push(n > 0
        ? `Yes. ${n} ${plural(n, 'item has', 'items have')} ${linkPhrase}.`
        : conflictedCount > 0 || unknownCount > 0
          ? 'The recorded conflicts or unknown states could change the answer, so I cannot give a plain yes or no.'
          : `No. No item has ${linkPhrase}.`);
    } else if (n === 0) {
      lines.push(`No inventory item is confirmed as having ${linkPhrase}.`);
    } else if (projection === 'COUNT') {
      lines.push(`${n} of your items ${plural(n, 'has', 'have')} ${linkPhrase}.`);
    } else {
      lines.push(`${names} ${plural(n, 'has', 'have')} ${linkPhrase}.`);
    }
    if (conflictedCount > 0) lines.push(`${conflictedCount} ${plural(conflictedCount, 'item has', 'items have')} conflicting warranty links and ${plural(conflictedCount, 'is', 'are')} shown separately from the confirmed count.`);
    if (unknownCount > 0) lines.push(`${unknownCount} ${plural(unknownCount, 'item has', 'items have')} an unknown warranty state and ${plural(unknownCount, 'is', 'are')} not counted either way.`);
    lines.push(negative
      ? 'This describes links recorded for each item; it does not decide whether warranty terms cover the item.'
      : 'A linked record does not by itself establish that warranty terms cover the item.');
    summaryBody = lines.join(' ');
    title = facet.projection === 'EXISTS'
      ? (n > 0 ? `Yes, ${plural(n, 'one item has', `${n} items have`)} ${negative ? 'no linked warranty record' : 'a linked warranty record'}` : negative ? 'No item is confirmed without a linked warranty record' : 'No item is confirmed with a linked warranty record')
      : projection === 'COUNT'
        ? `${n} ${plural(n, 'item has', 'items have')} ${negative ? 'no linked warranty record' : 'a linked warranty record'}`
        : negative ? 'Items without a linked warranty record' : 'Items with a linked warranty record';
  }

  const blocks = buildSliceRichPresentation({
    receipt,
    title,
    summaryBody,
    rows: presentedRows,
    ...(enrichment && enrichment.overflowCount > 0 ? { overflowNote: actionEnrichmentOverflowCopy(enrichment.overflowCount) } : {}),
    // Semantic inventory reads are still ordinary inventory records. Giving
    // them the canonical list identity enables the existing compact table and
    // live item-detail disclosure instead of the generic label-only cards.
    listId: 'inventory-results',
    listTitle: projection === 'COUNT'
      ? title
      : `${matched.length} matching ${plural(matched.length, 'appliance', 'appliances')}`,
    // The summary and section heading already state the count. Repeating it with an "open any item" instruction made the compact result visually top-heavy.
    listDescription: undefined,
  });

  const operationResult: AskOperationResult = {
    status: 'ANSWERED',
    blocks,
    suggestions: [],
    parameters: { semanticExecutionReceipt: receipt, redactedFields, operationId: 'INVENTORY_ITEMS_READ' },
    confirmation: null,
    clarification: null,
  };

  return {
    status: 'ANSWERED',
    envelope,
    spanRoundTripOk,
    plan,
    entityResolution,
    receipt,
    entailment: verifySemanticReadReceiptEntailment(operationResult),
    presentationEquivalence: verifyRichPresentationPopulationEquivalence(receipt, blocks),
    operationResult,
    redactedFields,
    traversalDepthUsed: effectiveTraversalCheck.depth,
    activeEntityIds: matched.map(({ item }) => item.id),
  };
}

/**
 * Semantic follow-up refinement preserving prior active entity population and
 * applying a follow-up constraint or projection change (e.g. "how many", "without warranty", "in kitchen").
 */
export function applySliceFollowUpRefinement(input: {
  readonly priorResult: SliceExecutionResult;
  readonly followUpText: string;
  readonly snapshot: SlicePropertySnapshot;
  readonly auth: SliceAuthorizationContext;
}): SliceExecutionResult {
  const { priorResult, followUpText, snapshot, auth } = input;
  const baseIds = priorResult.activeEntityIds;
  const dynamicEntities = buildDynamicPlaceholderCandidates(snapshot, auth);
  const delta = extractSemanticFollowUpDelta(followUpText, { dynamicEntities });
  if (delta.outcome !== 'APPLICABLE') {
    const followUpEnvelope = buildSemanticTextEnvelope(followUpText, { dynamicEntities });
    const rejectedPlan = SemanticRequestPlanSchema.parse({
      ...priorResult.plan,
      outcome: delta.outcome === 'INSUFFICIENT_TEXT' ? 'INSUFFICIENT_TEXT' : 'NONE_FITS',
      rawText: followUpText,
      normalizedText: followUpEnvelope.normalizedText,
      minimizedText: followUpEnvelope.minimizedText,
      facets: [],
      unresolvedSpans: [...delta.unresolvedSpans],
    });
    return buildNonExecutableResult({
      envelope: followUpEnvelope,
      spanRoundTripOk: verifyPlaceholderSpanMapRoundTrip(followUpEnvelope).ok,
      plan: rejectedPlan,
    });
  }
  const priorFacet = priorResult.plan.facets[0];
  if (!priorFacet) {
    return executeSemanticSlice({
      rawText: followUpText,
      snapshot,
      auth,
      filterEntityIds: baseIds.length > 0 ? baseIds : undefined,
    });
  }

  const mergedRelations = [...priorFacet.relations];
  for (const rel of delta.relations) {
    if (!mergedRelations.some((existing) => existing.semanticRelationId === rel.semanticRelationId && existing.predicateId === rel.predicateId)) {
      mergedRelations.push(rel);
    }
  }
  const mergedWhere: SemanticWhereExpression | null = delta.where
    ? priorFacet.where
      ? { kind: 'AND', operands: [priorFacet.where, delta.where] }
      : delta.where
    : priorFacet.where;

  const refinedPlan = SemanticRequestPlanSchema.parse({
    ...priorResult.plan,
    facets: [
      {
        ...priorFacet,
        projection: delta.projection ?? priorFacet.projection,
        polarity: delta.polarity ?? priorFacet.polarity,
        time: delta.time ?? priorFacet.time,
        relations: mergedRelations,
        where: mergedWhere,
      },
    ],
  });

  return executeValidatedSlicePlan({
    rawText: priorResult.plan.rawText,
    envelope: priorResult.envelope,
    spanRoundTripOk: priorResult.spanRoundTripOk,
    plan: refinedPlan,
    snapshot,
    auth,
    filterEntityIds: baseIds.length > 0 ? baseIds : undefined,
  });
}

/**
 * Authorization replay: re-evaluates the prior request under an updated
 * authorization context (e.g. role downgrade or item/property access revocation),
 * redacting sensitive fields or blocking unauthorized access.
 */
export function replaySliceExecutionWithAuthorization(input: {
  readonly priorResult: SliceExecutionResult;
  readonly snapshot: SlicePropertySnapshot;
  readonly updatedAuth: SliceAuthorizationContext;
}): SliceExecutionResult {
  return executeSemanticSlice({
    rawText: input.priorResult.plan.rawText,
    snapshot: input.snapshot,
    auth: input.updatedAuth,
  });
}

function normalizeSliceRole(role: string): SliceAuthorizationContext['role'] {
  const upper = role.toUpperCase();
  if (upper === 'OWNER' || upper === 'ADMIN') return 'OWNER';
  if (upper === 'EDITOR' || upper === 'MEMBER') return 'EDITOR';
  return 'VIEWER';
}

/**
 * Loads a property's inventory, room, warranty, and maintenance records from Prisma
 * into the typed SlicePropertySnapshot contract.
 */
export async function loadSlicePropertySnapshot(propertyId: string): Promise<SlicePropertySnapshot> {
  const [rooms, items, warranties, documents, maintenanceTasks, workflowVersion] = await Promise.all([
    prisma.inventoryRoom.findMany({
      where: { propertyId },
      select: { id: true, propertyId: true, name: true },
    }),
    prisma.inventoryItem.findMany({
      where: { propertyId, ...visibleInventoryItemWhere() },
      select: {
        id: true,
        propertyId: true,
        name: true,
        category: true,
        brand: true,
        modelNumber: true,
        serialNumber: true,
        purchaseCostCents: true,
        replacementCostCents: true,
        installedOn: true,
        purchasedOn: true,
        condition: true,
        roomId: true,
        coverageEvidenceStatus: true,
        warrantyApplicabilities: {
          where: { propertyId, status: 'COVERED', warranty: { scopeKind: 'PROPERTY_PLAN' } },
          select: { warrantyId: true },
        },
      },
    }),
    prisma.warranty.findMany({
      where: { propertyId },
      select: { id: true, inventoryItemId: true },
    }),
    prisma.document.findMany({
      where: { propertyId, inventoryItemId: { not: null }, deletedAt: null },
      select: { id: true, inventoryItemId: true, type: true, name: true, description: true, metadata: true },
    }),
    prisma.propertyMaintenanceTask.findMany({
      where: { propertyId },
      select: {
        id: true,
        propertyId: true,
        title: true,
        status: true,
        priority: true,
        nextDueDate: true,
        inventoryItemId: true,
        actualCost: true,
        estimatedCost: true,
        lastCompletedDate: true,
      },
    }),
    (await import('../../handlers/maintenance.handler')).maintenanceWorkflowVersion(propertyId),
  ]);

  const warrantiesByItem = new Map<string, string[]>();
  for (const w of warranties) {
    if (!w.inventoryItemId) continue;
    const list = warrantiesByItem.get(w.inventoryItemId) ?? [];
    list.push(w.id);
    warrantiesByItem.set(w.inventoryItemId, list);
  }
  const receiptsByItem = new Map<string, string>();
  for (const document of documents) {
    if (!document.inventoryItemId) continue;
    const metadata = document.metadata && typeof document.metadata === 'object' ? document.metadata as Record<string, unknown> : null;
    const kind = String(metadata?.documentKind ?? metadata?.kind ?? metadata?.category ?? metadata?.role ?? '').toUpperCase();
    const hint = `${String(document.name ?? '')} ${String(document.description ?? '')} ${kind}`;
    if (String(document.type).toUpperCase() === 'INVOICE' || kind === 'RECEIPT' || /\breceipt\b|\binvoice\b|\bpurchase\b/i.test(hint)) {
      if (!receiptsByItem.has(document.inventoryItemId)) receiptsByItem.set(document.inventoryItemId, document.id);
    }
  }

  return {
    propertyId,
    asOfDate: new Date().toISOString().slice(0, 10),
    maintenanceWorkflowVersion: workflowVersion,
    rooms: rooms.map((room) => ({
      id: room.id,
      propertyId: room.propertyId,
      name: room.name,
    })),
    items: items.map((item) => ({
      id: item.id,
      propertyId: item.propertyId,
      name: item.name,
      category: String(item.category),
      brand: item.brand ?? undefined,
      modelNumber: item.modelNumber ?? undefined,
      serialNumber: item.serialNumber ?? undefined,
      purchaseCostCents: item.purchaseCostCents ?? null,
      replacementCostCents: item.replacementCostCents ?? null,
      installedOn: item.installedOn ? item.installedOn.toISOString().slice(0, 10) : null,
      purchasedOn: item.purchasedOn ? item.purchasedOn.toISOString().slice(0, 10) : null,
      condition: String(item.condition),
      roomId: item.roomId ?? null,
      propertyPlanWarrantyId: item.warrantyApplicabilities[0]?.warrantyId ?? null,
      itemWarrantyIds: warrantiesByItem.get(item.id) ?? [],
      receiptDocumentId: receiptsByItem.get(item.id) ?? null,
      coverageEvidenceStatus: String(item.coverageEvidenceStatus ?? 'UNKNOWN'),
    })),
    maintenanceTasks: maintenanceTasks.map((task) => ({
      id: task.id,
      propertyId: task.propertyId,
      title: task.title,
      status: String(task.status),
      priority: String(task.priority),
      nextDueDate: task.nextDueDate ? task.nextDueDate.toISOString().slice(0, 10) : '',
      inventoryItemId: task.inventoryItemId ?? null,
      actualCostCents: task.actualCost === null || task.actualCost === undefined ? null : Math.round(Number(task.actualCost) * 100),
      estimatedCostCents: task.estimatedCost === null || task.estimatedCost === undefined ? null : Math.round(Number(task.estimatedCost) * 100),
      completedOn: task.lastCompletedDate ? task.lastCompletedDate.toISOString().slice(0, 10) : null,
    })),
  };
}

/**
 * Production entry point connecting Phase 2A vertical-slice execution to real
 * Prisma-backed property records and authorization context.
 */
export async function executeSliceOnProperty(input: {
  readonly propertyId: string;
  readonly role: string;
  readonly propertyAuthorized: boolean;
  readonly rawText: string;
  readonly restrictedItemIds?: readonly string[];
  readonly coordinationReading?: NegativeOrReading;
}): Promise<SliceExecutionResult> {
  const snapshot = await loadSlicePropertySnapshot(input.propertyId);
  return executeSemanticSlice({
    rawText: input.rawText,
    ...(input.coordinationReading ? { coordinationReading: input.coordinationReading } : {}),
    snapshot,
    auth: {
      propertyId: input.propertyId,
      role: normalizeSliceRole(input.role),
      propertyAuthorized: input.propertyAuthorized,
      restrictedItemIds: input.restrictedItemIds,
    },
  });
}
