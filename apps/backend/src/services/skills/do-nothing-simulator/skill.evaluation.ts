import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const DO_NOTHING_SIMULATOR_SKILL_EVALUATION = deepFreezeSkillPackage({
  id: 'skill-do-nothing-simulator-golden',
  skillId: 'do-nothing-simulator',
  skillVersion: '1.0.0',
  routingCases: [
    { mode: 'EXACT', message: 'Show my do-nothing simulation', expectedOperationId: 'DO_NOTHING_SIMULATION' },
    { mode: 'PARAPHRASED', message: 'What is the cost of doing nothing on this house?', expectedOperationId: 'DO_NOTHING_SIMULATION' },
    { mode: 'COLLOQUIAL', message: 'What happens if we keep putting things off?', expectedOperationId: 'DO_NOTHING_SIMULATION' },
    // Typo lands on "Shwo", not on the trigger phrase, so the deterministic pattern still resolves it.
    { mode: 'MISSPELLED', message: 'Shwo my do-nothing simulation', expectedOperationId: 'DO_NOTHING_SIMULATION' },
  ],
  operationCases: [
    { operationId: 'DO_NOTHING_SIMULATION', expectedAdapter: { id: 'do-nothing-simulator.latest', version: '1.0' } },
  ],
  ambiguityCases: [
    {
      message: 'What if we just leave the house alone?',
      candidateSkillIds: ['do-nothing-simulator', 'ownership-cost'],
      expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK',
    },
  ],
  policyCases: [
    { consumer: 'ASK', operationId: 'DO_NOTHING_SIMULATION', allowed: true },
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
    { message: 'Should I repair or replace my water heater?', expectedBehavior: 'DO_NOT_SELECT_SKILL' },
  ],
  exclusionCases: [
    { message: 'Run a new do-nothing simulation for 24 months', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' },
  ],
  resolutionAmbiguityCases: [
    { kind: 'ENTITY', message: 'Continue this request for the matching scenario', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'PROPERTY', message: 'Run this request for my home', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'DECISION_THREAD', message: 'Continue my current home decision', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  ],
  degradedModeCases: [
    {
      dependencyType: 'ADAPTER',
      dependency: { id: 'do-nothing-simulator.latest', version: '1.0' },
      expectedBehavior: 'DEGRADED_OR_UNAVAILABLE',
    },
  ],
  expectedAdapters: [{ id: 'do-nothing-simulator.latest', version: '1.0' }],
  prohibitedAdapters: ['inventory.lookup', 'intelligence-envelope.query'],
  expectedContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER, PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  prohibitedContextProviders: ['undeclared.financial-account'],
  expectedStatuses: ['ANSWERED', 'READY_WITH_LIMITATIONS'],
  expectedBlockTypes: ['SUMMARY', 'GROUPED_LIST', 'LIMITATION', 'BOUNDARY'],
  expectedCanonicalCalls: [{ id: 'do-nothing-simulator.latest', version: '1.0' }],
  prohibitedCanonicalCalls: ['inventory.lookup', 'intelligence-envelope.query'],
  modelDisabledCase: {
    message: 'Show my do-nothing simulation',
    expectedOperationId: 'DO_NOTHING_SIMULATION',
  },
  continuationCase: {
    message: 'Continue that request',
    sourceOperationId: 'DO_NOTHING_SIMULATION',
    expectedOperationId: 'DO_NOTHING_SIMULATION',
  },
  handoffCase: {
    suggestedNextSkillId: 'property-record',
    suggestedGoal: 'summarize-property-record',
    reasonCodes: ['VERIFY_RECORDED_HOME_CONTEXT'],
  },
  performanceCase: {
    message: 'Show my do-nothing simulation',
    maxSkillCandidates: 10,
    maxOperationCandidates: 3,
    smokeCeilingMs: 100,
  },
} satisfies SkillEvaluationPackage);
