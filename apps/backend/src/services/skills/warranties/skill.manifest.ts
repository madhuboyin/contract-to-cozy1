import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

// ASK_COZY_INLINE_WORKSPACE_FRD v1.124, Warranties W-1: a deterministic read of the warranties recorded for this home, the same
// property-scoped rows GET /properties/:propertyId/warranties returns (any household member, so VIEWER). Each warranty's status is
// derived as the Warranties page derives it (the governed evaluateCoverageRecord, then the page's 60-day expiring window). Reports
// recorded fields and the recorded coverage text only: it never decides whether something is covered, never files a claim and never
// reads a policy number or cost. Adding, correcting and evidence keep their own operations and owner-authorised controls.
export const WARRANTIES_SKILL = Object.freeze({
  id: 'warranties',
  version: '1.0.0',
  domain: 'HOME_CARE',
  displayName: 'Warranties',
  description: "Review the warranties recorded for this home: provider, category and dates, whether each is active, expiring within 60 days or expired, and the coverage text as recorded, without deciding what is covered.",
  homeownerJobs: ['STAY_AHEAD'],
  supportedGoals: ['review-warranties'],
  aliases: ['warranties', 'home warranties', 'warranty records'],
  operations: [{
    operationId: 'WARRANTY_LOOKUP',
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }],
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [{ id: 'warranty.lookup', version: '1.0' }],
  allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: ['WARRANTY_LOOKUP'] }],
  autonomyLevel: 1,
  riskPolicy: {
    effects: ['READ'],
    materiality: 'LOW',
    riskDomains: ['FINANCIAL'],
    reversibility: 'REVERSIBLE',
  },
  authorizationFloor: 'VIEWER',
  allowedResultBlocks: ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'LIMITATION', 'BOUNDARY'],
  dependencies: [
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, version: PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, required: true },
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, version: PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, required: false },
    { type: 'OPERATION_CONTRACT', id: 'WARRANTY_LOOKUP', version: '1.0', required: true },
  ],
  contextBudget: {
    maxFacts: 50,
    maxEntities: 50,
    maxDocuments: 0,
    maxHistoryEvents: 0,
    maxSerializedBytes: 96_000,
    maxProviderLatencyMs: 3_000,
    maxOverallLatencyMs: 10_000,
  },
  evaluationSuite: 'skill-warranties-golden',
  featureFlag: 'ASK_SKILL_WARRANTIES_ENABLED',
  killSwitch: 'ASK_SKILL_WARRANTIES_KILL_SWITCH',
  owner: 'Homeowner Product / Home Records',
  lifecycleStatus: 'DEVELOPMENT',
  operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
