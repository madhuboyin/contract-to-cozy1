// Shared types for the Decision Platform (Ask Intelligence FRD Phase 7A).
// See docs/product/AI_HOME_CONCIERGE_ASK_INTELLIGENCE_INCREMENTAL_FRD.md and
// docs/product/decision-platform/ for the normative source and ADRs.
//
// These types mirror the Prisma enums of the same name (DecisionPreference*,
// DecisionThread*, ScenarioStatus) rather than importing generated Prisma
// types, matching the existing convention in ask/askOperationRegistry.ts
// (e.g. AskPropertyRoleFloor mirrors HouseholdRole).

export type DecisionPreferenceSubjectType = 'USER' | 'HOUSEHOLD';

export type DecisionPreferenceProvenanceType =
  | 'USER_ENTERED'
  | 'DOCUMENT_EXTRACTED'
  | 'IMPORTED_REVIEWED'
  | 'SYSTEM_DERIVED';

// Only the two classes that ever produce a DecisionPreferenceValue row (FRD
// §11.1). SCENARIO_ONLY/SESSION_ONLY/PROHIBITED are enforced at the registry
// level (see decisionPreferenceRegistry.ts) but never reach persistence.
export type DecisionPreferenceStorageClass = 'DURABLE_PROFILE' | 'TEMPORARY_PROFILE';

export type DecisionPreferenceUsageClass =
  | DecisionPreferenceStorageClass
  | 'SCENARIO_ONLY'
  | 'SESSION_ONLY'
  | 'PROHIBITED';

export type DecisionPreferenceVisibility =
  | 'PRIVATE'
  | 'OWNER_ONLY'
  | 'HOUSEHOLD_SUMMARY'
  | 'HOUSEHOLD_DETAIL';

export type DecisionPreferenceStatus =
  | 'PENDING_CONFIRMATION'
  | 'ACTIVE'
  | 'REVOKED'
  | 'EXPIRED'
  | 'SUPERSEDED';

export type DecisionThreadLifecycleStatus =
  | 'OPEN'
  | 'GATHERING_CONTEXT'
  | 'READY_TO_COMPARE'
  | 'RECOMMENDATION_AVAILABLE'
  | 'ACTION_IN_PROGRESS'
  | 'DECIDED'
  | 'COMPLETED'
  | 'ABANDONED'
  | 'ARCHIVED';

export type DecisionThreadContextStatus = 'CURRENT' | 'STALE' | 'CONFLICTED';

export type ScenarioStatus = 'DRAFT' | 'READY' | 'EVALUATED' | 'STALE' | 'EXPIRED' | 'ARCHIVED';

// FRD §7.1: the definition registry shall declare value schema, allowed
// subject/scope, provenance, storage class, confirmation policy by
// provenance, sensitivity, visibility, default validity/expiry,
// reconfirmation policy, eligible operations, correction route, and whether
// a privacy-safe shared explanation is permitted.
export interface DecisionPreferenceDefinition {
  key: string;
  version: string;
  valueSchemaDescription: string;
  storageClass: DecisionPreferenceStorageClass;
  allowedSubjectTypes: DecisionPreferenceSubjectType[];
  allowedProvenanceTypes: DecisionPreferenceProvenanceType[];
  // Provenance types that force status = PENDING_CONFIRMATION on capture,
  // per FRD §7.1/§11.1 ("SYSTEM_DERIVED, DOCUMENT_EXTRACTED, and any
  // imported value shall remain PENDING_CONFIRMATION when its definition
  // requires homeowner review").
  confirmationRequiredForProvenance: DecisionPreferenceProvenanceType[];
  sensitivityClass: 'STANDARD' | 'SENSITIVE';
  defaultVisibility: DecisionPreferenceVisibility;
  defaultValidityMonths: number | null; // null = "until changed"
  reconfirmationPolicy: 'NONE' | 'ON_EXPIRY' | 'ANNUAL';
  eligibleDecisionDefinitionIds: string[];
  correctionRoute: string;
  sharedExplanationPermitted: boolean;
  // FRD §11.2: some keys (e.g. DECISION_DETAIL_LEVEL) are presentation-only
  // and must never affect a material recommendation or ranking.
  materialForRanking: boolean;
}

// FRD §12.1. Assembles declared inputs for one decision family; does not
// calculate the decision, choose providers, or expand access.
export interface DecisionContextContract {
  decisionDefinitionId: string;
  version: string;
  primaryDomain: string;
  // Home Intelligence Functional Completeness FRD Phase 3 review finding 4,
  // delivery step 6. HVAC composes its context by assembling declared
  // Property Context facts (composeHvacDecisionContext) before the engine
  // runs — that's what requiredFactDefinitions/the latency budgets/the
  // input policies below actually govern (only hvacRepairReplaceEngine
  // .service.ts reads them). A domain that instead snapshots its own
  // already-authoritative, already-persisted evaluation (refinance
  // opportunity, capital-timeline window, ownership cost change, a
  // savings/benefits match, a coverage question) has no fact-composition
  // step to bound, so it declares composesFromPropertyContext: false and
  // the fields below become inert metadata the validator does not enforce.
  composesFromPropertyContext: boolean;
  requiredFactDefinitions: string[];
  optionalEnhancerDefinitions: string[];
  allowedPreferenceDefinitions: string[];
  allowedScenarioInputDefinitions: string[];
  professionalBoundaryCode: string | null;
  maximumFacts: number;
  maximumSerializedBytes: number;
  // FRD §12.2/Phase 8C: a timed-out required input degrades or blocks; a
  // timed-out optional enhancer is omitted and disclosed. Both budgets are
  // enforced by decisionContextEnhancer.ts's withEnhancerTimeout, not left
  // as unenforced metadata (Phase 7A declared maximumEnhancerLatencyMs but
  // nothing read it until Phase 8C).
  requiredFactLatencyMs: number;
  maximumEnhancerLatencyMs: number;
  overallLatencyMs: number;
  staleInputPolicy: string;
  missingInputPolicy: string;
  conflictPolicy: string;
  redactionPolicy: string;
  outputSchemaVersion: string;
}

// The decision-family catalog referenced by DecisionThread.decisionDefinitionId
// (FRD §10.1) and Scenario.definitionId (FRD §13.1). Code-based per
// docs/product/decision-platform/adr-0001-ownership-and-scope.md — no kill
// switch/pause fields, since there are no real users yet to protect.
export interface DecisionDefinition {
  decisionDefinitionId: string;
  version: string;
  primaryDomain: string;
  title: string;
  contextContractId: string;
  allowedPreferenceDefinitionIds: string[];
  professionalBoundaryCode: string | null;
  evalSuite: string;
}

// FRD §15.2 — the Home Intelligence Graph is a typed read abstraction over
// canonical relational identifiers, not a graph database (§15.1). Every
// supported edge shall declare this metadata; LLM output cannot create an
// authoritative edge (§15.2). See
// services/decisionPlatform/homeIntelligenceGraph.ts.
export interface HomeIntelligenceGraphEdge {
  edgeType: string;
  version: string;
  sourceEntityType: string;
  targetEntityType: string;
  canonicalSourceOwner: string;
  derivationMethod: 'DIRECT_FOREIGN_KEY' | 'POLYMORPHIC_REFERENCE' | 'JSON_LINEAGE_SCAN';
  direction: 'FORWARD' | 'BIDIRECTIONAL';
  temporalValidity: 'CURRENT_ONLY' | 'HISTORICAL';
  // How property/role authorization propagates across this edge — every
  // read function scopes by propertyId itself (defense in depth), but this
  // documents the intended rule per §15.2.
  authorizationPropagationRule: string;
  freshnessPolicy: string;
  requiresHomeownerConfirmation: boolean;
}
