import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const HOME_EVENT_RADAR_SKILL_EVALUATION = deepFreezeSkillPackage({
  id: 'skill-home-event-radar-golden',
  skillId: 'home-event-radar',
  skillVersion: '1.0.0',
  routingCases: [
    { mode: 'EXACT', message: 'Show my home event radar feed', expectedOperationId: 'HOME_EVENT_RADAR_FEED' },
    { mode: 'PARAPHRASED', message: 'What monitored events are happening near my home?', expectedOperationId: 'HOME_EVENT_RADAR_FEED' },
    { mode: 'COLLOQUIAL', message: 'Anything going on around my house I should know about?', expectedOperationId: 'HOME_EVENT_RADAR_FEED' },
    // Typo lands on "Show", not on the "home event radar" trigger phrase itself --
    // same convention as CAPITAL_RESERVE_PLAN's own MISSPELLED fixture (typos
    // "replacements", not its "capital timeline" trigger phrase), so the
    // deterministic regex still resolves this without falling back to model
    // assistance.
    { mode: 'MISSPELLED', message: 'Sohw my home event radar feed', expectedOperationId: 'HOME_EVENT_RADAR_FEED' },
  ],
  operationCases: [
    { operationId: 'HOME_EVENT_RADAR_FEED', expectedAdapter: { id: 'home-event-radar.feed', version: '1.0' } },
    { operationId: 'HOME_EVENT_RADAR_STATE', expectedAdapter: { id: 'home-event-radar.state', version: '1.0' } },
    { operationId: 'HOME_EVENT_RADAR_MARK_DONE', expectedAdapter: { id: 'home-event-radar.mark-done', version: '1.0' } },
    { operationId: 'HOME_EVENT_RADAR_FEEDBACK', expectedAdapter: { id: 'home-event-radar.feedback', version: '1.0' } },
    { operationId: 'HOME_EVENT_RADAR_TASK', expectedAdapter: { id: 'home-event-radar.task', version: '1.0' } },
    { operationId: 'HOME_EVENT_RADAR_PREFERENCES', expectedAdapter: { id: 'home-event-radar.preferences', version: '1.0' } },
  ],
  ambiguityCases: [
    {
      message: 'What intelligence do you have about my property right now?',
      candidateSkillIds: ['home-event-radar', 'query-envelope'],
      expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK',
    },
  ],
  policyCases: [
    { consumer: 'ASK', operationId: 'HOME_EVENT_RADAR_FEED', allowed: true },
    { consumer: 'ASK', operationId: 'HOME_EVENT_RADAR_STATE', allowed: true },
    { consumer: 'ASK', operationId: 'HOME_EVENT_RADAR_MARK_DONE', allowed: true },
    { consumer: 'ASK', operationId: 'HOME_EVENT_RADAR_FEEDBACK', allowed: true },
    { consumer: 'ASK', operationId: 'HOME_EVENT_RADAR_TASK', allowed: true },
    { consumer: 'ASK', operationId: 'HOME_EVENT_RADAR_PREFERENCES', allowed: true },
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
    { message: 'Show my future home expenses and reserve plan', expectedBehavior: 'DO_NOT_SELECT_SKILL' },
  ],
  exclusionCases: [
    { message: 'Guarantee there will never be another storm near my home', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' },
  ],
  resolutionAmbiguityCases: [
    { kind: 'ENTITY', message: 'Continue this request for the matching event', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'PROPERTY', message: 'Run this request for my home', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'DECISION_THREAD', message: 'Continue my current home decision', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  ],
  degradedModeCases: [
    {
      dependencyType: 'ADAPTER',
      dependency: { id: 'home-event-radar.feed', version: '1.0' },
      expectedBehavior: 'DEGRADED_OR_UNAVAILABLE',
    },
  ],
  expectedAdapters: [
    { id: 'home-event-radar.feed', version: '1.0' },
    { id: 'home-event-radar.state', version: '1.0' },
    { id: 'home-event-radar.mark-done', version: '1.0' },
    { id: 'home-event-radar.feedback', version: '1.0' },
    { id: 'home-event-radar.task', version: '1.0' },
    { id: 'home-event-radar.preferences', version: '1.0' },
  ],
  prohibitedAdapters: [
    'intelligence-envelope.query',
  ],
  expectedContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER, PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  prohibitedContextProviders: [
    'undeclared.financial-account',
  ],
  expectedStatuses: [
    'ANSWERED',
    'READY_WITH_LIMITATIONS',
    'NEEDS_CONTEXT',
    'NEEDS_CONFIRMATION',
    'COMPLETED',
  ],
  expectedBlockTypes: [
    'SUMMARY',
    'GROUPED_LIST',
    'EVIDENCE',
    'EMPTY_STATE',
    'BOUNDARY',
    'WORKFLOW_PROGRESS',
  ],
  expectedCanonicalCalls: [
    { id: 'home-event-radar.feed', version: '1.0' },
    { id: 'home-event-radar.state', version: '1.0' },
    { id: 'home-event-radar.mark-done', version: '1.0' },
    { id: 'home-event-radar.feedback', version: '1.0' },
    { id: 'home-event-radar.task', version: '1.0' },
    { id: 'home-event-radar.preferences', version: '1.0' },
  ],
  prohibitedCanonicalCalls: [
    'intelligence-envelope.query',
  ],
  modelDisabledCase: {
    message: 'Show my home event radar feed',
    expectedOperationId: 'HOME_EVENT_RADAR_FEED',
  },
  continuationCase: {
    message: 'Continue that request',
    sourceOperationId: 'HOME_EVENT_RADAR_FEED',
    expectedOperationId: 'HOME_EVENT_RADAR_FEED',
  },
  handoffCase: {
    suggestedNextSkillId: 'query-envelope',
    suggestedGoal: 'review-derived-home-intelligence',
    reasonCodes: ['RADAR_EVENT_NEEDS_BROADER_CONTEXT'],
  },
  performanceCase: {
    message: 'Show my home event radar feed',
    maxSkillCandidates: 10,
    maxOperationCandidates: 3,
    smokeCeilingMs: 100,
  },
} satisfies SkillEvaluationPackage);
