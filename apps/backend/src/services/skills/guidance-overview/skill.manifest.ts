import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

// ASK_COZY_INLINE_WORKSPACE_FRD v1.65, capability-card audit (Appendix D), product option A: reads getPropertyGuidance,
// the call GET /properties/:id/guidance makes for the Guidance Overview page. Read-only; starting a journey stays with
// GUIDANCE_JOURNEY_CREATE (home-operations skill), and completing, skipping or dismissing steps stay on the page.
const GUIDANCE_OVERVIEW_WRITE_OPERATIONS = ['GUIDANCE_STEP_SKIP', 'GUIDANCE_JOURNEY_DISMISS'] as const;

export const GUIDANCE_OVERVIEW_SKILL = Object.freeze({
  id: 'guidance-overview',
  version: '1.0.0',
  domain: 'HOME_CARE',
  displayName: 'Guidance Overview',
  description: "Review the guided journeys under way on Guidance Overview: each issue's steps done, the next step and anything blocking it.",
  homeownerJobs: ['STAY_AHEAD'],
  supportedGoals: ['review-guided-journeys', 'continue-guided-journey', 'skip-guided-journey-step', 'dismiss-guided-journey'],
  aliases: ['guidance overview', 'guided journeys', 'step-by-step plans'],
  operations: [{
    operationId: 'GUIDANCE_JOURNEYS_LIST',
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }, {
    // Phase 1 of the guided-journey continuation design: one journey's state, reached only by a launch context.
    operationId: 'GUIDANCE_JOURNEY_CONTINUE',
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }, ...GUIDANCE_OVERVIEW_WRITE_OPERATIONS.map((operationId) => ({
    // Phase 3: confirmation-gated, CONTRIBUTOR; reached only by the declared actions on the continuation view.
    operationId,
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }))],
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [{ id: 'guidance-overview.journeys', version: '1.0' }, { id: 'guidance-overview.continue', version: '1.0' }, { id: 'guidance-overview.step-skip', version: '1.0' }, { id: 'guidance-overview.journey-dismiss', version: '1.0' }],
  allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: ['GUIDANCE_JOURNEYS_LIST', 'GUIDANCE_JOURNEY_CONTINUE', ...GUIDANCE_OVERVIEW_WRITE_OPERATIONS] }],
  autonomyLevel: 2,
  riskPolicy: {
    effects: ['READ', 'WRITE'],
    materiality: 'MATERIAL',
    riskDomains: ['HOME_SAFETY'],
    reversibility: 'PARTIALLY_REVERSIBLE',
  },
  authorizationFloor: 'VIEWER',
  allowedResultBlocks: ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'EMPTY_STATE', 'BOUNDARY', 'WORKFLOW_PROGRESS'],
  dependencies: [
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, version: PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, required: true },
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, version: PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, required: false },
    { type: 'OPERATION_CONTRACT', id: 'GUIDANCE_JOURNEYS_LIST', version: '1.0', required: true },
    { type: 'OPERATION_CONTRACT', id: 'GUIDANCE_JOURNEY_CONTINUE', version: '1.0', required: true },
    ...GUIDANCE_OVERVIEW_WRITE_OPERATIONS.map((id) => ({ type: 'OPERATION_CONTRACT' as const, id, version: '1.0', required: true })),
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
  evaluationSuite: 'skill-guidance-overview-golden',
  featureFlag: 'ASK_SKILL_GUIDANCE_OVERVIEW_ENABLED',
  killSwitch: 'ASK_SKILL_GUIDANCE_OVERVIEW_KILL_SWITCH',
  owner: 'Homeowner Product / Guidance',
  lifecycleStatus: 'DEVELOPMENT',
  operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
