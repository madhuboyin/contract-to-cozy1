// BICC-OPS-006/007/008/009 (docs/product/ASK_COZY_BEST_IN_CLASS_CONVERSATIONAL_CONCIERGE_FRD.md; plan slice BICC-0.2).
//
// The provider-boundary register is the single authoritative list of every external model or evaluator call path that
// Ask can reach. Each path is a separate data flow: an approval or minimization claim for one path is never inherited by
// another (OPS-008). A call site that is not registered here fails `providerBoundaryRegister.test.js`.
//
// What this register does NOT claim: provider terms (region, retention, training use, abuse monitoring, application
// logging) and homeowner-data approvals are owner/vendor facts that are not recorded anywhere in the repository. They are
// recorded as `UNRECORDED` and `realHomeownerData: 'NOT_APPROVED'`. A path may not be activated for real homeowner data
// until an owner records evidence for that exact path.

export type ProviderFlowStatus =
  | 'ACTIVE_CODE'       // a call site exists in the repository today
  | 'PLANNED'           // authorised by the plan but no call site exists yet
  | 'NOT_AUTHORIZED'    // conditional; may not be built without a new registration
  | 'RETIRED';          // removed; the scan test asserts no reference remains

export type RealHomeownerDataApproval = 'NOT_APPROVED' | 'APPROVED';
export type DataClass = 'REAL_HOMEOWNER' | 'SYNTHETIC_ONLY' | 'NONE';
export type RecordedFact = string; // 'UNRECORDED' until an owner supplies the fact

export interface ProviderBoundaryEntry {
  id: string;
  status: ProviderFlowStatus;
  purpose: string;
  stage: string;
  authorizingRequirements: readonly string[];
  /** Repository-relative files that contain the external call. Empty for PLANNED/NOT_AUTHORIZED/RETIRED. */
  callSites: readonly string[];
  /** Markers that must appear in each call-site file (proves the entry still describes real code). */
  callSiteMarkers: readonly string[];
  permittedFields: readonly string[];
  prohibitedDataCategories: readonly string[];
  transmits: { documentText: boolean; images: boolean; addresses: boolean; identifiers: boolean; homeFacts: boolean };
  minimization: string;
  outputAuthority: string;
  control: { flags: readonly string[]; defaultState: string };
  failureBehavior: string;
  evaluationGate: string;
  disposition: string;
  dataClass: DataClass;
  realHomeownerData: RealHomeownerDataApproval;
  /** Present only when realHomeownerData is APPROVED; names the exact flow it approves (never inherited). */
  approval?: { forFlowId: string; evidence: string };
  providerTerms: { provider: RecordedFact; model: RecordedFact; region: RecordedFact; retention: RecordedFact; trainingUse: RecordedFact; abuseMonitoring: RecordedFact; applicationLogging: RecordedFact; deletion: RecordedFact };
  openItems: readonly string[];
}

const UNRECORDED = 'UNRECORDED';
const unrecordedTerms = (provider: RecordedFact, model: RecordedFact) => ({
  provider, model, region: UNRECORDED, retention: UNRECORDED, trainingUse: UNRECORDED, abuseMonitoring: UNRECORDED, applicationLogging: UNRECORDED, deletion: UNRECORDED,
});
const GOOGLE_GEMINI = 'Google Gemini (via governed AI request boundary)';
const FAST_MODEL = 'resolveGovernedAIModel(FAST)';
const COMMON_PROHIBITED = ['credentials and secrets', 'government and financial account identifiers', 'unrelated document content', 'unrestricted conversation history', 'raw database records'] as const;
const NO_TRANSMIT = { documentText: false, images: false, addresses: false, identifiers: false, homeFacts: false };

export const PROVIDER_BOUNDARY_REGISTER: readonly ProviderBoundaryEntry[] = Object.freeze([
  {
    id: 'CAPTURE_EXTRACTION',
    status: 'ACTIVE_CODE',
    purpose: 'Extract typed fact, event, warranty, evidence or goal candidates from an ordinary homeowner message after a deterministic pre-filter.',
    stage: 'conversational capture (post-routing)',
    authorizingRequirements: ['MF-014', 'MF-017', 'MF-034', 'MF-038', 'MF-046', 'BICC-INV-002'],
    callSites: ['src/services/ask/conversationalUnderstanding/extractionContract.ts'],
    callSiteMarkers: ['ai:ask-conversational-capture-extraction', 'generateContent('],
    permittedFields: ['homeowner message text', 'recent home event id/title/occurredAt/amount', 'recent document ids', 'active decision thread summary', 'reference date and timezone'],
    prohibitedDataCategories: COMMON_PROHIBITED,
    transmits: { documentText: false, images: false, addresses: false, identifiers: true, homeFacts: true },
    minimization: 'Deterministic pre-filter gates the call; context is a bounded list of recent events/documents; output is validated against a closed schema and only ids from the supplied context are accepted.',
    outputAuthority: 'Candidate proposals only. It does not route, change the answer, or commit a material write; confirmation, authorization and idempotency are enforced downstream.',
    control: { flags: ['ASK_CONVERSATIONAL_CAPTURE_ENABLED', 'ASK_CONVERSATIONAL_CAPTURE_KILL_SWITCH'], defaultState: 'off' },
    failureBehavior: 'Malformed or invalid output is dropped; the turn continues without a capture candidate.',
    evaluationGate: 'BICC-GATE-008 per write family; BICC-EVAL-011',
    disposition: 'Retain as named structured-analysis exception; certify by candidate/write family.',
    dataClass: 'REAL_HOMEOWNER',
    realHomeownerData: 'NOT_APPROVED',
    providerTerms: unrecordedTerms(GOOGLE_GEMINI, FAST_MODEL),
    openItems: ['Owner records provider terms and a real-homeowner-data approval for this exact flow before it is enabled for real data.'],
  },
  {
    id: 'SEMANTIC_REQUEST_PLAN',
    status: 'ACTIVE_CODE',
    purpose: 'Last-resort typed target/plan proposal (operation and data-point ids, slots, facets) after certified deterministic paths do not resolve the request.',
    stage: 'semantic planning (last resort)',
    authorizingRequirements: ['FR-UND-*', 'FR-PRV-*', 'BICC-INV-011', 'BICC-UND-012'],
    callSites: ['src/services/gemini.service.ts', 'src/services/ask/modelRouting/understandingProvider.ts'],
    callSiteMarkers: ['planAskUnderstanding', 'selectAskUnderstandingDomains'],
    permittedFields: ['minimized homeowner text', 'policy-filtered operation ids and descriptions', 'policy-filtered data-point ids, descriptions and domains'],
    prohibitedDataCategories: [...COMMON_PROHIBITED, 'home record values'],
    transmits: { documentText: false, images: false, addresses: false, identifiers: false, homeFacts: false },
    minimization: 'The caller supplies only minimized text and a policy-filtered catalogue; no record values are sent. requestPlan.ts is the authority that admits any returned id.',
    outputAuthority: 'Validated plan only. Handlers remain answer authority; write targets are preview-only.',
    control: { flags: ['ASK_UNDERSTANDING_PLANNER_ENABLED', 'ASK_UNDERSTANDING_PLANNER_KILL_SWITCH', 'ASK_UNDERSTANDING_PROVIDER_TERMS_RECORDED', 'ASK_UNDERSTANDING_HOMEOWNER_TEXT_APPROVED'], defaultState: 'off' },
    failureBehavior: 'Fail closed to deterministic routing, a focused clarification, or an unavailable result; the model never broadens execution authority.',
    evaluationGate: 'BICC-GATE-001/003/010 for an approved stratum (BICC-1B.2)',
    disposition: 'Retain disabled until a stratum passes its gates.',
    dataClass: 'REAL_HOMEOWNER',
    realHomeownerData: 'NOT_APPROVED',
    providerTerms: unrecordedTerms(GOOGLE_GEMINI, FAST_MODEL),
    openItems: ['Owner records provider terms (ASK_UNDERSTANDING_PROVIDER_TERMS_RECORDED) and homeowner-text approval (ASK_UNDERSTANDING_HOMEOWNER_TEXT_APPROVED) for this flow.'],
  },
  {
    id: 'SEMANTIC_STAGED_UNDERSTANDING',
    status: 'ACTIVE_CODE',
    purpose: 'Stage-one segmentation and stage-two target selection for the cross-domain semantic request plan.',
    stage: 'semantic planning (staged provider)',
    authorizingRequirements: ['FR-UND-*', 'FR-ONT-*', 'BICC-INV-011', 'BICC-UND-012'],
    callSites: ['src/services/ask/semantic/evaluation/semanticProviderOrchestrator.ts'],
    callSiteMarkers: ['runStageOne', 'runStageTwo', 'generateContent('],
    permittedFields: ['minimized text', 'eligible domain ids', 'unresolved minimized spans', 'policy-filtered catalogue entries'],
    prohibitedDataCategories: [...COMMON_PROHIBITED, 'home record values'],
    transmits: { documentText: false, images: false, addresses: false, identifiers: false, homeFacts: false },
    minimization: 'Input is the minimized text plus eligible domain/catalogue ids and character-offset spans; output is schema-validated and offsets are checked against the minimized text.',
    outputAuthority: 'Validated semantic plan proposals only; the deterministic validators and handlers remain authoritative.',
    control: { flags: ['ASK_UNDERSTANDING_PLANNER_ENABLED', 'ASK_UNDERSTANDING_PLANNER_KILL_SWITCH', 'ASK_UNDERSTANDING_PROVIDER_TERMS_RECORDED', 'ASK_UNDERSTANDING_HOMEOWNER_TEXT_APPROVED', 'ASK_SEMANTIC_PROVIDER_APPROVED'], defaultState: 'off: inherits the semantic-planner controls through resolveDefaultSemanticProviderPolicy (owner decision 2026-11-22)' },
    failureBehavior: 'ProviderSchemaValidationError and timeouts fail closed to the deterministic path.',
    evaluationGate: 'BICC-GATE-001/003/010 for an approved stratum (BICC-1B.2); semantic evaluation harness',
    disposition: 'Inherits the semantic-planner controls; enabled only with the planner on, kill switch off, provider terms recorded, homeowner-text approval and a certified stratum (BICC-1B.2).',
    dataClass: 'REAL_HOMEOWNER',
    realHomeownerData: 'NOT_APPROVED',
    providerTerms: unrecordedTerms(GOOGLE_GEMINI, FAST_MODEL),
    openItems: [
      'Owner records provider terms and a real-homeowner-data approval for this exact flow.',
      'The per-stratum certification check is not yet enforced in code; it arrives with BICC-1B.2.',
    ],
  },
  {
    id: 'REMOTE_FALLBACK_TYPED_CLAIM_SELECTION',
    status: 'ACTIVE_CODE',
    purpose: 'Select which deterministic typed-claim candidates are relevant to a question for the GROUNDED_GUIDANCE operation; text is rendered deterministically from the selected claims.',
    stage: 'grounded guidance (post-routing)',
    authorizingRequirements: ['ASK_COZY_UNDERSTANDING_RELIABILITY_FRD (grounded fallback)', 'BICC-INV-002', 'BICC-ANS-013'],
    callSites: ['src/services/gemini.service.ts', 'src/services/groundedAsk.service.ts'],
    callSiteMarkers: ['selectAskRemoteFallbackTypedClaims', 'ASK_COZY_REMOTE_FALLBACK_SYNTHESIS'],
    permittedFields: ['minimized question', 'candidate claim entries: fact key, value, source, observedAt, confidence'],
    prohibitedDataCategories: COMMON_PROHIBITED,
    transmits: { documentText: false, images: false, addresses: false, identifiers: false, homeFacts: true },
    minimization: 'minimizeAskQuestion on the question; candidate facts are the question-relevant subset (at most a bounded number) selected deterministically.',
    outputAuthority: 'Selection only: the model returns claimType, factRefs and comparisonOperator from a closed schema; askRemoteFallbackTypedClaims.ts validates and renders every sentence deterministically.',
    control: { flags: ['ASK_REMOTE_GENERATION_ENABLED'], defaultState: 'off (owner decision 2026-11-22; the Kubernetes base config is also false)' },
    failureBehavior: 'No supported claim reconstructed: the answer states that no supported claim is available; nothing is invented.',
    evaluationGate: 'BICC-GATE-007 (static authored text); BICC-GATE-001 for the grounded-guidance read stratum',
    disposition: 'Disabled by default (owner decision 2026-11-22). No new named exception. Retire it if deterministic handlers or the governed last-resort semantic planner cover the same use case; if retained it runs under the semantic-planning boundary, never generates answer wording and never bypasses deterministic readers. With the flag off no provider is called and GROUNDED_GUIDANCE serves only its deterministic authored and Knowledge Hub branch.',
    dataClass: 'REAL_HOMEOWNER',
    realHomeownerData: 'NOT_APPROVED',
    providerTerms: unrecordedTerms(GOOGLE_GEMINI, FAST_MODEL),
    openItems: [
      'Consumer trace: groundedAsk.service answerGroundedAsk is called only by the GROUNDED_GUIDANCE handler (the legacy HTTP endpoint that also called it is retired); decide retire-or-fold once deterministic coverage is certified.',
      'It transmits home-fact values; it may not be enabled for real data without a recorded provider approval for this exact flow.',
    ],
  },
  {
    id: 'GUIDANCE_ADVISOR_STRATEGIC_TAKE',
    status: 'ACTIVE_CODE',
    purpose: 'Guidance Advisor "Strategic Take": one or two sentences of advisory text for an active guidance journey. A Guidance Engine feature, registered as its own flow; it is not an Ask exception.',
    stage: 'guidance engine (outside Ask)',
    authorizingRequirements: ['GUIDANCE_ENGINE_FRD FR-15', 'BICC-OPS-006', 'BICC-OPS-007', 'BICC-OPS-008', 'owner decision 2026-11-22'],
    callSites: ['src/services/gemini.service.ts', 'src/services/guidanceEngine/guidanceAdvisor.service.ts', 'src/services/guidanceEngine/guidanceAdvisorPayload.ts'],
    callSiteMarkers: ['generateGuidanceAdvice', 'serializeGuidanceAdvicePayload', 'GUIDANCE_ADVISOR_PERMITTED_FIELDS'],
    permittedFields: ['issueDomain', 'assetName', 'signalIntentFamily', 'symptom', 'currentStepLabel', 'priorityBucket', 'costOfDelay (rounded to the nearest $100)', 'coverageImpact'],
    prohibitedDataCategories: [...COMMON_PROHIBITED, 'user, property and journey identifiers', 'addresses', 'home-record facts'],
    transmits: { documentText: false, images: false, addresses: false, identifiers: false, homeFacts: true },
    minimization: 'An allowlisted serializer builds the prompt from eight fields; free text passes through the Ask minimiser (email, link, phone and account-number redaction) and is capped at 120 characters; no identifier, property context or history is sent. The previous direct chat call that injected property facts is removed.',
    outputAuthority: 'Free-form advisory sentence shown as optional text on the journey overview; it never changes a journey, a record or a step.',
    control: { flags: ['GUIDANCE_ADVISOR_AI_ENABLED', 'GUIDANCE_ADVISOR_AI_KILL_SWITCH', 'GUIDANCE_ADVISOR_PROVIDER_TERMS_RECORDED', 'GUIDANCE_ADVISOR_PROPERTY_DATA_APPROVED'], defaultState: 'off: needs the flag on, kill switch off, provider terms recorded and property-data transmission approved (owner decision 2026-11-22)' },
    failureBehavior: 'Returns no advice; the authored and deterministic Guidance Engine output is unchanged.',
    evaluationGate: 'none under BICC; captured-payload test in tests/unit/guidanceAdvisorProviderFlow.test.js',
    disposition: 'Feature-specific provider flow. No approval is inferred from any Ask provider flow. Disabled until its own provider terms and property-data transmission are approved.',
    dataClass: 'REAL_HOMEOWNER',
    realHomeownerData: 'NOT_APPROVED',
    providerTerms: unrecordedTerms(GOOGLE_GEMINI, FAST_MODEL),
    openItems: ['Owner records provider terms and a property-data transmission approval for this exact flow before it is enabled.'],
  },
  {
    id: 'LEGACY_GEMINI_CHAT_ENDPOINT',
    status: 'RETIRED',
    purpose: 'Legacy POST /api/gemini/chat (a thin HTTP wrapper over answerGroundedAsk with no frontend caller).',
    stage: 'retired',
    authorizingRequirements: ['BICC audit §8; owner decision 2026-11-22'],
    callSites: [], callSiteMarkers: [],
    permittedFields: ['none'],
    prohibitedDataCategories: ['all'],
    transmits: { ...NO_TRANSMIT },
    minimization: 'n/a (retired)',
    outputAuthority: 'None.',
    control: { flags: [], defaultState: 'removed' },
    failureBehavior: 'n/a',
    evaluationGate: 'n/a',
    disposition: 'Route, controller and API-client method removed; no governed consumer was found.',
    dataClass: 'NONE',
    realHomeownerData: 'NOT_APPROVED',
    providerTerms: unrecordedTerms(UNRECORDED, UNRECORDED),
    openItems: [],
  },
  {
    id: 'DOCUMENT_EVIDENCE_EXTRACTION',
    status: 'PLANNED',
    purpose: 'Extract typed spans, claims, fields and citation candidates from authorized document chunks.',
    stage: 'document-grounded answers (BICC-3.2)',
    authorizingRequirements: ['BICC-MM-004', 'BICC-MM-005', 'BICC-MM-006', 'BICC-MM-007', 'BICC-MM-008', 'BICC-MM-012', 'BICC-MM-013'],
    callSites: [], callSiteMarkers: [],
    permittedFields: ['authorized chunk text with document/version/page/chunk locators'],
    prohibitedDataCategories: [...COMMON_PROHIBITED, 'chunks from other users, properties or versions'],
    transmits: { documentText: true, images: false, addresses: false, identifiers: false, homeFacts: false },
    minimization: 'To be defined by BICC-3.2 before activation; document text is untrusted evidence.',
    outputAuthority: 'Evidence candidates only, verified mechanically against the cited chunk; deterministic templates render prose.',
    control: { flags: [], defaultState: 'not built' },
    failureBehavior: 'Any citation or provenance mismatch fails closed.',
    evaluationGate: 'BICC-GATE-004B2; BICC-EVAL-015',
    disposition: 'No call may activate before registration here and BICC-3.2 gates pass.',
    dataClass: 'REAL_HOMEOWNER',
    realHomeownerData: 'NOT_APPROVED',
    providerTerms: unrecordedTerms(GOOGLE_GEMINI, UNRECORDED),
    openItems: ['Provider flow review (OPS-008) when BICC-3.2 selects the implementation.'],
  },
  {
    id: 'VISION_OBSERVATION_EXTRACTION',
    status: 'PLANNED',
    purpose: 'Extract typed observations, condition candidates and an urgency class from an authorized image.',
    stage: 'attachment analysis (BICC-3.2)',
    authorizingRequirements: ['BICC-MM-009', 'BICC-MM-012', 'BICC-MM-013', 'BICC-SAFE-001'],
    callSites: [], callSiteMarkers: [],
    permittedFields: ['authorized image with region locators'],
    prohibitedDataCategories: [...COMMON_PROHIBITED, 'identity documents', 'images of people'],
    transmits: { documentText: false, images: true, addresses: false, identifiers: false, homeFacts: false },
    minimization: 'To be defined by BICC-3.2 before activation.',
    outputAuthority: 'Observation/urgency candidates only; no diagnosis or recommendation authority.',
    control: { flags: [], defaultState: 'not built' },
    failureBehavior: 'Schema or provenance rejection fails closed.',
    evaluationGate: 'BICC-GATE-004B2 subset; BICC-GATE-002 for safety-sensitive urgency',
    disposition: 'No call may activate before registration here and BICC-3.2 gates pass.',
    dataClass: 'REAL_HOMEOWNER',
    realHomeownerData: 'NOT_APPROVED',
    providerTerms: unrecordedTerms(GOOGLE_GEMINI, UNRECORDED),
    openItems: ['Provider flow review (OPS-008) when BICC-3.2 selects the implementation.'],
  },
  {
    id: 'SENSITIVE_DOCUMENT_CLASSIFIER',
    status: 'NOT_AUTHORIZED',
    purpose: 'Classify a minimized upload into allowed, prohibited or uncertain sensitivity classes (only if deterministic D04 checks prove insufficient).',
    stage: 'attachment intake (BICC-3.1)',
    authorizingRequirements: ['BICC-D04', 'BICC-OPS-006', 'BICC-OPS-007', 'BICC-OPS-008', 'BICC-OPS-009'],
    callSites: [], callSiteMarkers: [],
    permittedFields: ['none authorized'],
    prohibitedDataCategories: [...COMMON_PROHIBITED, 'full document content'],
    transmits: { ...NO_TRANSMIT },
    minimization: 'Not authorized; default implementation is deterministic.',
    outputAuthority: 'Classification candidate only; uncertain and prohibited outcomes fail closed.',
    control: { flags: [], defaultState: 'not built' },
    failureBehavior: 'Fail closed.',
    evaluationGate: 'D04 detection evaluation (at least 500 labeled files)',
    disposition: 'A fourth named exception only if registered and evaluated.',
    dataClass: 'NONE',
    realHomeownerData: 'NOT_APPROVED',
    providerTerms: unrecordedTerms(UNRECORDED, UNRECORDED),
    openItems: [],
  },
  {
    id: 'EVALUATION_JUDGE',
    status: 'PLANNED',
    purpose: 'Offline scoring of semantic properties that deterministic checks and human review cannot decide economically.',
    stage: 'offline evaluation (BICC-0.1)',
    authorizingRequirements: ['BICC-EVAL-014', 'BICC-OPS-009'],
    callSites: [], callSiteMarkers: [],
    permittedFields: ['approved synthetic prompts, synthetic records and synthetic answers'],
    prohibitedDataCategories: ['real or replayed homeowner prompts', 'real records, documents or images', 'production payloads', ...COMMON_PROHIBITED],
    transmits: { ...NO_TRANSMIT },
    minimization: 'Synthetic material only (OPS-009); the evaluator egress check rejects real payloads.',
    outputAuthority: 'Evaluation evidence only; never runtime behavior.',
    control: { flags: [], defaultState: 'not built' },
    failureBehavior: 'No judge result: the gate that needs it is not certifying.',
    evaluationGate: 'BICC-EVAL-014 calibration against a sealed human-labeled set',
    disposition: 'Offline evaluators are outside the runtime deterministic-first order but separately approved.',
    dataClass: 'SYNTHETIC_ONLY',
    realHomeownerData: 'NOT_APPROVED',
    providerTerms: unrecordedTerms(UNRECORDED, UNRECORDED),
    openItems: [],
  },
  {
    id: 'RESULT_SYNTHESIS',
    status: 'RETIRED',
    purpose: 'Generated homeowner-facing summary text from result blocks.',
    stage: 'retired',
    authorizingRequirements: ['BICC-ANS-010', 'BICC-ANS-013'],
    callSites: [], callSiteMarkers: [],
    permittedFields: ['none'],
    prohibitedDataCategories: ['all'],
    transmits: { ...NO_TRANSMIT },
    minimization: 'n/a (retired)',
    outputAuthority: 'None: model-written answer wording is not permitted.',
    control: { flags: [], defaultState: 'removed' },
    failureBehavior: 'n/a',
    evaluationGate: 'n/a',
    disposition: 'Retired under BICC-0.3; any return requires an owner-approved FRD amendment.',
    dataClass: 'NONE',
    realHomeownerData: 'NOT_APPROVED',
    providerTerms: unrecordedTerms(UNRECORDED, UNRECORDED),
    openItems: [],
  },
]);

const REQUIRED_NON_EMPTY: ReadonlyArray<keyof ProviderBoundaryEntry> = ['id', 'status', 'purpose', 'stage', 'minimization', 'outputAuthority', 'failureBehavior', 'evaluationGate', 'disposition', 'dataClass'];

/** Returns every violation of BICC-OPS-006..009 in a register; an empty array means the register is well formed. */
export function validateProviderBoundaryRegister(register: readonly ProviderBoundaryEntry[] = PROVIDER_BOUNDARY_REGISTER): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const entry of register) {
    if (ids.has(entry.id)) issues.push(`${entry.id}: duplicate id.`);
    ids.add(entry.id);
    for (const field of REQUIRED_NON_EMPTY) {
      const value = entry[field];
      if (typeof value !== 'string' || !value.trim()) issues.push(`${entry.id}: ${String(field)} is required.`);
    }
    if (!entry.authorizingRequirements.length) issues.push(`${entry.id}: at least one authorizing requirement is required.`);
    if (!entry.permittedFields.length) issues.push(`${entry.id}: permittedFields must be listed (use ['none ...'] when nothing is permitted).`);
    if (!entry.prohibitedDataCategories.length) issues.push(`${entry.id}: prohibitedDataCategories are required.`);
    if (!entry.control.defaultState.trim()) issues.push(`${entry.id}: control default state is required.`);
    for (const [key, value] of Object.entries(entry.providerTerms)) if (!String(value).trim()) issues.push(`${entry.id}: providerTerms.${key} must be a fact or UNRECORDED.`);
    if (entry.status === 'ACTIVE_CODE' && (!entry.callSites.length || !entry.callSiteMarkers.length)) issues.push(`${entry.id}: an ACTIVE_CODE flow must name its call sites and markers.`);
    if (entry.status !== 'ACTIVE_CODE' && entry.callSites.length) issues.push(`${entry.id}: ${entry.status} flows must not name call sites.`);
    // OPS-009: an evaluator never carries real homeowner data.
    if (entry.id === 'EVALUATION_JUDGE' && (entry.dataClass !== 'SYNTHETIC_ONLY' || entry.realHomeownerData !== 'NOT_APPROVED' || Object.values(entry.transmits).some(Boolean))) {
      issues.push(`${entry.id}: the evaluation judge must be synthetic-only and transmit no real homeowner category.`);
    }
    // OPS-008: an approval names exactly this flow and carries evidence; it can never be inherited.
    if (entry.realHomeownerData === 'APPROVED') {
      if (!entry.approval || entry.approval.forFlowId !== entry.id || !entry.approval.evidence.trim()) issues.push(`${entry.id}: a real-homeowner-data approval must name this exact flow and carry evidence.`);
      if (Object.values(entry.providerTerms).includes(UNRECORDED)) issues.push(`${entry.id}: a flow cannot be approved for real homeowner data while its provider terms are UNRECORDED.`);
    } else if (entry.approval) {
      issues.push(`${entry.id}: an approval record is present but realHomeownerData is NOT_APPROVED.`);
    }
    if (entry.status === 'RETIRED' && entry.control.flags.length) issues.push(`${entry.id}: a retired flow must not keep control flags.`);
  }
  return issues;
}

/** The flows that currently reach a provider with real homeowner data and have no recorded approval. */
export function flowsLackingRealDataApproval(register: readonly ProviderBoundaryEntry[] = PROVIDER_BOUNDARY_REGISTER): string[] {
  return register.filter((entry) => entry.status === 'ACTIVE_CODE' && entry.dataClass === 'REAL_HOMEOWNER' && entry.realHomeownerData !== 'APPROVED').map((entry) => entry.id);
}
