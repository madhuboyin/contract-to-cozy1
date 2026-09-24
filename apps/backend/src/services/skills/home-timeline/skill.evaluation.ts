import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const HOME_TIMELINE_SKILL_EVALUATION = deepFreezeSkillPackage({
  id: 'skill-home-timeline-golden',
  skillId: 'home-timeline',
  skillVersion: '1.0.0',
  routingCases: [
    { mode: 'EXACT', message: 'Show my home timeline', expectedOperationId: 'HOME_TIMELINE_EVENTS' },
    { mode: 'PARAPHRASED', message: 'What does the history of our home include?', expectedOperationId: 'HOME_TIMELINE_EVENTS' },
    { mode: 'COLLOQUIAL', message: 'Which past repairs and improvements were logged?', expectedOperationId: 'HOME_TIMELINE_EVENTS' },
    // Typo lands on "Shwo", not on the trigger phrase, so the deterministic pattern still resolves it.
    { mode: 'MISSPELLED', message: 'Shwo my home timeline', expectedOperationId: 'HOME_TIMELINE_EVENTS' },
  ],
  operationCases: [
    { operationId: 'HOME_TIMELINE_EVENTS', expectedAdapter: { id: 'home-timeline.events', version: '1.0' } },
  ],
  ambiguityCases: [
    {
      message: 'What has happened to this house over the years?',
      candidateSkillIds: ['home-timeline', 'property-record'],
      expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK',
    },
  ],
  policyCases: [
    { consumer: 'ASK', operationId: 'HOME_TIMELINE_EVENTS', allowed: true },
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
    { message: 'What changed at my home recently?', expectedBehavior: 'DO_NOT_SELECT_SKILL' },
  ],
  exclusionCases: [
    { message: 'Delete the roof repair from my timeline', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' },
  ],
  resolutionAmbiguityCases: [
    { kind: 'ENTITY', message: 'Continue this request for the matching timeline event', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'PROPERTY', message: 'Run this request for my home', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'DECISION_THREAD', message: 'Continue my current home decision', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  ],
  degradedModeCases: [
    {
      dependencyType: 'ADAPTER',
      dependency: { id: 'home-timeline.events', version: '1.0' },
      expectedBehavior: 'DEGRADED_OR_UNAVAILABLE',
    },
  ],
  expectedAdapters: [{ id: 'home-timeline.events', version: '1.0' }],
  prohibitedAdapters: ['inventory.lookup', 'intelligence-envelope.query'],
  expectedContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER, PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  prohibitedContextProviders: ['undeclared.financial-account'],
  expectedStatuses: ['ANSWERED', 'READY_WITH_LIMITATIONS'],
  expectedBlockTypes: ['SUMMARY', 'GROUPED_LIST', 'LIMITATION', 'BOUNDARY'],
  expectedCanonicalCalls: [{ id: 'home-timeline.events', version: '1.0' }],
  prohibitedCanonicalCalls: ['inventory.lookup', 'intelligence-envelope.query'],
  modelDisabledCase: {
    message: 'Show my home timeline',
    expectedOperationId: 'HOME_TIMELINE_EVENTS',
  },
  continuationCase: {
    message: 'Continue that request',
    sourceOperationId: 'HOME_TIMELINE_EVENTS',
    expectedOperationId: 'HOME_TIMELINE_EVENTS',
  },
  handoffCase: {
    suggestedNextSkillId: 'property-record',
    suggestedGoal: 'summarize-property-record',
    reasonCodes: ['VERIFY_RECORDED_HOME_CONTEXT'],
  },
  performanceCase: {
    message: 'Show my home timeline',
    maxSkillCandidates: 10,
    maxOperationCandidates: 3,
    smokeCeilingMs: 100,
  },
} satisfies SkillEvaluationPackage);
