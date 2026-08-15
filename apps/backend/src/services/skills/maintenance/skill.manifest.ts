import type { AskOperationId } from '../../ask/askOperationRegistry';
import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const MAINTENANCE_SKILL_OPERATIONS: AskOperationId[] = [
  'MAINTENANCE_STATUS',
  'MAINTENANCE_TASK_CREATE',
  'MAINTENANCE_TASK_COMPLETE',
  'MAINTENANCE_TASK_UPDATE',
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
  version: '1.0.0',
  domain: 'HOME_CARE',
  displayName: 'Maintenance',
  description: 'Understand, create, complete, update, and monitor home maintenance work.',
  homeownerJobs: ['STAY_AHEAD', 'DECIDE_WITH_CONFIDENCE'],
  supportedGoals: [
    'understand-maintenance-status',
    'create-maintenance-task',
    'complete-maintenance-task',
    'update-maintenance-task',
    'monitor-home-deadline',
  ],
  aliases: ['maintenance', 'home upkeep', 'service schedule', 'maintenance reminders'],
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
    { id: 'home-deadline.monitor', version: '1.0' },
  ],
  allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: MAINTENANCE_SKILL_OPERATIONS }],
  riskPolicy: {
    effects: ['READ', 'WRITE'],
    materiality: 'MATERIAL',
    riskDomains: ['HOME_SAFETY'],
    reversibility: 'PARTIALLY_REVERSIBLE',
  },
  authorizationFloor: 'VIEWER',
  allowedResultBlocks: ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'WORKFLOW_PROGRESS', 'CAPABILITY_LIST'],
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
  contextBudget: {
    maxFacts: 250,
    maxEntities: 60,
    maxDocuments: 0,
    maxHistoryEvents: 100,
    maxSerializedBytes: 192_000,
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
