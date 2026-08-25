import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const HOME_OPERATIONS_SKILL_EVALUATION = deepFreezeSkillPackage({
  id: 'skill-home-operations-golden',
  skillId: 'home-operations',
  skillVersion: '1.0.0',
  routingCases: [
    { mode: 'EXACT', message: 'What needs attention at my home?', expectedOperationId: 'HOME_ACTIONS' },
    { mode: 'PARAPHRASED', message: 'What should I do next for this home?', expectedOperationId: 'HOME_ACTIONS' },
    { mode: 'COLLOQUIAL', message: 'What needs my attention first?', expectedOperationId: 'HOME_ACTIONS' },
    { mode: 'MISSPELLED', message: 'What needs attension at my home?', expectedOperationId: 'HOME_ACTIONS' },
    { mode: 'EXACT', message: 'Accept the roof repair work item', expectedOperationId: 'OPERATIONAL_WORK_UPDATE' },
    { mode: 'EXACT', message: 'Start a guided plan for this home project', expectedOperationId: 'GUIDANCE_JOURNEY_CREATE' },
  ],
  operationCases: [
    { operationId: 'HOME_ACTIONS', expectedAdapter: { id: 'home-actions.feed', version: '1.0' } },
    { operationId: 'OPERATIONAL_WORK_UPDATE', expectedAdapter: { id: 'home-operations.update', version: '1.0' } },
    { operationId: 'GUIDANCE_JOURNEY_CREATE', expectedAdapter: { id: 'guidance.journey.create', version: '1.0' } },
  ],
  ambiguityCases: [
    { message: 'Show me what needs attention and my maintenance status', candidateSkillIds: ['home-operations', 'maintenance'], expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  ],
  policyCases: [
    { consumer: 'ASK', operationId: 'HOME_ACTIONS', allowed: true },
    { consumer: 'PROACTIVE', operationId: 'HOME_ACTIONS', allowed: false },
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
    { message: 'Should I refinance my mortgage?', expectedBehavior: 'DO_NOT_SELECT_SKILL' },
  ],
  exclusionCases: [
    { message: 'Guarantee that completing this work fixes an underlying safety issue', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' },
  ],
  resolutionAmbiguityCases: [
    { kind: 'ENTITY', message: 'Continue this request for the matching item', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'PROPERTY', message: 'Run this request for my home', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'DECISION_THREAD', message: 'Continue my current home decision', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  ],
  degradedModeCases: [
    { dependencyType: 'ADAPTER', dependency: { id: 'home-actions.feed', version: '1.0' }, expectedBehavior: 'DEGRADED_OR_UNAVAILABLE' },
  ],
  expectedAdapters: [{ id: 'home-actions.feed', version: '1.0' }, { id: 'home-operations.update', version: '1.0' }, { id: 'guidance.journey.create', version: '1.0' }],
  prohibitedAdapters: ['refinance.analysis'],
  expectedContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER, PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  prohibitedContextProviders: ['undeclared.financial-context'],
  expectedStatuses: ['ANSWERED', 'READY_WITH_LIMITATIONS', 'NEEDS_CONFIRMATION', 'COMPLETED'],
  expectedBlockTypes: ['BOUNDARY', 'CAPABILITY_LIST', 'EVIDENCE', 'GROUPED_LIST', 'PRIORITY_LIST', 'SUMMARY', 'WORKFLOW_PROGRESS'],
  expectedCanonicalCalls: [{ id: 'home-actions.feed', version: '1.0' }, { id: 'home-operations.update', version: '1.0' }, { id: 'guidance.journey.create', version: '1.0' }],
  prohibitedCanonicalCalls: ['refinance.analysis'],
  modelDisabledCase: { message: 'What needs attention at my home?', expectedOperationId: 'HOME_ACTIONS' },
  continuationCase: { message: 'Show that feed again', sourceOperationId: 'HOME_ACTIONS', expectedOperationId: 'HOME_ACTIONS' },
  handoffCase: { suggestedNextSkillId: 'maintenance', suggestedGoal: 'understand-maintenance-status', reasonCodes: ['HOME_ACTION_REVIEWED'] },
  performanceCase: { message: 'What needs attention at my home?', maxSkillCandidates: 10, maxOperationCandidates: 3, smokeCeilingMs: 100 },
} satisfies SkillEvaluationPackage);
