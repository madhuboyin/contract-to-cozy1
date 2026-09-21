import type { AskOperationId } from '../../ask/askOperationRegistry';
import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const PROPERTY_RECORD_SKILL_OPERATIONS: AskOperationId[] = [
  'PROPERTY_SUMMARY',
  'INVENTORY_LOOKUP',
  'HOME_CHANGE_SUMMARY',
  'INVENTORY_ITEM_CORRECT',
  'HOME_EVENT_CORRECT',
  'WARRANTY_CORRECT',
  'ROOM_RENAME',
  'ROOM_CREATE',
];

export const PROPERTY_RECORD_SKILL = Object.freeze({
  id: 'property-record',
  version: '1.0.0',
  domain: 'HOME_INTELLIGENCE',
  displayName: 'Property Record',
  description: 'Summarize the selected home and find recorded appliances, systems, and inventory details.',
  homeownerJobs: ['STAY_AHEAD', 'DECIDE_WITH_CONFIDENCE'],
  supportedGoals: ['summarize-property-record', 'find-recorded-home-item', 'correct-recorded-home-item'],
  aliases: ['property record', 'home record summary', 'living home record', 'home inventory lookup'],
  operations: PROPERTY_RECORD_SKILL_OPERATIONS.map((operationId) => ({ operationId, version: '1.0', requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER], optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER] })),
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [
    { id: 'property.summary', version: '1.0' },
    { id: 'inventory.lookup', version: '1.0' },
    { id: 'home-change.summary', version: '1.0' },
    { id: 'inventory.item-correct', version: '1.0' },
    { id: 'home-event.correct', version: '1.0' },
    { id: 'warranty.correct', version: '1.0' },
    { id: 'room.rename', version: '1.0' },
    { id: 'room.create', version: '1.0' },
  ],
  allowedExternalConnectors: [],
  consumerPolicy: [
    { consumer: 'ASK', operations: PROPERTY_RECORD_SKILL_OPERATIONS },
    { consumer: 'CONCIERGE_HOME', operations: PROPERTY_RECORD_SKILL_OPERATIONS.filter((operationId) => operationId !== 'INVENTORY_ITEM_CORRECT' && operationId !== 'HOME_EVENT_CORRECT' && operationId !== 'WARRANTY_CORRECT' && operationId !== 'ROOM_RENAME' && operationId !== 'ROOM_CREATE') },
    { consumer: 'HOME_ACTIONS', operations: ['PROPERTY_SUMMARY'] },
  ],
  autonomyLevel: 2,
  riskPolicy: {
    effects: ['READ', 'WRITE'],
    materiality: 'MATERIAL',
    riskDomains: ['PRIVACY'],
    reversibility: 'PARTIALLY_REVERSIBLE',
  },
  authorizationFloor: 'VIEWER',
  allowedResultBlocks: ['SUMMARY', 'GROUPED_LIST', 'TABLE', 'EVIDENCE', 'CAPABILITY_LIST', 'CHANGE_SUMMARY', 'EMPTY_STATE', 'WORKFLOW_PROGRESS', 'LIMITATION'],
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
