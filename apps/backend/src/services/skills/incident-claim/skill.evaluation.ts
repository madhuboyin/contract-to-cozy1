import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const INCIDENT_CLAIM_SKILL_EVALUATION = deepFreezeSkillPackage({
  id: 'skill-incident-claim-golden',
  skillId: 'incident-claim',
  skillVersion: '1.0.0',
  routingCases: [
    { mode: 'EXACT', message: 'What is the status of my insurance claim?', expectedOperationId: 'INCIDENT_CLAIM_STATUS' },
    { mode: 'PARAPHRASED', message: 'Track the status of my claim', expectedOperationId: 'INCIDENT_CLAIM_STATUS' },
    { mode: 'COLLOQUIAL', message: 'Is my claim active or pending?', expectedOperationId: 'INCIDENT_CLAIM_STATUS' },
    { mode: 'MISSPELLED', message: 'Whats the status of my insurence claim?', expectedOperationId: 'INCIDENT_CLAIM_STATUS' },
  ],
  operationCases: [
    { operationId: 'INCIDENT_CLAIM_STATUS', expectedAdapter: { id: 'incident-claim.status', version: '1.0' } },
  ],
  ambiguityCases: [
    { message: 'Review my recorded incident and its coverage', candidateSkillIds: ['incident-claim', 'coverage'], expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  ],
  policyCases: [
    { consumer: 'ASK', operationId: 'INCIDENT_CLAIM_STATUS', allowed: true },
    { consumer: 'PROACTIVE', operationId: 'INCIDENT_CLAIM_STATUS', allowed: false },
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
    { message: 'Show me coverage gaps for my appliances', expectedBehavior: 'DO_NOT_SELECT_SKILL' },
  ],
  exclusionCases: [
    { message: 'File a new claim on my behalf', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' },
  ],
  resolutionAmbiguityCases: [
    { kind: 'ENTITY', message: 'Continue this request for the matching item', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'PROPERTY', message: 'Run this request for my home', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'DECISION_THREAD', message: 'Continue my current home decision', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  ],
  degradedModeCases: [
    { dependencyType: 'ADAPTER', dependency: { id: 'incident-claim.status', version: '1.0' }, expectedBehavior: 'DEGRADED_OR_UNAVAILABLE' },
  ],
  expectedAdapters: [{ id: 'incident-claim.status', version: '1.0' }],
  prohibitedAdapters: ['coverage.review'],
  expectedContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER, PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  prohibitedContextProviders: ['undeclared.insurer-portal'],
  expectedStatuses: ['ANSWERED', 'READY_WITH_LIMITATIONS'],
  expectedBlockTypes: ['EMPTY_STATE', 'EVIDENCE', 'GROUPED_LIST', 'SUMMARY'],
  expectedCanonicalCalls: [{ id: 'incident-claim.status', version: '1.0' }],
  prohibitedCanonicalCalls: ['coverage.review'],
  modelDisabledCase: { message: 'What is the status of my insurance claim?', expectedOperationId: 'INCIDENT_CLAIM_STATUS' },
  continuationCase: { message: 'Check that claim again', sourceOperationId: 'INCIDENT_CLAIM_STATUS', expectedOperationId: 'INCIDENT_CLAIM_STATUS' },
  handoffCase: { suggestedNextSkillId: 'coverage', suggestedGoal: 'review-coverage-gaps', reasonCodes: ['VERIFY_COVERAGE_AFTER_CLAIM'] },
  performanceCase: { message: 'What is the status of my insurance claim?', maxSkillCandidates: 10, maxOperationCandidates: 3, smokeCeilingMs: 100 },
} satisfies SkillEvaluationPackage);
