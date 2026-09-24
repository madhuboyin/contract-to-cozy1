import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const PROPERTY_BRIEF_SKILL_EVALUATION = deepFreezeSkillPackage({
  id: 'skill-property-brief-golden',
  skillId: 'property-brief',
  skillVersion: '1.0.0',
  routingCases: [
    { mode: 'EXACT', message: 'Show my property briefs', expectedOperationId: 'PROPERTY_BRIEFS_LIST' },
    { mode: 'PARAPHRASED', message: 'Which of our property briefs are still shared?', expectedOperationId: 'PROPERTY_BRIEFS_LIST' },
    { mode: 'COLLOQUIAL', message: 'When does my brief share link expire?', expectedOperationId: 'PROPERTY_BRIEFS_LIST' },
    // Typo lands on "Shwo", not on the trigger phrase, so the deterministic pattern still resolves it.
    { mode: 'MISSPELLED', message: 'Shwo my property briefs', expectedOperationId: 'PROPERTY_BRIEFS_LIST' },
  ],
  operationCases: [
    { operationId: 'PROPERTY_BRIEFS_LIST', expectedAdapter: { id: 'property-brief.briefs', version: '1.0' } },
  ],
  ambiguityCases: [
    {
      message: 'What did we share about the house?',
      candidateSkillIds: ['property-brief', 'property-record'],
      expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK',
    },
  ],
  policyCases: [
    { consumer: 'ASK', operationId: 'PROPERTY_BRIEFS_LIST', allowed: true },
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
    { message: 'Give me a brief summary of my home', expectedBehavior: 'DO_NOT_SELECT_SKILL' },
  ],
  exclusionCases: [
    { message: 'Revoke the property brief link I sent the buyer', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' },
  ],
  resolutionAmbiguityCases: [
    { kind: 'ENTITY', message: 'Continue this request for the matching brief', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'PROPERTY', message: 'Run this request for my home', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'DECISION_THREAD', message: 'Continue my current home decision', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  ],
  degradedModeCases: [
    {
      dependencyType: 'ADAPTER',
      dependency: { id: 'property-brief.briefs', version: '1.0' },
      expectedBehavior: 'DEGRADED_OR_UNAVAILABLE',
    },
  ],
  expectedAdapters: [{ id: 'property-brief.briefs', version: '1.0' }],
  prohibitedAdapters: ['inventory.lookup', 'intelligence-envelope.query'],
  expectedContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER, PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  prohibitedContextProviders: ['undeclared.financial-account'],
  expectedStatuses: ['ANSWERED', 'READY_WITH_LIMITATIONS'],
  expectedBlockTypes: ['SUMMARY', 'GROUPED_LIST', 'BOUNDARY'],
  expectedCanonicalCalls: [{ id: 'property-brief.briefs', version: '1.0' }],
  prohibitedCanonicalCalls: ['inventory.lookup', 'intelligence-envelope.query'],
  modelDisabledCase: {
    message: 'Show my property briefs',
    expectedOperationId: 'PROPERTY_BRIEFS_LIST',
  },
  continuationCase: {
    message: 'Continue that request',
    sourceOperationId: 'PROPERTY_BRIEFS_LIST',
    expectedOperationId: 'PROPERTY_BRIEFS_LIST',
  },
  handoffCase: {
    suggestedNextSkillId: 'property-record',
    suggestedGoal: 'summarize-property-record',
    reasonCodes: ['VERIFY_RECORDED_HOME_CONTEXT'],
  },
  performanceCase: {
    message: 'Show my property briefs',
    maxSkillCandidates: 10,
    maxOperationCandidates: 3,
    smokeCeilingMs: 100,
  },
} satisfies SkillEvaluationPackage);
