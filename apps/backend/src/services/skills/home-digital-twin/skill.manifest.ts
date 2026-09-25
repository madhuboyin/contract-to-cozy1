import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

// ASK_COZY_INLINE_WORKSPACE_FRD v1.57, capability-card audit (Appendix D): the ninth new operation for a capability the
// audit found with no Ask operation. Reads HomeDigitalTwinScenarioService.listScenarios, the call GET
// /properties/:id/home-digital-twin/scenarios makes, for the property's twin (never created from Ask). Read-only;
// creating, calculating and deciding on options stay on the page.
export const HOME_DIGITAL_TWIN_SKILL = Object.freeze({
  id: 'home-digital-twin',
  version: '1.0.0',
  domain: 'HOME_CARE',
  displayName: 'Home Upgrade Planner',
  description: "Review the upgrade options saved in this home's Home Upgrade Planner, grouped by system, with estimated cost, savings, payback and any decision recorded.",
  homeownerJobs: ['DECIDE_WITH_CONFIDENCE'],
  supportedGoals: ['review-home-upgrade-options'],
  aliases: ['home upgrade planner', 'home digital twin', 'upgrade options', 'what-if scenarios'],
  operations: [{
    operationId: 'HOME_UPGRADE_SCENARIOS',
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }],
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [{ id: 'home-digital-twin.scenarios', version: '1.0' }],
  allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: ['HOME_UPGRADE_SCENARIOS'] }],
  autonomyLevel: 1,
  riskPolicy: {
    effects: ['READ'],
    materiality: 'LOW',
    riskDomains: ['FINANCIAL', 'HOME_SAFETY'],
    reversibility: 'REVERSIBLE',
  },
  authorizationFloor: 'VIEWER',
  allowedResultBlocks: ['SUMMARY', 'GROUPED_LIST', 'COMPARISON', 'BOUNDARY'],
  dependencies: [
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, version: PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, required: true },
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, version: PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, required: false },
    { type: 'OPERATION_CONTRACT', id: 'HOME_UPGRADE_SCENARIOS', version: '1.0', required: true },
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
  evaluationSuite: 'skill-home-digital-twin-golden',
  featureFlag: 'ASK_SKILL_HOME_DIGITAL_TWIN_ENABLED',
  killSwitch: 'ASK_SKILL_HOME_DIGITAL_TWIN_KILL_SWITCH',
  owner: 'Homeowner Product / Decide and Compare',
  lifecycleStatus: 'DEVELOPMENT',
  operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
