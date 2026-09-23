import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

// ASK_COZY_INLINE_WORKSPACE_FRD v1.53, capability-card audit (Appendix D): the fifth new operation for a capability
// the audit found with no Ask operation. Reads HomeHabitCoachService.listActiveHabits, the same call the Home Habit
// Coach page's route (GET /properties/:id/home-habits) makes. A pure read that never generates habits; adopt, complete,
// snooze, skip, dismiss and generate are a follow-up.
export const HOME_HABIT_COACH_SKILL = Object.freeze({
  id: 'home-habit-coach',
  version: '1.0.0',
  domain: 'HOME_CARE',
  displayName: 'Home Habit Coach',
  description: 'Review the small household habits the Home Habit Coach suggests for this home, ranked, with why each was suggested.',
  homeownerJobs: ['STAY_AHEAD'],
  supportedGoals: ['review-home-habits'],
  aliases: ['habit coach', 'home habit coach', 'home habits', 'home care habits'],
  operations: [{
    operationId: 'HOME_HABITS',
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }],
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [{ id: 'home-habits.read', version: '1.0' }],
  allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: ['HOME_HABITS'] }],
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
    { type: 'OPERATION_CONTRACT', id: 'HOME_HABITS', version: '1.0', required: true },
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
  evaluationSuite: 'skill-home-habit-coach-golden',
  featureFlag: 'ASK_SKILL_HOME_HABIT_COACH_ENABLED',
  killSwitch: 'ASK_SKILL_HOME_HABIT_COACH_KILL_SWITCH',
  owner: 'Homeowner Product / Home Care',
  lifecycleStatus: 'DEVELOPMENT',
  operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
