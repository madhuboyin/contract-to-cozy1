import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const PRICE_FINALIZATION_SKILL_EVALUATION = deepFreezeSkillPackage({
  id: 'skill-price-finalization-golden',
  skillId: 'price-finalization',
  skillVersion: '1.0.0',
  routingCases: [
    { mode: 'EXACT', message: 'Show my price finalizations', expectedOperationId: 'PRICE_FINALIZATIONS_LIST' },
    { mode: 'PARAPHRASED', message: 'What price did we agree with the plumber?', expectedOperationId: 'PRICE_FINALIZATIONS_LIST' },
    { mode: 'COLLOQUIAL', message: 'Which vendor terms have we finalized?', expectedOperationId: 'PRICE_FINALIZATIONS_LIST' },
    // Typo lands on "Shwo", not on the trigger phrase, so the deterministic pattern still resolves it.
    { mode: 'MISSPELLED', message: 'Shwo my price finalizations', expectedOperationId: 'PRICE_FINALIZATIONS_LIST' },
  ],
  operationCases: [
    { operationId: 'PRICE_FINALIZATIONS_LIST', expectedAdapter: { id: 'price-finalization.records', version: '1.0' } },
  ],
  ambiguityCases: [
    {
      message: 'What did we settle on with the contractor?',
      candidateSkillIds: ['price-finalization', 'quote-comparison'],
      expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK',
    },
  ],
  policyCases: [
    { consumer: 'ASK', operationId: 'PRICE_FINALIZATIONS_LIST', allowed: true },
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
    { message: 'Compare my service quotes', expectedBehavior: 'DO_NOT_SELECT_SKILL' },
  ],
  exclusionCases: [
    { message: 'Finalize the plumber price at $1,200', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' },
  ],
  resolutionAmbiguityCases: [
    { kind: 'ENTITY', message: 'Continue this request for the matching vendor', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'PROPERTY', message: 'Run this request for my home', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'DECISION_THREAD', message: 'Continue my current home decision', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  ],
  degradedModeCases: [
    {
      dependencyType: 'ADAPTER',
      dependency: { id: 'price-finalization.records', version: '1.0' },
      expectedBehavior: 'DEGRADED_OR_UNAVAILABLE',
    },
  ],
  expectedAdapters: [{ id: 'price-finalization.records', version: '1.0' }],
  prohibitedAdapters: ['inventory.lookup', 'intelligence-envelope.query'],
  expectedContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER, PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  prohibitedContextProviders: ['undeclared.financial-account'],
  expectedStatuses: ['ANSWERED', 'READY_WITH_LIMITATIONS'],
  expectedBlockTypes: ['SUMMARY', 'GROUPED_LIST', 'LIMITATION', 'BOUNDARY'],
  expectedCanonicalCalls: [{ id: 'price-finalization.records', version: '1.0' }],
  prohibitedCanonicalCalls: ['inventory.lookup', 'intelligence-envelope.query'],
  modelDisabledCase: {
    message: 'Show my price finalizations',
    expectedOperationId: 'PRICE_FINALIZATIONS_LIST',
  },
  continuationCase: {
    message: 'Continue that request',
    sourceOperationId: 'PRICE_FINALIZATIONS_LIST',
    expectedOperationId: 'PRICE_FINALIZATIONS_LIST',
  },
  handoffCase: {
    suggestedNextSkillId: 'property-record',
    suggestedGoal: 'summarize-property-record',
    reasonCodes: ['VERIFY_RECORDED_HOME_CONTEXT'],
  },
  performanceCase: {
    message: 'Show my price finalizations',
    maxSkillCandidates: 10,
    maxOperationCandidates: 3,
    smokeCeilingMs: 100,
  },
} satisfies SkillEvaluationPackage);
