import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

// ASK_COZY_INLINE_WORKSPACE_FRD v1.67, capability-card audit (Appendix D): reads PriceFinalizationService.listForProperty,
// the call GET /properties/:id/price-finalizations makes for the Price Finalization page. OWNER floor: the service only
// admits the primary homeowner profile. Read-only; saving, finalizing and booking stay on the page.
export const PRICE_FINALIZATION_SKILL = Object.freeze({
  id: 'price-finalization',
  version: '1.0.0',
  domain: 'HOME_CARE',
  displayName: 'Price Finalization',
  description: "Review the prices and terms recorded in Price Finalization: accepted price against the quote, agreed terms, and whether each was finalized or booked.",
  homeownerJobs: ['STAY_AHEAD'],
  supportedGoals: ['review-price-finalizations'],
  aliases: ['price finalization', 'finalized price', 'accepted terms'],
  operations: [{
    operationId: 'PRICE_FINALIZATIONS_LIST',
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }],
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [{ id: 'price-finalization.records', version: '1.0' }],
  allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: ['PRICE_FINALIZATIONS_LIST'] }],
  autonomyLevel: 1,
  riskPolicy: {
    effects: ['READ'],
    materiality: 'LOW',
    riskDomains: ['FINANCIAL'],
    reversibility: 'REVERSIBLE',
  },
  authorizationFloor: 'OWNER',
  allowedResultBlocks: ['SUMMARY', 'GROUPED_LIST', 'LIMITATION', 'BOUNDARY'],
  dependencies: [
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, version: PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, required: true },
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, version: PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, required: false },
    { type: 'OPERATION_CONTRACT', id: 'PRICE_FINALIZATIONS_LIST', version: '1.0', required: true },
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
  evaluationSuite: 'skill-price-finalization-golden',
  featureFlag: 'ASK_SKILL_PRICE_FINALIZATION_ENABLED',
  killSwitch: 'ASK_SKILL_PRICE_FINALIZATION_KILL_SWITCH',
  owner: 'Homeowner Product / Home Records',
  lifecycleStatus: 'DEVELOPMENT',
  operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
