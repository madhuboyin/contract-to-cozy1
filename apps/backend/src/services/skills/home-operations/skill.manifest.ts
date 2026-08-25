import type { AskOperationId } from '../../ask/askOperationRegistry';
import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

/**
 * Home Intelligence Functional Completeness FRD Phase 6 (HI-SKL-003,
 * "Operational Work") — HOME_ACTIONS was already fully defined, routed,
 * and executed (askOrchestrator.service.ts's homeActionsResult(), backed
 * by getHomeActionFeed()) and already had a capability + bridge entry
 * ('home-operations' in maintainPrevent.ts / capabilitySkillGuidanceBridge.registry.ts),
 * but no owning Skill — the same ungoverned-operation gap as
 * buyer-closing and incident-claim, caught by
 * validateSkillOperationGovernanceCoverage. This governs the existing
 * canonical ranked Home Action feed read; accept/complete/defer/snooze
 * lifecycle commands on individual Home Actions and Operational Work
 * Items are a separate, larger Ask-surface gap not covered here — see the
 * FRD Phase 6 status note.
 */
export const HOME_OPERATIONS_SKILL_OPERATIONS: AskOperationId[] = ['HOME_ACTIONS'];

export const HOME_OPERATIONS_SKILL = Object.freeze({
  id: 'home-operations',
  version: '1.0.0',
  domain: 'HOME_INTELLIGENCE',
  displayName: 'Home Operations',
  description: 'Review the canonical ranked feed of recommended, scheduled, active, and completed home work.',
  homeownerJobs: ['STAY_AHEAD', 'DECIDE_WITH_CONFIDENCE'],
  supportedGoals: ['review-home-actions-feed'],
  aliases: ['home actions', 'what needs attention', 'home operations feed', 'my home to-do list'],
  operations: HOME_OPERATIONS_SKILL_OPERATIONS.map((operationId) => ({
    operationId,
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  })),
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [{ id: 'home-actions.feed', version: '1.0' }],
  allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: HOME_OPERATIONS_SKILL_OPERATIONS }],
  riskPolicy: {
    effects: ['READ'],
    materiality: 'MATERIAL',
    riskDomains: ['HOME_SAFETY'],
    reversibility: 'REVERSIBLE',
  },
  authorizationFloor: 'VIEWER',
  allowedResultBlocks: ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'PRIORITY_LIST', 'BOUNDARY', 'CAPABILITY_LIST'],
  dependencies: [
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, version: PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, required: true },
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, version: PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, required: false },
    { type: 'OPERATION_CONTRACT', id: 'HOME_ACTIONS', version: '1.0', required: true },
  ],
  contextBudget: {
    maxFacts: 150,
    maxEntities: 60,
    maxDocuments: 0,
    maxHistoryEvents: 100,
    maxSerializedBytes: 128_000,
    maxProviderLatencyMs: 3_000,
    maxOverallLatencyMs: 15_000,
  },
  evaluationSuite: 'skill-home-operations-golden',
  featureFlag: 'ASK_SKILL_HOME_OPERATIONS_ENABLED',
  killSwitch: 'ASK_SKILL_HOME_OPERATIONS_KILL_SWITCH',
  owner: 'Homeowner Product / Home Intelligence',
  lifecycleStatus: 'DEVELOPMENT',
  operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
