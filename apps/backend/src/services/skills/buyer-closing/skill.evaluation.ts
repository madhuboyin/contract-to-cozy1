import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { getAskOperationDefinition } from '../../ask/askOperationRegistry';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';
import { BUYER_CLOSING_SKILL } from './skill.manifest';

const operationCases = BUYER_CLOSING_SKILL.operations.map((operation) => ({
  operationId: operation.operationId,
  expectedAdapter: {
    id: getAskOperationDefinition(operation.operationId).adapterKey,
    version: BUYER_CLOSING_SKILL.allowedAdapters.find((adapter) => adapter.id === getAskOperationDefinition(operation.operationId).adapterKey)!.version,
  },
}));

export const BUYER_CLOSING_SKILL_EVALUATION = deepFreezeSkillPackage({
  id: 'skill-buyer-closing-golden',
  skillId: 'buyer-closing',
  skillVersion: '1.0.0',
  routingCases: [
    { mode: 'EXACT', message: "What's my buyer plan status?", expectedOperationId: 'BUYER_PLAN_STATUS' },
    { mode: 'PARAPHRASED', message: 'What deadlines are coming up before closing?', expectedOperationId: 'BUYER_DEADLINES' },
    { mode: 'COLLOQUIAL', message: 'What do I need for closing day?', expectedOperationId: 'BUYER_CLOSING_DAY_READINESS' },
    { mode: 'MISSPELLED', message: 'What deadlines are comming up before closing?', expectedOperationId: 'BUYER_DEADLINES' },
  ],
  operationCases,
  ambiguityCases: [
    { message: 'Show me my home purchase and property record together', candidateSkillIds: ['buyer-closing', 'property-record'], expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  ],
  policyCases: [
    { consumer: 'ASK', operationId: 'BUYER_PLAN_STATUS', allowed: true },
    { consumer: 'PROACTIVE', operationId: 'BUYER_PLAN_STATUS', allowed: false },
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
    { message: 'What maintenance is overdue at my home?', expectedBehavior: 'DO_NOT_SELECT_SKILL' },
  ],
  exclusionCases: [
    { message: 'Guarantee that my mortgage application will be approved', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' },
  ],
  resolutionAmbiguityCases: [
    { kind: 'ENTITY', message: 'Continue this request for the matching item', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'PROPERTY', message: 'Run this request for my home', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'DECISION_THREAD', message: 'Continue my current home decision', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  ],
  degradedModeCases: [
    { dependencyType: 'ADAPTER', dependency: { id: 'buyer.plan.status', version: '1.0' }, expectedBehavior: 'DEGRADED_OR_UNAVAILABLE' },
  ],
  expectedAdapters: BUYER_CLOSING_SKILL.allowedAdapters,
  prohibitedAdapters: ['maintenance.create'],
  expectedContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER, PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  prohibitedContextProviders: ['undeclared.lender-portal'],
  expectedStatuses: ['ANSWERED', 'READY_WITH_LIMITATIONS', 'NEEDS_CONFIRMATION', 'COMPLETED'],
  expectedBlockTypes: ['BOUNDARY', 'EVIDENCE', 'GROUPED_LIST', 'SUMMARY', 'WORKFLOW_PROGRESS'],
  expectedCanonicalCalls: BUYER_CLOSING_SKILL.allowedAdapters,
  prohibitedCanonicalCalls: ['maintenance.create'],
  modelDisabledCase: { message: "What's my buyer plan status?", expectedOperationId: 'BUYER_PLAN_STATUS' },
  continuationCase: { message: 'Now show me the deadlines', sourceOperationId: 'BUYER_PLAN_STATUS', expectedOperationId: 'BUYER_DEADLINES' },
  handoffCase: { suggestedNextSkillId: 'property-record', suggestedGoal: 'summarize-property-record', reasonCodes: ['VERIFY_RECORDED_HOME_CONTEXT'] },
  performanceCase: { message: "What's my buyer plan status?", maxSkillCandidates: 10, maxOperationCandidates: 3, smokeCeilingMs: 100 },
} satisfies SkillEvaluationPackage);
