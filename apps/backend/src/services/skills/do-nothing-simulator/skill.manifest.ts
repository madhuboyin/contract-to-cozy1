import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

// ASK_COZY_INLINE_WORKSPACE_FRD v1.68, capability-card audit (Appendix D): reads DoNothingSimulatorService getLatestRun and
// listScenarios, the two GETs the Do-Nothing Simulator page makes on load. OWNER floor: the service only admits the
// primary homeowner profile. Read-only; running, saving and editing scenarios stay on the page.
export const DO_NOTHING_SIMULATOR_SKILL = Object.freeze({
  id: 'do-nothing-simulator',
  version: '1.0.0',
  domain: 'HOME_CARE',
  displayName: 'Do-Nothing Simulator',
  description: "Review the latest Do-Nothing Simulator run: what putting off home upkeep could cost, the risk drivers, the biggest avoidable losses and the saved scenarios.",
  homeownerJobs: ['STAY_AHEAD'],
  supportedGoals: ['review-do-nothing-simulation'],
  aliases: ['do-nothing simulator', 'cost of doing nothing', 'cost of waiting'],
  operations: [{
    operationId: 'DO_NOTHING_SIMULATION',
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }],
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [{ id: 'do-nothing-simulator.latest', version: '1.0' }],
  allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: ['DO_NOTHING_SIMULATION'] }],
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
    { type: 'OPERATION_CONTRACT', id: 'DO_NOTHING_SIMULATION', version: '1.0', required: true },
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
  evaluationSuite: 'skill-do-nothing-simulator-golden',
  featureFlag: 'ASK_SKILL_DO_NOTHING_SIMULATOR_ENABLED',
  killSwitch: 'ASK_SKILL_DO_NOTHING_SIMULATOR_KILL_SWITCH',
  owner: 'Homeowner Product / Home Records',
  lifecycleStatus: 'DEVELOPMENT',
  operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
