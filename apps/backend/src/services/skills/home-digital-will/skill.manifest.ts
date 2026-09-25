import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

// ASK_COZY_INLINE_WORKSPACE_FRD v1.54, capability-card audit (Appendix D): the sixth new operation for a capability
// the audit found with no Ask operation. Reads HomeDigitalWillService.getByProperty, the same call the Home Continuity
// Plan page's route (GET /properties/:id/home-digital-will) makes, behind the same CONTRIBUTOR floor. Entry titles only
// and contacts without email or phone, since entries can hold access notes. Read-only; edits are a follow-up.
export const HOME_DIGITAL_WILL_SKILL = Object.freeze({
  id: 'home-digital-will',
  version: '1.0.0',
  domain: 'HOME_INTELLIGENCE',
  displayName: 'Home Continuity Plan',
  description: "Review this home's continuity plan: how ready it is to hand off, what each section holds and who the trusted contacts are.",
  homeownerJobs: ['NAVIGATE_MAJOR_MOMENTS'],
  supportedGoals: ['review-home-continuity-plan'],
  aliases: ['home continuity plan', 'digital will', 'home digital will', 'home handoff plan'],
  operations: [{
    operationId: 'HOME_DIGITAL_WILL',
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }],
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [{ id: 'home-digital-will.read', version: '1.0' }],
  allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: ['HOME_DIGITAL_WILL'] }],
  autonomyLevel: 1,
  riskPolicy: {
    effects: ['READ'],
    materiality: 'LOW',
    riskDomains: ['PRIVACY', 'HOUSEHOLD_SECURITY'],
    reversibility: 'REVERSIBLE',
  },
  authorizationFloor: 'CONTRIBUTOR',
  allowedResultBlocks: ['SUMMARY', 'GROUPED_LIST', 'PROGRESS', 'LIMITATION', 'BOUNDARY'],
  dependencies: [
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, version: PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, required: true },
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, version: PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, required: false },
    { type: 'OPERATION_CONTRACT', id: 'HOME_DIGITAL_WILL', version: '1.0', required: true },
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
  evaluationSuite: 'skill-home-digital-will-golden',
  featureFlag: 'ASK_SKILL_HOME_DIGITAL_WILL_ENABLED',
  killSwitch: 'ASK_SKILL_HOME_DIGITAL_WILL_KILL_SWITCH',
  owner: 'Homeowner Product / Home Care',
  lifecycleStatus: 'DEVELOPMENT',
  operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
