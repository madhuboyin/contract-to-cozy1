import type { HouseholdRole } from '@prisma/client';
import type { AskOperatingMode } from '../../skills/context/propertyJourneyContext.contract';
import { evaluateAskAudienceApplicability, getAskAudiencePolicy } from '../askAudiencePolicy';
import { ASK_OPERATION_DEFINITIONS, type AskOperationId, type AskPropertyRoleFloor } from '../askOperationRegistry';

/**
 * Sole Homeowner Interface FR-SAVED-001/003: the server-owned list of saved-artifact types. Each type names its canonical owner, the Ask
 * read that governs who may see it, and, in code, how a refresh behaves (FR-SAVED-003). Saved is a projection: nothing here or in the
 * readers copies an artifact's payload into a generic table; visibility, retention and deletion are the canonical owner's own.
 */
export type AskArtifactCategory = 'REPORT' | 'COMPARISON' | 'DECISION_OUTPUT' | 'BRIEFING' | 'CHECKLIST' | 'ANALYSIS';

export type AskArtifactTypeId =
  | 'HOME_REPORT_EXPORT' | 'QUOTE_COMPARISON' | 'DECISION_RECOMMENDATION' | 'PROPERTY_BRIEF' | 'SEASONAL_CHECKLIST' | 'SELL_HOLD_RENT_ANALYSIS';

/**
 * FR-SAVED-003. NEW_VERSION_RETAINED: a refresh writes a new row and the prior row stays, marked superseded (so a material decision output
 * is never silently replaced). UPDATES_IN_PLACE_WITH_HISTORY: one artifact changes, and the owner keeps its transition history.
 * UPDATES_IN_PLACE: one artifact per period is edited and carries no history (not allowed for a material decision output).
 */
export type AskArtifactVersionBehavior = 'NEW_VERSION_RETAINED' | 'UPDATES_IN_PLACE_WITH_HISTORY' | 'UPDATES_IN_PLACE';

export type AskArtifactFreshness = 'CURRENT' | 'STALE' | 'EXPIRED' | 'SUPERSEDED';
export const ASK_ARTIFACT_FRESHNESS_STATES: readonly AskArtifactFreshness[] = Object.freeze(['CURRENT', 'STALE', 'EXPIRED', 'SUPERSEDED']);

export type AskArtifactReadAuthority = 'OPERATION_FLOOR' | 'OWN_REQUESTS';

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
}

const type = (value: AskArtifactTypeDefinition): AskArtifactTypeDefinition => Object.freeze({ ...value, readOperationIds: Object.freeze([...value.readOperationIds]) });

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
    readOperationIds: ['PROPERTY_BRIEFS_LIST'], readAuthority: 'OPERATION_FLOOR', lifecycleOperationId: 'PROPERTY_BRIEFS_LIST', versionBehavior: 'NEW_VERSION_RETAINED', materialDecisionOutput: false,
    retention: 'Kept until archived or deleted by the household; shares expire on their own dates.',
  }),
  type({
    id: 'SEASONAL_CHECKLIST', label: 'Seasonal checklists', category: 'CHECKLIST', owner: 'seasonal-maintenance', keyPrefix: 'seasonal',
    readOperationIds: ['SEASONAL_HOME_CARE'], readAuthority: 'OPERATION_FLOOR', lifecycleOperationId: 'SEASONAL_HOME_CARE', versionBehavior: 'UPDATES_IN_PLACE', materialDecisionOutput: false,
    retention: 'One checklist per season and year, kept with the home.',
  }),
  type({
    id: 'SELL_HOLD_RENT_ANALYSIS', label: 'Sell, hold or rent analyses', category: 'ANALYSIS', owner: 'sale-case', keyPrefix: 'analysis',
    readOperationIds: ['SELL_HOLD_RENT_ANALYSIS'], readAuthority: 'OPERATION_FLOOR', lifecycleOperationId: 'SELL_HOLD_RENT_ANALYSIS', versionBehavior: 'NEW_VERSION_RETAINED', materialDecisionOutput: true,
    retention: 'Every computed analysis is kept; a newer one supersedes it and the older stays readable.',
  }),
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
