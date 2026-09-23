import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const HOME_RISK_REPLAY_SKILL_EVALUATION = deepFreezeSkillPackage({
  id: 'skill-home-risk-replay-golden',
  skillId: 'home-risk-replay',
  skillVersion: '1.0.0',
  routingCases: [
    { mode: 'EXACT', message: 'Show my home risk replay', expectedOperationId: 'PAST_HAZARD_EXPOSURE' },
    { mode: 'PARAPHRASED', message: 'What past hazards has this home been exposed to?', expectedOperationId: 'PAST_HAZARD_EXPOSURE' },
    { mode: 'COLLOQUIAL', message: 'Has my house ever been hit by a hurricane or a flood?', expectedOperationId: 'PAST_HAZARD_EXPOSURE' },
    // Typo lands on "Shwo", not on the trigger phrase, so the deterministic pattern still resolves it.
    { mode: 'MISSPELLED', message: 'Shwo my home risk replay', expectedOperationId: 'PAST_HAZARD_EXPOSURE' },
  ],
  operationCases: [
    { operationId: 'PAST_HAZARD_EXPOSURE', expectedAdapter: { id: 'home-risk-replay.exposure', version: '1.0' } },
  ],
  ambiguityCases: [
    {
      message: 'Is my home at risk from storms?',
      candidateSkillIds: ['home-risk-replay', 'home-event-radar'],
      expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK',
    },
  ],
  policyCases: [
    { consumer: 'ASK', operationId: 'PAST_HAZARD_EXPOSURE', allowed: true },
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
    { message: 'My basement flooded, help me file a claim', expectedBehavior: 'DO_NOT_SELECT_SKILL' },
  ],
  exclusionCases: [
    { message: 'Guarantee my home was never damaged by a storm', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' },
  ],
  resolutionAmbiguityCases: [
    { kind: 'ENTITY', message: 'Continue this request for the matching hazard', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'PROPERTY', message: 'Run this request for my home', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'DECISION_THREAD', message: 'Continue my current home decision', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  ],
  degradedModeCases: [
    {
      dependencyType: 'ADAPTER',
      dependency: { id: 'home-risk-replay.exposure', version: '1.0' },
      expectedBehavior: 'DEGRADED_OR_UNAVAILABLE',
    },
  ],
  expectedAdapters: [{ id: 'home-risk-replay.exposure', version: '1.0' }],
  prohibitedAdapters: ['home-event-radar.feed', 'intelligence-envelope.query'],
  expectedContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER, PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  prohibitedContextProviders: ['undeclared.financial-account'],
  expectedStatuses: ['ANSWERED', 'READY_WITH_LIMITATIONS'],
  expectedBlockTypes: ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'LIMITATION', 'BOUNDARY'],
  expectedCanonicalCalls: [{ id: 'home-risk-replay.exposure', version: '1.0' }],
  prohibitedCanonicalCalls: ['home-event-radar.feed', 'intelligence-envelope.query'],
  modelDisabledCase: {
    message: 'Show my home risk replay',
    expectedOperationId: 'PAST_HAZARD_EXPOSURE',
  },
  continuationCase: {
    message: 'Continue that request',
    sourceOperationId: 'PAST_HAZARD_EXPOSURE',
    expectedOperationId: 'PAST_HAZARD_EXPOSURE',
  },
  handoffCase: {
    suggestedNextSkillId: 'home-event-radar',
    suggestedGoal: 'review-monitored-home-events',
    reasonCodes: ['PAST_HAZARD_NEEDS_CURRENT_EVENTS'],
  },
  performanceCase: {
    message: 'Show my home risk replay',
    maxSkillCandidates: 10,
    maxOperationCandidates: 3,
    smokeCeilingMs: 100,
  },
} satisfies SkillEvaluationPackage);
