import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const STATUS_BOARD_SKILL_EVALUATION = deepFreezeSkillPackage({
  id: 'skill-status-board-golden',
  skillId: 'status-board',
  skillVersion: '1.0.0',
  routingCases: [
    { mode: 'EXACT', message: 'Show my status board', expectedOperationId: 'HOME_STATUS_BOARD' },
    { mode: 'PARAPHRASED', message: 'Which of my appliances need attention?', expectedOperationId: 'HOME_STATUS_BOARD' },
    { mode: 'COLLOQUIAL', message: 'How are my home systems holding up?', expectedOperationId: 'HOME_STATUS_BOARD' },
    // Typo lands on "Shwo", not on the trigger phrase, so the deterministic pattern still resolves it.
    { mode: 'MISSPELLED', message: 'Shwo my status board', expectedOperationId: 'HOME_STATUS_BOARD' },
  ],
  operationCases: [
    { operationId: 'HOME_STATUS_BOARD', expectedAdapter: { id: 'status-board.read', version: '1.0' } },
  ],
  ambiguityCases: [
    {
      message: 'What needs attention in my home?',
      candidateSkillIds: ['status-board', 'maintenance'],
      expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK',
    },
  ],
  policyCases: [
    { consumer: 'ASK', operationId: 'HOME_STATUS_BOARD', allowed: true },
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
    { message: 'Guarantee none of my appliances will fail this year', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' },
  ],
  resolutionAmbiguityCases: [
    { kind: 'ENTITY', message: 'Continue this request for the matching appliance', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'PROPERTY', message: 'Run this request for my home', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'DECISION_THREAD', message: 'Continue my current home decision', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  ],
  degradedModeCases: [
    {
      dependencyType: 'ADAPTER',
      dependency: { id: 'status-board.read', version: '1.0' },
      expectedBehavior: 'DEGRADED_OR_UNAVAILABLE',
    },
  ],
  expectedAdapters: [{ id: 'status-board.read', version: '1.0' }],
  prohibitedAdapters: ['inventory.lookup', 'intelligence-envelope.query'],
  expectedContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER, PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  prohibitedContextProviders: ['undeclared.financial-account'],
  expectedStatuses: ['ANSWERED', 'READY_WITH_LIMITATIONS'],
  expectedBlockTypes: ['SUMMARY', 'GROUPED_LIST', 'LIMITATION', 'BOUNDARY'],
  expectedCanonicalCalls: [{ id: 'status-board.read', version: '1.0' }],
  prohibitedCanonicalCalls: ['inventory.lookup', 'intelligence-envelope.query'],
  modelDisabledCase: {
    message: 'Show my status board',
    expectedOperationId: 'HOME_STATUS_BOARD',
  },
  continuationCase: {
    message: 'Continue that request',
    sourceOperationId: 'HOME_STATUS_BOARD',
    expectedOperationId: 'HOME_STATUS_BOARD',
  },
  handoffCase: {
    suggestedNextSkillId: 'repair-replace',
    suggestedGoal: 'analyze-repair-or-replace',
    reasonCodes: ['ITEM_NEEDS_REPAIR_OR_REPLACE_DECISION'],
  },
  performanceCase: {
    message: 'Show my status board',
    maxSkillCandidates: 10,
    maxOperationCandidates: 3,
    smokeCeilingMs: 100,
  },
} satisfies SkillEvaluationPackage);
