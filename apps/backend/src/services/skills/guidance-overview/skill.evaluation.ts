import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const GUIDANCE_OVERVIEW_SKILL_EVALUATION = deepFreezeSkillPackage({
  id: 'skill-guidance-overview-golden',
  skillId: 'guidance-overview',
  skillVersion: '1.0.0',
  routingCases: [
    { mode: 'EXACT', message: 'Show my guided journeys', expectedOperationId: 'GUIDANCE_JOURNEYS_LIST' },
    { mode: 'PARAPHRASED', message: 'Show the guided journeys I have going', expectedOperationId: 'GUIDANCE_JOURNEYS_LIST' },
    { mode: 'COLLOQUIAL', message: 'Where am I in my guided journey?', expectedOperationId: 'GUIDANCE_JOURNEYS_LIST' },
    // Typo lands on "Shwo", not on the trigger phrase, so the deterministic pattern still resolves it.
    { mode: 'MISSPELLED', message: 'Shwo my guided journeys', expectedOperationId: 'GUIDANCE_JOURNEYS_LIST' },
  ],
  operationCases: [
    { operationId: 'GUIDANCE_JOURNEYS_LIST', expectedAdapter: { id: 'guidance-overview.journeys', version: '1.0' } },
  ],
  ambiguityCases: [
    {
      message: 'What am I working through on the house?',
      candidateSkillIds: ['guidance-overview', 'home-operations'],
      expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK',
    },
  ],
  policyCases: [
    { consumer: 'ASK', operationId: 'GUIDANCE_JOURNEYS_LIST', allowed: true },
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
    { message: 'What maintenance tasks are due?', expectedBehavior: 'DO_NOT_SELECT_SKILL' },
  ],
  exclusionCases: [
    { message: 'Dismiss the guided journey for the water heater', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' },
  ],
  resolutionAmbiguityCases: [
    { kind: 'ENTITY', message: 'Continue this request for the matching journey', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'PROPERTY', message: 'Run this request for my home', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'DECISION_THREAD', message: 'Continue my current home decision', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  ],
  degradedModeCases: [
    {
      dependencyType: 'ADAPTER',
      dependency: { id: 'guidance-overview.journeys', version: '1.0' },
      expectedBehavior: 'DEGRADED_OR_UNAVAILABLE',
    },
  ],
  expectedAdapters: [{ id: 'guidance-overview.journeys', version: '1.0' }],
  prohibitedAdapters: ['inventory.lookup', 'intelligence-envelope.query'],
  expectedContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER, PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  prohibitedContextProviders: ['undeclared.financial-account'],
  expectedStatuses: ['ANSWERED', 'READY_WITH_LIMITATIONS'],
  expectedBlockTypes: ['SUMMARY', 'GROUPED_LIST', 'BOUNDARY'],
  expectedCanonicalCalls: [{ id: 'guidance-overview.journeys', version: '1.0' }],
  prohibitedCanonicalCalls: ['inventory.lookup', 'intelligence-envelope.query'],
  modelDisabledCase: {
    message: 'Show my guided journeys',
    expectedOperationId: 'GUIDANCE_JOURNEYS_LIST',
  },
  continuationCase: {
    message: 'Continue that request',
    sourceOperationId: 'GUIDANCE_JOURNEYS_LIST',
    expectedOperationId: 'GUIDANCE_JOURNEYS_LIST',
  },
  handoffCase: {
    suggestedNextSkillId: 'property-record',
    suggestedGoal: 'summarize-property-record',
    reasonCodes: ['VERIFY_RECORDED_HOME_CONTEXT'],
  },
  performanceCase: {
    message: 'Show my guided journeys',
    maxSkillCandidates: 10,
    maxOperationCandidates: 3,
    smokeCeilingMs: 100,
  },
} satisfies SkillEvaluationPackage);
