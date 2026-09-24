import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const APPLIANCE_ORACLE_SKILL_EVALUATION = deepFreezeSkillPackage({
  id: 'skill-appliance-oracle-golden',
  skillId: 'appliance-oracle',
  skillVersion: '1.0.0',
  routingCases: [
    { mode: 'EXACT', message: 'Show my appliance oracle', expectedOperationId: 'APPLIANCE_FAILURE_RISK' },
    { mode: 'PARAPHRASED', message: 'Which appliances are likely to fail soon?', expectedOperationId: 'APPLIANCE_FAILURE_RISK' },
    { mode: 'COLLOQUIAL', message: 'What is the failure risk on my appliances?', expectedOperationId: 'APPLIANCE_FAILURE_RISK' },
    // Typo lands on "Shwo", not on the trigger phrase, so the deterministic pattern still resolves it.
    { mode: 'MISSPELLED', message: 'Shwo my appliance oracle', expectedOperationId: 'APPLIANCE_FAILURE_RISK' },
  ],
  operationCases: [
    { operationId: 'APPLIANCE_FAILURE_RISK', expectedAdapter: { id: 'appliance-oracle.risk', version: '1.0' } },
  ],
  ambiguityCases: [
    {
      message: 'Is anything in the house about to break?',
      candidateSkillIds: ['appliance-oracle', 'repair-replace'],
      expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK',
    },
  ],
  policyCases: [
    { consumer: 'ASK', operationId: 'APPLIANCE_FAILURE_RISK', allowed: true },
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
    { message: 'Which dishwasher brand should I buy?', expectedBehavior: 'DO_NOT_SELECT_SKILL' },
  ],
  exclusionCases: [
    { message: 'Recommend a new refrigerator model', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' },
  ],
  resolutionAmbiguityCases: [
    { kind: 'ENTITY', message: 'Continue this request for the matching item', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'PROPERTY', message: 'Run this request for my home', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'DECISION_THREAD', message: 'Continue my current home decision', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  ],
  degradedModeCases: [
    {
      dependencyType: 'ADAPTER',
      dependency: { id: 'appliance-oracle.risk', version: '1.0' },
      expectedBehavior: 'DEGRADED_OR_UNAVAILABLE',
    },
  ],
  expectedAdapters: [{ id: 'appliance-oracle.risk', version: '1.0' }],
  prohibitedAdapters: ['inventory.lookup', 'intelligence-envelope.query'],
  expectedContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER, PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  prohibitedContextProviders: ['undeclared.financial-account'],
  expectedStatuses: ['ANSWERED', 'READY_WITH_LIMITATIONS'],
  expectedBlockTypes: ['SUMMARY', 'GROUPED_LIST', 'LIMITATION', 'BOUNDARY'],
  expectedCanonicalCalls: [{ id: 'appliance-oracle.risk', version: '1.0' }],
  prohibitedCanonicalCalls: ['inventory.lookup', 'intelligence-envelope.query'],
  modelDisabledCase: {
    message: 'Show my appliance oracle',
    expectedOperationId: 'APPLIANCE_FAILURE_RISK',
  },
  continuationCase: {
    message: 'Continue that request',
    sourceOperationId: 'APPLIANCE_FAILURE_RISK',
    expectedOperationId: 'APPLIANCE_FAILURE_RISK',
  },
  handoffCase: {
    suggestedNextSkillId: 'property-record',
    suggestedGoal: 'summarize-property-record',
    reasonCodes: ['VERIFY_RECORDED_HOME_CONTEXT'],
  },
  performanceCase: {
    message: 'Show my appliance oracle',
    maxSkillCandidates: 10,
    maxOperationCandidates: 3,
    smokeCeilingMs: 100,
  },
} satisfies SkillEvaluationPackage);
