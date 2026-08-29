import type { AskOperationId } from '../../ask/askOperationRegistry';
import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const REFINANCE_SKILL_OPERATIONS: AskOperationId[] = [
  'REFINANCE_ANALYSIS',
  'REFINANCE_RATE_MONITOR',
];

export const REFINANCE_SKILL = Object.freeze({
  id: 'refinance',
  version: '1.0.0',
  domain: 'HOME_FINANCE',
  displayName: 'Refinance',
  description: 'Evaluate a recorded mortgage refinance opportunity and manage a governed mortgage-rate monitor.',
  homeownerJobs: ['DECIDE_WITH_CONFIDENCE', 'STAY_AHEAD'],
  supportedGoals: ['analyze-refinance-opportunity', 'monitor-refinance-rate-threshold'],
  aliases: ['mortgage refinance', 'refinance analysis', 'mortgage rate monitor', 'refinance rate alert'],
  operations: REFINANCE_SKILL_OPERATIONS.map((operationId) => ({ operationId, version: '1.0', requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER], optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER] })),
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [
    { id: 'refinance.analysis', version: '1.0' },
    { id: 'refinance.monitor', version: '1.0' },
  ],
  allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: REFINANCE_SKILL_OPERATIONS }],
  autonomyLevel: 2,
  riskPolicy: {
    effects: ['READ', 'WRITE'],
    materiality: 'MATERIAL',
    riskDomains: ['FINANCIAL', 'PRIVACY', 'EXTERNAL_COMMUNICATION'],
    reversibility: 'REVERSIBLE',
  },
  authorizationFloor: 'VIEWER',
  allowedResultBlocks: ['SUMMARY', 'TABLE', 'EVIDENCE', 'WORKFLOW_PROGRESS', 'MONITOR', 'CAPABILITY_LIST', 'BOUNDARY'],
  dependencies: [
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, version: PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, required: true },
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, version: PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, required: false },
    ...REFINANCE_SKILL_OPERATIONS.map((operationId) => ({
      type: 'OPERATION_CONTRACT' as const,
      id: operationId,
      version: '1.0',
      required: true,
    })),
    { type: 'CANONICAL_SERVICE_CAPABILITY', id: 'refinance-radar-analysis', version: '1.0', required: true },
    { type: 'CANONICAL_SERVICE_CAPABILITY', id: 'refinance-rate-monitor', version: '1.0', required: true },
  ],
  contextBudget: {
    maxFacts: 60,
    maxEntities: 20,
    maxDocuments: 5,
    maxHistoryEvents: 50,
    maxSerializedBytes: 96_000,
    maxProviderLatencyMs: 5_000,
    maxOverallLatencyMs: 15_000,
  },
  evaluationSuite: 'skill-refinance-golden',
  featureFlag: 'ASK_SKILL_REFINANCE_ENABLED',
  killSwitch: 'ASK_SKILL_REFINANCE_KILL_SWITCH',
  owner: 'Homeowner Product / Home Finance',
  lifecycleStatus: 'DEVELOPMENT',
  operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
