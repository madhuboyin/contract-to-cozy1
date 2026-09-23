import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const BREAK_EVEN_SKILL_EVALUATION = deepFreezeSkillPackage({
  id: 'skill-break-even-golden',
  skillId: 'break-even',
  skillVersion: '1.0.0',
  routingCases: [
    { mode: 'EXACT', message: 'Show my home break-even analysis', expectedOperationId: 'BREAK_EVEN_ANALYSIS' },
    { mode: 'PARAPHRASED', message: 'When will my home break even?', expectedOperationId: 'BREAK_EVEN_ANALYSIS' },
    { mode: 'COLLOQUIAL', message: 'Has this house paid for itself yet or is it still costing me?', expectedOperationId: 'BREAK_EVEN_ANALYSIS' },
    // Typo lands on "Shwo", not on the "break-even" trigger, so the deterministic pattern still resolves it.
    { mode: 'MISSPELLED', message: 'Shwo my home break-even analysis', expectedOperationId: 'BREAK_EVEN_ANALYSIS' },
  ],
  operationCases: [
    { operationId: 'BREAK_EVEN_ANALYSIS', expectedAdapter: { id: 'break-even.analysis', version: '1.0' } },
  ],
  ambiguityCases: [
    {
      message: 'Is this home a good financial decision?',
      candidateSkillIds: ['break-even', 'sell-hold-rent'],
      expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK',
    },
  ],
  policyCases: [
    { consumer: 'ASK', operationId: 'BREAK_EVEN_ANALYSIS', allowed: true },
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
    { message: 'When would refinancing my mortgage break even?', expectedBehavior: 'DO_NOT_SELECT_SKILL' },
  ],
  exclusionCases: [
    { message: 'Guarantee my home will be worth more than I paid when I sell', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' },
  ],
  resolutionAmbiguityCases: [
    { kind: 'ENTITY', message: 'Continue this request for the matching item', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'PROPERTY', message: 'Run this request for my home', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'DECISION_THREAD', message: 'Continue my current home decision', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  ],
  degradedModeCases: [
    {
      dependencyType: 'ADAPTER',
      dependency: { id: 'break-even.analysis', version: '1.0' },
      expectedBehavior: 'DEGRADED_OR_UNAVAILABLE',
    },
  ],
  expectedAdapters: [{ id: 'break-even.analysis', version: '1.0' }],
  prohibitedAdapters: ['sale-case.analysis', 'refinance.analysis'],
  expectedContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER, PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  prohibitedContextProviders: ['undeclared.financial-account'],
  expectedStatuses: ['ANSWERED', 'READY_WITH_LIMITATIONS'],
  expectedBlockTypes: ['SUMMARY', 'TABLE', 'EVIDENCE', 'LIMITATION', 'BOUNDARY'],
  expectedCanonicalCalls: [{ id: 'break-even.analysis', version: '1.0' }],
  prohibitedCanonicalCalls: ['sale-case.analysis', 'refinance.analysis'],
  modelDisabledCase: {
    message: 'Show my home break-even analysis',
    expectedOperationId: 'BREAK_EVEN_ANALYSIS',
  },
  continuationCase: {
    message: 'Continue that request',
    sourceOperationId: 'BREAK_EVEN_ANALYSIS',
    expectedOperationId: 'BREAK_EVEN_ANALYSIS',
  },
  handoffCase: {
    suggestedNextSkillId: 'sell-hold-rent',
    suggestedGoal: 'analyze-sell-hold-rent',
    reasonCodes: ['BREAK_EVEN_INFORMS_DISPOSITION'],
  },
  performanceCase: {
    message: 'Show my home break-even analysis',
    maxSkillCandidates: 10,
    maxOperationCandidates: 3,
    smokeCeilingMs: 100,
  },
} satisfies SkillEvaluationPackage);
