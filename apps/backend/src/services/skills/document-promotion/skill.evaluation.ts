import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const DOCUMENT_PROMOTION_SKILL_EVALUATION = deepFreezeSkillPackage({
  id: 'skill-document-promotion-golden', skillId: 'document-promotion', skillVersion: '1.0.0',
  routingCases: [
    { mode: 'EXACT', message: 'Show document facts waiting for review', expectedOperationId: 'DOCUMENT_PROMOTION_REVIEW' },
    { mode: 'PARAPHRASED', message: 'Review pending document promotions', expectedOperationId: 'DOCUMENT_PROMOTION_REVIEW' },
    { mode: 'COLLOQUIAL', message: 'What extracted home facts need me?', expectedOperationId: 'DOCUMENT_PROMOTION_REVIEW' },
    { mode: 'MISSPELLED', message: 'Review pending documnt extractions', expectedOperationId: 'DOCUMENT_PROMOTION_REVIEW' },
    { mode: 'EXACT', message: 'Confirm this reviewed document extraction', expectedOperationId: 'DOCUMENT_PROMOTION_CONFIRM' },
  ],
  operationCases: [{ operationId: 'DOCUMENT_PROMOTION_REVIEW', expectedAdapter: { id: 'document-promotion.review', version: '1.0' } }, { operationId: 'DOCUMENT_PROMOTION_CONFIRM', expectedAdapter: { id: 'document-promotion.confirm', version: '1.0' } }],
  ambiguityCases: [{ message: 'Review this extracted record', candidateSkillIds: ['document-promotion', 'property-record'], expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' }],
  policyCases: [{ consumer: 'ASK', operationId: 'DOCUMENT_PROMOTION_REVIEW', allowed: true }, { consumer: 'PROACTIVE', operationId: 'DOCUMENT_PROMOTION_CONFIRM', allowed: false }],
  contextCases: [{ state: 'KNOWN', expectedBehavior: 'READY' }, { state: 'MISSING', expectedBehavior: 'CAPTURE_OR_BLOCK' }, { state: 'STALE', expectedBehavior: 'DISCLOSE_OR_BLOCK' }, { state: 'CONFLICTING', expectedBehavior: 'BLOCK' }, { state: 'UNAUTHORIZED', expectedBehavior: 'BLOCK' }, { state: 'UNAVAILABLE', expectedBehavior: 'DEGRADED_OR_BLOCK' }],
  negativeCases: [{ message: 'Upload a new unrelated file', expectedBehavior: 'DO_NOT_SELECT_SKILL' }], exclusionCases: [{ message: 'Promote every extraction without review', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' }],
  resolutionAmbiguityCases: [{ kind: 'ENTITY', message: 'Confirm this extraction', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' }, { kind: 'PROPERTY', message: 'Review document facts', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' }, { kind: 'DECISION_THREAD', message: 'Use this document in my decision', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' }],
  degradedModeCases: [{ dependencyType: 'ADAPTER', dependency: { id: 'document-promotion.confirm', version: '1.0' }, expectedBehavior: 'DEGRADED_OR_UNAVAILABLE' }],
  expectedAdapters: [{ id: 'document-promotion.review', version: '1.0' }, { id: 'document-promotion.confirm', version: '1.0' }], prohibitedAdapters: ['property.summary'],
  expectedContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER, PROPERTY_JOURNEY_CONTEXT_PROVIDER], prohibitedContextProviders: ['unreviewed.raw-document'],
  expectedStatuses: ['ANSWERED', 'NEEDS_CONFIRMATION', 'COMPLETED'], expectedBlockTypes: ['BOUNDARY', 'EMPTY_STATE', 'EVIDENCE', 'GROUPED_LIST', 'SUMMARY', 'WORKFLOW_PROGRESS'],
  expectedCanonicalCalls: [{ id: 'document-promotion.review', version: '1.0' }, { id: 'document-promotion.confirm', version: '1.0' }], prohibitedCanonicalCalls: ['property.summary'],
  modelDisabledCase: { message: 'Show document facts waiting for review', expectedOperationId: 'DOCUMENT_PROMOTION_REVIEW' },
  continuationCase: { message: 'Confirm this reviewed document extraction', sourceOperationId: 'DOCUMENT_PROMOTION_REVIEW', expectedOperationId: 'DOCUMENT_PROMOTION_CONFIRM' },
  handoffCase: { suggestedNextSkillId: 'property-record', suggestedGoal: 'summarize-property-record', reasonCodes: ['DOCUMENT_PROMOTED'] },
  performanceCase: { message: 'Show document facts waiting for review', maxSkillCandidates: 10, maxOperationCandidates: 3, smokeCeilingMs: 100 },
} satisfies SkillEvaluationPackage);
