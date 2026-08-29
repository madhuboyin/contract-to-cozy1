import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const QUERY_ENVELOPE_SKILL_EVALUATION = deepFreezeSkillPackage({
  id: 'skill-query-envelope-golden',
  skillId: 'query-envelope',
  skillVersion: '1.0.0',
  routingCases: [
    { mode: 'EXACT', message: 'Query the intelligence envelope for my home', expectedOperationId: 'INTELLIGENCE_ENVELOPE_QUERY' },
    { mode: 'PARAPHRASED', message: 'Show the registered derived intelligence for this property', expectedOperationId: 'INTELLIGENCE_ENVELOPE_QUERY' },
    { mode: 'COLLOQUIAL', message: 'What intelligence signals does my home have?', expectedOperationId: 'INTELLIGENCE_ENVELOPE_QUERY' },
    { mode: 'MISSPELLED', message: 'Show my inteligence envelope', expectedOperationId: 'INTELLIGENCE_ENVELOPE_QUERY' },
  ],
  operationCases: [{ operationId: 'INTELLIGENCE_ENVELOPE_QUERY', expectedAdapter: { id: 'intelligence-envelope.query', version: '1.0' } }],
  ambiguityCases: [{
    message: 'Show my home record and its derived intelligence',
    candidateSkillIds: ['query-envelope', 'property-record'],
    expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK',
  }],
  policyCases: [
    { consumer: 'ASK', operationId: 'INTELLIGENCE_ENVELOPE_QUERY', allowed: true },
    { consumer: 'CONCIERGE_HOME', operationId: 'INTELLIGENCE_ENVELOPE_QUERY', allowed: true },
    { consumer: 'PROACTIVE', operationId: 'INTELLIGENCE_ENVELOPE_QUERY', allowed: false },
  ],
  contextCases: [
    { state: 'KNOWN', expectedBehavior: 'READY' },
    { state: 'MISSING', expectedBehavior: 'CAPTURE_OR_BLOCK' },
    { state: 'STALE', expectedBehavior: 'DISCLOSE_OR_BLOCK' },
    { state: 'CONFLICTING', expectedBehavior: 'BLOCK' },
    { state: 'UNAUTHORIZED', expectedBehavior: 'BLOCK' },
    { state: 'UNAVAILABLE', expectedBehavior: 'DEGRADED_OR_BLOCK' },
  ],
  negativeCases: [{ message: 'Show my ordinary inspection records', expectedBehavior: 'DO_NOT_SELECT_SKILL' }],
  exclusionCases: [{ message: 'Read intelligence from a property I cannot access', expectedBehavior: 'DO_NOT_EXECUTE_SKILL' }],
  resolutionAmbiguityCases: [
    { kind: 'ENTITY', message: 'Show intelligence for this item', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'PROPERTY', message: 'Show my intelligence envelope', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
    { kind: 'DECISION_THREAD', message: 'Show intelligence for this decision', expectedBehavior: 'CLARIFY_OR_SAFE_BLOCK' },
  ],
  degradedModeCases: [{ dependencyType: 'ADAPTER', dependency: { id: 'intelligence-envelope.query', version: '1.0' }, expectedBehavior: 'DEGRADED_OR_UNAVAILABLE' }],
  expectedAdapters: [{ id: 'intelligence-envelope.query', version: '1.0' }],
  prohibitedAdapters: ['inspection-findings.review', 'home-actions.feed'],
  expectedContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER, PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  prohibitedContextProviders: ['raw-domain-records'],
  expectedStatuses: ['ANSWERED', 'READY_WITH_LIMITATIONS'],
  expectedBlockTypes: ['BOUNDARY', 'EMPTY_STATE', 'EVIDENCE', 'GROUPED_LIST', 'SUMMARY'],
  expectedCanonicalCalls: [{ id: 'intelligence-envelope.query', version: '1.0' }],
  prohibitedCanonicalCalls: ['inspection-findings.review', 'home-actions.feed'],
  modelDisabledCase: { message: 'Query the intelligence envelope for my home', expectedOperationId: 'INTELLIGENCE_ENVELOPE_QUERY' },
  continuationCase: { message: 'Query the intelligence envelope again', sourceOperationId: 'INTELLIGENCE_ENVELOPE_QUERY', expectedOperationId: 'INTELLIGENCE_ENVELOPE_QUERY' },
  handoffCase: { suggestedNextSkillId: 'property-record', suggestedGoal: 'summarize-property-record', reasonCodes: ['VERIFY_RECORDED_HOME_CONTEXT'] },
  performanceCase: { message: 'Query the intelligence envelope for my home', maxSkillCandidates: 10, maxOperationCandidates: 3, smokeCeilingMs: 100 },
} satisfies SkillEvaluationPackage);
