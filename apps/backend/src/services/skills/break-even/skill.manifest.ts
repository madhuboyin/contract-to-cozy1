import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

// ASK_COZY_INLINE_WORKSPACE_FRD v1.48, capability-card audit (Appendix D): the first new operation for a capability
// the audit found with no Ask operation. Reads BreakEvenService.compute, the same call the Break-Even page's route
// (GET /properties/:id/tools/break-even) makes. Read-only; the page's assumption overrides are not exposed.
export const BREAK_EVEN_SKILL = Object.freeze({
  id: 'break-even',
  version: '1.0.0',
  domain: 'HOME_FINANCE',
  displayName: 'Break-Even',
  description: 'Show when owning this home breaks even, as projected appreciation catches up with cumulative ownership costs, with a conservative-to-optimistic range.',
  homeownerJobs: ['DECIDE_WITH_CONFIDENCE'],
  supportedGoals: ['review-ownership-break-even'],
  aliases: ['break even', 'home break-even', 'ownership break even', 'when does owning pay off'],
  operations: [{
    operationId: 'BREAK_EVEN_ANALYSIS',
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }],
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [{ id: 'break-even.analysis', version: '1.0' }],
  allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: ['BREAK_EVEN_ANALYSIS'] }],
  autonomyLevel: 1,
  riskPolicy: {
    effects: ['READ'],
    materiality: 'MATERIAL',
    riskDomains: ['FINANCIAL'],
    reversibility: 'REVERSIBLE',
  },
  authorizationFloor: 'VIEWER',
  allowedResultBlocks: ['SUMMARY', 'TABLE', 'EVIDENCE', 'LIMITATION', 'BOUNDARY'],
  dependencies: [
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, version: PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, required: true },
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, version: PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, required: false },
    { type: 'OPERATION_CONTRACT', id: 'BREAK_EVEN_ANALYSIS', version: '1.0', required: true },
  ],
  contextBudget: {
    maxFacts: 40,
    maxEntities: 10,
    maxDocuments: 0,
    maxHistoryEvents: 0,
    maxSerializedBytes: 64_000,
    maxProviderLatencyMs: 3_000,
    maxOverallLatencyMs: 10_000,
  },
  evaluationSuite: 'skill-break-even-golden',
  featureFlag: 'ASK_SKILL_BREAK_EVEN_ENABLED',
  killSwitch: 'ASK_SKILL_BREAK_EVEN_KILL_SWITCH',
  owner: 'Homeowner Product / Home Finance',
  lifecycleStatus: 'DEVELOPMENT',
  operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
