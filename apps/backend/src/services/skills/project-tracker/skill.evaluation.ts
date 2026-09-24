import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const PROJECT_TRACKER_SKILL_EVALUATION = deepFreezeSkillPackage({
  id: 'skill-project-tracker-golden',
  skillId: 'project-tracker',
  skillVersion: '1.0.0',
  routingCases: [
    { mode: 'EXACT', message: 'Show my project tracker', expectedOperationId: 'PROJECT_TRACKER_PROJECTS' },
    { mode: 'PARAPHRASED', message: 'Which contractor projects are still in progress?', expectedOperationId: 'PROJECT_TRACKER_PROJECTS' },
    { mode: 'COLLOQUIAL', message: 'How much do we still owe our contractors?', expectedOperationId: 'PROJECT_TRACKER_PROJECTS' },
    // Typo lands on "Shwo", not on the trigger phrase, so the deterministic pattern still resolves it.
    { mode: 'MISSPELLED', message: 'Shwo my project tracker', expectedOperationId: 'PROJECT_TRACKER_PROJECTS' },
  ],
  operationCases: [
    { operationId: 'PROJECT_TRACKER_PROJECTS', expectedAdapter: { id: 'project-tracker.projects', version: '1.0' } },
  ],
  ambiguityCases: [
    {
      message: 'How is the kitchen remodel going?',
      candidateSkillIds: ['project-tracker', 'renovation'],
      expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK',
    },
  ],
  policyCases: [
    { consumer: 'ASK', operationId: 'PROJECT_TRACKER_PROJECTS', allowed: true },
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
    { message: 'Is my renovation ready for permits?', expectedBehavior: 'DO_NOT_SELECT_SKILL' },
  ],
  exclusionCases: [
    { message: 'Record a $5,000 payment to the roofer', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' },
  ],
  resolutionAmbiguityCases: [
    { kind: 'ENTITY', message: 'Continue this request for the matching project', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'PROPERTY', message: 'Run this request for my home', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'DECISION_THREAD', message: 'Continue my current home decision', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  ],
  degradedModeCases: [
    {
      dependencyType: 'ADAPTER',
      dependency: { id: 'project-tracker.projects', version: '1.0' },
      expectedBehavior: 'DEGRADED_OR_UNAVAILABLE',
    },
  ],
  expectedAdapters: [{ id: 'project-tracker.projects', version: '1.0' }],
  prohibitedAdapters: ['inventory.lookup', 'intelligence-envelope.query'],
  expectedContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER, PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  prohibitedContextProviders: ['undeclared.financial-account'],
  expectedStatuses: ['ANSWERED', 'READY_WITH_LIMITATIONS'],
  expectedBlockTypes: ['SUMMARY', 'GROUPED_LIST', 'BOUNDARY'],
  expectedCanonicalCalls: [{ id: 'project-tracker.projects', version: '1.0' }],
  prohibitedCanonicalCalls: ['inventory.lookup', 'intelligence-envelope.query'],
  modelDisabledCase: {
    message: 'Show my project tracker',
    expectedOperationId: 'PROJECT_TRACKER_PROJECTS',
  },
  continuationCase: {
    message: 'Continue that request',
    sourceOperationId: 'PROJECT_TRACKER_PROJECTS',
    expectedOperationId: 'PROJECT_TRACKER_PROJECTS',
  },
  handoffCase: {
    suggestedNextSkillId: 'renovation',
    suggestedGoal: 'review-renovation-readiness',
    reasonCodes: ['PROJECT_NEEDS_PERMIT_READINESS'],
  },
  performanceCase: {
    message: 'Show my project tracker',
    maxSkillCandidates: 10,
    maxOperationCandidates: 3,
    smokeCeilingMs: 100,
  },
} satisfies SkillEvaluationPackage);
