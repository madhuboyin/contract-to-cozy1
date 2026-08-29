import type { AskOperationId } from '../../ask/askOperationRegistry';
import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';

export const QUERY_ENVELOPE_SKILL_OPERATIONS: AskOperationId[] = ['INTELLIGENCE_ENVELOPE_QUERY'];

export const QUERY_ENVELOPE_SKILL = Object.freeze({
  id: 'query-envelope',
  version: '1.0.0',
  domain: 'HOME_INTELLIGENCE',
  displayName: 'Query Intelligence Envelope',
  description: 'Read a bounded, normalized view of registered intelligence produced for an authorized property.',
  homeownerJobs: ['STAY_AHEAD', 'DECIDE_WITH_CONFIDENCE'],
  supportedGoals: ['review-derived-home-intelligence', 'trace-home-intelligence-evidence'],
  aliases: ['intelligence envelope', 'derived home intelligence', 'registered intelligence signals'],
  operations: [{
    operationId: 'INTELLIGENCE_ENVELOPE_QUERY',
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [],
  }],
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [],
  allowedAdapters: [{ id: 'intelligence-envelope.query', version: '1.0' }],
  allowedExternalConnectors: [],
  consumerPolicy: [
    { consumer: 'ASK', operations: QUERY_ENVELOPE_SKILL_OPERATIONS },
    { consumer: 'CONCIERGE_HOME', operations: QUERY_ENVELOPE_SKILL_OPERATIONS },
  ],
  autonomyLevel: 0,
  riskPolicy: {
    effects: ['READ'],
    materiality: 'LOW',
    riskDomains: ['PRIVACY'],
    reversibility: 'REVERSIBLE',
  },
  authorizationFloor: 'VIEWER',
  allowedResultBlocks: ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'EMPTY_STATE', 'BOUNDARY'],
  dependencies: [
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, version: PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, required: true },
    { type: 'OPERATION_CONTRACT', id: 'INTELLIGENCE_ENVELOPE_QUERY', version: '1.0', required: true },
    { type: 'CANONICAL_SERVICE_CAPABILITY', id: 'intelligence-envelope-query', version: '1.0', required: true },
  ],
  contextBudget: {
    maxFacts: 100,
    maxEntities: 100,
    maxDocuments: 0,
    maxHistoryEvents: 0,
    maxSerializedBytes: 128_000,
    maxProviderLatencyMs: 2_000,
    maxOverallLatencyMs: 5_000,
  },
  evaluationSuite: 'skill-query-envelope-golden',
  featureFlag: 'ASK_SKILL_QUERY_ENVELOPE_ENABLED',
  killSwitch: 'ASK_SKILL_QUERY_ENVELOPE_KILL_SWITCH',
  owner: 'Homeowner Product / Home Intelligence',
  lifecycleStatus: 'DEVELOPMENT',
  operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
