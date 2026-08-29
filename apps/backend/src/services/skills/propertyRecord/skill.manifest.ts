import type { AskOperationId } from '../../ask/askOperationRegistry';
import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const PROPERTY_RECORD_SKILL_OPERATIONS: AskOperationId[] = [
  'PROPERTY_SUMMARY',
  'INVENTORY_LOOKUP',
  'HOME_CHANGE_SUMMARY',
];

export const PROPERTY_RECORD_SKILL = Object.freeze({
  id: 'property-record',
  version: '1.0.0',
  domain: 'HOME_INTELLIGENCE',
  displayName: 'Property Record',
  description: 'Summarize the selected home and find recorded appliances, systems, and inventory details.',
  homeownerJobs: ['STAY_AHEAD', 'DECIDE_WITH_CONFIDENCE'],
  supportedGoals: ['summarize-property-record', 'find-recorded-home-item'],
  aliases: ['property record', 'home record summary', 'living home record', 'home inventory lookup'],
  operations: PROPERTY_RECORD_SKILL_OPERATIONS.map((operationId) => ({ operationId, version: '1.0', requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER], optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER] })),
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [
    { id: 'property.summary', version: '1.0' },
    { id: 'inventory.lookup', version: '1.0' },
    { id: 'home-change.summary', version: '1.0' },
  ],
  allowedExternalConnectors: [],
  consumerPolicy: [
    { consumer: 'ASK', operations: PROPERTY_RECORD_SKILL_OPERATIONS },
    { consumer: 'CONCIERGE_HOME', operations: PROPERTY_RECORD_SKILL_OPERATIONS },
    { consumer: 'HOME_ACTIONS', operations: ['PROPERTY_SUMMARY'] },
  ],
  autonomyLevel: 0,
  riskPolicy: {
    effects: ['READ'],
    materiality: 'LOW',
    riskDomains: ['PRIVACY'],
    reversibility: 'REVERSIBLE',
  },
  authorizationFloor: 'VIEWER',
  allowedResultBlocks: ['SUMMARY', 'GROUPED_LIST', 'TABLE', 'EVIDENCE', 'CAPABILITY_LIST', 'CHANGE_SUMMARY', 'EMPTY_STATE'],
  dependencies: [
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, version: PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, required: true },
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, version: PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, required: false },
    ...PROPERTY_RECORD_SKILL_OPERATIONS.map((operationId) => ({
      type: 'OPERATION_CONTRACT' as const,
      id: operationId,
      version: '1.0',
      required: true,
    })),
    { type: 'CANONICAL_SERVICE_CAPABILITY', id: 'property-record-overview', version: '1.0', required: true },
    { type: 'CANONICAL_SERVICE_CAPABILITY', id: 'home-inventory-read', version: '1.0', required: true },
  ],
  contextBudget: {
    maxFacts: 80,
    maxEntities: 50,
    maxDocuments: 0,
    maxHistoryEvents: 100,
    maxSerializedBytes: 96_000,
    maxProviderLatencyMs: 3_000,
    maxOverallLatencyMs: 15_000,
  },
  evaluationSuite: 'skill-property-record-golden',
  featureFlag: 'ASK_SKILL_PROPERTY_RECORD_ENABLED',
  killSwitch: 'ASK_SKILL_PROPERTY_RECORD_KILL_SWITCH',
  owner: 'Homeowner Product / Home Intelligence',
  lifecycleStatus: 'DEVELOPMENT',
  operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
