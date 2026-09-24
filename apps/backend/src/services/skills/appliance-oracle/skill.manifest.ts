import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

// ASK_COZY_INLINE_WORKSPACE_FRD v1.70, product decision option A: Appliance Oracle's calculated failure risk
// (ApplianceOracleService.generateOracleReport with includeRecommendations: false). OWNER floor: the service only admits
// the primary homeowner profile. The Gemini replacement recommendations stay on the page.
export const APPLIANCE_ORACLE_SKILL = Object.freeze({
  id: 'appliance-oracle',
  version: '1.0.0',
  domain: 'HOME_CARE',
  displayName: 'Appliance Oracle',
  description: "See which appliances and systems are nearing the end of their expected life, with failure risk by age and a replacement estimate.",
  homeownerJobs: ['STAY_AHEAD'],
  supportedGoals: ['review-appliance-failure-risk'],
  aliases: ['appliance oracle', 'failure risk', 'appliance lifespan'],
  operations: [{
    operationId: 'APPLIANCE_FAILURE_RISK',
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }],
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [{ id: 'appliance-oracle.risk', version: '1.0' }],
  allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: ['APPLIANCE_FAILURE_RISK'] }],
  autonomyLevel: 1,
  riskPolicy: {
    effects: ['READ'],
    materiality: 'LOW',
    riskDomains: ['HOME_SAFETY'],
    reversibility: 'REVERSIBLE',
  },
  authorizationFloor: 'OWNER',
  allowedResultBlocks: ['SUMMARY', 'LIFESPAN', 'GROUPED_LIST', 'LIMITATION', 'BOUNDARY'],
  dependencies: [
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, version: PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, required: true },
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, version: PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, required: false },
    { type: 'OPERATION_CONTRACT', id: 'APPLIANCE_FAILURE_RISK', version: '1.0', required: true },
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
  evaluationSuite: 'skill-appliance-oracle-golden',
  featureFlag: 'ASK_SKILL_APPLIANCE_ORACLE_ENABLED',
  killSwitch: 'ASK_SKILL_APPLIANCE_ORACLE_KILL_SWITCH',
  owner: 'Homeowner Product / Home Records',
  lifecycleStatus: 'DEVELOPMENT',
  operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
