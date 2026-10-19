import type { HouseholdRole } from '@prisma/client';
import type { AskOperatingMode } from '../../skills/context/propertyJourneyContext.contract';
import { evaluateAskAudienceApplicability, getAskAudiencePolicy } from '../askAudiencePolicy';
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

export interface AskRecordSectionDefinition {
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
  /** Export is a later Phase 2 slice. No section claims eligibility until that slice evaluates it. */
  exportEligibility: 'NOT_EVALUATED';
  primaryAction: { label: string; question: string };
}

const section = (value: AskRecordSectionDefinition): AskRecordSectionDefinition => Object.freeze({
  ...value,
  readOperationIds: Object.freeze([...value.readOperationIds]),
  commandOperationIds: Object.freeze([...value.commandOperationIds]),
  primaryAction: Object.freeze({ ...value.primaryAction }),
});

const OVERVIEW = 'PROPERTY_RECORD_OVERVIEW' as const;
const PAGED = 'PAGED_COLLECTION' as const;

export const ASK_RECORD_SECTION_REGISTRY: readonly AskRecordSectionDefinition[] = Object.freeze([
  section({
    id: 'property-facts', label: 'Property details', scope: 'Structure, use, systems, safety and other governed home facts.', owner: 'property-context',
    readOperationIds: ['PROPERTY_SUMMARY'], commandOperationIds: ['PROPERTY_CONTEXT_AREA_CAPTURE', 'PROPERTY_PURCHASE_DATE_SET'],
    collectionReader: OVERVIEW, pagedCollection: false, lifecycleOperationId: 'PROPERTY_SUMMARY', freshnessSource: 'Property Context completeness', exportEligibility: 'NOT_EVALUATED',
    primaryAction: { label: 'Review details', question: 'How complete is my home record?' },
  }),
  section({
    id: 'rooms', label: 'Rooms', scope: 'Rooms, floor placement, item counts and open maintenance.', owner: 'home-record',
    readOperationIds: ['PROPERTY_SUMMARY'], commandOperationIds: ['ROOM_CREATE', 'ROOM_RENAME'],
    collectionReader: OVERVIEW, pagedCollection: true, lifecycleOperationId: 'PROPERTY_SUMMARY', freshnessSource: 'Most recently updated room', exportEligibility: 'NOT_EVALUATED',
    primaryAction: { label: 'View rooms', question: 'Show me my home by room.' },
  }),
  section({
    id: 'inventory', label: 'Systems and inventory', scope: 'Appliances, systems and belongings with condition and verification.', owner: 'inventory',
    readOperationIds: ['INVENTORY_LOOKUP'], commandOperationIds: ['INVENTORY_ITEM_CREATE', 'INVENTORY_ITEM_CORRECT'],
    collectionReader: OVERVIEW, pagedCollection: true, lifecycleOperationId: 'INVENTORY_LOOKUP', freshnessSource: 'Most recently updated item', exportEligibility: 'NOT_EVALUATED',
    primaryAction: { label: 'View inventory', question: 'What is in my home inventory?' },
  }),
  section({
    id: 'documents', label: 'Documents', scope: 'Home records and vault documents, plus extracted candidates awaiting review.', owner: 'home-records',
    readOperationIds: ['DOCUMENT_LOOKUP', 'DOCUMENT_PROMOTION_REVIEW'], commandOperationIds: ['DOCUMENT_PROMOTION_CONFIRM'],
    collectionReader: OVERVIEW, pagedCollection: true, lifecycleOperationId: 'DOCUMENT_LOOKUP', freshnessSource: 'Most recently added document', exportEligibility: 'NOT_EVALUATED',
    primaryAction: { label: 'View documents', question: 'Show me my home documents.' },
  }),
  section({
    id: 'warranties', label: 'Warranties', scope: 'Active and expired warranties with providers and dates.', owner: 'warranties',
    readOperationIds: ['WARRANTY_LOOKUP'], commandOperationIds: ['WARRANTY_CORRECT'],
    collectionReader: OVERVIEW, pagedCollection: true, lifecycleOperationId: 'WARRANTY_LOOKUP', freshnessSource: 'Warranty expiry dates', exportEligibility: 'NOT_EVALUATED',
    primaryAction: { label: 'View warranties', question: 'Show me my warranties.' },
  }),
  section({
    id: 'timeline', label: 'Home timeline', scope: 'Events in the home’s history, with how well each is verified.', owner: 'home-timeline',
    readOperationIds: ['HOME_TIMELINE_EVENTS'], commandOperationIds: ['HOME_EVENT_CORRECT', 'HOME_EVENT_VISIBILITY'],
    collectionReader: PAGED, pagedCollection: true, lifecycleOperationId: 'HOME_TIMELINE_EVENTS', freshnessSource: 'Most recent event date', exportEligibility: 'NOT_EVALUATED',
    primaryAction: { label: 'View timeline', question: 'Show me my home timeline.' },
  }),
  section({
    id: 'maintenance-history', label: 'Maintenance history', scope: 'Completed and open maintenance work.', owner: 'maintenance',
    readOperationIds: ['MAINTENANCE_STATUS'], commandOperationIds: ['MAINTENANCE_TASK_CREATE', 'MAINTENANCE_TASK_UPDATE', 'MAINTENANCE_TASK_COMPLETE'],
    collectionReader: PAGED, pagedCollection: true, lifecycleOperationId: 'MAINTENANCE_STATUS', freshnessSource: 'Most recent completion', exportEligibility: 'NOT_EVALUATED',
    primaryAction: { label: 'View maintenance', question: 'What is the status of my home maintenance?' },
  }),
  section({
    id: 'inspections', label: 'Inspections', scope: 'Inspection reports and their findings.', owner: 'inspections',
    readOperationIds: ['INSPECTION_REPORTS', 'INSPECTION_FINDINGS'], commandOperationIds: ['INSPECTION_FINDING_UPDATE', 'INSPECTION_REPORT_COMMAND'],
    collectionReader: PAGED, pagedCollection: true, lifecycleOperationId: 'INSPECTION_REPORTS', freshnessSource: 'Most recent inspection date', exportEligibility: 'NOT_EVALUATED',
    primaryAction: { label: 'View inspections', question: 'Show me my inspection reports.' },
  }),
  section({
    id: 'permits', label: 'Permits', scope: 'Permits and their approval status.', owner: 'permits',
    readOperationIds: ['PERMIT_TRACKER_STATUS'], commandOperationIds: ['PERMIT_TRACKER_COMMAND'],
    collectionReader: PAGED, pagedCollection: true, lifecycleOperationId: 'PERMIT_TRACKER_STATUS', freshnessSource: 'Most recent permit issue date', exportEligibility: 'NOT_EVALUATED',
    primaryAction: { label: 'View permits', question: 'What is the status of my permits?' },
  }),
  section({
    id: 'projects-renovations', label: 'Projects and renovations', scope: 'Home projects and renovation cases.', owner: 'projects',
    readOperationIds: ['PROJECT_TRACKER_PROJECTS'], commandOperationIds: ['PROJECT_TRACKER_CREATE', 'PROJECT_TRACKER_COMMAND', 'RENOVATION_CASE_START'],
    collectionReader: PAGED, pagedCollection: true, lifecycleOperationId: 'PROJECT_TRACKER_PROJECTS', freshnessSource: 'Most recently created project', exportEligibility: 'NOT_EVALUATED',
    primaryAction: { label: 'View projects', question: 'Show me my home projects.' },
  }),
  section({
    id: 'incidents-claims', label: 'Incidents and claims', scope: 'Home incidents and insurance claims.', owner: 'incidents-claims',
    readOperationIds: ['INCIDENT_CLAIM_STATUS'], commandOperationIds: ['CLAIM_FILE', 'CLAIM_TRANSITION', 'CLAIM_ACTIVITY_COMMAND'],
    collectionReader: PAGED, pagedCollection: true, lifecycleOperationId: 'INCIDENT_CLAIM_STATUS', freshnessSource: 'Most recent incident or claim', exportEligibility: 'NOT_EVALUATED',
    primaryAction: { label: 'View claims', question: 'What is the status of my incidents and claims?' },
  }),
  section({
    id: 'coverage', label: 'Coverage and policies', scope: 'Insurance policy records and their dates.', owner: 'coverage',
    readOperationIds: ['COVERAGE_REVIEW_STATUS', 'COVERAGE_GAPS'], commandOperationIds: ['COVERAGE_COMMAND'],
    collectionReader: PAGED, pagedCollection: true, lifecycleOperationId: 'COVERAGE_REVIEW_STATUS', freshnessSource: 'Policy expiry dates', exportEligibility: 'NOT_EVALUATED',
    primaryAction: { label: 'Review coverage', question: 'Review my coverage.' },
  }),
  section({
    id: 'financing-ownership', label: 'Financing and ownership', scope: 'Saved financing scenarios for home projects.', owner: 'financing',
    readOperationIds: ['FINANCING_OVERVIEW', 'OWNERSHIP_COSTS'], commandOperationIds: ['FINANCING_PROFILE_COMMAND', 'OWNERSHIP_COST_COMMAND'],
    collectionReader: PAGED, pagedCollection: true, lifecycleOperationId: 'FINANCING_OVERVIEW', freshnessSource: 'Newest saved scenario', exportEligibility: 'NOT_EVALUATED',
    primaryAction: { label: 'View financing', question: 'Show me my financing and ownership costs.' },
  }),
  section({
    id: 'buyer-records', label: 'Buyer records', scope: 'Buyer Plan tasks across the purchase.', owner: 'buyer-plan',
    readOperationIds: ['BUYER_PLAN_STATUS'], commandOperationIds: ['BUYER_PLAN_SETUP_COMMAND', 'BUYER_TASK_CREATE', 'BUYER_TASK_UPDATE', 'BUYER_TASK_COMPLETE'],
    collectionReader: PAGED, pagedCollection: true, lifecycleOperationId: 'BUYER_PLAN_STATUS', freshnessSource: 'Most recent task completion', exportEligibility: 'NOT_EVALUATED',
    primaryAction: { label: 'View buyer plan', question: 'What is the status of my buyer plan?' },
  }),
  section({
    id: 'seller-records', label: 'Seller records', scope: 'Sale readiness checklist items.', owner: 'seller-prep',
    readOperationIds: ['SELLER_PREP_CHECKLIST'], commandOperationIds: ['SELLER_PREP_ITEM_DECISION', 'SELLER_PREP_CASE_COMMAND'],
    collectionReader: PAGED, pagedCollection: true, lifecycleOperationId: 'SELLER_PREP_CHECKLIST', freshnessSource: 'Last checklist refresh', exportEligibility: 'NOT_EVALUATED',
    primaryAction: { label: 'View sale prep', question: 'Show me my sale preparation checklist.' },
  }),
  // No Ask operation is dedicated to reading household access, so this read-only summary rides the Property Summary operation. The
  // member list is member-level on its route (`GET /household/members`). Role changes, invitations, and the pending-invite list stay
  // owner-only and deferred (HOUSEHOLD_INVITATION is OWNER-only).
  section({
    id: 'household-access', label: 'Household access', scope: 'Who has access to this home and in what role.', owner: 'household',
    readOperationIds: ['PROPERTY_SUMMARY'], commandOperationIds: [],
    collectionReader: PAGED, pagedCollection: true, lifecycleOperationId: 'PROPERTY_SUMMARY', freshnessSource: 'Household membership', exportEligibility: 'NOT_EVALUATED',
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
    if (entry.exportEligibility !== 'NOT_EVALUATED') issues.push(`${entry.id} claims export eligibility before the export slice evaluates it`);
  }
  return issues;
}
