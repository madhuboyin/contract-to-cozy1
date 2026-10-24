import { ASK_OPERATION_DEFINITIONS, type AskOperationId } from '../askOperationRegistry';
import { ASK_DOMAIN_COMMAND_REGISTRY } from '../askDomainCommandRegistry';
import { ASK_RECORD_SECTION_REGISTRY, type AskRecordSectionId } from './askRecordSectionRegistry';
import { ASK_WORK_PROVIDER_REGISTRY, type AskWorkProviderId } from './askWorkProviderRegistry';
import { ASK_ARTIFACT_TYPE_REGISTRY, type AskArtifactTypeId } from './askArtifactTypeRegistry';
import { ASK_NOTIFICATION_CONTINUATION_RULES } from './askNotificationContinuationRegistry';

// Sole Homeowner Interface Phase 8 (FR-PLAT-001): what every canonical Ask mutation can change, declared once and validated.
// Replaces the sibling-read list that used to live in executeOperation.ts. A mutation declares, for each surface a person can be looking at:
//   reads          visible answers in a conversation that must be refreshed or marked stale (these are operations, all reads)
//   recordSections Record destination sections whose rows or counts change
//   workProviders  Work destination providers whose rows change
//   artifactTypes  Saved artifact types whose freshness can change
//   notifications  notification continuation rules whose target changes state
//   suggestions    REFRESH_VISIBLE when refreshing those reads can change the next actions shown, otherwise NONE
// Destinations, Saved, Work and notification continuations read the canonical owner live, so declaring them is what makes the registry the
// complete, checkable answer to "what does this write touch?"; the conversation's own answers are the only copies that can go stale,
// and `reads` is how they are found.
export interface AskMutationImpact {
  operationId: AskOperationId;
  reads: readonly AskOperationId[];
  recordSections: readonly AskRecordSectionId[];
  workProviders: readonly AskWorkProviderId[];
  artifactTypes: readonly AskArtifactTypeId[];
  notifications: readonly string[];
  suggestions: 'REFRESH_VISIBLE' | 'NONE';
  /** Required, and only allowed, when nothing at all is affected: why that is true. */
  noDependents?: string;
}

type Declared = Omit<AskMutationImpact, 'operationId' | 'suggestions' | 'reads' | 'recordSections' | 'workProviders' | 'artifactTypes' | 'notifications'> & Partial<Pick<AskMutationImpact, 'recordSections' | 'workProviders' | 'artifactTypes' | 'notifications' | 'suggestions'>> & { reads: readonly AskOperationId[] };

const impact = (reads: readonly AskOperationId[], more: Omit<Declared, 'reads'> = {}): Declared => ({ reads, ...more });

/**
 * What each mutation declares itself. Record sections, work providers and Saved types that already list a mutation as their own command are
 * added automatically (see `resolveImpact`), so the sources cannot disagree; what is written here is the rest.
 */
const DECLARED: Readonly<Record<string, Declared>> = {
  // Property facts, rooms, inventory, documents, warranties, timeline
  CAPTURE_FACT_CONFIRM: impact(['PROPERTY_SUMMARY', 'INVENTORY_LOOKUP'], { recordSections: ['property-facts'] }),
  CAPTURE_EVENT_CONFIRM: impact(['PROPERTY_SUMMARY', 'INVENTORY_LOOKUP', 'HOME_TIMELINE_EVENTS'], { recordSections: ['timeline'] }),
  CAPTURE_WARRANTY_CONFIRM: impact(['PROPERTY_SUMMARY', 'INVENTORY_LOOKUP', 'WARRANTY_LOOKUP'], { recordSections: ['warranties'], notifications: ['warranty'] }),
  CAPTURE_EVIDENCE_CONFIRM: impact(['DOCUMENT_LOOKUP', 'PROPERTY_SUMMARY'], { recordSections: ['documents', 'timeline'] }),
  DOCUMENT_PROMOTION_CONFIRM: impact(['DOCUMENT_PROMOTION_REVIEW', 'DOCUMENT_LOOKUP', 'PROPERTY_SUMMARY']),
  INVENTORY_ITEM_CREATE: impact(['PROPERTY_SUMMARY', 'INVENTORY_LOOKUP']),
  INVENTORY_ITEM_CORRECT: impact(['INVENTORY_LOOKUP', 'PROPERTY_SUMMARY', 'HOME_ACTIONS', 'HOME_STATUS_BOARD']),
  HOME_EVENT_CORRECT: impact(['INVENTORY_LOOKUP', 'PROPERTY_SUMMARY', 'HOME_TIMELINE_EVENTS']),
  HOME_EVENT_UPDATE: impact(['INVENTORY_LOOKUP', 'PROPERTY_SUMMARY', 'HOME_TIMELINE_EVENTS']),
  HOME_EVENT_VISIBILITY: impact(['HOME_TIMELINE_EVENTS']),
  WARRANTY_UPDATE: impact(['PROPERTY_SUMMARY', 'HOME_STATUS_BOARD', 'WARRANTY_LOOKUP'], { notifications: ['warranty'] }),
  ROOM_RENAME: impact(['PROPERTY_SUMMARY', 'INVENTORY_LOOKUP']),
  ROOM_CREATE: impact(['PROPERTY_SUMMARY', 'INVENTORY_LOOKUP']),
  PROPERTY_PURCHASE_DATE_SET: impact(['MAINTENANCE_STATUS', 'PROPERTY_SUMMARY']),
  PROPERTY_CONTEXT_AREA_CAPTURE: impact(['PROPERTY_SUMMARY']),
  HOME_JOURNEY_SET: impact(['PROPERTY_SUMMARY'], { recordSections: ['property-facts'] }),
  MATERIAL_SPEC_ADD: impact(['MATERIAL_SPECS_LIST'], { recordSections: ['documents'] }),
  MATERIAL_SPEC_UPDATE: impact(['MATERIAL_SPECS_LIST']),
  HOME_PLANT_ADD: impact(['PLANT_CARE_OUTLOOK']),
  ROOM_PLANT_RECOMMENDATIONS: impact(['PLANT_CARE_OUTLOOK']),
  HOUSEHOLD_INVITATION: impact(['HOUSEHOLD_ACCESS_SUMMARY'], { recordSections: ['household-access'] }),
  // Maintenance, seasonal, habits
  MAINTENANCE_TASK_CREATE: impact(['MAINTENANCE_TEMPLATES_BROWSE', 'MAINTENANCE_STATUS'], { workProviders: ['OPERATIONAL_WORK_ITEMS'], notifications: ['maintenance-task'] }),
  MAINTENANCE_TASK_UPDATE: impact(['MAINTENANCE_STATUS'], { workProviders: ['OPERATIONAL_WORK_ITEMS'], notifications: ['maintenance-task'] }),
  MAINTENANCE_TASK_COMPLETE: impact(['MAINTENANCE_STATUS', 'HOME_ACTIONS'], { workProviders: ['OPERATIONAL_WORK_ITEMS'], notifications: ['maintenance-task'] }),
  SEASONAL_CHECKLIST_SETUP: impact(['SEASONAL_HOME_CARE', 'MAINTENANCE_STATUS'], { artifactTypes: ['SEASONAL_CHECKLIST'], notifications: ['seasonal-checklist', 'maintenance-task'] }),
  SEASONAL_ITEM_COMMAND: impact(['MAINTENANCE_STATUS', 'SEASONAL_HOME_CARE'], { artifactTypes: ['SEASONAL_CHECKLIST'], notifications: ['seasonal-checklist', 'maintenance-task'] }),
  HOME_HABITS_GENERATE: impact(['HOME_HABITS'], { notifications: ['home-habit'] }),
  HOME_HABIT_PREFERENCES_COMMAND: impact(['HOME_HABITS'], { notifications: ['home-habit'] }),
  HOME_HABIT_UPDATE: impact(['HOME_HABITS', 'MAINTENANCE_STATUS'], { notifications: ['home-habit'] }),
  HOME_DEADLINE_MONITOR: impact(['MAINTENANCE_STATUS'], { workProviders: ['MONITORS'], notifications: ['coverage', 'warranty'] }),
  // Work items, home actions, status board
  HOME_RECORD_EXPORT_SHARE: impact(['HOME_RECORD_EXPORT_STATUS', 'SAVED_RESULTS'], { artifactTypes: ['HOME_REPORT_EXPORT'] }),
  HOME_RECORD_EXPORT: impact(['HOME_RECORD_EXPORT_STATUS', 'WORK_OVERVIEW', 'SAVED_RESULTS'], { workProviders: ['QUEUED_JOBS'], artifactTypes: ['HOME_REPORT_EXPORT'] }),
  HOME_WORK_ITEM_COMMAND: impact(['HOME_WORK_ITEMS', 'HOME_ACTIONS'], { notifications: ['home-action'] }),
  OPERATIONAL_WORK_UPDATE: impact(['HOME_ACTIONS', 'HOME_WORK_ITEMS'], { notifications: ['home-action'] }),
  STATUS_BOARD_COMMAND: impact(['HOME_STATUS_BOARD', 'HOME_ACTIONS'], { notifications: ['home-action'] }),
  // Inspections, recalls, coverage, claims
  INSPECTION_FINDING_UPDATE: impact(['INSPECTION_FINDINGS', 'INSPECTION_REPORTS']),
  INSPECTION_FINDING_DECISION_COMMAND: impact(['INSPECTION_FINDINGS', 'INSPECTION_REPORTS', 'INSPECTION_REPORT_FINDINGS']),
  INSPECTION_REPORT_COMMAND: impact(['INSPECTION_FINDINGS', 'INSPECTION_REPORTS', 'INSPECTION_REPORT_FINDINGS']),
  RECALL_MATCH_UPDATE: impact(['RECALL_REVIEW', 'INVENTORY_LOOKUP'], { notifications: ['recall'] }),
  INSPECTION_REPORT_REVIEW: impact(['INSPECTION_FINDINGS', 'GUIDANCE_JOURNEY_CONTINUE', 'GUIDANCE_JOURNEYS_LIST']),
  INSPECTION_FINDINGS_CHECK: impact(['INSPECTION_FINDINGS', 'GUIDANCE_JOURNEY_CONTINUE', 'GUIDANCE_JOURNEYS_LIST']),
  COVERAGE_RECORD_CHECK: impact(['COVERAGE_REVIEW_STATUS', 'GUIDANCE_JOURNEY_CONTINUE', 'GUIDANCE_JOURNEYS_LIST']),
  COVERAGE_TERM_REVIEW: impact(['COVERAGE_REVIEW_STATUS', 'GUIDANCE_JOURNEY_CONTINUE', 'GUIDANCE_JOURNEYS_LIST']),
  MAINTENANCE_EVIDENCE_ATTACH: impact(['MAINTENANCE_STATUS', 'GUIDANCE_JOURNEY_CONTINUE', 'GUIDANCE_JOURNEYS_LIST']),
  COVERAGE_ANALYSIS_RUN: impact(['COVERAGE_REVIEW_STATUS', 'COVERAGE_GAPS', 'GUIDANCE_JOURNEY_CONTINUE', 'GUIDANCE_JOURNEYS_LIST']),
  COVERAGE_COMMAND: impact(['COVERAGE_COMPARISON_STATUS', 'COVERAGE_REVIEW_STATUS', 'COVERAGE_GAPS'], { artifactTypes: ['COVERAGE_COMPARISON'], notifications: ['coverage'] }),
  CLAIM_FILE: impact(['INCIDENT_CONTINUATION', 'INCIDENT_CLAIM_STATUS'], { notifications: ['claim', 'incident'] }),
  CLAIM_TRANSITION: impact(['INCIDENT_CONTINUATION', 'INCIDENT_CLAIM_STATUS'], { notifications: ['claim', 'incident'] }),
  CLAIM_ACTIVITY_COMMAND: impact(['INCIDENT_CLAIM_STATUS', 'INCIDENT_CONTINUATION'], { notifications: ['claim', 'incident'] }),
  // Projects, renovations, permits, DIY
  PROJECT_TRACKER_CREATE: impact(['PROJECT_TRACKER_PROJECTS']),
  PROJECT_TRACKER_COMMAND: impact(['PROJECT_TRACKER_PROJECTS'], { notifications: ['renovation-requirement'] }),
  RENOVATION_CASE_START: impact(['RENOVATION_PERMIT_READINESS', 'PROJECT_TRACKER_PROJECTS'], { notifications: ['renovation-requirement'] }),
  RENOVATION_READINESS_COMMAND: impact(['RENOVATION_PERMIT_READINESS', 'PROJECT_TRACKER_PROJECTS'], { notifications: ['renovation-requirement'] }),
  PERMIT_TRACKER_COMMAND: impact(['PERMIT_TRACKER_STATUS', 'RENOVATION_PERMIT_READINESS'], { notifications: ['permit-milestone'] }),
  DIY_PROJECT_START: impact(['DIY_PROJECTS', 'DIY_TEMPLATE_BROWSE'], { workProviders: ['DIY_PROJECTS'] }),
  DIY_STEP_UPDATE: impact(['DIY_PROJECT_GUIDE', 'DIY_PROJECTS']),
  DIY_PROJECT_COMPLETE: impact(['DIY_PROJECT_GUIDE', 'DIY_PROJECTS']),
  DIY_PROJECT_ABANDON: impact(['DIY_PROJECT_GUIDE', 'DIY_PROJECTS']),
  DIY_COMPLETION_RECOVER: impact(['DIY_PROJECT_GUIDE', 'DIY_PROJECTS']),
  DIY_PROJECT_NOTE_COMMAND: impact(['DIY_PROJECTS', 'DIY_PROJECT_GUIDE'], { workProviders: ['DIY_PROJECTS'] }),
  DIY_SKILL_PROFILE_COMMAND: impact(['DIY_TEMPLATE_BROWSE']),
  WORK_REQUEST_COMMAND: impact(['WORK_OVERVIEW'], { workProviders: ['PENDING_EXECUTIONS', 'RETRYABLE_EXECUTIONS', 'UNKNOWN_OUTCOME_EXECUTIONS'] }),
  SAVED_ARCHIVE_COMMAND: impact(['SAVED_RESULTS']),
  NOTIFICATION_COMMAND: impact(['NOTIFICATIONS_OVERVIEW']),
  NOTIFICATION_SETTINGS_COMMAND: impact(['NOTIFICATION_SETTINGS_OVERVIEW']),
  // Guidance
  GUIDANCE_JOURNEY_CREATE: impact(['GUIDANCE_JOURNEYS_LIST'], { workProviders: ['GUIDANCE_JOURNEYS'] }),
  GUIDANCE_STEP_SKIP: impact(['GUIDANCE_JOURNEY_CONTINUE', 'GUIDANCE_JOURNEYS_LIST']),
  GUIDANCE_STEP_ACKNOWLEDGE: impact(['GUIDANCE_JOURNEY_CONTINUE', 'GUIDANCE_JOURNEYS_LIST']),
  GUIDANCE_JOURNEY_DISMISS: impact(['GUIDANCE_JOURNEY_CONTINUE', 'GUIDANCE_JOURNEYS_LIST']),
  // Decisions (HVAC)
  HVAC_DECISION_START: impact(['HVAC_DECISION_CONTINUE'], { workProviders: ['DECISION_THREADS'], artifactTypes: ['DECISION_RECOMMENDATION'] }),
  HVAC_DECISION_SCENARIO: impact(['HVAC_DECISION_CONTINUE'], { workProviders: ['DECISION_THREADS'], artifactTypes: ['DECISION_RECOMMENDATION'] }),
  HVAC_DECISION_ABANDON: impact(['HVAC_DECISION_CONTINUE'], { workProviders: ['DECISION_THREADS'], artifactTypes: ['DECISION_RECOMMENDATION'] }),
  HVAC_DECISION_OUTCOME_REPORT: impact(['HVAC_DECISION_OUTCOME_VIEW', 'HVAC_DECISION_CONTINUE'], { workProviders: ['DECISION_THREADS'], artifactTypes: ['DECISION_RECOMMENDATION'] }),
  HVAC_DECISION_OUTCOME_UNLINK: impact(['HVAC_DECISION_OUTCOME_VIEW', 'HVAC_DECISION_CONTINUE'], { workProviders: ['DECISION_THREADS'], artifactTypes: ['DECISION_RECOMMENDATION'] }),
  HVAC_PREFERENCE_SAVE: impact(['HVAC_DECISION_CONTINUE'], { workProviders: ['DECISION_THREADS'], artifactTypes: ['DECISION_RECOMMENDATION'] }),
  HVAC_PREFERENCE_FORGET: impact(['HVAC_DECISION_CONTINUE'], { workProviders: ['DECISION_THREADS'], artifactTypes: ['DECISION_RECOMMENDATION'] }),
  // Buyer
  BUYER_PLAN_SETUP_COMMAND: impact(['BUYER_LOAN_ESTIMATES', 'BUYER_FINANCING_READINESS', 'BUYER_INSPECTION_REVIEW', 'BUYER_TITLE_ESCROW_READINESS', 'BUYER_DEADLINES', 'BUYER_PLAN_STATUS']),
  BUYER_TASK_CREATE: impact(['BUYER_PLAN_STATUS', 'BUYER_DEADLINES']),
  BUYER_TASK_UPDATE: impact(['BUYER_PLAN_STATUS', 'BUYER_DEADLINES']),
  BUYER_TASK_COMPLETE: impact(['BUYER_PLAN_STATUS', 'BUYER_DEADLINES']),
  BUYER_LIFECYCLE_UPDATE: impact(['BUYER_PLAN_STATUS', 'BUYER_DEADLINES']),
  BUYER_FINDING_DISPOSITION: impact(['BUYER_INSPECTION_REVIEW']),
  BUYER_CONTRACT_COMMAND: impact(['BUYER_CONTRACT_TIMELINE', 'BUYER_DEADLINES', 'BUYER_PLAN_STATUS']),
  BUYER_CLOSING_DISCLOSURE_COMMAND: impact(['BUYER_DISCLOSURE_FUNDS_READINESS', 'BUYER_DEADLINES', 'BUYER_PLAN_STATUS']),
  BUYER_LOAN_ESTIMATE_COMMAND: impact(['BUYER_LOAN_ESTIMATES', 'BUYER_FINANCING_READINESS', 'BUYER_DISCLOSURE_FUNDS_READINESS', 'BUYER_PLAN_STATUS']),
  BUYER_INSURANCE_COMMAND: impact(['BUYER_INSURANCE_READINESS', 'BUYER_PLAN_STATUS']),
  BUYER_CLOSING_ITEM_COMMAND: impact(['BUYER_FINANCING_READINESS', 'BUYER_TITLE_ESCROW_READINESS', 'BUYER_PLAN_STATUS']),
  BUYER_WALKTHROUGH_COMMAND: impact(['BUYER_WALKTHROUGH_READINESS', 'BUYER_PLAN_STATUS']),
  NEGOTIATION_SHIELD_BUYER_COMMAND: impact(['BUYER_NEGOTIATION_READINESS', 'BUYER_INSPECTION_REVIEW']),
  NEGOTIATION_SHIELD_CASE_START: impact(['NEGOTIATION_SHIELD_CASES']),
  NEGOTIATION_SHIELD_CASE_ANALYZE: impact(['NEGOTIATION_SHIELD_CASES']),
  NEGOTIATION_SHIELD_CASE_UPDATE: impact(['NEGOTIATION_SHIELD_CASES']),
  NEGOTIATION_SHIELD_CASE_ATTACH: impact(['NEGOTIATION_SHIELD_CASES']),
  PRICE_FINALIZATION_COMMAND: impact(['PRICE_FINALIZATIONS_LIST', 'QUOTE_COMPARISON_REVIEW']),
  // Seller, sell/hold/rent
  SELLER_PREP_ITEM_DECISION: impact(['SELLER_PREP_CHECKLIST']),
  SELLER_PREP_CASE_COMMAND: impact(['SELLER_PREP_CHECKLIST']),
  SELL_HOLD_RENT_GOAL_CAPTURE: impact(['SELL_HOLD_RENT_ANALYSIS'], { artifactTypes: ['SELL_HOLD_RENT_ANALYSIS'] }),
  SELL_HOLD_RENT_COMMAND: impact(['SELL_HOLD_RENT_ANALYSIS'], { artifactTypes: ['SELL_HOLD_RENT_ANALYSIS'] }),
  // Money: financing, costs, reserve, savings, refinance, quotes
  FINANCING_PROFILE_COMMAND: impact(['FINANCING_OVERVIEW', 'SELL_HOLD_RENT_ANALYSIS'], { artifactTypes: ['FINANCING_SCENARIO', 'SELL_HOLD_RENT_ANALYSIS'] }),
  OWNERSHIP_COST_COMMAND: impact(['OWNERSHIP_COSTS']),
  RESERVE_FUND_COMMAND: impact(['CAPITAL_RESERVE_PLAN'], { artifactTypes: ['CAPITAL_TIMELINE_ANALYSIS'], notifications: ['reserve-fund', 'capital-timeline'] }),
  CAPITAL_TIMELINE_COMMAND: impact(['CAPITAL_RESERVE_PLAN'], { artifactTypes: ['CAPITAL_TIMELINE_ANALYSIS'], notifications: ['capital-timeline', 'reserve-fund'] }),
  SAVINGS_BENEFIT_COMMAND: impact(['SAVINGS_OPPORTUNITIES'], { notifications: ['savings-action', 'savings-match'] }),
  REFINANCE_RATE_MONITOR: impact(['REFINANCE_ANALYSIS'], { artifactTypes: ['REFINANCE_SCENARIO'], notifications: ['refinance'] }),
  QUOTE_COMPARISON_CREATE: impact(['QUOTE_COMPARISON_REVIEW'], { artifactTypes: ['QUOTE_COMPARISON'] }),
  QUOTE_COMPARISON_COMMAND: impact(['QUOTE_COMPARISON_REVIEW'], { artifactTypes: ['QUOTE_COMPARISON'] }),
  SERVICE_PRICE_CHECK_RUN: impact(['SERVICE_PRICE_CHECKS']),
  HOME_UPGRADE_COMMAND: impact(['HOME_UPGRADE_SCENARIOS']),
  DO_NOTHING_SCENARIO_COMMAND: impact(['DO_NOTHING_SIMULATION']),
  DO_NOTHING_SIMULATION_RUN: impact(['DO_NOTHING_SIMULATION']),
  // Property tax, HOA, environment, neighborhood, hazards
  PROPERTY_TAX_APPEAL_COMMAND: impact(['PROPERTY_TAX_APPEAL_READINESS']),
  PROPERTY_TAX_COMPARABLE_COMMAND: impact(['PROPERTY_TAX_APPEAL_READINESS']),
  HOA_COMPLIANCE_COMMAND: impact(['HOA_COMPLIANCE_STATUS']),
  ENVIRONMENT_REPORT_COMMAND: impact(['ENVIRONMENT_REPORT', 'MAINTENANCE_STATUS']),
  NEIGHBORHOOD_INTERACTION_COMMAND: impact(['NEIGHBORHOOD_CHANGE_FEED']),
  PAST_HAZARD_OUTCOME_COMMAND: impact(['PAST_HAZARD_EXPOSURE']),
  HOME_EVENT_RADAR_STATE: impact(['HOME_EVENT_RADAR_FEED']),
  HOME_EVENT_RADAR_MARK_DONE: impact(['HOME_EVENT_RADAR_FEED']),
  HOME_EVENT_RADAR_FEEDBACK: impact(['HOME_EVENT_RADAR_FEED']),
  HOME_EVENT_RADAR_TASK: impact(['HOME_EVENT_RADAR_FEED', 'MAINTENANCE_STATUS'], { workProviders: ['OPERATIONAL_WORK_ITEMS'] }),
  HOME_EVENT_RADAR_PREFERENCES: impact(['HOME_EVENT_RADAR_FEED']),
  // Briefings, brief, will
  HOME_BRIEFING_COMMAND: impact(['HOME_BRIEFING_VIEW'], { notifications: ['home-briefing'] }),
  HOME_BRIEFING_SHARE_COMMAND: impact(['HOME_BRIEFING_VIEW'], { notifications: ['home-briefing'] }),
  PROPERTY_BRIEF_COMMAND: impact(['PROPERTY_BRIEFS_LIST'], { artifactTypes: ['PROPERTY_BRIEF'] }),
  HOME_DIGITAL_WILL_CREATE: impact(['HOME_DIGITAL_WILL']),
  HOME_RECORD_STATE_COMMAND: impact(['DOCUMENT_LOOKUP'], { recordSections: ['documents'] }),
};

export interface AskResolvedMutationImpact extends AskMutationImpact {}

/** Every operation that changes canonical state: the domain command registry plus the COMMAND family. */
export function askMutationOperationIds(): AskOperationId[] {
  const ids = new Set<AskOperationId>();
  for (const definition of Object.values(ASK_DOMAIN_COMMAND_REGISTRY)) ids.add(definition.operationId as AskOperationId);
  for (const definition of Object.values(ASK_OPERATION_DEFINITIONS)) if (definition.family === 'COMMAND') ids.add(definition.operationId as AskOperationId);
  return [...ids].sort();
}

/** The surfaces the other registries already attach to a mutation as its own command or lifecycle owner. */
function derivedSurfaces(operationId: AskOperationId) {
  const sections = ASK_RECORD_SECTION_REGISTRY.filter((section) => section.commandOperationIds.includes(operationId));
  const providers = ASK_WORK_PROVIDER_REGISTRY.filter((provider) => provider.commandOperationIds.includes(operationId));
  return {
    recordSections: sections.map((section) => section.id),
    workProviders: providers.map((provider) => provider.id),
    reads: [...sections.map((section) => section.lifecycleOperationId), ...providers.map((provider) => provider.lifecycleOperationId)].filter((id): id is AskOperationId => Boolean(id)),
  };
}

const unique = <T,>(values: readonly T[]): T[] => [...new Set(values)];

function resolveImpact(operationId: AskOperationId, declared: Declared): AskMutationImpact {
  const derived = derivedSurfaces(operationId);
  const reads = unique([...declared.reads, ...derived.reads]);
  return {
    operationId,
    reads,
    recordSections: unique([...(declared.recordSections ?? []), ...derived.recordSections]),
    workProviders: unique([...(declared.workProviders ?? []), ...derived.workProviders]),
    artifactTypes: unique(declared.artifactTypes ?? []),
    notifications: unique(declared.notifications ?? []),
    suggestions: declared.suggestions ?? (reads.length > 0 ? 'REFRESH_VISIBLE' : 'NONE'),
    ...(declared.noDependents ? { noDependents: declared.noDependents } : {}),
  };
}

export const ASK_MUTATION_IMPACT_REGISTRY: Readonly<Record<string, AskMutationImpact>> = Object.freeze(
  Object.fromEntries(Object.entries(DECLARED).map(([operationId, declared]) => [operationId, resolveImpact(operationId as AskOperationId, declared)])),
);

export function mutationImpactFor(operationId: string): AskMutationImpact | undefined {
  return ASK_MUTATION_IMPACT_REGISTRY[operationId];
}

/** The conversation reads a mutation can leave stale. Replaces the old ASK_MUTATION_IMPACT_MAP. */
export function impactedReadOperationIds(operationId: string): readonly AskOperationId[] {
  return ASK_MUTATION_IMPACT_REGISTRY[operationId]?.reads ?? [];
}

export function validateAskMutationImpactRegistry(
  registry: Readonly<Record<string, AskMutationImpact>> = ASK_MUTATION_IMPACT_REGISTRY,
  mutationIds: readonly AskOperationId[] = askMutationOperationIds(),
): string[] {
  const issues: string[] = [];
  const sectionIds = new Set(ASK_RECORD_SECTION_REGISTRY.map((section) => section.id as string));
  const providerIds = new Set(ASK_WORK_PROVIDER_REGISTRY.map((provider) => provider.id as string));
  const artifactIds = new Set(ASK_ARTIFACT_TYPE_REGISTRY.map((artifact) => artifact.id as string));
  const ruleIds = new Set(ASK_NOTIFICATION_CONTINUATION_RULES.map((rule) => rule.id));
  const mutationSet = new Set<string>(mutationIds);

  for (const id of mutationIds) if (!registry[id]) issues.push(`${id}: a mutation with no impact declaration`);
  for (const [id, entry] of Object.entries(registry)) {
    if (!mutationSet.has(id)) issues.push(`${id}: declared but not a registered mutation`);
    if (entry.operationId !== id) issues.push(`${id}: entry names operation ${entry.operationId}`);
    for (const read of entry.reads) {
      const definition = ASK_OPERATION_DEFINITIONS[read];
      if (!definition) issues.push(`${id}: reads unknown operation ${read}`);
      else if (mutationSet.has(read) || definition.family === 'COMMAND') issues.push(`${id}: reads ${read}, which is a mutation, not a read`);
    }
    for (const section of entry.recordSections) if (!sectionIds.has(section)) issues.push(`${id}: unknown record section ${section}`);
    for (const provider of entry.workProviders) if (!providerIds.has(provider)) issues.push(`${id}: unknown work provider ${provider}`);
    for (const artifact of entry.artifactTypes) if (!artifactIds.has(artifact)) issues.push(`${id}: unknown artifact type ${artifact}`);
    for (const rule of entry.notifications) if (!ruleIds.has(rule)) issues.push(`${id}: unknown notification rule ${rule}`);
    const empty = !entry.reads.length && !entry.recordSections.length && !entry.workProviders.length && !entry.artifactTypes.length && !entry.notifications.length;
    if (empty && !entry.noDependents) issues.push(`${id}: affects nothing but gives no reason`);
    if (!empty && entry.noDependents) issues.push(`${id}: says it affects nothing but declares surfaces`);
    if (entry.suggestions === 'NONE' && entry.reads.length > 0) issues.push(`${id}: reads can change next actions, so suggestions cannot be NONE`);

    // Cross-check against what the other registries say about this mutation.
    const derived = derivedSurfaces(id as AskOperationId);
    for (const read of derived.reads) if (!entry.reads.includes(read)) issues.push(`${id}: the read ${read} (the lifecycle read of a section or provider that owns this mutation) is not refreshed`);
    for (const provider of ASK_WORK_PROVIDER_REGISTRY) if (provider.commandOperationIds.includes(id as AskOperationId) && !entry.workProviders.includes(provider.id)) issues.push(`${id}: work provider ${provider.id} lists it as a command but the impact omits it`);
    for (const section of ASK_RECORD_SECTION_REGISTRY) if (section.commandOperationIds.includes(id as AskOperationId) && !entry.recordSections.includes(section.id)) issues.push(`${id}: record section ${section.id} lists it as a command but the impact omits it`);
    for (const artifact of entry.artifactTypes) {
      const definition = ASK_ARTIFACT_TYPE_REGISTRY.find((candidate) => candidate.id === artifact);
      if (definition?.lifecycleOperationId && !entry.reads.includes(definition.lifecycleOperationId)) issues.push(`${id}: artifact ${artifact} is read by ${definition.lifecycleOperationId}, which the impact does not refresh`);
    }
  }
  return issues;
}
