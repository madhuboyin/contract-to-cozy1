import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

// ASK_COZY_INLINE_WORKSPACE_FRD v1.56, capability-card audit (Appendix D): the eighth new operation for a capability
// the audit found with no Ask operation. Reads NegotiationShieldService.listCasesForProperty, the same call the page's
// case list (GET /properties/:id/negotiation-shield/cases) makes. Case descriptions, inputs, analyses and drafts stay on
// the case. Read-only; creating, analyzing and drafting are the page's writes.
export const NEGOTIATION_SHIELD_SKILL = Object.freeze({
  id: 'negotiation-shield',
  version: '1.0.0',
  domain: 'HOME_FINANCE',
  displayName: 'Negotiation Shield',
  description: "Review this home's Negotiation Shield cases: the quote, premium, claim, urgency and inspection negotiations prepared so far and where each one stands.",
  homeownerJobs: ['DECIDE_WITH_CONFIDENCE'],
  supportedGoals: ['review-negotiation-shield-cases'],
  aliases: ['negotiation shield', 'negotiation reviews', 'negotiation cases'],
  operations: [{
    operationId: 'NEGOTIATION_SHIELD_CASES',
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }],
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [{ id: 'negotiation-shield.cases', version: '1.0' }],
  allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: ['NEGOTIATION_SHIELD_CASES'] }],
  autonomyLevel: 1,
  riskPolicy: {
    effects: ['READ'],
    materiality: 'LOW',
    riskDomains: ['FINANCIAL'],
    reversibility: 'REVERSIBLE',
  },
  authorizationFloor: 'VIEWER',
  allowedResultBlocks: ['SUMMARY', 'GROUPED_LIST', 'LIMITATION', 'BOUNDARY'],
  dependencies: [
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, version: PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, required: true },
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, version: PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, required: false },
    { type: 'OPERATION_CONTRACT', id: 'NEGOTIATION_SHIELD_CASES', version: '1.0', required: true },
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
  evaluationSuite: 'skill-negotiation-shield-golden',
  featureFlag: 'ASK_SKILL_NEGOTIATION_SHIELD_ENABLED',
  killSwitch: 'ASK_SKILL_NEGOTIATION_SHIELD_KILL_SWITCH',
  owner: 'Homeowner Product / Decide and Compare',
  lifecycleStatus: 'DEVELOPMENT',
  operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
