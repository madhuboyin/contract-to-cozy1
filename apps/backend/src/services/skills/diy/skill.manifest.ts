import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

// ASK_COZY_INLINE_WORKSPACE_FRD v1.58, capability-card audit (Appendix D): the tenth new operation for a capability the
// audit found with no Ask operation. Reads diyService.listProjects with the page's filter (planning and in progress),
// the call GET /properties/:id/diy/projects makes for the DIY page. Read-only; starting, stepping through, completing
// and abandoning projects, and the AI guide, stay on the page.
// Step 6 of the stateful GUIDE (docs/architecture/ASK_COZY_DIY_STEP_COMMANDS_PLAN.md) adds ONE write, DIY_STEP_UPDATE: mark the current step of a reviewed project done, or
// skip it, after confirmation. That supersedes the read-only stance above for template-sourced projects that pass the reviewed-guide gate; everything else stays on the page.
const DIY_PROJECT_WRITE_OPERATIONS = ['DIY_PROJECT_COMPLETE', 'DIY_PROJECT_ABANDON', 'DIY_COMPLETION_RECOVER'] as const;

export const DIY_SKILL = Object.freeze({
  id: 'diy',
  version: '1.0.0',
  domain: 'HOME_CARE',
  displayName: 'DIY Project Center',
  description: "Review this home's active DIY projects in planning or in progress, with how many required steps are done.",
  homeownerJobs: ['STAY_AHEAD'],
  supportedGoals: ['review-diy-projects', 'follow-diy-project-guide', 'advance-diy-project-step', 'finish-diy-project', 'stop-diy-project', 'recover-diy-completion'],
  aliases: ['diy project center', 'diy projects', 'do it yourself projects'],
  operations: [{
    operationId: 'DIY_PROJECTS',
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }, {
    // Step 5 of the stateful GUIDE: one project's guide, reached only by a launch context. Read-only.
    operationId: 'DIY_PROJECT_GUIDE',
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }, {
    // Step 6: confirmation-gated, CONTRIBUTOR; reached only by the declared actions on the project guide card.
    operationId: 'DIY_STEP_UPDATE',
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }, ...DIY_PROJECT_WRITE_OPERATIONS.map((operationId) => ({
    // Step 7B: finishing a project, and stopping or handing it off. Confirmation-gated, CONTRIBUTOR, IRREVERSIBLE in Cozy; reached only by declared actions on the project guide.
    operationId,
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }))],
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [{ id: 'diy.projects', version: '1.0' }, { id: 'diy.project-guide', version: '1.0' }, { id: 'diy.step-update', version: '1.0' }, { id: 'diy.project-complete', version: '1.0' }, { id: 'diy.project-abandon', version: '1.0' }, { id: 'diy.completion-recover', version: '1.0' }],
  allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: ['DIY_PROJECTS', 'DIY_PROJECT_GUIDE', 'DIY_STEP_UPDATE', ...DIY_PROJECT_WRITE_OPERATIONS] }],
  autonomyLevel: 2,
  riskPolicy: {
    effects: ['READ', 'WRITE'],
    materiality: 'MATERIAL',
    riskDomains: ['HOME_SAFETY'],
    // Finishing, stopping and handing off a project cannot be undone anywhere in Cozy (no operation reopens a closed project), so the skill is declared IRREVERSIBLE.
    reversibility: 'IRREVERSIBLE',
  },
  authorizationFloor: 'VIEWER',
  allowedResultBlocks: ['SUMMARY', 'GROUPED_LIST', 'LIMITATION', 'TASK_GUIDE', 'EMPTY_STATE', 'BOUNDARY', 'WORKFLOW_PROGRESS'],
  dependencies: [
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, version: PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, required: true },
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, version: PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, required: false },
    { type: 'OPERATION_CONTRACT', id: 'DIY_PROJECTS', version: '1.0', required: true },
    { type: 'OPERATION_CONTRACT', id: 'DIY_PROJECT_GUIDE', version: '1.0', required: true },
    { type: 'OPERATION_CONTRACT', id: 'DIY_STEP_UPDATE', version: '1.0', required: true },
    ...DIY_PROJECT_WRITE_OPERATIONS.map((id) => ({ type: 'OPERATION_CONTRACT' as const, id, version: '1.0', required: true })),
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
  evaluationSuite: 'skill-diy-golden',
  featureFlag: 'ASK_SKILL_DIY_ENABLED',
  killSwitch: 'ASK_SKILL_DIY_KILL_SWITCH',
  owner: 'Homeowner Product / Home Care',
  lifecycleStatus: 'DEVELOPMENT',
  operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
