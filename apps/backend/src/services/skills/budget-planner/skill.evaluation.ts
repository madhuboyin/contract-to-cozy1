import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const BUDGET_PLANNER_SKILL_EVALUATION = deepFreezeSkillPackage({
  id: 'skill-budget-planner-golden',
  skillId: 'budget-planner',
  skillVersion: '1.0.0',
  routingCases: [
    { mode: 'EXACT', message: 'Show my budget planner', expectedOperationId: 'MAINTENANCE_BUDGET_FORECAST' },
    { mode: 'PARAPHRASED', message: 'How much should we budget for home maintenance this year?', expectedOperationId: 'MAINTENANCE_BUDGET_FORECAST' },
    { mode: 'COLLOQUIAL', message: 'What is our yearly upkeep budget?', expectedOperationId: 'MAINTENANCE_BUDGET_FORECAST' },
    // Typo lands on "Shwo", not on the trigger phrase, so the deterministic pattern still resolves it.
    { mode: 'MISSPELLED', message: 'Shwo my budget planner', expectedOperationId: 'MAINTENANCE_BUDGET_FORECAST' },
  ],
  operationCases: [
    { operationId: 'MAINTENANCE_BUDGET_FORECAST', expectedAdapter: { id: 'budget-planner.forecast', version: '1.0' } },
  ],
  ambiguityCases: [
    {
      message: 'How much do houses like ours cost to keep up?',
      candidateSkillIds: ['budget-planner', 'ownership-cost'],
      expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK',
    },
  ],
  policyCases: [
    { consumer: 'ASK', operationId: 'MAINTENANCE_BUDGET_FORECAST', allowed: true },
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
    { message: 'What are my monthly ownership costs?', expectedBehavior: 'DO_NOT_SELECT_SKILL' },
  ],
  exclusionCases: [
    { message: 'Set up a new maintenance budget of $300 a month', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' },
  ],
  resolutionAmbiguityCases: [
    { kind: 'ENTITY', message: 'Continue this request for the matching item', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'PROPERTY', message: 'Run this request for my home', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'DECISION_THREAD', message: 'Continue my current home decision', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  ],
  degradedModeCases: [
    {
      dependencyType: 'ADAPTER',
      dependency: { id: 'budget-planner.forecast', version: '1.0' },
      expectedBehavior: 'DEGRADED_OR_UNAVAILABLE',
    },
  ],
  expectedAdapters: [{ id: 'budget-planner.forecast', version: '1.0' }],
  prohibitedAdapters: ['inventory.lookup', 'intelligence-envelope.query'],
  expectedContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER, PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  prohibitedContextProviders: ['undeclared.financial-account'],
  expectedStatuses: ['ANSWERED', 'READY_WITH_LIMITATIONS'],
  expectedBlockTypes: ['SUMMARY', 'GROUPED_LIST', 'LIMITATION', 'BOUNDARY'],
  expectedCanonicalCalls: [{ id: 'budget-planner.forecast', version: '1.0' }],
  prohibitedCanonicalCalls: ['inventory.lookup', 'intelligence-envelope.query'],
  modelDisabledCase: {
    message: 'Show my budget planner',
    expectedOperationId: 'MAINTENANCE_BUDGET_FORECAST',
  },
  continuationCase: {
    message: 'Continue that request',
    sourceOperationId: 'MAINTENANCE_BUDGET_FORECAST',
    expectedOperationId: 'MAINTENANCE_BUDGET_FORECAST',
  },
  handoffCase: {
    suggestedNextSkillId: 'property-record',
    suggestedGoal: 'summarize-property-record',
    reasonCodes: ['VERIFY_RECORDED_HOME_CONTEXT'],
  },
  performanceCase: {
    message: 'Show my budget planner',
    maxSkillCandidates: 10,
    maxOperationCandidates: 3,
    smokeCeilingMs: 100,
  },
} satisfies SkillEvaluationPackage);
