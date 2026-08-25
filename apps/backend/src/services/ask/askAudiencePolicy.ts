import type { HouseholdRole } from '@prisma/client';
import type { AskOperatingMode } from '../skills/context/propertyJourneyContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../skills/context/propertyJourneyContext.contract';
import { SKILL_DEFINITIONS } from '../skills/skillRegistry';
import {
  getAskOperationDefinition,
  type AskOperationId,
  type AskPropertyRoleFloor,
} from './askOperationRegistry';
import type { AskAccountRole } from './askAccountEligibility';

export const ASK_AUDIENCE_POLICY_VERSION = '1.2' as const;

export type AskAudienceUnknownModeBehavior = 'ALLOW_GENERAL' | 'EXPLAIN' | 'BLOCK';
export type AskAudienceIneligibleTypedRequestBehavior = 'EXPLAIN' | 'BLOCK';
export type AskAudienceDiscoveryBehavior = 'SHOW' | 'HIDE';
export type AskAudienceJourneyPresentation = 'CONTEXTUAL' | 'NEUTRAL';
export type AskAudienceApplicabilityOutcome =
  | 'APPLICABLE'
  | 'APPLICABLE_GENERAL'
  | 'CONTEXT_REQUIRED'
  | 'INAPPLICABLE_EXPLAIN'
  | 'INAPPLICABLE_BLOCK'
  | 'HIDDEN';

export interface AskAudiencePolicy {
  operationId: AskOperationId;
  operationVersion: string;
  policyVersion: typeof ASK_AUDIENCE_POLICY_VERSION;
  eligibleAccountRoles: readonly AskAccountRole[];
  eligibleOperatingModes: readonly AskOperatingMode[];
  minimumHouseholdRole: AskPropertyRoleFloor;
  unknownModeBehavior: AskAudienceUnknownModeBehavior;
  ineligibleTypedRequestBehavior: AskAudienceIneligibleTypedRequestBehavior;
  discoveryBehavior: AskAudienceDiscoveryBehavior;
  journeyPresentation: AskAudienceJourneyPresentation;
}

export interface AskAudienceApplicabilityDecision {
  outcome: AskAudienceApplicabilityOutcome;
  allowed: boolean;
  discoverable: boolean;
  reasonCode: string | null;
  policyVersion: typeof ASK_AUDIENCE_POLICY_VERSION;
  operatingMode: AskOperatingMode;
}

const ALL_MODES: readonly AskOperatingMode[] = ['BUYING', 'OWNING', 'SELLING', 'UNKNOWN'];
const KNOWN_MODES: readonly AskOperatingMode[] = ['BUYING', 'OWNING', 'SELLING'];
const OWNER_LIFECYCLE_MODES: readonly AskOperatingMode[] = ['OWNING', 'SELLING'];

function definePolicy(
  operationId: AskOperationId,
  eligibleOperatingModes: readonly AskOperatingMode[],
  options: Partial<Pick<AskAudiencePolicy, 'unknownModeBehavior' | 'ineligibleTypedRequestBehavior' | 'discoveryBehavior' | 'journeyPresentation'>> = {},
): AskAudiencePolicy {
  const operation = getAskOperationDefinition(operationId);
  return Object.freeze({
    operationId,
    operationVersion: operation.version,
    policyVersion: ASK_AUDIENCE_POLICY_VERSION,
    eligibleAccountRoles: ['HOMEOWNER'] as const,
    eligibleOperatingModes: Object.freeze([...eligibleOperatingModes]),
    minimumHouseholdRole: operation.propertyRoleFloor,
    unknownModeBehavior: options.unknownModeBehavior ?? (eligibleOperatingModes.includes('UNKNOWN') ? 'ALLOW_GENERAL' : 'EXPLAIN'),
    ineligibleTypedRequestBehavior: options.ineligibleTypedRequestBehavior ?? 'EXPLAIN',
    discoveryBehavior: options.discoveryBehavior ?? 'SHOW',
    journeyPresentation: options.journeyPresentation ?? 'CONTEXTUAL',
  });
}

const POLICIES: readonly AskAudiencePolicy[] = [
  // Factual maintenance and seasonal-checklist reads do not become more
  // reliable when a buying/owning/selling stage is known. Keep the answer
  // focused on the selected records instead of adding an onboarding CTA.
  definePolicy('MAINTENANCE_STATUS', ALL_MODES, { journeyPresentation: 'NEUTRAL' }),
  // Canonical maintenance work is governed by property authorization and the
  // operation's own confirmation contract. Journey stage may personalize the
  // presentation, but an absent stage must not create an onboarding wall for
  // creating, completing, updating, or monitoring an authorized record.
  definePolicy('MAINTENANCE_TASK_CREATE', ALL_MODES, { journeyPresentation: 'NEUTRAL' }),
  definePolicy('MAINTENANCE_TASK_COMPLETE', ALL_MODES, { journeyPresentation: 'NEUTRAL' }),
  definePolicy('MAINTENANCE_TASK_UPDATE', ALL_MODES, { journeyPresentation: 'NEUTRAL' }),
  definePolicy('HOME_DEADLINE_MONITOR', ALL_MODES, { journeyPresentation: 'NEUTRAL' }),
  definePolicy('COVERAGE_GAPS', ALL_MODES),
  definePolicy('INCIDENT_CLAIM_STATUS', ALL_MODES, { journeyPresentation: 'NEUTRAL' }),
  definePolicy('CLAIM_FILE', ALL_MODES),
  definePolicy('CLAIM_TRANSITION', ALL_MODES),
  definePolicy('INCIDENT_CONTINUATION', ALL_MODES),
  definePolicy('SAVINGS_OPPORTUNITIES', ALL_MODES),
  // This is a factual read of costs recorded against the selected home. An
  // unknown buying/owning/selling stage may change framing, but not whether
  // those canonical records can be shown.
  definePolicy('OWNERSHIP_COSTS', ALL_MODES),
  definePolicy('INVENTORY_LOOKUP', ALL_MODES),
  definePolicy('PROPERTY_SUMMARY', ALL_MODES),
  definePolicy('HOME_CHANGE_SUMMARY', ALL_MODES, { journeyPresentation: 'NEUTRAL' }),
  definePolicy('HOME_ACTIONS', ALL_MODES),
  definePolicy('OPERATIONAL_WORK_UPDATE', ALL_MODES),
  definePolicy('INSPECTION_FINDINGS', ALL_MODES),
  definePolicy('INSPECTION_FINDING_UPDATE', ALL_MODES),
  definePolicy('DOCUMENT_PROMOTION_REVIEW', ALL_MODES),
  definePolicy('DOCUMENT_PROMOTION_CONFIRM', ALL_MODES),
  definePolicy('GUIDANCE_JOURNEY_CREATE', ALL_MODES),
  definePolicy('REPLACEMENT_GUIDANCE', ALL_MODES),
  definePolicy('HVAC_DECISION_START', KNOWN_MODES),
  definePolicy('HVAC_DECISION_CONTINUE', KNOWN_MODES),
  definePolicy('HVAC_DECISION_SCENARIO', KNOWN_MODES),
  definePolicy('HVAC_DECISION_ABANDON', KNOWN_MODES),
  definePolicy('HVAC_PREFERENCE_SAVE', OWNER_LIFECYCLE_MODES),
  definePolicy('HVAC_PREFERENCE_FORGET', OWNER_LIFECYCLE_MODES),
  definePolicy('HVAC_DECISION_OUTCOME_REPORT', KNOWN_MODES),
  definePolicy('HVAC_DECISION_OUTCOME_VIEW', KNOWN_MODES),
  definePolicy('HVAC_DECISION_OUTCOME_UNLINK', KNOWN_MODES),
  definePolicy('REFINANCE_ANALYSIS', ['OWNING']),
  definePolicy('REFINANCE_RATE_MONITOR', ['OWNING']),
  definePolicy('SELL_HOLD_RENT_ANALYSIS', OWNER_LIFECYCLE_MODES),
  definePolicy('HOUSEHOLD_INVITATION', OWNER_LIFECYCLE_MODES),
  definePolicy('QUOTE_COMPARISON_CREATE', ALL_MODES),
  definePolicy('QUOTE_COMPARISON_REVIEW', ALL_MODES),
  definePolicy('CAPITAL_RESERVE_PLAN', OWNER_LIFECYCLE_MODES),
  definePolicy('PROPERTY_TAX_APPEAL_READINESS', ALL_MODES),
  definePolicy('RENOVATION_PERMIT_READINESS', KNOWN_MODES),
  definePolicy('MAJOR_EVENT_ENTRY', OWNER_LIFECYCLE_MODES),
  // Buyer & Closing is transaction-scoped. These operations require an
  // active BUYING journey; UNKNOWN receives the standard context-required
  // explanation and OWNING/SELLING audiences do not discover them. Command
  // role floors still come from the immutable operation definitions.
  definePolicy('BUYER_PLAN_STATUS', ['BUYING']),
  definePolicy('BUYER_DEADLINES', ['BUYING']),
  definePolicy('BUYER_DOCUMENT_READINESS', ['BUYING']),
  definePolicy('BUYER_INSPECTION_REVIEW', ['BUYING']),
  definePolicy('BUYER_TASK_COMPLETE', ['BUYING']),
  definePolicy('BUYER_TASK_CREATE', ['BUYING']),
  definePolicy('BUYER_TASK_UPDATE', ['BUYING']),
  definePolicy('BUYER_MOVE_STATUS', ['BUYING']),
  definePolicy('BUYER_FINANCING_READINESS', ['BUYING']),
  definePolicy('BUYER_TITLE_ESCROW_READINESS', ['BUYING']),
  definePolicy('BUYER_WALKTHROUGH_READINESS', ['BUYING']),
  definePolicy('BUYER_DISCLOSURE_FUNDS_READINESS', ['BUYING']),
  definePolicy('BUYER_CLOSING_DAY_READINESS', ['BUYING']),
  definePolicy('BUYER_CONTRACT_TIMELINE', ['BUYING']),
  definePolicy('BUYER_NEGOTIATION_READINESS', ['BUYING']),
  definePolicy('BUYER_COST_READINESS', ['BUYING']),
  definePolicy('BUYER_FINDING_DISPOSITION', ['BUYING']),
  definePolicy('BUYER_LIFECYCLE_UPDATE', ['BUYING']),
];

export const ASK_AUDIENCE_POLICIES: Readonly<Record<string, AskAudiencePolicy>> = Object.freeze(
  Object.fromEntries(POLICIES.map((policy) => [`${policy.operationId}@${policy.operationVersion}`, policy])),
);

const ROLE_RANK: Record<Exclude<AskPropertyRoleFloor, null>, number> = { VIEWER: 1, CONTRIBUTOR: 2, OWNER: 3 };

export function getAskAudiencePolicy(operationId: AskOperationId, operationVersion = '1.0'): AskAudiencePolicy | undefined {
  return ASK_AUDIENCE_POLICIES[`${operationId}@${operationVersion}`];
}

export function evaluateAskAudienceApplicability(input: {
  policy: AskAudiencePolicy;
  accountRole: AskAccountRole;
  householdRole: HouseholdRole;
  operatingMode: AskOperatingMode;
  purpose: 'EXECUTION' | 'DISCOVERY';
}): AskAudienceApplicabilityDecision {
  const base = { policyVersion: input.policy.policyVersion, operatingMode: input.operatingMode } as const;
  if (!input.policy.eligibleAccountRoles.includes(input.accountRole)) {
    return { ...base, outcome: 'INAPPLICABLE_BLOCK', allowed: false, discoverable: false, reasonCode: 'ASK_ACCOUNT_ROLE_NOT_ELIGIBLE' };
  }
  if (input.policy.minimumHouseholdRole && ROLE_RANK[input.householdRole] < ROLE_RANK[input.policy.minimumHouseholdRole]) {
    return { ...base, outcome: 'INAPPLICABLE_BLOCK', allowed: false, discoverable: false, reasonCode: 'ASK_PERMISSION_REQUIRED' };
  }
  const eligible = input.policy.eligibleOperatingModes.includes(input.operatingMode);
  if (input.purpose === 'DISCOVERY') {
    if (!eligible || input.policy.discoveryBehavior === 'HIDE') {
      return { ...base, outcome: 'HIDDEN', allowed: false, discoverable: false, reasonCode: 'ASK_AUDIENCE_NOT_DISCOVERABLE' };
    }
    return {
      ...base,
      outcome: input.operatingMode === 'UNKNOWN' ? 'APPLICABLE_GENERAL' : 'APPLICABLE',
      allowed: true,
      discoverable: true,
      reasonCode: input.operatingMode === 'UNKNOWN' ? 'ASK_AUDIENCE_GENERAL_GUIDANCE' : null,
    };
  }
  if (eligible) {
    return {
      ...base,
      outcome: input.operatingMode === 'UNKNOWN' ? 'APPLICABLE_GENERAL' : 'APPLICABLE',
      allowed: true,
      discoverable: input.policy.discoveryBehavior === 'SHOW',
      reasonCode: input.operatingMode === 'UNKNOWN' ? 'ASK_AUDIENCE_GENERAL_GUIDANCE' : null,
    };
  }
  if (input.operatingMode === 'UNKNOWN' && input.policy.unknownModeBehavior === 'EXPLAIN') {
    return { ...base, outcome: 'CONTEXT_REQUIRED', allowed: false, discoverable: false, reasonCode: 'ASK_AUDIENCE_CONTEXT_REQUIRED' };
  }
  const explain = input.policy.ineligibleTypedRequestBehavior === 'EXPLAIN';
  return {
    ...base,
    outcome: explain ? 'INAPPLICABLE_EXPLAIN' : 'INAPPLICABLE_BLOCK',
    allowed: false,
    discoverable: false,
    reasonCode: explain ? 'ASK_AUDIENCE_INAPPLICABLE' : 'ASK_AUDIENCE_BLOCKED',
  };
}

export function isAskOperationDiscoverableForAudience(input: {
  operationId: AskOperationId;
  operationVersion?: string;
  accountRole: AskAccountRole;
  householdRole: HouseholdRole;
  operatingMode: AskOperatingMode;
}): boolean {
  const policy = getAskAudiencePolicy(input.operationId, input.operationVersion ?? '1.0');
  if (!policy) return true;
  return evaluateAskAudienceApplicability({ ...input, policy, purpose: 'DISCOVERY' }).discoverable;
}

export function validateAskAudiencePolicies(): string[] {
  const issues: string[] = [];
  const supportedModes = new Set<AskOperatingMode>(ALL_MODES);
  const registeredOperations = new Set<AskOperationId>();
  for (const skill of Object.values(SKILL_DEFINITIONS)) {
    for (const operation of skill.operations) registeredOperations.add(operation.operationId);
  }
  for (const operationId of registeredOperations) {
    const operation = getAskOperationDefinition(operationId);
    const policy = getAskAudiencePolicy(operationId, operation.version);
    if (!policy) {
      issues.push(`${operationId}@${operation.version}: missing audience policy`);
      continue;
    }
    if (policy.policyVersion !== ASK_AUDIENCE_POLICY_VERSION) issues.push(`${operationId}: unsupported audience policy version`);
    if (policy.operationId !== operationId || policy.operationVersion !== operation.version) issues.push(`${operationId}: audience policy identity mismatch`);
    if (!policy.eligibleAccountRoles.length || policy.eligibleAccountRoles.some((role) => role !== 'HOMEOWNER')) issues.push(`${operationId}: unknown or empty account-role policy`);
    if (!policy.eligibleOperatingModes.length || policy.eligibleOperatingModes.some((mode) => !supportedModes.has(mode))) issues.push(`${operationId}: unknown or empty operating-mode policy`);
    if (policy.discoveryBehavior === 'SHOW' && policy.ineligibleTypedRequestBehavior === 'BLOCK') issues.push(`${operationId}: discovery exposure requires an explanation policy for ineligible typed requests`);
    if (operation.propertyRoleFloor && (!policy.minimumHouseholdRole || ROLE_RANK[policy.minimumHouseholdRole] < ROLE_RANK[operation.propertyRoleFloor])) {
      issues.push(`${operationId}: audience role floor is weaker than operation role floor`);
    }
    const skill = Object.values(SKILL_DEFINITIONS).find((candidate) => candidate.operations.some((reference) => reference.operationId === operationId));
    const operationReference = skill?.operations.find((reference) => reference.operationId === operationId);
    const providerReferences: readonly { id: string; version: string }[] = [
      ...(operationReference?.optionalContextProviders ?? []),
      ...(operationReference?.requiredContextProviders ?? []),
    ];
    const declaresJourney = providerReferences.some((provider) => provider.id === PROPERTY_JOURNEY_CONTEXT_PROVIDER.id && provider.version === PROPERTY_JOURNEY_CONTEXT_PROVIDER.version);
    if (!declaresJourney) issues.push(`${operationId}: audience-governed operation lacks the journey context provider`);
  }
  if (Object.keys(ASK_AUDIENCE_POLICIES).length !== POLICIES.length) issues.push('conflicting audience policies for an immutable operation version');
  return issues;
}
