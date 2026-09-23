import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

// ASK_COZY_INLINE_WORKSPACE_FRD v1.51, capability-card audit (Appendix D): the fourth new operation for a capability
// the audit found with no Ask operation. Reads listBoard, the same call the Status Board page's route
// (GET /properties/:id/status-board) makes, which also materializes missing board rows and recomputes stale statuses.
// Read-only; pin, hide, condition override and manual recompute are a follow-up.
export const STATUS_BOARD_SKILL = Object.freeze({
  id: 'status-board',
  version: '1.0.0',
  domain: 'HOME_CARE',
  displayName: 'Status Board',
  description: "Review the condition of this home's recorded appliances and systems: what needs action, what to monitor, and what is in good shape, with why.",
  homeownerJobs: ['STAY_AHEAD'],
  supportedGoals: ['review-home-item-condition'],
  aliases: ['status board', 'home status board', 'appliance condition', 'system condition'],
  operations: [{
    operationId: 'HOME_STATUS_BOARD',
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }],
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [{ id: 'status-board.read', version: '1.0' }],
  allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: ['HOME_STATUS_BOARD'] }],
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
    { type: 'OPERATION_CONTRACT', id: 'HOME_STATUS_BOARD', version: '1.0', required: true },
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
  evaluationSuite: 'skill-status-board-golden',
  featureFlag: 'ASK_SKILL_STATUS_BOARD_ENABLED',
  killSwitch: 'ASK_SKILL_STATUS_BOARD_KILL_SWITCH',
  owner: 'Homeowner Product / Home Care',
  lifecycleStatus: 'DEVELOPMENT',
  operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
