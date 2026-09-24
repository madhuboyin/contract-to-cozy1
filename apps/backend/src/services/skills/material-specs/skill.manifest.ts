import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

// ASK_COZY_INLINE_WORKSPACE_FRD v1.62, capability-card audit (Appendix D): the fourteenth new operation for a capability
// the audit found with no Ask operation. Reads MaterialSpecService.listSpecs, the call GET /properties/:id/materials
// makes for the Material Specs page. Read-only; adding, editing and photos stay on the page, and material extraction
// reviews remain the document-promotion skill's.
export const MATERIAL_SPECS_SKILL = Object.freeze({
  id: 'material-specs',
  version: '1.0.0',
  domain: 'HOME_CARE',
  displayName: 'Material Specs',
  description: "Look up the paint colours, tile, flooring, fixtures and suppliers recorded in this home's Material Specs.",
  homeownerJobs: ['STAY_AHEAD'],
  supportedGoals: ['look-up-material-specs'],
  aliases: ['material specs', 'paint colours', 'finishes', 'materials'],
  operations: [{
    operationId: 'MATERIAL_SPECS_LIST',
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  }],
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: [{ id: 'material-specs.list', version: '1.0' }],
  allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: ['MATERIAL_SPECS_LIST'] }],
  autonomyLevel: 1,
  riskPolicy: {
    effects: ['READ'],
    materiality: 'LOW',
    riskDomains: ['HOME_SAFETY'],
    reversibility: 'REVERSIBLE',
  },
  authorizationFloor: 'VIEWER',
  allowedResultBlocks: ['SUMMARY', 'GROUPED_LIST', 'LIMITATION', 'BOUNDARY'],
  dependencies: [
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, version: PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, required: true },
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, version: PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, required: false },
    { type: 'OPERATION_CONTRACT', id: 'MATERIAL_SPECS_LIST', version: '1.0', required: true },
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
  evaluationSuite: 'skill-material-specs-golden',
  featureFlag: 'ASK_SKILL_MATERIAL_SPECS_ENABLED',
  killSwitch: 'ASK_SKILL_MATERIAL_SPECS_KILL_SWITCH',
  owner: 'Homeowner Product / Home Records',
  lifecycleStatus: 'DEVELOPMENT',
  operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
