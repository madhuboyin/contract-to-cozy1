import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const DIY_SKILL_EVALUATION = deepFreezeSkillPackage({
  id: 'skill-diy-golden',
  skillId: 'diy',
  skillVersion: '1.0.0',
  routingCases: [
    { mode: 'EXACT', message: 'Show my DIY projects', expectedOperationId: 'DIY_PROJECTS' },
    { mode: 'PARAPHRASED', message: 'Which DIY projects am I in the middle of?', expectedOperationId: 'DIY_PROJECTS' },
    { mode: 'COLLOQUIAL', message: 'Which steps are left on my DIY projects?', expectedOperationId: 'DIY_PROJECTS' },
    // Typo lands on "Shwo", not on the trigger phrase, so the deterministic pattern still resolves it.
    { mode: 'MISSPELLED', message: 'Shwo my diy projects', expectedOperationId: 'DIY_PROJECTS' },
  ],
  operationCases: [
    { operationId: 'DIY_PROJECTS', expectedAdapter: { id: 'diy.projects', version: '1.0' } },
  ],
  ambiguityCases: [
    {
      message: 'What home projects should I work on this weekend?',
      candidateSkillIds: ['diy', 'maintenance'],
      expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK',
    },
  ],
  policyCases: [
    { consumer: 'ASK', operationId: 'DIY_PROJECTS', allowed: true },
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
    { message: 'What maintenance is due?', expectedBehavior: 'DO_NOT_SELECT_SKILL' },
  ],
  exclusionCases: [
    { message: 'Walk me through replacing my breaker panel myself', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' },
  ],
  resolutionAmbiguityCases: [
    { kind: 'ENTITY', message: 'Continue this request for the matching DIY project', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'PROPERTY', message: 'Run this request for my home', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'DECISION_THREAD', message: 'Continue my current home decision', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  ],
  degradedModeCases: [
    {
      dependencyType: 'ADAPTER',
      dependency: { id: 'diy.projects', version: '1.0' },
      expectedBehavior: 'DEGRADED_OR_UNAVAILABLE',
    },
  ],
  expectedAdapters: [{ id: 'diy.projects', version: '1.0' }],
  prohibitedAdapters: ['inventory.lookup', 'intelligence-envelope.query'],
  expectedContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER, PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  prohibitedContextProviders: ['undeclared.financial-account'],
  expectedStatuses: ['ANSWERED', 'READY_WITH_LIMITATIONS'],
  expectedBlockTypes: ['SUMMARY', 'GROUPED_LIST', 'LIMITATION', 'BOUNDARY'],
  expectedCanonicalCalls: [{ id: 'diy.projects', version: '1.0' }],
  prohibitedCanonicalCalls: ['inventory.lookup', 'intelligence-envelope.query'],
  modelDisabledCase: {
    message: 'Show my DIY projects',
    expectedOperationId: 'DIY_PROJECTS',
  },
  continuationCase: {
    message: 'Continue that request',
    sourceOperationId: 'DIY_PROJECTS',
    expectedOperationId: 'DIY_PROJECTS',
  },
  handoffCase: {
    suggestedNextSkillId: 'maintenance',
    suggestedGoal: 'understand-maintenance-status',
    reasonCodes: ['DIY_PROJECT_NEEDS_MAINTENANCE_CONTEXT'],
  },
  performanceCase: {
    message: 'Show my DIY projects',
    maxSkillCandidates: 10,
    maxOperationCandidates: 3,
    smokeCeilingMs: 100,
  },
} satisfies SkillEvaluationPackage);
