import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const HOME_HABIT_COACH_SKILL_EVALUATION = deepFreezeSkillPackage({
  id: 'skill-home-habit-coach-golden',
  skillId: 'home-habit-coach',
  skillVersion: '1.0.0',
  routingCases: [
    { mode: 'EXACT', message: 'Show my home habits', expectedOperationId: 'HOME_HABITS' },
    { mode: 'PARAPHRASED', message: 'Which habits is the coach suggesting for our house?', expectedOperationId: 'HOME_HABITS' },
    { mode: 'COLLOQUIAL', message: 'Which home care habits should I pick up?', expectedOperationId: 'HOME_HABITS' },
    // Typo lands on "Shwo", not on the trigger phrase, so the deterministic pattern still resolves it.
    { mode: 'MISSPELLED', message: 'Shwo my home habits', expectedOperationId: 'HOME_HABITS' },
  ],
  operationCases: [
    { operationId: 'HOME_HABITS', expectedAdapter: { id: 'home-habits.read', version: '1.0' } },
  ],
  ambiguityCases: [
    {
      message: 'What should I keep up with around the house?',
      candidateSkillIds: ['home-habit-coach', 'maintenance'],
      expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK',
    },
  ],
  policyCases: [
    { consumer: 'ASK', operationId: 'HOME_HABITS', allowed: true },
  ],
  contextCases: [
    { state: 'KNOWN', expectedBehavior: 'READY' },
    { state: 'MISSING', expectedBehavior: 'CAPTURE_OR_BLOCK' },
    { state: 'STALE', expectedBehavior: 'DISCLOSE_OR_BLOCK' },
    { state: 'CONFLICTING', expectedBehavior: 'BLOCK' },
    { state: 'UNAUTHORIZED', expectedBehavior: 'BLOCK' },
    { state: 'UNAVAILABLE', expectedBehavior: 'DEGRADED_OR_BLOCK' },
  ],
  negativeCases: [
    { message: 'What maintenance is due?', expectedBehavior: 'DO_NOT_SELECT_SKILL' },
  ],
  exclusionCases: [
    { message: 'Guarantee these habits will prevent every repair', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' },
  ],
  resolutionAmbiguityCases: [
    { kind: 'ENTITY', message: 'Continue this request for the matching habit', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'PROPERTY', message: 'Run this request for my home', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'DECISION_THREAD', message: 'Continue my current home decision', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  ],
  degradedModeCases: [
    {
      dependencyType: 'ADAPTER',
      dependency: { id: 'home-habits.read', version: '1.0' },
      expectedBehavior: 'DEGRADED_OR_UNAVAILABLE',
    },
  ],
  expectedAdapters: [{ id: 'home-habits.read', version: '1.0' }],
  prohibitedAdapters: ['inventory.lookup', 'intelligence-envelope.query'],
  expectedContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER, PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  prohibitedContextProviders: ['undeclared.financial-account'],
  expectedStatuses: ['ANSWERED', 'READY_WITH_LIMITATIONS'],
  expectedBlockTypes: ['SUMMARY', 'GROUPED_LIST', 'LIMITATION', 'BOUNDARY'],
  expectedCanonicalCalls: [{ id: 'home-habits.read', version: '1.0' }],
  prohibitedCanonicalCalls: ['inventory.lookup', 'intelligence-envelope.query'],
  modelDisabledCase: {
    message: 'Show my home habits',
    expectedOperationId: 'HOME_HABITS',
  },
  continuationCase: {
    message: 'Continue that request',
    sourceOperationId: 'HOME_HABITS',
    expectedOperationId: 'HOME_HABITS',
  },
  handoffCase: {
    suggestedNextSkillId: 'maintenance',
    suggestedGoal: 'understand-maintenance-status',
    reasonCodes: ['HABIT_NEEDS_MAINTENANCE_TASK'],
  },
  performanceCase: {
    message: 'Show my home habits',
    maxSkillCandidates: 10,
    maxOperationCandidates: 3,
    smokeCeilingMs: 100,
  },
} satisfies SkillEvaluationPackage);
