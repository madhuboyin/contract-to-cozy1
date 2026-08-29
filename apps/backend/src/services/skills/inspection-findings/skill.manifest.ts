import type { AskOperationId } from '../../ask/askOperationRegistry';
import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const INSPECTION_FINDINGS_SKILL_OPERATIONS: AskOperationId[] = [
  'INSPECTION_FINDINGS',
  'INSPECTION_FINDING_UPDATE',
];

export const INSPECTION_FINDINGS_SKILL = Object.freeze({
  id: 'inspection-findings', version: '1.0.0', domain: 'HOME_CARE',
  displayName: 'Inspection Findings',
  description: 'Review canonical inspection findings and explicitly accept, dismiss, or resolve an exact finding.',
  homeownerJobs: ['STAY_AHEAD', 'DECIDE_WITH_CONFIDENCE'],
  supportedGoals: ['review-inspection-findings', 'manage-inspection-finding'],
  aliases: ['inspection findings', 'inspection issues', 'inspection follow-up'],
  operations: INSPECTION_FINDINGS_SKILL_OPERATIONS.map((operationId) => ({ operationId, version: '1.0', requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER], optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER] })),
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [{ id: 'inspection-findings.review', version: '1.0' }, { id: 'inspection-findings.update', version: '1.0' }],
  allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: INSPECTION_FINDINGS_SKILL_OPERATIONS }],
  autonomyLevel: 2,
  riskPolicy: { effects: ['READ', 'WRITE'], materiality: 'MATERIAL', riskDomains: ['HOME_SAFETY'], reversibility: 'PARTIALLY_REVERSIBLE' },
  authorizationFloor: 'VIEWER',
  allowedResultBlocks: ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'EMPTY_STATE', 'WORKFLOW_PROGRESS', 'BOUNDARY'],
  dependencies: [
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, version: PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, required: true },
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, version: PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, required: false },
    ...INSPECTION_FINDINGS_SKILL_OPERATIONS.map((operationId) => ({ type: 'OPERATION_CONTRACT' as const, id: operationId, version: '1.0', required: true })),
    { type: 'CANONICAL_SERVICE_CAPABILITY', id: 'inspection-hub', version: '1.0', required: true },
  ],
  contextBudget: { maxFacts: 80, maxEntities: 80, maxDocuments: 10, maxHistoryEvents: 100, maxSerializedBytes: 128_000, maxProviderLatencyMs: 3_000, maxOverallLatencyMs: 15_000 },
  evaluationSuite: 'skill-inspection-findings-golden',
  featureFlag: 'ASK_SKILL_INSPECTION_FINDINGS_ENABLED', killSwitch: 'ASK_SKILL_INSPECTION_FINDINGS_KILL_SWITCH',
  owner: 'Homeowner Product / Inspection Hub', lifecycleStatus: 'ACTIVE', operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
