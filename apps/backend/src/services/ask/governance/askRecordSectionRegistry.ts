import type { HouseholdRole } from '@prisma/client';
import type { AskOperatingMode } from '../../skills/context/propertyJourneyContext.contract';
import { evaluateAskAudienceApplicability, getAskAudiencePolicy } from '../askAudiencePolicy';
import { REPORT_PACK_SECTION_PATHS, type ReportPackPath, type ReportPackSectionId } from '../../planningContext/reportPackSections';
import { ASK_OPERATION_DEFINITIONS, type AskOperationId, type AskPropertyRoleFloor } from '../askOperationRegistry';

/**
 * Sole Homeowner Interface FRD FR-REC-002: the server-owned list of homeowner record sections. A section declares which existing Ask
 * operations read and change it. Its role floor and lifecycle applicability are DERIVED from those operations' registered definitions
 * and audience policies; nothing here classifies sensitivity on its own.
 */
export type AskRecordSectionId =
  | 'property-facts' | 'rooms' | 'inventory' | 'documents' | 'warranties' | 'timeline' | 'maintenance-history'
  | 'inspections' | 'permits' | 'projects-renovations' | 'incidents-claims' | 'coverage' | 'financing-ownership'
  | 'buyer-records' | 'seller-records' | 'household-access';

/** Where the index gets the section's count today. Null means no collection reader exists yet, so the section reports UNAVAILABLE. */
export type AskRecordCollectionReader = 'PROPERTY_RECORD_OVERVIEW' | 'PAGED_COLLECTION' | null;

/**
 * Where a section sits in the existing home-report pack (`buildAuthoritativeReportSnapshot`). Field names are the snapshot's own. The
 * pack is the one authoritative export: this registry only describes it, so a test holds `sharedFields` to the redaction allowlist
 * (`buildRedactedReportSnapshot`) and `ownerFields` to the fields the builder emits.
 */
export type AskRecordPackPath = ReportPackPath;

export type AskRecordSectionExport =
  | {
    state: 'IN_PACK';
    packPath: AskRecordPackPath;
    /** Every field the owner's copy of the pack carries for this section. */
    ownerFields: readonly string[];
    /** The fields that survive redaction into a shared link's copy. */
    sharedFields: readonly string[];
    /** Owner-copy fields the shared copy never carries. */
    withheldFromShared: readonly string[];
    /** A plain statement of how the pack's content differs from the Record section, when it does. */
    note: string | null;
  }
  | { state: 'NOT_IN_PACK'; reason: string };

/**
 * FR-REC-004: whether a row opens canonical per-record detail (askRecordDetail.service). Where no canonical detail reader is connected the
 * capability is reported UNAVAILABLE with a reason; it is never synthesized from the collection row and never left out.
 */
export type AskRecordDetailCapability =
  | { state: 'CONNECTED' }
  | { state: 'UNAVAILABLE'; reason: string };

/** The sections whose rows open per-record detail today. Every other section is UNAVAILABLE until its canonical owner has a detail reader. */
export const ASK_RECORD_DETAIL_CONNECTED_SECTIONS: readonly AskRecordSectionId[] = Object.freeze([
  'rooms', 'inventory', 'documents', 'warranties', 'timeline', 'maintenance-history', 'inspections', 'permits', 'projects-renovations', 'incidents-claims', 'coverage',
  'financing-ownership', 'buyer-records', 'seller-records', 'household-access',
]);

const recordDetailCapability = (id: AskRecordSectionId, label: string): AskRecordDetailCapability => (
  ASK_RECORD_DETAIL_CONNECTED_SECTIONS.includes(id)
    ? { state: 'CONNECTED' }
    : id === 'property-facts'
      ? { state: 'UNAVAILABLE', reason: 'Property details is the governed completeness view, not a list of records, so it has no per-record detail; its facts are read through Property Context.' }
      : { state: 'UNAVAILABLE', reason: `No canonical per-record detail reader is connected for ${label.toLowerCase()} yet, so a row shows its listed facts only.` }
);

export interface AskRecordSectionDefinition {
  /** Derived from `ASK_RECORD_DETAIL_CONNECTED_SECTIONS`; present on every registered section. */
  recordDetail: AskRecordDetailCapability;
  id: AskRecordSectionId;
  label: string;
  /** One concise line of what the section holds. */
  scope: string;
  owner: string;
  /** Existing Ask reads for the section's collection and detail; the role floor is the strictest of these. */
  readOperationIds: readonly AskOperationId[];
  /** Existing Ask commands that change the section's records. They never lower the read floor. */
  commandOperationIds: readonly AskOperationId[];
  collectionReader: AskRecordCollectionReader;
  /** True once a pageable, filterable collection reader serves this section (askRecordCollections.service). */
  pagedCollection: boolean;
  /** Its audience policy decides lifecycle applicability. It must be one of `readOperationIds`. */
  lifecycleOperationId: AskOperationId;
  freshnessSource: string;
  /** Whether, and how, this section is in the home-report pack. Evaluated against the pack's snapshot builder and redaction allowlist. */
  exportEligibility: AskRecordSectionExport;
  primaryAction: { label: string; question: string };
}

const section = (value: Omit<AskRecordSectionDefinition, 'recordDetail'>): AskRecordSectionDefinition => Object.freeze({
  ...value,
  recordDetail: Object.freeze(recordDetailCapability(value.id, value.label)),
  exportEligibility: Object.freeze(value.exportEligibility.state === 'IN_PACK'
    ? { ...value.exportEligibility, ownerFields: Object.freeze([...value.exportEligibility.ownerFields]), sharedFields: Object.freeze([...value.exportEligibility.sharedFields]), withheldFromShared: Object.freeze([...value.exportEligibility.withheldFromShared]) }
    : { ...value.exportEligibility }),
  readOperationIds: Object.freeze([...value.readOperationIds]),
  commandOperationIds: Object.freeze([...value.commandOperationIds]),
  primaryAction: Object.freeze({ ...value.primaryAction }),
});


const notInPack = (reason: string): AskRecordSectionExport => ({ state: 'NOT_IN_PACK', reason });
const inPack = (id: ReportPackSectionId, ownerFields: readonly string[], sharedFields: readonly string[], withheldFromShared: readonly string[], note: string | null = null): AskRecordSectionExport => ({
  state: 'IN_PACK', packPath: REPORT_PACK_SECTION_PATHS[id], ownerFields, sharedFields, withheldFromShared, note,
});

const EXPORT: Record<AskRecordSectionId, AskRecordSectionExport> = {
  'property-facts': inPack('property-facts', ['nickname', 'dwellingType', 'propertyUse', 'yearBuilt', 'livingAreaSqft'], ['dwellingType', 'yearBuilt', 'livingAreaSqft'], ['nickname', 'propertyUse'],
    'Only the headline facts. Property Context completeness, known facts by area, and their sources are not in the pack. The home’s address is on every pack’s cover whatever is selected.'),
  rooms: inPack('rooms', ['id', 'name'], ['name'], ['id'], 'Room names only: floors, item counts, and open maintenance are not in the pack.'),
  inventory: inPack('inventory', ['name', 'category', 'condition', 'brand', 'modelNumber', 'serialNumber', 'purchasedOn', 'purchaseCostCents', 'replacementCostCents', 'room', 'documents'], ['name', 'category', 'condition', 'brand', 'roomName'], ['modelNumber', 'serialNumber', 'purchasedOn', 'purchaseCostCents', 'replacementCostCents', 'documents'],
    'The same inventory rows the Record and Ask list (items they hide are not exported).'),
  documents: notInPack('The pack has no documents section. Documents appear only as transitional legacy file links attached to exported inventory items, insurance policies, and warranties (deleted files and links on items the Record hides are excluded).'),
  warranties: inPack('warranties', ['providerName', 'policyNumber', 'startDate', 'expiryDate', 'coverageDetails', 'documents'], ['providerName', 'startDate', 'expiryDate'], ['policyNumber', 'coverageDetails', 'documents']),
  timeline: notInPack('The pack has no timeline section.'),
  'maintenance-history': inPack('maintenance-history', ['title', 'status', 'priority', 'riskLevel', 'frequency', 'nextDueDate', 'lastCompletedDate', 'estimatedCost', 'actualCost', 'assetType', 'source'], ['title', 'status', 'priority', 'frequency', 'lastCompletedDate'], ['riskLevel', 'nextDueDate', 'estimatedCost', 'actualCost', 'assetType', 'source'],
    'Completed maintenance only, the same rows the Record’s maintenance history lists; open and cancelled work is not exported.'),
  inspections: notInPack('The pack has no inspections section.'),
  permits: notInPack('The pack has no permits section.'),
  'projects-renovations': notInPack('The pack has no projects or renovations section.'),
  'incidents-claims': notInPack('The pack has no incidents or claims section.'),
  coverage: inPack('coverage', ['providerName', 'policyNumber', 'startDate', 'expiryDate', 'premium', 'coverageAmount', 'documents'], ['providerName', 'startDate', 'expiryDate'], ['policyNumber', 'premium', 'coverageAmount', 'documents'],
    'Insurance policies only, with the policy number, premium, and coverage amount in the owner’s copy.'),
  'financing-ownership': notInPack('The pack has no financing or ownership-cost section.'),
  'buyer-records': notInPack('The pack has no buyer records section.'),
  'seller-records': notInPack('The pack has no seller records section.'),
  'household-access': notInPack('The pack has no household section, and household membership is never exported.'),
};

const OVERVIEW = 'PROPERTY_RECORD_OVERVIEW' as const;
const PAGED = 'PAGED_COLLECTION' as const;

export const ASK_RECORD_SECTION_REGISTRY: readonly AskRecordSectionDefinition[] = Object.freeze([
  section({
    id: 'property-facts', label: 'Property details', scope: 'Structure, use, systems, safety and other governed home facts.', owner: 'property-context',
    readOperationIds: ['PROPERTY_SUMMARY'], commandOperationIds: ['PROPERTY_CONTEXT_AREA_CAPTURE', 'PROPERTY_PURCHASE_DATE_SET'],
    collectionReader: OVERVIEW, pagedCollection: false, lifecycleOperationId: 'PROPERTY_SUMMARY', freshnessSource: 'Property Context completeness', exportEligibility: EXPORT['property-facts'],
    primaryAction: { label: 'Review details', question: 'How complete is my home record?' },
  }),
  section({
    id: 'rooms', label: 'Rooms', scope: 'Rooms, floor placement, item counts and open maintenance.', owner: 'home-record',
    readOperationIds: ['PROPERTY_SUMMARY'], commandOperationIds: ['ROOM_CREATE', 'ROOM_RENAME'],
    collectionReader: OVERVIEW, pagedCollection: true, lifecycleOperationId: 'PROPERTY_SUMMARY', freshnessSource: 'Most recently updated room', exportEligibility: EXPORT['rooms'],
    primaryAction: { label: 'View rooms', question: 'Show me my home by room.' },
  }),
  section({
    id: 'inventory', label: 'Systems and inventory', scope: 'Appliances, systems and belongings with condition and verification.', owner: 'inventory',
    readOperationIds: ['INVENTORY_LOOKUP'], commandOperationIds: ['INVENTORY_ITEM_CREATE', 'INVENTORY_ITEM_CORRECT'],
    collectionReader: OVERVIEW, pagedCollection: true, lifecycleOperationId: 'INVENTORY_LOOKUP', freshnessSource: 'Most recently updated item', exportEligibility: EXPORT['inventory'],
    primaryAction: { label: 'View inventory', question: 'Show me my inventory.' },
  }),
  section({
    id: 'documents', label: 'Documents', scope: 'Home records and vault documents, plus extracted candidates awaiting review.', owner: 'home-records',
    readOperationIds: ['DOCUMENT_LOOKUP', 'DOCUMENT_PROMOTION_REVIEW'], commandOperationIds: ['DOCUMENT_PROMOTION_CONFIRM'],
    collectionReader: OVERVIEW, pagedCollection: true, lifecycleOperationId: 'DOCUMENT_LOOKUP', freshnessSource: 'Most recently added document', exportEligibility: EXPORT['documents'],
    primaryAction: { label: 'View documents', question: 'Show me my home documents.' },
  }),
  section({
    id: 'warranties', label: 'Warranties', scope: 'Active and expired warranties with providers and dates.', owner: 'warranties',
    readOperationIds: ['WARRANTY_LOOKUP'], commandOperationIds: ['WARRANTY_UPDATE'],
    collectionReader: OVERVIEW, pagedCollection: true, lifecycleOperationId: 'WARRANTY_LOOKUP', freshnessSource: 'Warranty expiry dates', exportEligibility: EXPORT['warranties'],
    primaryAction: { label: 'View warranties', question: 'Show me my warranties.' },
  }),
  section({
    id: 'timeline', label: 'Home timeline', scope: 'Events in the home’s history, with how well each is verified.', owner: 'home-timeline',
    readOperationIds: ['HOME_TIMELINE_EVENTS'], commandOperationIds: ['HOME_EVENT_CORRECT', 'HOME_EVENT_UPDATE', 'HOME_EVENT_VISIBILITY'],
    collectionReader: PAGED, pagedCollection: true, lifecycleOperationId: 'HOME_TIMELINE_EVENTS', freshnessSource: 'Most recent event date', exportEligibility: EXPORT['timeline'],
    primaryAction: { label: 'View timeline', question: 'Show me my home timeline.' },
  }),
  section({
    id: 'maintenance-history', label: 'Maintenance history', scope: 'Completed and open maintenance work.', owner: 'maintenance',
    readOperationIds: ['MAINTENANCE_STATUS'], commandOperationIds: ['MAINTENANCE_TASK_CREATE', 'MAINTENANCE_TASK_UPDATE', 'MAINTENANCE_TASK_COMPLETE'],
    collectionReader: PAGED, pagedCollection: true, lifecycleOperationId: 'MAINTENANCE_STATUS', freshnessSource: 'Most recent completion', exportEligibility: EXPORT['maintenance-history'],
    primaryAction: { label: 'View maintenance', question: 'What is the status of my home maintenance?' },
  }),
  section({
    id: 'inspections', label: 'Inspections', scope: 'Inspection reports and their findings.', owner: 'inspections',
    readOperationIds: ['INSPECTION_REPORTS', 'INSPECTION_FINDINGS'], commandOperationIds: ['INSPECTION_FINDING_UPDATE', 'INSPECTION_REPORT_COMMAND'],
    collectionReader: PAGED, pagedCollection: true, lifecycleOperationId: 'INSPECTION_REPORTS', freshnessSource: 'Most recent inspection date', exportEligibility: EXPORT['inspections'],
    primaryAction: { label: 'View inspections', question: 'Show me my inspection reports.' },
  }),
  section({
    id: 'permits', label: 'Permits', scope: 'Permits and their approval status.', owner: 'permits',
    readOperationIds: ['PERMIT_TRACKER_STATUS'], commandOperationIds: ['PERMIT_TRACKER_COMMAND'],
    collectionReader: PAGED, pagedCollection: true, lifecycleOperationId: 'PERMIT_TRACKER_STATUS', freshnessSource: 'Most recent permit issue date', exportEligibility: EXPORT['permits'],
    primaryAction: { label: 'View permits', question: 'What is the status of my permits?' },
  }),
  section({
    id: 'projects-renovations', label: 'Projects and renovations', scope: 'Home projects and renovation cases.', owner: 'projects',
    readOperationIds: ['PROJECT_TRACKER_PROJECTS'], commandOperationIds: ['PROJECT_TRACKER_CREATE', 'PROJECT_TRACKER_COMMAND', 'RENOVATION_CASE_START'],
    collectionReader: PAGED, pagedCollection: true, lifecycleOperationId: 'PROJECT_TRACKER_PROJECTS', freshnessSource: 'Most recently created project', exportEligibility: EXPORT['projects-renovations'],
    primaryAction: { label: 'View projects', question: 'Show me my home projects.' },
  }),
  section({
    id: 'incidents-claims', label: 'Incidents and claims', scope: 'Home incidents and insurance claims.', owner: 'incidents-claims',
    readOperationIds: ['INCIDENT_CLAIM_STATUS'], commandOperationIds: ['CLAIM_FILE', 'CLAIM_TRANSITION', 'CLAIM_ACTIVITY_COMMAND'],
    collectionReader: PAGED, pagedCollection: true, lifecycleOperationId: 'INCIDENT_CLAIM_STATUS', freshnessSource: 'Most recent incident or claim', exportEligibility: EXPORT['incidents-claims'],
    primaryAction: { label: 'View claims', question: 'What is the status of my incidents and claims?' },
  }),
  section({
    id: 'coverage', label: 'Coverage and policies', scope: 'Insurance policy records and their dates.', owner: 'coverage',
    readOperationIds: ['COVERAGE_REVIEW_STATUS', 'COVERAGE_GAPS'], commandOperationIds: ['COVERAGE_COMMAND'],
    collectionReader: PAGED, pagedCollection: true, lifecycleOperationId: 'COVERAGE_REVIEW_STATUS', freshnessSource: 'Policy expiry dates', exportEligibility: EXPORT['coverage'],
    primaryAction: { label: 'Review coverage', question: 'Review my coverage.' },
  }),
  section({
    id: 'financing-ownership', label: 'Financing and ownership', scope: 'Saved financing scenarios for home projects.', owner: 'financing',
    readOperationIds: ['FINANCING_OVERVIEW', 'OWNERSHIP_COSTS'], commandOperationIds: ['FINANCING_PROFILE_COMMAND', 'OWNERSHIP_COST_COMMAND'],
    collectionReader: PAGED, pagedCollection: true, lifecycleOperationId: 'FINANCING_OVERVIEW', freshnessSource: 'Newest saved scenario', exportEligibility: EXPORT['financing-ownership'],
    primaryAction: { label: 'View financing', question: 'Show me my financing and ownership costs.' },
  }),
  section({
    id: 'buyer-records', label: 'Buyer records', scope: 'Buyer Plan tasks across the purchase.', owner: 'buyer-plan',
    readOperationIds: ['BUYER_PLAN_STATUS'], commandOperationIds: ['BUYER_PLAN_SETUP_COMMAND', 'BUYER_TASK_CREATE', 'BUYER_TASK_UPDATE', 'BUYER_TASK_COMPLETE'],
    collectionReader: PAGED, pagedCollection: true, lifecycleOperationId: 'BUYER_PLAN_STATUS', freshnessSource: 'Most recent task completion', exportEligibility: EXPORT['buyer-records'],
    primaryAction: { label: 'View buyer plan', question: 'Show me my buyer checklist.' },
  }),
  section({
    id: 'seller-records', label: 'Seller records', scope: 'Sale readiness checklist items.', owner: 'seller-prep',
    readOperationIds: ['SELLER_PREP_CHECKLIST'], commandOperationIds: ['SELLER_PREP_ITEM_DECISION', 'SELLER_PREP_CASE_COMMAND'],
    collectionReader: PAGED, pagedCollection: true, lifecycleOperationId: 'SELLER_PREP_CHECKLIST', freshnessSource: 'Last checklist refresh', exportEligibility: EXPORT['seller-records'],
    primaryAction: { label: 'View sale prep', question: 'Show me my sale readiness checklist.' },
  }),
  // Household access reads through HOUSEHOLD_ACCESS_SUMMARY. Role changes, invitations, and the pending-invite list stay owner-only and deferred
  // (HOUSEHOLD_INVITATION is OWNER-only).
  section({
    id: 'household-access', label: 'Household access', scope: 'Who has access to this home and in what role.', owner: 'household',
    readOperationIds: ['HOUSEHOLD_ACCESS_SUMMARY'], commandOperationIds: [],
    collectionReader: PAGED, pagedCollection: true, lifecycleOperationId: 'HOUSEHOLD_ACCESS_SUMMARY', freshnessSource: 'Household membership', exportEligibility: EXPORT['household-access'],
    primaryAction: { label: 'View household', question: 'Who has access to my home?' },
  }),
]);

const ROLE_RANK: Record<HouseholdRole, number> = { VIEWER: 0, CONTRIBUTOR: 1, OWNER: 2 };
const FLOOR_RANK: Record<Exclude<AskPropertyRoleFloor, null>, number> = { VIEWER: 0, CONTRIBUTOR: 1, OWNER: 2 };

/** The strictest floor among the section's read operations; null when none declares one (membership alone suffices). */
export function recordSectionRoleFloor(definition: AskRecordSectionDefinition): AskPropertyRoleFloor {
  let strictest: AskPropertyRoleFloor = null;
  for (const operationId of definition.readOperationIds) {
    const floor = ASK_OPERATION_DEFINITIONS[operationId]?.propertyRoleFloor ?? null;
    if (floor && (strictest === null || FLOOR_RANK[floor] > FLOOR_RANK[strictest])) strictest = floor;
  }
  return strictest;
}

export type AskRecordSectionApplicability = 'APPLICABLE' | 'NOT_APPLICABLE' | 'CONTEXT_REQUIRED' | 'RESTRICTED';

/** Role floor first (the section stays listed but withholds content), then the lifecycle decision of the section's audience policy. */
export function evaluateRecordSectionApplicability(
  definition: AskRecordSectionDefinition,
  input: { householdRole: HouseholdRole; operatingMode: AskOperatingMode },
): AskRecordSectionApplicability {
  const floor = recordSectionRoleFloor(definition);
  if (floor && ROLE_RANK[input.householdRole] < FLOOR_RANK[floor]) return 'RESTRICTED';
  const policy = getAskAudiencePolicy(definition.lifecycleOperationId);
  if (!policy) return 'APPLICABLE';
  const decision = evaluateAskAudienceApplicability({
    policy, accountRole: 'HOMEOWNER', householdRole: input.householdRole, operatingMode: input.operatingMode, purpose: 'EXECUTION',
  });
  if (decision.allowed) return 'APPLICABLE';
  if (decision.outcome === 'CONTEXT_REQUIRED') return 'CONTEXT_REQUIRED';
  return decision.reasonCode === 'ASK_PERMISSION_REQUIRED' ? 'RESTRICTED' : 'NOT_APPLICABLE';
}

/** Startup validation: unique ids, owners, registered operations, a lifecycle operation drawn from the reads, and no export claim. */
export function validateAskRecordSectionRegistry(
  entries: readonly AskRecordSectionDefinition[] = ASK_RECORD_SECTION_REGISTRY,
): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) issues.push(`Duplicate record section id: ${entry.id}`);
    ids.add(entry.id);
    if (!entry.label.trim()) issues.push(`${entry.id} has no label`);
    if (!entry.owner.trim()) issues.push(`${entry.id} has no owner`);
    if (!entry.scope.trim()) issues.push(`${entry.id} has no scope`);
    if (!entry.freshnessSource.trim()) issues.push(`${entry.id} has no freshness source`);
    if (!entry.primaryAction.label.trim() || !entry.primaryAction.question.trim()) issues.push(`${entry.id} has an incomplete primary action`);
    if (entry.readOperationIds.length === 0) issues.push(`${entry.id} declares no read operation`);
    for (const operationId of [...entry.readOperationIds, ...entry.commandOperationIds]) {
      if (!ASK_OPERATION_DEFINITIONS[operationId]) issues.push(`${entry.id} references unregistered operation ${operationId}`);
    }
    for (const operationId of entry.commandOperationIds) {
      if (ASK_OPERATION_DEFINITIONS[operationId] && ASK_OPERATION_DEFINITIONS[operationId].family !== 'COMMAND') issues.push(`${entry.id} lists non-command operation ${operationId} as a command`);
    }
    if (!entry.readOperationIds.includes(entry.lifecycleOperationId)) issues.push(`${entry.id} lifecycle operation ${entry.lifecycleOperationId} is not one of its reads`);
    if (entry.collectionReader === 'PAGED_COLLECTION' && !entry.pagedCollection) issues.push(`${entry.id} counts from a paged collection but is not flagged paged`);
    const exported = entry.exportEligibility;
    if (!exported) issues.push(`${entry.id} has no export evaluation`);
    else if (exported.state === 'NOT_IN_PACK') {
      if (!exported.reason.trim()) issues.push(`${entry.id} is not in the pack but gives no reason`);
    } else {
      if (!exported.ownerFields.length || !exported.sharedFields.length) issues.push(`${entry.id} is in the pack but lists no fields`);
      for (const field of exported.withheldFromShared) if (!exported.ownerFields.includes(field)) issues.push(`${entry.id} withholds ${field} from sharing but does not list it as an owner field`);
      for (const field of exported.sharedFields) if (exported.withheldFromShared.includes(field)) issues.push(`${entry.id} both shares and withholds ${field}`);
    }
  }
  return issues;
}
