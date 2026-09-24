import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const MATERIAL_SPECS_SKILL_EVALUATION = deepFreezeSkillPackage({
  id: 'skill-material-specs-golden',
  skillId: 'material-specs',
  skillVersion: '1.0.0',
  routingCases: [
    { mode: 'EXACT', message: 'Show my material specs', expectedOperationId: 'MATERIAL_SPECS_LIST' },
    { mode: 'PARAPHRASED', message: 'What paint colour did we use in the living room?', expectedOperationId: 'MATERIAL_SPECS_LIST' },
    { mode: 'COLLOQUIAL', message: 'Which tile and flooring did we put in the kitchen?', expectedOperationId: 'MATERIAL_SPECS_LIST' },
    // Typo lands on "Shwo", not on the trigger phrase, so the deterministic pattern still resolves it.
    { mode: 'MISSPELLED', message: 'Shwo my material specs', expectedOperationId: 'MATERIAL_SPECS_LIST' },
  ],
  operationCases: [
    { operationId: 'MATERIAL_SPECS_LIST', expectedAdapter: { id: 'material-specs.list', version: '1.0' } },
  ],
  ambiguityCases: [
    {
      message: 'What did we put in the bathroom?',
      candidateSkillIds: ['material-specs', 'property-record'],
      expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK',
    },
  ],
  policyCases: [
    { consumer: 'ASK', operationId: 'MATERIAL_SPECS_LIST', allowed: true },
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
    { message: 'What paint colour should I choose for the bedroom?', expectedBehavior: 'DO_NOT_SELECT_SKILL' },
  ],
  exclusionCases: [
    { message: 'Order two more gallons of the living room paint', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' },
  ],
  resolutionAmbiguityCases: [
    { kind: 'ENTITY', message: 'Continue this request for the matching material', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'PROPERTY', message: 'Run this request for my home', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'DECISION_THREAD', message: 'Continue my current home decision', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  ],
  degradedModeCases: [
    {
      dependencyType: 'ADAPTER',
      dependency: { id: 'material-specs.list', version: '1.0' },
      expectedBehavior: 'DEGRADED_OR_UNAVAILABLE',
    },
  ],
  expectedAdapters: [{ id: 'material-specs.list', version: '1.0' }],
  prohibitedAdapters: ['inventory.lookup', 'intelligence-envelope.query'],
  expectedContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER, PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  prohibitedContextProviders: ['undeclared.financial-account'],
  expectedStatuses: ['ANSWERED', 'READY_WITH_LIMITATIONS'],
  expectedBlockTypes: ['SUMMARY', 'GROUPED_LIST', 'LIMITATION', 'BOUNDARY'],
  expectedCanonicalCalls: [{ id: 'material-specs.list', version: '1.0' }],
  prohibitedCanonicalCalls: ['inventory.lookup', 'intelligence-envelope.query'],
  modelDisabledCase: {
    message: 'Show my material specs',
    expectedOperationId: 'MATERIAL_SPECS_LIST',
  },
  continuationCase: {
    message: 'Continue that request',
    sourceOperationId: 'MATERIAL_SPECS_LIST',
    expectedOperationId: 'MATERIAL_SPECS_LIST',
  },
  handoffCase: {
    suggestedNextSkillId: 'property-record',
    suggestedGoal: 'summarize-property-record',
    reasonCodes: ['VERIFY_RECORDED_HOME_CONTEXT'],
  },
  performanceCase: {
    message: 'Show my material specs',
    maxSkillCandidates: 10,
    maxOperationCandidates: 3,
    smokeCeilingMs: 100,
  },
} satisfies SkillEvaluationPackage);
