import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

// ASK_COZY_INLINE_WORKSPACE_FRD v1.66, capability-card audit (Appendix D): reads the HOA Compliance page's association,
// approval records and violations (HoaComplianceService). Read-only; adding the association, tracking an approval,
// reporting a status and reporting a violation stay on the page.
export const HOA_COMPLIANCE_SKILL = Object.freeze({
  id: 'hoa-compliance',
  version: '1.0.0',
  domain: 'HOME_CARE',
  displayName: 'HOA Compliance',
  description: "Review this home's HOA records: the association and dues, approval requests with the association's recorded decision, and violations.",
  homeownerJobs: ['STAY_AHEAD'],
  supportedGoals: ['review-hoa-records'],
  aliases: ['hoa', 'hoa approvals', 'hoa violations', 'hoa dues'],
  operations: [{
    operationId: 'HOA_COMPLIANCE_STATUS',
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }],
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [{ id: 'hoa-compliance.status', version: '1.0' }],
  allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: ['HOA_COMPLIANCE_STATUS'] }],
  autonomyLevel: 1,
  riskPolicy: {
    effects: ['READ'],
    materiality: 'LOW',
    riskDomains: ['FINANCIAL'],
    reversibility: 'REVERSIBLE',
  },
  authorizationFloor: 'VIEWER',
  allowedResultBlocks: ['SUMMARY', 'GROUPED_LIST', 'BOUNDARY'],
  dependencies: [
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, version: PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, required: true },
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, version: PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, required: false },
    { type: 'OPERATION_CONTRACT', id: 'HOA_COMPLIANCE_STATUS', version: '1.0', required: true },
  ],
  contextBudget: {
    maxFacts: 50,
    maxEntities: 50,
    maxDocuments: 0,
    maxHistoryEvents: 0,
    maxSerializedBytes: 96_000,
    maxProviderLatencyMs: 3_000,
    maxOverallLatencyMs: 10_000,
  },
  evaluationSuite: 'skill-hoa-compliance-golden',
  featureFlag: 'ASK_SKILL_HOA_COMPLIANCE_ENABLED',
  killSwitch: 'ASK_SKILL_HOA_COMPLIANCE_KILL_SWITCH',
  owner: 'Homeowner Product / Home Records',
  lifecycleStatus: 'DEVELOPMENT',
  operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
