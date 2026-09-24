import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

// ASK_COZY_INLINE_WORKSPACE_FRD v1.55, capability-card audit (Appendix D): the seventh new operation for a capability
// the audit found with no Ask operation. Reads PlantCarePlannerService.getOutlook, the same call Plant Advisor's Care tab
// (GET /properties/:id/plant-advisor/care-outlook) makes; the canonical service owns its weather, air-quality, drought
// and hardiness lookups, as it does for the page, so the Skill declares no external connector of its own. Read-only.
export const PLANT_ADVISOR_SKILL = Object.freeze({
  id: 'plant-advisor',
  version: '1.0.0',
  domain: 'HOME_CARE',
  displayName: 'Plant Advisor care outlook',
  description: "Review weather-aware care for this home's tracked plants and garden zones: what to change now or soon and why.",
  homeownerJobs: ['STAY_AHEAD'],
  supportedGoals: ['review-plant-care-outlook'],
  aliases: ['plant advisor', 'plant care', 'garden zones', 'plant care outlook'],
  operations: [{
    operationId: 'PLANT_CARE_OUTLOOK',
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }],
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [{ id: 'plant-advisor.care-outlook', version: '1.0' }],
  allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: ['PLANT_CARE_OUTLOOK'] }],
  autonomyLevel: 1,
  riskPolicy: {
    effects: ['READ'],
    materiality: 'LOW',
    riskDomains: ['HOME_SAFETY'],
    reversibility: 'REVERSIBLE',
  },
  authorizationFloor: 'VIEWER',
  allowedResultBlocks: ['SUMMARY', 'GROUPED_LIST', 'LIMITATION', 'BOUNDARY'],
  dependencies: [
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, version: PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, required: true },
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, version: PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, required: false },
    { type: 'OPERATION_CONTRACT', id: 'PLANT_CARE_OUTLOOK', version: '1.0', required: true },
  ],
  contextBudget: {
    maxFacts: 50,
    maxEntities: 50,
    maxDocuments: 0,
    maxHistoryEvents: 0,
    maxSerializedBytes: 96_000,
    maxProviderLatencyMs: 3_000,
    // getOutlook resolves the county before the drought lookup, two 8 s timeouts in sequence.
    maxOverallLatencyMs: 20_000,
  },
  evaluationSuite: 'skill-plant-advisor-golden',
  featureFlag: 'ASK_SKILL_PLANT_ADVISOR_ENABLED',
  killSwitch: 'ASK_SKILL_PLANT_ADVISOR_KILL_SWITCH',
  owner: 'Homeowner Product / Home Care',
  lifecycleStatus: 'DEVELOPMENT',
  operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
