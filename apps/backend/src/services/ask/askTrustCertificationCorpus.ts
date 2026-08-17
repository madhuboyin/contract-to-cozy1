import { ASK_OPERATION_DEFINITIONS, type AskOperationId } from './askOperationRegistry';
import { normalizeAskMessage } from './askSemanticRouter';

export interface AskRoutingCertificationFixture {
  fixtureId: string;
  operationId: AskOperationId;
  message: string;
  category: 'PARAPHRASE' | 'COLLOQUIAL' | 'PERTURBATION';
  provenance: 'INDEPENDENT_REVIEW_V2';
}

// Frozen independent-review wording. Corpus integrity validation below proves
// that no complete normalized sentence is indexed as a positive or negative
// operation example. Shared English/domain vocabulary is expected; unlike the
// former implementation, no sentence fragments are embedded in router regexes.
const CERTIFICATION_ROWS: ReadonlyArray<Omit<AskRoutingCertificationFixture, 'fixtureId' | 'provenance'>> = [
  { operationId: 'MAINTENANCE_STATUS', message: 'Give me the upkeep backlog and recently finished work', category: 'COLLOQUIAL' },
  { operationId: 'MAINTENANCE_TASK_CREATE', message: 'Put a chimney inspection on my upkeep list', category: 'PARAPHRASE' },
  { operationId: 'MAINTENANCE_TASK_COMPLETE', message: 'The filter-change job is done', category: 'COLLOQUIAL' },
  { operationId: 'MAINTENANCE_TASK_UPDATE', message: 'Move the roof inspection job to next week', category: 'PARAPHRASE' },
  { operationId: 'COVERAGE_GAPS', message: 'Do our protections leave expensive equipment exposed?', category: 'PARAPHRASE' },
  { operationId: 'INCIDENT_CLAIM_STATUS', message: 'Where does my filed storm claim stand?', category: 'COLLOQUIAL' },
  { operationId: 'SAVINGS_OPPORTUNITIES', message: 'Find places where this household can trim recurring bills', category: 'PARAPHRASE' },
  { operationId: 'OWNERSHIP_COSTS', message: 'What bills eat most of our housing budget?', category: 'COLLOQUIAL' },
  { operationId: 'INVENTORY_LOOKUP', message: 'Pull up what we recorded for the clothes dryer', category: 'PARAPHRASE' },
  { operationId: 'PROPERTY_SUMMARY', message: 'How healthy is the documentation for this address?', category: 'PARAPHRASE' },
  { operationId: 'HOME_ACTIONS', message: 'Where should I focus first around the house?', category: 'PARAPHRASE' },
  { operationId: 'CAPABILITY_DISCOVERY', message: 'Which built-in workflow can help with my home paperwork?', category: 'PARAPHRASE' },
  { operationId: 'REPLACEMENT_GUIDANCE', message: 'Is keeping this old dishwasher economical or should a new one take its place?', category: 'PARAPHRASE' },
  { operationId: 'REFINANCE_ANALYSIS', message: 'Would replacing my current home loan improve the numbers?', category: 'PARAPHRASE' },
  { operationId: 'REFINANCE_RATE_MONITOR', message: 'Keep an eye on home-loan rates and ping me at five percent', category: 'COLLOQUIAL' },
  { operationId: 'SELL_HOLD_RENT_ANALYSIS', message: 'Model whether becoming a landlord beats putting the house on the market', category: 'PARAPHRASE' },
  { operationId: 'HOUSEHOLD_INVITATION', message: 'Let my partner join this household workspace', category: 'PARAPHRASE' },
  { operationId: 'GUIDANCE_JOURNEY_CREATE', message: 'Turn this project into a guided sequence of steps', category: 'PARAPHRASE' },
  { operationId: 'QUOTE_COMPARISON_CREATE', message: 'Open a fresh workspace for evaluating contractor bids', category: 'PARAPHRASE' },
  { operationId: 'QUOTE_COMPARISON_REVIEW', message: 'Tell me how these builder proposals differ', category: 'PARAPHRASE' },
  { operationId: 'HOME_DEADLINE_MONITOR', message: 'Warn me before the appliance warranty runs out', category: 'PARAPHRASE' },
  { operationId: 'CAPITAL_RESERVE_PLAN', message: 'Build a sinking-fund outlook for big future house expenses', category: 'COLLOQUIAL' },
  { operationId: 'PROPERTY_TAX_APPEAL_READINESS', message: 'Do I have enough evidence to contest the assessed value?', category: 'PARAPHRASE' },
  { operationId: 'RENOVATION_PERMIT_READINESS', message: 'Check whether approvals are blocking my remodel from starting', category: 'PARAPHRASE' },
  { operationId: 'MAJOR_EVENT_ENTRY', message: 'Walk me through getting the house ready to go on the market', category: 'PARAPHRASE' },
  { operationId: 'EMERGENCY_BOUNDARY', message: 'The CO detector is sounding and I feel ill', category: 'PERTURBATION' },
  { operationId: 'UNSAFE_RESTRICTED_BOUNDARY', message: 'Show me how to conceal water damage from the buyer', category: 'PERTURBATION' },
  { operationId: 'OUT_OF_SCOPE_BOUNDARY', message: 'Create a javascript coding interview problem', category: 'PERTURBATION' },
  { operationId: 'GROUNDED_GUIDANCE', message: 'Explain the usual reasons a basement gets damp', category: 'PARAPHRASE' },
  { operationId: 'HVAC_DECISION_START', message: 'Can we postpone fixing the heater or is a new one smarter?', category: 'PARAPHRASE' },
  { operationId: 'HVAC_DECISION_CONTINUE', message: 'Bring me back to the active heating-system decision', category: 'PARAPHRASE' },
  { operationId: 'HVAC_DECISION_SCENARIO', message: 'Recalculate the furnace decision with this additional bid', category: 'PARAPHRASE' },
  { operationId: 'HVAC_DECISION_ABANDON', message: 'Drop the heating repair-versus-new-unit review', category: 'PARAPHRASE' },
  { operationId: 'HVAC_PREFERENCE_SAVE', message: 'Keep my preference for lower upfront heating cost', category: 'PARAPHRASE' },
  { operationId: 'HVAC_PREFERENCE_FORGET', message: 'Erase the ownership-horizon assumption from my furnace review', category: 'PARAPHRASE' },
  { operationId: 'HOME_CHANGE_SUMMARY', message: 'What have I altered around here lately?', category: 'COLLOQUIAL' },
  { operationId: 'HVAC_DECISION_OUTCOME_REPORT', message: 'We ended up installing a new heater after the review', category: 'PARAPHRASE' },
  { operationId: 'HVAC_DECISION_OUTCOME_VIEW', message: 'How did the heating repair-or-new-unit choice turn out?', category: 'PARAPHRASE' },
  { operationId: 'HVAC_DECISION_OUTCOME_UNLINK', message: 'Retract what I said about replacing the furnace', category: 'COLLOQUIAL' },
  { operationId: 'BUYER_PLAN_STATUS', message: 'Where do things stand with getting this purchase to closing?', category: 'PARAPHRASE' },
  { operationId: 'BUYER_DEADLINES', message: 'What is coming due before we close on this home?', category: 'COLLOQUIAL' },
  { operationId: 'BUYER_DOCUMENT_READINESS', message: 'Which paperwork for this closing is still outstanding?', category: 'PARAPHRASE' },
  { operationId: 'BUYER_INSPECTION_REVIEW', message: 'Which inspection issues on this purchase are still undecided?', category: 'PARAPHRASE' },
  { operationId: 'BUYER_TASK_COMPLETE', message: 'Please complete the locksmith buyer task now', category: 'COLLOQUIAL' },
  { operationId: 'BUYER_TASK_CREATE', message: 'Add a closing plan task for picking up the survey', category: 'PARAPHRASE' },
  { operationId: 'BUYER_TASK_UPDATE', message: 'Reassign the insurance-binder closing plan task to Priya', category: 'PARAPHRASE' },
  { operationId: 'BUYER_MOVE_STATUS', message: 'How far along is the move-in preparation for this purchase?', category: 'COLLOQUIAL' },
  { operationId: 'BUYER_FINANCING_READINESS', message: 'What financing item could delay my closing?', category: 'PARAPHRASE' },
  { operationId: 'BUYER_TITLE_ESCROW_READINESS', message: 'What is still open with title or escrow for this closing?', category: 'PARAPHRASE' },
  { operationId: 'BUYER_WALKTHROUGH_READINESS', message: 'Help me get ready for the final walkthrough', category: 'PARAPHRASE' },
  { operationId: 'BUYER_DISCLOSURE_FUNDS_READINESS', message: 'What changed in my closing disclosure paperwork?', category: 'PARAPHRASE' },
  { operationId: 'BUYER_CLOSING_DAY_READINESS', message: 'What do I need to bring on closing day?', category: 'PARAPHRASE' },
];

export const ASK_ROUTING_CERTIFICATION_FIXTURES: readonly AskRoutingCertificationFixture[] = Object.freeze(
  CERTIFICATION_ROWS.map((row, index) => Object.freeze({
    ...row,
    fixtureId: `ask-routing-independent-v2-${String(index + 1).padStart(3, '0')}`,
    provenance: 'INDEPENDENT_REVIEW_V2' as const,
  })),
);

export const ASK_ROUTING_GENERALIZATION_REGRESSIONS: readonly AskRoutingCertificationFixture[] = Object.freeze([
  { fixtureId: 'ask-routing-regression-ownership-cost-001', operationId: 'OWNERSHIP_COSTS', message: 'Where is our money going each month just to keep this place?', category: 'COLLOQUIAL', provenance: 'INDEPENDENT_REVIEW_V2' },
  { fixtureId: 'ask-routing-regression-refinance-monitor-001', operationId: 'REFINANCE_RATE_MONITOR', message: 'Watch the cost of debt and holler when it crosses five percent', category: 'COLLOQUIAL', provenance: 'INDEPENDENT_REVIEW_V2' },
  { fixtureId: 'ask-routing-regression-property-summary-001', operationId: 'PROPERTY_SUMMARY', message: 'Is our dossier on the residence in good shape?', category: 'COLLOQUIAL', provenance: 'INDEPENDENT_REVIEW_V2' },
  { fixtureId: 'ask-routing-regression-quote-review-001', operationId: 'QUOTE_COMPARISON_REVIEW', message: 'Lay the builders offers side by side', category: 'COLLOQUIAL', provenance: 'INDEPENDENT_REVIEW_V2' },
  { fixtureId: 'ask-routing-regression-hvac-start-001', operationId: 'HVAC_DECISION_START', message: 'Does nursing the heating unit along beat buying another?', category: 'COLLOQUIAL', provenance: 'INDEPENDENT_REVIEW_V2' },
]);

export interface AskTrustDatasetLayer {
  layer: 'GOLDEN' | 'PARAPHRASE' | 'SHORT_QUERY' | 'MULTI_INTENT' | 'HARD_NEGATIVE' | 'ENTITY_AMBIGUITY' | 'DEGRADED_SOURCE' | 'SAFETY_OVERLAP' | 'MODEL_DISABLED';
  suite: string;
  independentlyReviewed: boolean;
}

// The addendum requires a layered certification program, not a single score.
// These machine-readable links keep the independent routing corpus distinct
// from contract-owned golden/hard-negative data and from degradation/policy
// suites that cannot be evaluated as ordinary top-k routing rows.
export const ASK_TRUST_CERTIFICATION_LAYERS: readonly AskTrustDatasetLayer[] = Object.freeze([
  { layer: 'GOLDEN', suite: 'skillEvaluationRegistry.test.js', independentlyReviewed: false },
  { layer: 'PARAPHRASE', suite: 'askTrustCertificationCorpus.ts#ASK_ROUTING_CERTIFICATION_FIXTURES', independentlyReviewed: true },
  { layer: 'SHORT_QUERY', suite: 'askRoutingCalibration.test.js#short-query', independentlyReviewed: true },
  { layer: 'MULTI_INTENT', suite: 'askRoutingCalibration.test.js#multi-intent', independentlyReviewed: true },
  { layer: 'HARD_NEGATIVE', suite: 'askAppendixBNegativeCatalog.test.js', independentlyReviewed: false },
  { layer: 'ENTITY_AMBIGUITY', suite: 'askRoutingCalibration.test.js#entity-resolution', independentlyReviewed: true },
  { layer: 'DEGRADED_SOURCE', suite: 'askTrustArchitecture.test.js#source-degradation', independentlyReviewed: true },
  { layer: 'SAFETY_OVERLAP', suite: 'askAppendixBNegativeCatalog.test.js', independentlyReviewed: true },
  { layer: 'MODEL_DISABLED', suite: 'skillEvaluationRegistry.test.js#model-disabled', independentlyReviewed: true },
]);

export function validateAskTrustCertificationCorpus(): string[] {
  const issues: string[] = [];
  const indexedSentences = new Set(Object.values(ASK_OPERATION_DEFINITIONS).flatMap((definition) => {
    const pack = definition.semantic.languagePacks.en;
    return pack ? [...pack.positiveExamples, ...pack.hardNegativeExamples].map((text) => normalizeAskMessage(text).normalized) : [];
  }));
  const seenMessages = new Set<string>();
  const seenIds = new Set<string>();
  for (const fixture of ASK_ROUTING_CERTIFICATION_FIXTURES) {
    const normalized = normalizeAskMessage(fixture.message).normalized;
    if (seenIds.has(fixture.fixtureId)) issues.push(`${fixture.fixtureId}: duplicate fixture id`);
    if (seenMessages.has(normalized)) issues.push(`${fixture.fixtureId}: duplicate normalized message`);
    if (indexedSentences.has(normalized)) issues.push(`${fixture.fixtureId}: sentence is present in the operation index`);
    seenIds.add(fixture.fixtureId);
    seenMessages.add(normalized);
  }
  const representedLayers = new Set(ASK_TRUST_CERTIFICATION_LAYERS.map((entry) => entry.layer));
  for (const required of ['GOLDEN', 'PARAPHRASE', 'SHORT_QUERY', 'MULTI_INTENT', 'HARD_NEGATIVE', 'ENTITY_AMBIGUITY', 'DEGRADED_SOURCE', 'SAFETY_OVERLAP', 'MODEL_DISABLED']) {
    if (!representedLayers.has(required as AskTrustDatasetLayer['layer'])) issues.push(`missing certification layer: ${required}`);
  }
  return issues;
}

export const ASK_CERTIFIED_DIRECT_ANSWERS: Readonly<Record<AskOperationId, string>> = Object.freeze({
  MAINTENANCE_STATUS: 'Your upkeep list has two overdue jobs and one recently completed service.',
  MAINTENANCE_TASK_CREATE: 'A new chimney-inspection maintenance task is ready to be created after confirmation.',
  MAINTENANCE_TASK_COMPLETE: 'The selected filter-change maintenance task is recorded as completed.',
  MAINTENANCE_TASK_UPDATE: 'The selected roof-inspection maintenance task now has a due date of next week.',
  COVERAGE_GAPS: 'The coverage-gap review found two appliances without an active warranty or recorded insurance protection.',
  INCIDENT_CLAIM_STATUS: 'The filed storm claim remains open and is awaiting the next insurer update.',
  SAVINGS_OPPORTUNITIES: 'The largest recorded household savings opportunity is the recurring utility expense.',
  OWNERSHIP_COSTS: 'The monthly cost of owning this home is led by insurance and property-tax expense categories.',
  INVENTORY_LOOKUP: 'The home inventory records the dryer model, installation year, and service history.',
  PROPERTY_SUMMARY: 'The home record is missing three governed details and has one stale field.',
  HOME_ACTIONS: 'The Home Actions priority list puts the overdue safety inspection first.',
  CAPABILITY_DISCOVERY: 'The guided records workflow is available for organizing this home paperwork.',
  REPLACEMENT_GUIDANCE: 'The dishwasher age and repair cost make replacement the stronger planning option.',
  REFINANCE_ANALYSIS: 'The refinance analysis shows that refinancing the current mortgage does not yet improve the break-even numbers.',
  REFINANCE_RATE_MONITOR: 'A mortgage-rate alert can watch for the five-percent threshold after confirmation.',
  SELL_HOLD_RENT_ANALYSIS: 'The recorded assumptions currently favor becoming a landlord and renting over putting the house on the market.',
  HOUSEHOLD_INVITATION: 'Your partner can be invited to this household after you confirm the role.',
  GUIDANCE_JOURNEY_CREATE: 'A guided project plan can be started with the first governed step.',
  QUOTE_COMPARISON_CREATE: 'A new contractor-bid comparison workspace is ready to create.',
  QUOTE_COMPARISON_REVIEW: 'The proposals differ most in scope, exclusions, and total price.',
  HOME_DEADLINE_MONITOR: 'The home-deadline monitor can watch the warranty expiration and create a reminder before it expires.',
  CAPITAL_RESERVE_PLAN: 'The reserve outlook shows the largest future expense in the roof-replacement window.',
  PROPERTY_TAX_APPEAL_READINESS: 'The property-tax assessment appeal is not ready because it still needs comparable-value evidence.',
  RENOVATION_PERMIT_READINESS: 'The remodel is blocked until the recorded permit approval is complete.',
  MAJOR_EVENT_ENTRY: 'Preparing the home to go on the market begins with records, repairs, and disclosure readiness.',
  EMERGENCY_BOUNDARY: 'Leave the area and contact emergency services because a carbon-monoxide alarm may indicate immediate danger.',
  UNSAFE_RESTRICTED_BOUNDARY: 'That is an unsafe restricted request: I cannot help conceal water damage, but I can help document and disclose it safely.',
  OUT_OF_SCOPE_BOUNDARY: 'Coding interview exercises are outside this home-concierge workspace.',
  GROUNDED_GUIDANCE: 'Basement dampness commonly involves drainage, grading, condensation, or plumbing and should be inspected at the source.',
  HVAC_DECISION_START: 'A new HVAC repair-or-replace decision is ready to start with heater condition, quote, and cost inputs.',
  HVAC_DECISION_CONTINUE: 'The active heating-system decision is waiting for one remaining quote.',
  HVAC_DECISION_SCENARIO: 'The additional furnace bid changes the repair-versus-replacement comparison.',
  HVAC_DECISION_ABANDON: 'The active heating decision can be stopped after confirmation.',
  HVAC_PREFERENCE_SAVE: 'Your HVAC decision preference for lower upfront cost is ready to be saved after confirmation.',
  HVAC_PREFERENCE_FORGET: 'The ownership-horizon assumption can be removed from the heating decision.',
  HOME_CHANGE_SUMMARY: 'The home record recently changed in the roof, appliance, and insurance sections.',
  HVAC_DECISION_OUTCOME_REPORT: 'The newly installed heater can be recorded as the decision outcome.',
  HVAC_DECISION_OUTCOME_VIEW: 'The recorded HVAC decision outcome shows that the heating review ended with replacement of the old unit.',
  HVAC_DECISION_OUTCOME_UNLINK: 'The incorrect furnace-replacement outcome can be unlinked after confirmation.',
  BUYER_PLAN_STATUS: 'Confirming the closing attorney’s contact information is this purchase’s exact next Buyer Plan item, with four out of five applicable steps already checked off.',
  BUYER_DEADLINES: 'Two closing-timeline milestones are due before this purchase closes, and one blocking item still needs to be resolved.',
  BUYER_DOCUMENT_READINESS: 'Two transaction documents for this closing are verified, but one still needs a second look before it counts as received.',
  BUYER_INSPECTION_REVIEW: 'The roof-leak finding from this purchase still awaits a seller-negotiation, acceptance, or dismissal decision.',
  BUYER_TASK_COMPLETE: 'The locksmith rekey checklist item is marked done, releasing its assignee from the Buyer Plan task list.',
  BUYER_TASK_CREATE: 'The survey-pickup line item is queued on the closing task list, pending confirmation before it is added.',
  BUYER_TASK_UPDATE: 'The insurance-binder line item now shows Priya as its assignee instead of the previous one.',
  BUYER_MOVE_STATUS: 'Unpacking and the address-change task are done; two move tasks remain before the scheduled move-in date.',
  BUYER_FINANCING_READINESS: 'Underwriting is paused on one lender stipulation requesting updated pay stubs before it can clear.',
  BUYER_TITLE_ESCROW_READINESS: 'The title commitment lists one unresolved easement question that the settlement attorney flagged as blocking.',
  BUYER_WALKTHROUGH_READINESS: 'The scheduled walkthrough checklist covers agreed repairs, included fixtures, and utility access confirmation.',
  BUYER_DISCLOSURE_FUNDS_READINESS: 'The latest disclosure revision raised the cash-to-close total by four hundred dollars versus the selected Loan Estimate.',
  BUYER_CLOSING_DAY_READINESS: 'The signing appointment is confirmed for Thursday at the title company, with certified funds and photo ID both marked ready.',
});

export const ASK_ANSWER_RELEVANCE_CERTIFICATION_FIXTURES = Object.freeze(
  ASK_ROUTING_CERTIFICATION_FIXTURES.map((fixture) => ({ ...fixture, answerOperationId: fixture.operationId, answer: ASK_CERTIFIED_DIRECT_ANSWERS[fixture.operationId] })),
);

export const ASK_ANSWER_RELEVANCE_CROSS_OPERATION_NEGATIVE_MATRIX = Object.freeze(
  ASK_ROUTING_CERTIFICATION_FIXTURES.flatMap((fixture) => Object.entries(ASK_CERTIFIED_DIRECT_ANSWERS)
    .filter(([answerOperationId]) => answerOperationId !== fixture.operationId)
    .map(([answerOperationId, answer]) => Object.freeze({
      fixtureId: `${fixture.fixtureId}-wrong-${answerOperationId.toLowerCase()}`,
      operationId: fixture.operationId,
      answerOperationId: answerOperationId as AskOperationId,
      message: fixture.message,
      answer,
      expectedOutcome: 'FAIL_OR_UNKNOWN' as const,
    }))),
);
