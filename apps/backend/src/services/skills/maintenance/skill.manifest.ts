import type { AskOperationId } from '../../ask/askOperationRegistry';
import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const MAINTENANCE_SKILL_OPERATIONS: AskOperationId[] = [
  'MAINTENANCE_STATUS',
  'MAINTENANCE_TASK_CREATE',
  'MAINTENANCE_TASK_COMPLETE',
  'MAINTENANCE_TASK_UPDATE',
  'MAINTENANCE_FORECAST',
  'HOME_DEADLINE_MONITOR',
];

export const MAINTENANCE_TASK_CONTEXT_PROVIDER = Object.freeze({
  id: 'maintenance.task-context',
  version: '1.0.0',
});

export const SEASONAL_CHECKLIST_CONTEXT_PROVIDER = Object.freeze({
  id: 'maintenance.seasonal-checklist-context',
  version: '1.0.0',
});

export const MAINTENANCE_SKILL = Object.freeze({
  id: 'maintenance',
  version: '1.1.0',
  domain: 'HOME_CARE',
  displayName: 'Maintenance',
  description: 'Understand, create, complete, update, and monitor home maintenance work, and see predicted upcoming maintenance for verified home systems.',
  homeownerJobs: ['STAY_AHEAD', 'DECIDE_WITH_CONFIDENCE'],
  supportedGoals: [
    'understand-maintenance-status',
    'create-maintenance-task',
    'complete-maintenance-task',
    'update-maintenance-task',
    'monitor-home-deadline',
    'forecast-maintenance',
  ],
  aliases: ['maintenance', 'home upkeep', 'service schedule', 'maintenance reminders', 'maintenance forecast'],
  operations: MAINTENANCE_SKILL_OPERATIONS.map((operationId) => ({
    operationId,
    version: '1.0',
    requiredContextProviders: [
      PROPERTY_IDENTITY_CONTEXT_PROVIDER,
      ...(operationId === 'MAINTENANCE_STATUS' ? [MAINTENANCE_TASK_CONTEXT_PROVIDER] : []),
    ],
    optionalContextProviders: [
      PROPERTY_JOURNEY_CONTEXT_PROVIDER,
      ...(operationId === 'MAINTENANCE_STATUS' ? [SEASONAL_CHECKLIST_CONTEXT_PROVIDER] : []),
    ],
  })),
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER, MAINTENANCE_TASK_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER, SEASONAL_CHECKLIST_CONTEXT_PROVIDER],
  allowedAdapters: [
    { id: 'maintenance.status', version: '1.0' },
    { id: 'maintenance.create', version: '1.0' },
    { id: 'maintenance.complete', version: '1.0' },
    { id: 'maintenance.update', version: '1.0' },
    { id: 'maintenance.forecast', version: '1.0' },
    { id: 'home-deadline.monitor', version: '1.0' },
  ],
  allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: MAINTENANCE_SKILL_OPERATIONS }],
  autonomyLevel: 2,
  riskPolicy: {
    effects: ['READ', 'WRITE'],
    materiality: 'MATERIAL',
    riskDomains: ['HOME_SAFETY'],
    reversibility: 'PARTIALLY_REVERSIBLE',
  },
  authorizationFloor: 'VIEWER',
  allowedResultBlocks: ['SUMMARY', 'PROACTIVE_INSIGHT', 'GROUPED_LIST', 'EVIDENCE', 'EMPTY_STATE', 'WORKFLOW_PROGRESS', 'OUTPUT_ARTIFACTS', 'CAPABILITY_LIST', 'BOUNDARY'],
  dependencies: [
    ...[PROPERTY_IDENTITY_CONTEXT_PROVIDER, MAINTENANCE_TASK_CONTEXT_PROVIDER].map((provider) => ({
      type: 'CONTEXT_PROVIDER' as const,
      id: provider.id,
      version: provider.version,
      required: true,
    })),
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, version: PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, required: false },
    { type: 'CONTEXT_PROVIDER', id: SEASONAL_CHECKLIST_CONTEXT_PROVIDER.id, version: SEASONAL_CHECKLIST_CONTEXT_PROVIDER.version, required: false },
  ],
  // External review [P1]: maxEntities/maxFacts/maxSerializedBytes were the
  // generic scaffold defaults, not something sized for this domain --
  // maintenanceTaskContext.provider.ts treats one maintenance task as one
  // entity/fact, and includeCompleted: true means a property with a few
  // years of history can genuinely have well over 60 total task rows. At
  // the old maxEntities: 60, any property past that count hit
  // BUDGET_EXCEEDED and had the entire (required, DETERMINISTIC -- never
  // LLM-facing) MAINTENANCE_STATUS operation fail outright.
  //
  // Raised to skillRegistry.ts's own PLATFORM_CONTEXT_BUDGET_MAXIMUMS
  // ceiling (maxEntities: 100, maxSerializedBytes: 256_000) -- a genuine
  // platform-wide governance limit enforced across every Skill
  // (skillPlatformFoundation.test.js asserts no Skill exceeds it), not
  // something to override. maxFacts matched to maxEntities rather than
  // raised to its own separate 250 ceiling, since one task is exactly one
  // fact and one entity here; there is no reason for the two counts to
  // diverge for this provider.
  //
  // External review [P1] follow-up (MAINT-003/A02): that platform ceiling
  // is exactly why maintenanceTaskContext.provider.ts can no longer be the
  // source maintenanceResult filters/counts over -- a genuine cut of the
  // canonical task list at this ceiling silently dropped real matches for
  // any property past 100 (active) tasks. The provider itself now only
  // carries two small date facts through this budget; maintenanceResult
  // fetches the canonical full collection directly via
  // loadCanonicalMaintenanceTaskSet for its actual filtering/counting, so
  // this contextBudget no longer bounds task data at all for this skill.
  contextBudget: {
    maxFacts: 100,
    maxEntities: 100,
    maxDocuments: 0,
    maxHistoryEvents: 100,
    maxSerializedBytes: 256_000,
    maxProviderLatencyMs: 2_000,
    maxOverallLatencyMs: 15_000,
  },
  evaluationSuite: 'skill-maintenance-golden',
  featureFlag: 'ASK_SKILL_MAINTENANCE_ENABLED',
  killSwitch: 'ASK_SKILL_MAINTENANCE_KILL_SWITCH',
  owner: 'Homeowner Product / Home Care',
  lifecycleStatus: 'DEVELOPMENT',
  operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
