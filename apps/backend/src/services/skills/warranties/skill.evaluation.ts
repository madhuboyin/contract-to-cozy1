import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const WARRANTIES_SKILL_EVALUATION = deepFreezeSkillPackage({
  id: 'skill-warranties-golden',
  skillId: 'warranties',
  skillVersion: '1.0.0',
  routingCases: [
    { mode: 'EXACT', message: 'Show my warranties', expectedOperationId: 'WARRANTY_LOOKUP' },
    { mode: 'PARAPHRASED', message: 'Which warranties expire within 60 days?', expectedOperationId: 'WARRANTY_LOOKUP' },
    { mode: 'COLLOQUIAL', message: 'Is my roof warranty still active?', expectedOperationId: 'WARRANTY_LOOKUP' },
    // Typo lands on "Shwo", not on the trigger phrase, so the semantic router still resolves it.
    { mode: 'MISSPELLED', message: 'Shwo my warranties', expectedOperationId: 'WARRANTY_LOOKUP' },
  ],
  operationCases: [
    { operationId: 'WARRANTY_LOOKUP', expectedAdapter: { id: 'warranty.lookup', version: '1.0' } },
  ],
  ambiguityCases: [
    {
      message: 'Am I covered if my furnace breaks?',
      candidateSkillIds: ['warranties', 'coverage'],
      expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK',
    },
  ],
  policyCases: [
    { consumer: 'ASK', operationId: 'WARRANTY_LOOKUP', allowed: true },
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
    { message: 'Which items are missing warranty coverage?', expectedBehavior: 'DO_NOT_SELECT_SKILL' },
  ],
  exclusionCases: [
    { message: 'File a claim for my broken furnace', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' },
  ],
  resolutionAmbiguityCases: [
    { kind: 'ENTITY', message: 'Continue this request for the matching warranty', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'PROPERTY', message: 'Run this request for my home', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'DECISION_THREAD', message: 'Continue my current home decision', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  ],
  degradedModeCases: [
    {
      dependencyType: 'ADAPTER',
      dependency: { id: 'warranty.lookup', version: '1.0' },
      expectedBehavior: 'DEGRADED_OR_UNAVAILABLE',
    },
  ],
  expectedAdapters: [{ id: 'warranty.lookup', version: '1.0' }],
  prohibitedAdapters: ['inventory.lookup', 'coverage.review'],
  expectedContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER, PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  prohibitedContextProviders: ['undeclared.financial-account'],
  expectedStatuses: ['ANSWERED', 'READY_WITH_LIMITATIONS'],
  expectedBlockTypes: ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'LIMITATION', 'BOUNDARY'],
  expectedCanonicalCalls: [{ id: 'warranty.lookup', version: '1.0' }],
  prohibitedCanonicalCalls: ['inventory.lookup', 'coverage.review'],
  modelDisabledCase: {
    message: 'Show my warranties',
    expectedOperationId: 'WARRANTY_LOOKUP',
  },
  continuationCase: {
    message: 'Continue that request',
    sourceOperationId: 'WARRANTY_LOOKUP',
    expectedOperationId: 'WARRANTY_LOOKUP',
  },
  handoffCase: {
    suggestedNextSkillId: 'property-record',
    suggestedGoal: 'summarize-property-record',
    reasonCodes: ['VERIFY_RECORDED_HOME_CONTEXT'],
  },
  performanceCase: {
    message: 'Show my warranties',
    maxSkillCandidates: 10,
    maxOperationCandidates: 3,
    smokeCeilingMs: 100,
  },
} satisfies SkillEvaluationPackage);
