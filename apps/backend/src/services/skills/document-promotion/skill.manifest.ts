import type { AskOperationId } from '../../ask/askOperationRegistry';
import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const DOCUMENT_PROMOTION_SKILL_OPERATIONS: AskOperationId[] = ['DOCUMENT_PROMOTION_REVIEW', 'DOCUMENT_PROMOTION_CONFIRM'];
export const DOCUMENT_PROMOTION_SKILL = Object.freeze({
  id: 'document-promotion', version: '1.0.0', domain: 'HOME_INTELLIGENCE', displayName: 'Document Review and Promotion',
  description: 'Review document-derived candidates and confirm or reject an exact candidate through its canonical promotion adapter.',
  homeownerJobs: ['STAY_AHEAD', 'DECIDE_WITH_CONFIDENCE'], supportedGoals: ['review-document-candidates', 'promote-reviewed-document'],
  aliases: ['document review', 'extracted facts', 'promote document facts'],
  operations: DOCUMENT_PROMOTION_SKILL_OPERATIONS.map((operationId) => ({ operationId, version: '1.0', requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER], optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER] })),
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER], optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [{ id: 'document-promotion.review', version: '1.0' }, { id: 'document-promotion.confirm', version: '1.0' }], allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: DOCUMENT_PROMOTION_SKILL_OPERATIONS }],
  autonomyLevel: 2,
  riskPolicy: { effects: ['READ', 'WRITE'], materiality: 'MATERIAL', riskDomains: ['PRIVACY', 'COVERAGE'], reversibility: 'PARTIALLY_REVERSIBLE' },
  authorizationFloor: 'VIEWER', allowedResultBlocks: ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'EMPTY_STATE', 'WORKFLOW_PROGRESS', 'BOUNDARY'],
  dependencies: [
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, version: PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, required: true },
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, version: PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, required: false },
    ...DOCUMENT_PROMOTION_SKILL_OPERATIONS.map((operationId) => ({ type: 'OPERATION_CONTRACT' as const, id: operationId, version: '1.0', required: true })),
    { type: 'CANONICAL_SERVICE_CAPABILITY', id: 'document-promotion-registry', version: '1.0', required: true },
  ],
  contextBudget: { maxFacts: 100, maxEntities: 60, maxDocuments: 10, maxHistoryEvents: 100, maxSerializedBytes: 128_000, maxProviderLatencyMs: 3_000, maxOverallLatencyMs: 15_000 },
  evaluationSuite: 'skill-document-promotion-golden', featureFlag: 'ASK_SKILL_DOCUMENT_PROMOTION_ENABLED', killSwitch: 'ASK_SKILL_DOCUMENT_PROMOTION_KILL_SWITCH',
  owner: 'Homeowner Product / Home Records', lifecycleStatus: 'ACTIVE', operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
