import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

// ASK_COZY_INLINE_WORKSPACE_FRD v1.59, capability-card audit (Appendix D): the eleventh new operation for a capability
// the audit found with no Ask operation. Reads projectTracker.service listProjects, the call GET /properties/:id/projects
// makes for the Project Tracker page. Its declared commands create projects and manage the bounded active-execution
// records that the canonical service owns; final completion and change-order approval retain dedicated governance.
export const PROJECT_TRACKER_SKILL = Object.freeze({
  id: 'project-tracker',
  version: '1.0.0',
  domain: 'HOME_PROJECTS',
  displayName: 'Project Tracker',
  description: "Review and manage this home's tracked contractor or DIY projects, including lifecycle, milestones, payments, progress notes, and issues.",
  homeownerJobs: ['STAY_AHEAD'],
  supportedGoals: ['review-tracked-projects'],
  aliases: ['project tracker', 'contractor projects', 'home projects'],
  operations: [{
    operationId: 'PROJECT_TRACKER_PROJECTS',
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }, {
    operationId: 'PROJECT_TRACKER_CREATE',
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }, {
    operationId: 'PROJECT_TRACKER_COMMAND',
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }],
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [{ id: 'project-tracker.projects', version: '1.0' }, { id: 'project-tracker.create', version: '1.0' }, { id: 'project-tracker.command', version: '1.0' }],
  allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: ['PROJECT_TRACKER_PROJECTS', 'PROJECT_TRACKER_CREATE', 'PROJECT_TRACKER_COMMAND'] }],
  autonomyLevel: 2,
  riskPolicy: {
    effects: ['READ', 'WRITE'],
    materiality: 'MATERIAL',
    riskDomains: ['FINANCIAL'],
    reversibility: 'REVERSIBLE',
  },
  authorizationFloor: 'VIEWER',
  allowedResultBlocks: ['SUMMARY', 'TABLE', 'GROUPED_LIST', 'EMPTY_STATE', 'BOUNDARY', 'WORKFLOW_PROGRESS', 'LIMITATION'],
  dependencies: [
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, version: PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, required: true },
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, version: PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, required: false },
    { type: 'OPERATION_CONTRACT', id: 'PROJECT_TRACKER_PROJECTS', version: '1.0', required: true },
    { type: 'OPERATION_CONTRACT', id: 'PROJECT_TRACKER_CREATE', version: '1.0', required: true },
    { type: 'OPERATION_CONTRACT', id: 'PROJECT_TRACKER_COMMAND', version: '1.0', required: true },
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
