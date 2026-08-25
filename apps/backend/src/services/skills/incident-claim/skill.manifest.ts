import type { AskOperationId } from '../../ask/askOperationRegistry';
import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

/**
 * Home Intelligence Functional Completeness FRD Phase 6 (HI-SKL-003) —
 * INCIDENT_CLAIM_STATUS was already fully defined, routed, and executed in
 * askOperationRegistry.ts/askOrchestrator.service.ts but had no owning
 * Skill (same ungoverned-operation gap as buyer-closing). This governs the
 * existing read-only claim status surface; claims.service.ts's filing and
 * transition operations are not yet Ask-reachable at all — see the FRD
 * Phase 6 status note for that open item.
 */
export const INCIDENT_CLAIM_SKILL_OPERATIONS: AskOperationId[] = ['INCIDENT_CLAIM_STATUS'];

export const INCIDENT_CLAIM_SKILL = Object.freeze({
  id: 'incident-claim',
  version: '1.0.0',
  domain: 'HOME_PROTECTION',
  displayName: 'Claims',
  description: 'Review the status of filed insurance and incident claims for this home.',
  homeownerJobs: ['STAY_AHEAD', 'DECIDE_WITH_CONFIDENCE'],
  supportedGoals: ['review-claim-status'],
  aliases: ['claim status', 'insurance claim', 'incident claim tracker', 'check my claim'],
  operations: INCIDENT_CLAIM_SKILL_OPERATIONS.map((operationId) => ({
    operationId,
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  })),
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [{ id: 'incident-claim.status', version: '1.0' }],
  allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: INCIDENT_CLAIM_SKILL_OPERATIONS }],
  riskPolicy: {
    effects: ['READ'],
    materiality: 'MATERIAL',
    riskDomains: ['COVERAGE', 'PRIVACY'],
    reversibility: 'REVERSIBLE',
  },
  authorizationFloor: 'VIEWER',
  allowedResultBlocks: ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'EMPTY_STATE'],
  dependencies: [
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, version: PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, required: true },
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, version: PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, required: false },
    { type: 'OPERATION_CONTRACT', id: 'INCIDENT_CLAIM_STATUS', version: '1.0', required: true },
  ],
  contextBudget: {
    maxFacts: 50,
    maxEntities: 25,
    maxDocuments: 5,
    maxHistoryEvents: 50,
    maxSerializedBytes: 64_000,
    maxProviderLatencyMs: 3_000,
    maxOverallLatencyMs: 15_000,
  },
  evaluationSuite: 'skill-incident-claim-golden',
  featureFlag: 'ASK_SKILL_INCIDENT_CLAIM_ENABLED',
  killSwitch: 'ASK_SKILL_INCIDENT_CLAIM_KILL_SWITCH',
  owner: 'Homeowner Product / Home Protection',
  lifecycleStatus: 'DEVELOPMENT',
  operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
