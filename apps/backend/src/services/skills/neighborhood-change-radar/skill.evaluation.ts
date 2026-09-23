import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const NEIGHBORHOOD_CHANGE_RADAR_SKILL_EVALUATION = deepFreezeSkillPackage({
  id: 'skill-neighborhood-change-radar-golden',
  skillId: 'neighborhood-change-radar',
  skillVersion: '1.0.0',
  routingCases: [
    { mode: 'EXACT', message: 'Show my Around Your Home feed', expectedOperationId: 'NEIGHBORHOOD_CHANGE_FEED' },
    { mode: 'PARAPHRASED', message: 'Are there zoning changes near my home?', expectedOperationId: 'NEIGHBORHOOD_CHANGE_FEED' },
    { mode: 'COLLOQUIAL', message: "What's changing around my home?", expectedOperationId: 'NEIGHBORHOOD_CHANGE_FEED' },
    // Typo lands on "Anny", not on the trigger phrase, so the deterministic pattern still resolves it.
    { mode: 'MISSPELLED', message: 'Anny new construction near my house?', expectedOperationId: 'NEIGHBORHOOD_CHANGE_FEED' },
  ],
  operationCases: [
    { operationId: 'NEIGHBORHOOD_CHANGE_FEED', expectedAdapter: { id: 'neighborhood-change.feed', version: '1.0' } },
  ],
  ambiguityCases: [
    {
      message: "What's new near my home?",
      candidateSkillIds: ['neighborhood-change-radar', 'home-event-radar'],
      expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK',
    },
  ],
  policyCases: [
    { consumer: 'ASK', operationId: 'NEIGHBORHOOD_CHANGE_FEED', allowed: true },
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
    { message: 'What is happening near my home?', expectedBehavior: 'DO_NOT_SELECT_SKILL' },
  ],
  exclusionCases: [
    { message: 'Tell me how much the new development will lower my home value', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' },
  ],
  resolutionAmbiguityCases: [
    { kind: 'ENTITY', message: 'Continue this request for the matching change', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'PROPERTY', message: 'Run this request for my home', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'DECISION_THREAD', message: 'Continue my current home decision', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  ],
  degradedModeCases: [
    {
      dependencyType: 'ADAPTER',
      dependency: { id: 'neighborhood-change.feed', version: '1.0' },
      expectedBehavior: 'DEGRADED_OR_UNAVAILABLE',
    },
  ],
  expectedAdapters: [{ id: 'neighborhood-change.feed', version: '1.0' }],
  prohibitedAdapters: ['home-event-radar.feed', 'intelligence-envelope.query'],
  expectedContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER, PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  prohibitedContextProviders: ['undeclared.financial-account'],
  expectedStatuses: ['ANSWERED', 'READY_WITH_LIMITATIONS'],
  expectedBlockTypes: ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'LIMITATION', 'BOUNDARY'],
  expectedCanonicalCalls: [{ id: 'neighborhood-change.feed', version: '1.0' }],
  prohibitedCanonicalCalls: ['home-event-radar.feed', 'intelligence-envelope.query'],
  modelDisabledCase: {
    message: 'Show my Around Your Home feed',
    expectedOperationId: 'NEIGHBORHOOD_CHANGE_FEED',
  },
  continuationCase: {
    message: 'Continue that request',
    sourceOperationId: 'NEIGHBORHOOD_CHANGE_FEED',
    expectedOperationId: 'NEIGHBORHOOD_CHANGE_FEED',
  },
  handoffCase: {
    suggestedNextSkillId: 'home-event-radar',
    suggestedGoal: 'review-monitored-home-events',
    reasonCodes: ['LOCAL_CHANGE_NEEDS_EVENT_CONTEXT'],
  },
  performanceCase: {
    message: 'Show my Around Your Home feed',
    maxSkillCandidates: 10,
    maxOperationCandidates: 3,
    smokeCeilingMs: 100,
  },
} satisfies SkillEvaluationPackage);
