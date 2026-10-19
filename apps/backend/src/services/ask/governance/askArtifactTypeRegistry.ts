import type { HouseholdRole } from '@prisma/client';
import type { AskOperatingMode } from '../../skills/context/propertyJourneyContext.contract';
import { evaluateAskAudienceApplicability, getAskAudiencePolicy } from '../askAudiencePolicy';
import { ASK_OPERATION_DEFINITIONS, type AskOperationId, type AskPropertyRoleFloor } from '../askOperationRegistry';

/**
 * Sole Homeowner Interface FR-SAVED-001/003: the server-owned list of saved-artifact types. Each type names its canonical owner, the Ask
 * read that governs who may see it, and, in code, how a refresh behaves (FR-SAVED-003). Saved is a projection: nothing here or in the
 * readers copies an artifact's payload into a generic table; visibility, retention and deletion are the canonical owner's own.
 */
export type AskArtifactCategory = 'REPORT' | 'COMPARISON' | 'DECISION_OUTPUT' | 'BRIEFING' | 'CHECKLIST' | 'ANALYSIS' | 'PLAN' | 'IMAGE' | 'OTHER';

export type AskArtifactTypeId =
  | 'HOME_REPORT_EXPORT' | 'QUOTE_COMPARISON' | 'DECISION_RECOMMENDATION' | 'PROPERTY_BRIEF' | 'SEASONAL_CHECKLIST' | 'SELL_HOLD_RENT_ANALYSIS'
  | 'COVERAGE_COMPARISON' | 'FINANCING_SCENARIO' | 'REPLACE_REPAIR_ANALYSIS' | 'CAPITAL_TIMELINE_ANALYSIS'
  // Registered so they are never silently absent: each is UNAVAILABLE with its reason until it has a reader and a visibility rule.
  | 'HOME_SCORE_REPORT' | 'NEGOTIATION_SHIELD_ANALYSIS' | 'REFINANCE_SCENARIO' | 'BUYER_WORKSPACE' | 'SELLER_PREP_PLAN' | 'MOVING_PLAN'
  | 'HOME_DIGITAL_WILL' | 'ROOM_AND_PLANT_CHECKLIST' | 'RENOVATION_COMPLIANCE_CHECKLIST' | 'ANNOTATED_IMAGE';

/**
 * FR-SAVED-003. NEW_VERSION_RETAINED: a refresh writes a new row and the prior row stays, marked superseded (so a material decision output
 * is never silently replaced). UPDATES_IN_PLACE_WITH_HISTORY: one artifact changes, and the owner keeps its transition history.
 * UPDATES_IN_PLACE: one artifact per period is edited and carries no history (not allowed for a material decision output).
 */
export type AskArtifactVersionBehavior = 'NEW_VERSION_RETAINED' | 'UPDATES_IN_PLACE_WITH_HISTORY' | 'UPDATES_IN_PLACE';

export type AskArtifactFreshness = 'CURRENT' | 'STALE' | 'EXPIRED' | 'SUPERSEDED';
export const ASK_ARTIFACT_FRESHNESS_STATES: readonly AskArtifactFreshness[] = Object.freeze(['CURRENT', 'STALE', 'EXPIRED', 'SUPERSEDED']);

export type AskArtifactReadAuthority = 'OPERATION_FLOOR' | 'OWN_REQUESTS' | 'NONE';

/** CONNECTED means a canonical reader is registered. UNAVAILABLE means there is none yet; the type is reported with this reason and never omitted. */
export type AskArtifactTypeReader = { state: 'CONNECTED' } | { state: 'UNAVAILABLE'; reason: string };

export interface AskArtifactTypeDefinition {
  id: AskArtifactTypeId;
  label: string;
  category: AskArtifactCategory;
  owner: string;
  /** The `<prefix>:<id>` an artifact key starts with. */
  keyPrefix: string;
  readOperationIds: readonly AskOperationId[];
  readAuthority: AskArtifactReadAuthority;
  lifecycleOperationId: AskOperationId | null;
  versionBehavior: AskArtifactVersionBehavior;
  /** True for outputs a person may rely on to decide something; these must retain prior versions. */
  materialDecisionOutput: boolean;
  retention: string;
  reader: AskArtifactTypeReader;
}

const CONNECTED: AskArtifactTypeReader = { state: 'CONNECTED' };
const type = (value: Omit<AskArtifactTypeDefinition, 'reader'> & { reader?: AskArtifactTypeReader }): AskArtifactTypeDefinition => Object.freeze({ ...value, reader: value.reader ?? CONNECTED, readOperationIds: Object.freeze([...value.readOperationIds]) });

const pending = (id: AskArtifactTypeId, label: string, category: AskArtifactCategory, owner: string, keyPrefix: string, reason: string): AskArtifactTypeDefinition => type({
  id, label, category, owner, keyPrefix, readOperationIds: [], readAuthority: 'NONE', lifecycleOperationId: null, versionBehavior: 'NEW_VERSION_RETAINED', materialDecisionOutput: false,
  retention: 'Not yet projected; the owner keeps it.', reader: { state: 'UNAVAILABLE', reason },
});

export const ASK_ARTIFACT_TYPE_REGISTRY: readonly AskArtifactTypeDefinition[] = Object.freeze([
  type({
    id: 'HOME_REPORT_EXPORT', label: 'Home reports', category: 'REPORT', owner: 'home-reports', keyPrefix: 'report',
    readOperationIds: [], readAuthority: 'OWN_REQUESTS', lifecycleOperationId: null, versionBehavior: 'NEW_VERSION_RETAINED', materialDecisionOutput: false,
    retention: 'The export record is kept until its owner deletes it; the file expires on its own date.',
  }),
  type({
    id: 'QUOTE_COMPARISON', label: 'Quote comparisons', category: 'COMPARISON', owner: 'quote-comparison', keyPrefix: 'comparison',
    readOperationIds: ['QUOTE_COMPARISON_REVIEW'], readAuthority: 'OPERATION_FLOOR', lifecycleOperationId: 'QUOTE_COMPARISON_REVIEW', versionBehavior: 'UPDATES_IN_PLACE_WITH_HISTORY', materialDecisionOutput: true,
    retention: 'Kept with the workspace; every decision transition is retained by the quote-decision history.',
  }),
  type({
    id: 'DECISION_RECOMMENDATION', label: 'Decision recommendations', category: 'DECISION_OUTPUT', owner: 'decision-platform', keyPrefix: 'decision',
    readOperationIds: ['HVAC_DECISION_CONTINUE'], readAuthority: 'OPERATION_FLOOR', lifecycleOperationId: 'HVAC_DECISION_CONTINUE', versionBehavior: 'NEW_VERSION_RETAINED', materialDecisionOutput: true,
    retention: 'Every recommendation snapshot is kept; a recompute supersedes the prior one and never overwrites it.',
  }),
  type({
    id: 'PROPERTY_BRIEF', label: 'Property briefs', category: 'BRIEFING', owner: 'property-brief', keyPrefix: 'brief',
    // Republishing a brief replaces its sections inside the same brief, so earlier content is not kept; an accurate in-place update, and a brief is not a decision output.
    readOperationIds: ['PROPERTY_BRIEFS_LIST'], readAuthority: 'OPERATION_FLOOR', lifecycleOperationId: 'PROPERTY_BRIEFS_LIST', versionBehavior: 'UPDATES_IN_PLACE', materialDecisionOutput: false,
    retention: 'Kept until archived or deleted by the household; shares expire on their own dates. Republishing replaces the brief\'s sections in place and keeps no earlier version.',
  }),
  type({
    id: 'SEASONAL_CHECKLIST', label: 'Seasonal checklists', category: 'CHECKLIST', owner: 'seasonal-maintenance', keyPrefix: 'seasonal',
    readOperationIds: ['SEASONAL_HOME_CARE'], readAuthority: 'OPERATION_FLOOR', lifecycleOperationId: 'SEASONAL_HOME_CARE', versionBehavior: 'UPDATES_IN_PLACE', materialDecisionOutput: false,
    retention: 'One checklist per season and year, kept with the home.',
  }),
  type({
    id: 'SELL_HOLD_RENT_ANALYSIS', label: 'Sell, hold or rent analyses', category: 'ANALYSIS', owner: 'sale-case', keyPrefix: 'analysis',
    readOperationIds: ['SELL_HOLD_RENT_ANALYSIS'], readAuthority: 'OPERATION_FLOOR', lifecycleOperationId: 'SELL_HOLD_RENT_ANALYSIS', versionBehavior: 'NEW_VERSION_RETAINED', materialDecisionOutput: true,
    retention: 'Every computed analysis is kept; for the same number of years, a newer one supersedes it and the older stays readable. Different horizons are separate chains.',
  }),
  type({
    id: 'COVERAGE_COMPARISON', label: 'Coverage comparisons', category: 'COMPARISON', owner: 'coverage', keyPrefix: 'coverage',
    readOperationIds: ['COVERAGE_COMPARISON_STATUS'], readAuthority: 'OPERATION_FLOOR', lifecycleOperationId: 'COVERAGE_COMPARISON_STATUS', versionBehavior: 'UPDATES_IN_PLACE_WITH_HISTORY', materialDecisionOutput: true,
    retention: 'Kept with the comparison; each coverage decision recorded against it is retained.',
  }),
  type({
    id: 'FINANCING_SCENARIO', label: 'Financing scenarios', category: 'PLAN', owner: 'financing', keyPrefix: 'financing',
    readOperationIds: ['FINANCING_OVERVIEW'], readAuthority: 'OPERATION_FLOOR', lifecycleOperationId: 'FINANCING_OVERVIEW', versionBehavior: 'UPDATES_IN_PLACE', materialDecisionOutput: false,
    retention: 'Each scenario is its own saved record. Editing a scenario updates it in place; a new calculation is a separate scenario. Archived scenarios stay with the household.',
  }),
  type({
    id: 'REPLACE_REPAIR_ANALYSIS', label: 'Replace or repair analyses', category: 'ANALYSIS', owner: 'replacement-guidance', keyPrefix: 'replacerepair',
    readOperationIds: ['REPLACEMENT_GUIDANCE'], readAuthority: 'OPERATION_FLOOR', lifecycleOperationId: 'REPLACEMENT_GUIDANCE', versionBehavior: 'NEW_VERSION_RETAINED', materialDecisionOutput: true,
    retention: 'Every analysis is kept. The owner marks exactly one per item as current and clears the marker on the one it replaces, so the older analysis stays readable as superseded.',
  }),
  type({
    id: 'CAPITAL_TIMELINE_ANALYSIS', label: 'Capital timelines', category: 'PLAN', owner: 'capital-planning', keyPrefix: 'capital',
    readOperationIds: ['CAPITAL_RESERVE_PLAN'], readAuthority: 'OPERATION_FLOOR', lifecycleOperationId: 'CAPITAL_RESERVE_PLAN', versionBehavior: 'NEW_VERSION_RETAINED', materialDecisionOutput: true,
    retention: 'Every computed timeline is kept; for the same horizon, a newer one supersedes an older one and the older stays readable.',
  }),
  pending('HOME_SCORE_REPORT', 'Home score reports', 'REPORT', 'home-score', 'scorereport', 'Home score reports have no Ask operation to govern who may see them, and their share tokens need a visibility rule before they are projected.'),
  pending('NEGOTIATION_SHIELD_ANALYSIS', 'Negotiation analyses', 'ANALYSIS', 'negotiation-shield', 'negotiation', 'Negotiation analyses belong to a buyer case; the case\'s visibility rule has not been connected to Saved.'),
  pending('REFINANCE_SCENARIO', 'Refinance scenarios', 'ANALYSIS', 'refinance', 'refinance', 'Refinance scenario snapshots are owned by the person who ran them and need an own-records rule before they are projected.'),
  pending('BUYER_WORKSPACE', 'Buyer workspaces', 'PLAN', 'buyer-plan', 'buyer', 'Buyer workspaces apply only to a purchase in progress; their lifecycle gate has not been connected to Saved.'),
  pending('SELLER_PREP_PLAN', 'Seller prep plans', 'PLAN', 'seller-prep', 'sellerprep', 'The seller prep plan is a per-person preference record without versions; it needs its own Saved identity before it is projected.'),
  pending('MOVING_PLAN', 'Moving plans', 'PLAN', 'moving', 'moving', 'Moving plans have no Ask read operation to govern visibility.'),
  pending('HOME_DIGITAL_WILL', 'Home digital will', 'OTHER', 'digital-will', 'will', 'The digital will holds sensitive estate content and needs its own visibility and sharing rules before it is projected.'),
  pending('ROOM_AND_PLANT_CHECKLIST', 'Room and plant checklists', 'CHECKLIST', 'rooms', 'roomchecklist', 'Room and plant checklists have no read operation of their own to govern visibility.'),
  pending('RENOVATION_COMPLIANCE_CHECKLIST', 'Renovation compliance checklists', 'CHECKLIST', 'renovation', 'renovationchecklist', 'Compliance checklists are part of a renovation case and need that case\'s visibility rule before they are projected.'),
  pending('ANNOTATED_IMAGE', 'Annotated images', 'IMAGE', 'media', 'annotated', 'No annotated-image record exists yet, so there is nothing to project.'),
]);

const ROLE_RANK: Record<HouseholdRole, number> = { VIEWER: 0, CONTRIBUTOR: 1, OWNER: 2 };
const FLOOR_RANK: Record<Exclude<AskPropertyRoleFloor, null>, number> = { VIEWER: 0, CONTRIBUTOR: 1, OWNER: 2 };

export function artifactTypeReadFloor(definition: AskArtifactTypeDefinition): AskPropertyRoleFloor {
  let strictest: AskPropertyRoleFloor = null;
  for (const operationId of definition.readOperationIds) {
    const floor = ASK_OPERATION_DEFINITIONS[operationId]?.propertyRoleFloor ?? null;
    if (floor && (strictest === null || FLOOR_RANK[floor] > FLOOR_RANK[strictest])) strictest = floor;
  }
  return strictest;
}

export type AskArtifactApplicability = 'APPLICABLE' | 'NOT_APPLICABLE' | 'CONTEXT_REQUIRED' | 'RESTRICTED';

export function evaluateArtifactTypeApplicability(definition: AskArtifactTypeDefinition, input: { householdRole: HouseholdRole; operatingMode: AskOperatingMode }): AskArtifactApplicability {
  const floor = artifactTypeReadFloor(definition);
  if (floor && ROLE_RANK[input.householdRole] < FLOOR_RANK[floor]) return 'RESTRICTED';
  const policy = definition.lifecycleOperationId ? getAskAudiencePolicy(definition.lifecycleOperationId) : null;
  if (!policy) return 'APPLICABLE';
  const decision = evaluateAskAudienceApplicability({ policy, accountRole: 'HOMEOWNER', householdRole: input.householdRole, operatingMode: input.operatingMode, purpose: 'EXECUTION' });
  if (decision.allowed) return 'APPLICABLE';
  if (decision.outcome === 'CONTEXT_REQUIRED') return 'CONTEXT_REQUIRED';
  return decision.reasonCode === 'ASK_PERMISSION_REQUIRED' ? 'RESTRICTED' : 'NOT_APPLICABLE';
}

/** Startup validation: unique ids and prefixes, registered reads, honest authority, and a material decision output that retains its prior versions. */
export function validateAskArtifactTypeRegistry(entries: readonly AskArtifactTypeDefinition[] = ASK_ARTIFACT_TYPE_REGISTRY): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  const prefixes = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) issues.push(`Duplicate artifact type id: ${entry.id}`);
    ids.add(entry.id);
    if (prefixes.has(entry.keyPrefix)) issues.push(`Duplicate artifact key prefix: ${entry.keyPrefix}`);
    prefixes.add(entry.keyPrefix);
    if (!entry.label.trim() || !entry.owner.trim() || !entry.retention.trim()) issues.push(`${entry.id} is missing a label, owner or retention statement`);
    for (const operationId of entry.readOperationIds) if (!ASK_OPERATION_DEFINITIONS[operationId]) issues.push(`${entry.id} references unregistered operation ${operationId}`);
    if (entry.reader.state === 'UNAVAILABLE') {
      if (!entry.reader.reason.trim()) issues.push(`${entry.id} is unavailable but gives no reason`);
      if (entry.readOperationIds.length > 0 || entry.readAuthority !== 'NONE') issues.push(`${entry.id} is unavailable but declares a read authority`);
      continue;
    }
    if (entry.readAuthority === 'NONE') issues.push(`${entry.id} is connected but has no read authority`);
    if (entry.readAuthority === 'OPERATION_FLOOR') {
      if (entry.readOperationIds.length === 0) issues.push(`${entry.id} derives its floor from operations but declares none`);
      if (!entry.lifecycleOperationId || !entry.readOperationIds.includes(entry.lifecycleOperationId)) issues.push(`${entry.id} lifecycle operation is not one of its reads`);
    } else if (entry.readOperationIds.length > 0 || entry.lifecycleOperationId) {
      issues.push(`${entry.id} owns its rows by requester but declares read operations`);
    }
    if (entry.materialDecisionOutput && entry.versionBehavior === 'UPDATES_IN_PLACE') issues.push(`${entry.id} is a material decision output but would be replaced in place`);
  }
  return issues;
}
