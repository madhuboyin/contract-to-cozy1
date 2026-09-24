import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const NEGOTIATION_SHIELD_SKILL_EVALUATION = deepFreezeSkillPackage({
  id: 'skill-negotiation-shield-golden',
  skillId: 'negotiation-shield',
  skillVersion: '1.0.0',
  routingCases: [
    { mode: 'EXACT', message: 'Show my negotiation shield cases', expectedOperationId: 'NEGOTIATION_SHIELD_CASES' },
    { mode: 'PARAPHRASED', message: 'List the negotiation reviews I have prepared', expectedOperationId: 'NEGOTIATION_SHIELD_CASES' },
    { mode: 'COLLOQUIAL', message: 'Which of my negotiations have been analyzed?', expectedOperationId: 'NEGOTIATION_SHIELD_CASES' },
    // Typo lands on "Shwo", not on the trigger phrase, so the deterministic pattern still resolves it.
    { mode: 'MISSPELLED', message: 'Shwo my negotiation shield', expectedOperationId: 'NEGOTIATION_SHIELD_CASES' },
  ],
  operationCases: [
    { operationId: 'NEGOTIATION_SHIELD_CASES', expectedAdapter: { id: 'negotiation-shield.cases', version: '1.0' } },
  ],
  ambiguityCases: [
    {
      message: 'Is this contractor price fair?',
      candidateSkillIds: ['negotiation-shield', 'quote-comparison'],
      expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK',
    },
  ],
  policyCases: [
    { consumer: 'ASK', operationId: 'NEGOTIATION_SHIELD_CASES', allowed: true },
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
    { message: 'What should I discuss with my agent about the inspection?', expectedBehavior: 'DO_NOT_SELECT_SKILL' },
  ],
  exclusionCases: [
    { message: 'Send my counteroffer to the contractor now', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' },
  ],
  resolutionAmbiguityCases: [
    { kind: 'ENTITY', message: 'Continue this request for the matching negotiation case', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'PROPERTY', message: 'Run this request for my home', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'DECISION_THREAD', message: 'Continue my current home decision', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  ],
  degradedModeCases: [
    {
      dependencyType: 'ADAPTER',
      dependency: { id: 'negotiation-shield.cases', version: '1.0' },
      expectedBehavior: 'DEGRADED_OR_UNAVAILABLE',
    },
  ],
  expectedAdapters: [{ id: 'negotiation-shield.cases', version: '1.0' }],
  prohibitedAdapters: ['inventory.lookup', 'intelligence-envelope.query'],
  expectedContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER, PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  prohibitedContextProviders: ['undeclared.financial-account'],
  expectedStatuses: ['ANSWERED', 'READY_WITH_LIMITATIONS'],
  expectedBlockTypes: ['SUMMARY', 'GROUPED_LIST', 'LIMITATION', 'BOUNDARY'],
  expectedCanonicalCalls: [{ id: 'negotiation-shield.cases', version: '1.0' }],
  prohibitedCanonicalCalls: ['inventory.lookup', 'intelligence-envelope.query'],
  modelDisabledCase: {
    message: 'Show my negotiation shield cases',
    expectedOperationId: 'NEGOTIATION_SHIELD_CASES',
  },
  continuationCase: {
    message: 'Continue that request',
    sourceOperationId: 'NEGOTIATION_SHIELD_CASES',
    expectedOperationId: 'NEGOTIATION_SHIELD_CASES',
  },
  handoffCase: {
    suggestedNextSkillId: 'quote-comparison',
    suggestedGoal: 'review-quote-comparison',
    reasonCodes: ['NEGOTIATION_NEEDS_QUOTE_COMPARISON'],
  },
  performanceCase: {
    message: 'Show my negotiation shield cases',
    maxSkillCandidates: 10,
    maxOperationCandidates: 3,
    smokeCeilingMs: 100,
  },
} satisfies SkillEvaluationPackage);
