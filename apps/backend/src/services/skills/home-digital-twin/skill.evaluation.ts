import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const HOME_DIGITAL_TWIN_SKILL_EVALUATION = deepFreezeSkillPackage({
  id: 'skill-home-digital-twin-golden',
  skillId: 'home-digital-twin',
  skillVersion: '1.0.0',
  routingCases: [
    { mode: 'EXACT', message: 'Show my upgrade planner options', expectedOperationId: 'HOME_UPGRADE_SCENARIOS' },
    { mode: 'PARAPHRASED', message: 'What upgrade options have I saved for the house?', expectedOperationId: 'HOME_UPGRADE_SCENARIOS' },
    { mode: 'COLLOQUIAL', message: 'Which saved what-if scenarios have results ready?', expectedOperationId: 'HOME_UPGRADE_SCENARIOS' },
    // Typo lands on "Shwo", not on the trigger phrase, so the deterministic pattern still resolves it.
    { mode: 'MISSPELLED', message: 'Shwo my upgrade planner', expectedOperationId: 'HOME_UPGRADE_SCENARIOS' },
  ],
  operationCases: [
    { operationId: 'HOME_UPGRADE_SCENARIOS', expectedAdapter: { id: 'home-digital-twin.scenarios', version: '1.0' } },
  ],
  ambiguityCases: [
    {
      message: 'Is it time to replace my water heater?',
      candidateSkillIds: ['home-digital-twin', 'repair-replace'],
      expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK',
    },
  ],
  policyCases: [
    { consumer: 'ASK', operationId: 'HOME_UPGRADE_SCENARIOS', allowed: true },
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
    { message: 'Should I repair or replace my aging appliance?', expectedBehavior: 'DO_NOT_SELECT_SKILL' },
  ],
  exclusionCases: [
    { message: 'Mark the heat pump option as selected and book the installer', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' },
  ],
  resolutionAmbiguityCases: [
    { kind: 'ENTITY', message: 'Continue this request for the matching upgrade option', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'PROPERTY', message: 'Run this request for my home', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'DECISION_THREAD', message: 'Continue my current home decision', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  ],
  degradedModeCases: [
    {
      dependencyType: 'ADAPTER',
      dependency: { id: 'home-digital-twin.scenarios', version: '1.0' },
      expectedBehavior: 'DEGRADED_OR_UNAVAILABLE',
    },
  ],
  expectedAdapters: [{ id: 'home-digital-twin.scenarios', version: '1.0' }],
  prohibitedAdapters: ['inventory.lookup', 'intelligence-envelope.query'],
  expectedContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER, PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  prohibitedContextProviders: ['undeclared.financial-account'],
  expectedStatuses: ['ANSWERED', 'READY_WITH_LIMITATIONS'],
  expectedBlockTypes: ['SUMMARY', 'GROUPED_LIST', 'BOUNDARY'],
  expectedCanonicalCalls: [{ id: 'home-digital-twin.scenarios', version: '1.0' }],
  prohibitedCanonicalCalls: ['inventory.lookup', 'intelligence-envelope.query'],
  modelDisabledCase: {
    message: 'Show my upgrade planner options',
    expectedOperationId: 'HOME_UPGRADE_SCENARIOS',
  },
  continuationCase: {
    message: 'Continue that request',
    sourceOperationId: 'HOME_UPGRADE_SCENARIOS',
    expectedOperationId: 'HOME_UPGRADE_SCENARIOS',
  },
  handoffCase: {
    suggestedNextSkillId: 'quote-comparison',
    suggestedGoal: 'review-quote-comparison',
    reasonCodes: ['UPGRADE_OPTION_NEEDS_QUOTES'],
  },
  performanceCase: {
    message: 'Show my upgrade planner options',
    maxSkillCandidates: 10,
    maxOperationCandidates: 3,
    smokeCeilingMs: 100,
  },
} satisfies SkillEvaluationPackage);
