import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

// ASK_COZY_INLINE_WORKSPACE_FRD v1.70, product decision option A: Budget Planner's calculated upkeep forecast
// (BudgetForecasterService.generateBudgetForecast with includeRecommendations: false). OWNER floor: the service only
// admits the primary homeowner profile. The Gemini recommendations stay on the page.
export const BUDGET_PLANNER_SKILL = Object.freeze({
  id: 'budget-planner',
  version: '1.0.0',
  domain: 'HOME_CARE',
  displayName: 'Budget Planner',
  description: "See how much to budget for home upkeep: a yearly total, a monthly average, a month-by-month forecast and a split by category.",
  homeownerJobs: ['STAY_AHEAD'],
  supportedGoals: ['review-maintenance-budget'],
  aliases: ['budget planner', 'upkeep budget', 'maintenance budget'],
  operations: [{
    operationId: 'MAINTENANCE_BUDGET_FORECAST',
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }],
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [{ id: 'budget-planner.forecast', version: '1.0' }],
  allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: ['MAINTENANCE_BUDGET_FORECAST'] }],
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
    { type: 'OPERATION_CONTRACT', id: 'MAINTENANCE_BUDGET_FORECAST', version: '1.0', required: true },
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
  evaluationSuite: 'skill-budget-planner-golden',
  featureFlag: 'ASK_SKILL_BUDGET_PLANNER_ENABLED',
  killSwitch: 'ASK_SKILL_BUDGET_PLANNER_KILL_SWITCH',
  owner: 'Homeowner Product / Home Records',
  lifecycleStatus: 'DEVELOPMENT',
  operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
