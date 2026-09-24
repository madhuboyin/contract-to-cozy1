import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const HOA_COMPLIANCE_SKILL_EVALUATION = deepFreezeSkillPackage({
  id: 'skill-hoa-compliance-golden',
  skillId: 'hoa-compliance',
  skillVersion: '1.0.0',
  routingCases: [
    { mode: 'EXACT', message: 'Show my HOA records', expectedOperationId: 'HOA_COMPLIANCE_STATUS' },
    { mode: 'PARAPHRASED', message: 'Did the HOA approve our fence request?', expectedOperationId: 'HOA_COMPLIANCE_STATUS' },
    { mode: 'COLLOQUIAL', message: 'Are there any open HOA violations?', expectedOperationId: 'HOA_COMPLIANCE_STATUS' },
    // Typo lands on "Shwo", not on the trigger phrase, so the deterministic pattern still resolves it.
    { mode: 'MISSPELLED', message: 'Shwo my HOA records', expectedOperationId: 'HOA_COMPLIANCE_STATUS' },
  ],
  operationCases: [
    { operationId: 'HOA_COMPLIANCE_STATUS', expectedAdapter: { id: 'hoa-compliance.status', version: '1.0' } },
  ],
  ambiguityCases: [
    {
      message: 'What is going on with the association?',
      candidateSkillIds: ['hoa-compliance', 'renovation'],
      expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK',
    },
  ],
  policyCases: [
    { consumer: 'ASK', operationId: 'HOA_COMPLIANCE_STATUS', allowed: true },
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
    { message: 'Do I need HOA approval to build a deck?', expectedBehavior: 'DO_NOT_SELECT_SKILL' },
  ],
  exclusionCases: [
    { message: 'Report an HOA violation for the trash cans', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' },
  ],
  resolutionAmbiguityCases: [
    { kind: 'ENTITY', message: 'Continue this request for the matching approval', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'PROPERTY', message: 'Run this request for my home', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'DECISION_THREAD', message: 'Continue my current home decision', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  ],
  degradedModeCases: [
    {
      dependencyType: 'ADAPTER',
      dependency: { id: 'hoa-compliance.status', version: '1.0' },
      expectedBehavior: 'DEGRADED_OR_UNAVAILABLE',
    },
  ],
  expectedAdapters: [{ id: 'hoa-compliance.status', version: '1.0' }],
  prohibitedAdapters: ['inventory.lookup', 'intelligence-envelope.query'],
  expectedContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER, PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  prohibitedContextProviders: ['undeclared.financial-account'],
  expectedStatuses: ['ANSWERED', 'READY_WITH_LIMITATIONS'],
  expectedBlockTypes: ['SUMMARY', 'GROUPED_LIST', 'BOUNDARY'],
  expectedCanonicalCalls: [{ id: 'hoa-compliance.status', version: '1.0' }],
  prohibitedCanonicalCalls: ['inventory.lookup', 'intelligence-envelope.query'],
  modelDisabledCase: {
    message: 'Show my HOA records',
    expectedOperationId: 'HOA_COMPLIANCE_STATUS',
  },
  continuationCase: {
    message: 'Continue that request',
    sourceOperationId: 'HOA_COMPLIANCE_STATUS',
    expectedOperationId: 'HOA_COMPLIANCE_STATUS',
  },
  handoffCase: {
    suggestedNextSkillId: 'property-record',
    suggestedGoal: 'summarize-property-record',
    reasonCodes: ['VERIFY_RECORDED_HOME_CONTEXT'],
  },
  performanceCase: {
    message: 'Show my HOA records',
    maxSkillCandidates: 10,
    maxOperationCandidates: 3,
    smokeCeilingMs: 100,
  },
} satisfies SkillEvaluationPackage);
