import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const SERVICE_PRICE_RADAR_SKILL_EVALUATION = deepFreezeSkillPackage({
  id: 'skill-service-price-radar-golden',
  skillId: 'service-price-radar',
  skillVersion: '1.0.0',
  routingCases: [
    { mode: 'EXACT', message: 'Show my service price radar', expectedOperationId: 'SERVICE_PRICE_CHECKS' },
    { mode: 'PARAPHRASED', message: 'Which of my price checks came in above the expected range?', expectedOperationId: 'SERVICE_PRICE_CHECKS' },
    { mode: 'COLLOQUIAL', message: 'What did my past quote checks say?', expectedOperationId: 'SERVICE_PRICE_CHECKS' },
    // Typo lands on "Shwo", not on the trigger phrase, so the deterministic pattern still resolves it.
    { mode: 'MISSPELLED', message: 'Shwo my price radar', expectedOperationId: 'SERVICE_PRICE_CHECKS' },
  ],
  operationCases: [
    { operationId: 'SERVICE_PRICE_CHECKS', expectedAdapter: { id: 'service-price-radar.checks', version: '1.0' } },
  ],
  ambiguityCases: [
    {
      message: 'Is this plumber quote too high?',
      candidateSkillIds: ['service-price-radar', 'quote-comparison'],
      expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK',
    },
  ],
  policyCases: [
    { consumer: 'ASK', operationId: 'SERVICE_PRICE_CHECKS', allowed: true },
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
    { message: 'Tell the contractor his quote is too high', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' },
  ],
  resolutionAmbiguityCases: [
    { kind: 'ENTITY', message: 'Continue this request for the matching quote check', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'PROPERTY', message: 'Run this request for my home', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'DECISION_THREAD', message: 'Continue my current home decision', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  ],
  degradedModeCases: [
    {
      dependencyType: 'ADAPTER',
      dependency: { id: 'service-price-radar.checks', version: '1.0' },
      expectedBehavior: 'DEGRADED_OR_UNAVAILABLE',
    },
  ],
  expectedAdapters: [{ id: 'service-price-radar.checks', version: '1.0' }],
  prohibitedAdapters: ['inventory.lookup', 'intelligence-envelope.query'],
  expectedContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER, PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  prohibitedContextProviders: ['undeclared.financial-account'],
  expectedStatuses: ['ANSWERED', 'READY_WITH_LIMITATIONS', 'BLOCKED'],
  expectedBlockTypes: ['SUMMARY', 'GROUPED_LIST', 'LIMITATION', 'BOUNDARY'],
  expectedCanonicalCalls: [{ id: 'service-price-radar.checks', version: '1.0' }],
  prohibitedCanonicalCalls: ['inventory.lookup', 'intelligence-envelope.query'],
  modelDisabledCase: {
    message: 'Show my service price radar',
    expectedOperationId: 'SERVICE_PRICE_CHECKS',
  },
  continuationCase: {
    message: 'Continue that request',
    sourceOperationId: 'SERVICE_PRICE_CHECKS',
    expectedOperationId: 'SERVICE_PRICE_CHECKS',
  },
  handoffCase: {
    suggestedNextSkillId: 'quote-comparison',
    suggestedGoal: 'review-quote-comparison',
    reasonCodes: ['QUOTE_NEEDS_COMPARISON'],
  },
  performanceCase: {
    message: 'Show my service price radar',
    maxSkillCandidates: 10,
    maxOperationCandidates: 3,
    smokeCeilingMs: 100,
  },
} satisfies SkillEvaluationPackage);
