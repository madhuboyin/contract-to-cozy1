import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

// ASK_COZY_INLINE_WORKSPACE_FRD v1.63, capability-card audit (Appendix D): the fifteenth new operation for a capability
// the audit found with no Ask operation. Reads listPropertyBriefs, the call GET /properties/:id/property-briefs makes
// for the Property Brief page. Read-only; preparing, previewing, sharing, revoking and republishing stay on the page.
export const PROPERTY_BRIEF_SKILL = Object.freeze({
  id: 'property-brief',
  version: '1.0.0',
  domain: 'HOME_CARE',
  displayName: 'Property Brief',
  description: "Review this home's saved Property Briefs: each brief's purpose, snapshot date and sections, and which share links are still live.",
  homeownerJobs: ['NAVIGATE_MAJOR_MOMENTS'],
  supportedGoals: ['review-property-briefs'],
  aliases: ['property brief', 'property briefs', 'brief share link'],
  operations: [{
    operationId: 'PROPERTY_BRIEFS_LIST',
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }],
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [{ id: 'property-brief.briefs', version: '1.0' }],
  allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: ['PROPERTY_BRIEFS_LIST'] }],
  autonomyLevel: 1,
  riskPolicy: {
    effects: ['READ'],
    materiality: 'LOW',
    riskDomains: ['PRIVACY'],
    reversibility: 'REVERSIBLE',
  },
  authorizationFloor: 'VIEWER',
  allowedResultBlocks: ['SUMMARY', 'GROUPED_LIST', 'BOUNDARY'],
  dependencies: [
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, version: PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, required: true },
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, version: PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, required: false },
    { type: 'OPERATION_CONTRACT', id: 'PROPERTY_BRIEFS_LIST', version: '1.0', required: true },
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
  evaluationSuite: 'skill-property-brief-golden',
  featureFlag: 'ASK_SKILL_PROPERTY_BRIEF_ENABLED',
  killSwitch: 'ASK_SKILL_PROPERTY_BRIEF_KILL_SWITCH',
  owner: 'Homeowner Product / Home Records',
  lifecycleStatus: 'DEVELOPMENT',
  operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
