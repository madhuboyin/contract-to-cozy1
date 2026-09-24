import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const PLANT_ADVISOR_SKILL_EVALUATION = deepFreezeSkillPackage({
  id: 'skill-plant-advisor-golden',
  skillId: 'plant-advisor',
  skillVersion: '1.0.0',
  routingCases: [
    { mode: 'EXACT', message: 'Show my plant care outlook', expectedOperationId: 'PLANT_CARE_OUTLOOK' },
    { mode: 'PARAPHRASED', message: 'Do my plants need anything with this weather?', expectedOperationId: 'PLANT_CARE_OUTLOOK' },
    { mode: 'COLLOQUIAL', message: 'How should I care for my garden zones this week?', expectedOperationId: 'PLANT_CARE_OUTLOOK' },
    // Typo lands on "Shwo", not on the trigger phrase, so the deterministic pattern still resolves it.
    { mode: 'MISSPELLED', message: 'Shwo my plant care', expectedOperationId: 'PLANT_CARE_OUTLOOK' },
  ],
  operationCases: [
    { operationId: 'PLANT_CARE_OUTLOOK', expectedAdapter: { id: 'plant-advisor.care-outlook', version: '1.0' } },
  ],
  ambiguityCases: [
    {
      message: 'What should I take care of outside this week?',
      candidateSkillIds: ['plant-advisor', 'maintenance'],
      expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK',
    },
  ],
  policyCases: [
    { consumer: 'ASK', operationId: 'PLANT_CARE_OUTLOOK', allowed: true },
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
    { message: 'Which plants should I buy for my living room?', expectedBehavior: 'DO_NOT_SELECT_SKILL' },
  ],
  exclusionCases: [
    { message: 'Diagnose the disease on my plant from this photo', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' },
  ],
  resolutionAmbiguityCases: [
    { kind: 'ENTITY', message: 'Continue this request for the matching plant', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'PROPERTY', message: 'Run this request for my home', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'DECISION_THREAD', message: 'Continue my current home decision', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  ],
  degradedModeCases: [
    {
      dependencyType: 'ADAPTER',
      dependency: { id: 'plant-advisor.care-outlook', version: '1.0' },
      expectedBehavior: 'DEGRADED_OR_UNAVAILABLE',
    },
  ],
  expectedAdapters: [{ id: 'plant-advisor.care-outlook', version: '1.0' }],
  prohibitedAdapters: ['inventory.lookup', 'intelligence-envelope.query'],
  expectedContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER, PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  prohibitedContextProviders: ['undeclared.financial-account'],
  expectedStatuses: ['ANSWERED', 'READY_WITH_LIMITATIONS'],
  expectedBlockTypes: ['SUMMARY', 'GROUPED_LIST', 'LIMITATION', 'BOUNDARY'],
  expectedCanonicalCalls: [{ id: 'plant-advisor.care-outlook', version: '1.0' }],
  prohibitedCanonicalCalls: ['inventory.lookup', 'intelligence-envelope.query'],
  modelDisabledCase: {
    message: 'Show my plant care outlook',
    expectedOperationId: 'PLANT_CARE_OUTLOOK',
  },
  continuationCase: {
    message: 'Continue that request',
    sourceOperationId: 'PLANT_CARE_OUTLOOK',
    expectedOperationId: 'PLANT_CARE_OUTLOOK',
  },
  handoffCase: {
    suggestedNextSkillId: 'maintenance',
    suggestedGoal: 'understand-maintenance-status',
    reasonCodes: ['PLANT_CARE_NEEDS_MAINTENANCE_TASK'],
  },
  performanceCase: {
    message: 'Show my plant care outlook',
    maxSkillCandidates: 10,
    maxOperationCandidates: 3,
    smokeCeilingMs: 100,
  },
} satisfies SkillEvaluationPackage);
