import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

// ASK_COZY_INLINE_WORKSPACE_FRD v1.60, capability-card audit (Appendix D): the twelfth new operation for a capability
// the audit found with no Ask operation. Reads ServicePriceRadarService.listChecks, the call GET
// /properties/:id/service-price-radar/checks makes for the page's recent checks. OWNER floor: listChecks admits only the
// primary homeowner profile. Read-only; running a new quote check stays on the page.
export const SERVICE_PRICE_RADAR_SKILL = Object.freeze({
  id: 'service-price-radar',
  version: '1.0.0',
  domain: 'HOME_PROJECTS',
  displayName: 'Service Price Radar',
  description: "Review the quote checks run in Service Price Radar for this home: each quoted price against the expected local range, with the verdict.",
  homeownerJobs: ['DECIDE_WITH_CONFIDENCE'],
  supportedGoals: ['review-service-price-checks'],
  aliases: ['service price radar', 'price radar', 'quote checks'],
  operations: [{
    operationId: 'SERVICE_PRICE_CHECKS',
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }],
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [{ id: 'service-price-radar.checks', version: '1.0' }],
  allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: ['SERVICE_PRICE_CHECKS'] }],
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
    { type: 'OPERATION_CONTRACT', id: 'SERVICE_PRICE_CHECKS', version: '1.0', required: true },
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
  evaluationSuite: 'skill-service-price-radar-golden',
  featureFlag: 'ASK_SKILL_SERVICE_PRICE_RADAR_ENABLED',
  killSwitch: 'ASK_SKILL_SERVICE_PRICE_RADAR_KILL_SWITCH',
  owner: 'Homeowner Product / Decide and Compare',
  lifecycleStatus: 'DEVELOPMENT',
  operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
