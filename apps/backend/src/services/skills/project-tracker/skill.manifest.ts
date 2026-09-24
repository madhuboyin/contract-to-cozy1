import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

// ASK_COZY_INLINE_WORKSPACE_FRD v1.59, capability-card audit (Appendix D): the eleventh new operation for a capability
// the audit found with no Ask operation. Reads projectTracker.service listProjects, the call GET /properties/:id/projects
// makes for the Project Tracker page. Read-only; creating projects and recording milestones, payments, change orders and
// issues stay on the page.
export const PROJECT_TRACKER_SKILL = Object.freeze({
  id: 'project-tracker',
  version: '1.0.0',
  domain: 'HOME_PROJECTS',
  displayName: 'Project Tracker',
  description: "Review this home's contractor projects in Project Tracker: which are active, completed or cancelled, with contract, paid and remaining amounts.",
  homeownerJobs: ['STAY_AHEAD'],
  supportedGoals: ['review-tracked-projects'],
  aliases: ['project tracker', 'contractor projects', 'home projects'],
  operations: [{
    operationId: 'PROJECT_TRACKER_PROJECTS',
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }],
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [{ id: 'project-tracker.projects', version: '1.0' }],
  allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: ['PROJECT_TRACKER_PROJECTS'] }],
  autonomyLevel: 1,
  riskPolicy: {
    effects: ['READ'],
    materiality: 'LOW',
    riskDomains: ['FINANCIAL'],
    reversibility: 'REVERSIBLE',
  },
  authorizationFloor: 'VIEWER',
  allowedResultBlocks: ['SUMMARY', 'GROUPED_LIST', 'BOUNDARY'],
  dependencies: [
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, version: PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, required: true },
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, version: PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, required: false },
    { type: 'OPERATION_CONTRACT', id: 'PROJECT_TRACKER_PROJECTS', version: '1.0', required: true },
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
  evaluationSuite: 'skill-project-tracker-golden',
  featureFlag: 'ASK_SKILL_PROJECT_TRACKER_ENABLED',
  killSwitch: 'ASK_SKILL_PROJECT_TRACKER_KILL_SWITCH',
  owner: 'Homeowner Product / Home Projects',
  lifecycleStatus: 'DEVELOPMENT',
  operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
