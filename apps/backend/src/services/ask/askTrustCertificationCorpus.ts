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
  { operationId: 'REPLACEMENT_GUIDANCE', message: 'Does it make more sense to repair this worn dishwasher or replace it?', category: 'PARAPHRASE' },
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
  { operationId: 'BUYER_PLAN_STATUS', message: 'Give me the big-picture progress on this purchase and the next closing step', category: 'PARAPHRASE' },
  { operationId: 'BUYER_DEADLINES', message: 'What is coming due before we close on this home?', category: 'COLLOQUIAL' },
  { operationId: 'BUYER_DOCUMENT_READINESS', message: 'Which paperwork for this closing is still outstanding?', category: 'PARAPHRASE' },
  { operationId: 'BUYER_INSPECTION_REVIEW', message: 'Which inspection issues on this purchase are still undecided?', category: 'PARAPHRASE' },
  { operationId: 'BUYER_TASK_COMPLETE', message: 'Please complete the locksmith buyer task now', category: 'COLLOQUIAL' },
  { operationId: 'BUYER_TASK_CREATE', message: 'Add a closing plan task for picking up the survey', category: 'PARAPHRASE' },
  { operationId: 'BUYER_TASK_UPDATE', message: 'Reassign the insurance-binder closing plan task to Priya', category: 'PARAPHRASE' },
  { operationId: 'BUYER_MOVE_STATUS', message: 'How far along is the move-in preparation for this purchase?', category: 'COLLOQUIAL' },
  { operationId: 'BUYER_FINANCING_READINESS', message: 'Could underwriting or appraisal delay settlement?', category: 'PARAPHRASE' },
  { operationId: 'BUYER_TITLE_ESCROW_READINESS', message: 'What is still open with title or escrow for this closing?', category: 'PARAPHRASE' },
  { operationId: 'BUYER_WALKTHROUGH_READINESS', message: 'Help me get ready for the final walkthrough', category: 'PARAPHRASE' },
  { operationId: 'BUYER_DISCLOSURE_FUNDS_READINESS', message: 'What changed in my closing disclosure paperwork?', category: 'PARAPHRASE' },
  { operationId: 'BUYER_CLOSING_DAY_READINESS', message: 'What do I need to bring on closing day?', category: 'PARAPHRASE' },
  { operationId: 'BUYER_CONTRACT_TIMELINE', message: 'Which dates in my purchase contract still need confirming?', category: 'PARAPHRASE' },
  { operationId: 'BUYER_NEGOTIATION_READINESS', message: 'How is the inspection negotiation with the seller going?', category: 'COLLOQUIAL' },
  { operationId: 'BUYER_COST_READINESS', message: 'What purchase expenses are recorded for the first ninety days after closing?', category: 'PARAPHRASE' },
  { operationId: 'BUYER_FINDING_DISPOSITION', message: 'Classify the water-heater finding as post-close work', category: 'PARAPHRASE' },
  { operationId: 'BUYER_LIFECYCLE_UPDATE', message: 'Cancel my buyer plan: we lost financing approval', category: 'PARAPHRASE' },
  { operationId: 'CLAIM_FILE', message: 'Start a new insurance claim for damage from a burst pipe', category: 'PARAPHRASE' },
  { operationId: 'CLAIM_TRANSITION', message: 'Advance the recorded hail case to submitted', category: 'PARAPHRASE' },
  { operationId: 'INCIDENT_CONTINUATION', message: 'Everyone is safe now; help me capture the incident and next claim steps', category: 'PARAPHRASE' },
  { operationId: 'OPERATIONAL_WORK_UPDATE', message: 'Take ownership of the tracked roof repair work item', category: 'PARAPHRASE' },
  { operationId: 'INSPECTION_FINDINGS', message: 'List unresolved findings from my home inspection', category: 'PARAPHRASE' },
  { operationId: 'INSPECTION_FINDING_UPDATE', message: 'Turn the electrical inspection defect into tracked work', category: 'PARAPHRASE' },
  { operationId: 'DOCUMENT_PROMOTION_REVIEW', message: 'Which facts extracted from my uploaded files are waiting on me?', category: 'PARAPHRASE' },
  { operationId: 'DOCUMENT_PROMOTION_CONFIRM', message: 'Promote the reviewed extracted furnace serial number into the home record', category: 'PARAPHRASE' },
  { operationId: 'INTELLIGENCE_ENVELOPE_QUERY', message: 'List normalized observations emitted by registered intelligence producers for this address', category: 'PARAPHRASE' },
  // Phase 3 / PR 12b — appended at the end so existing fixture indices (and the
  // 001-066 calibration rows keyed off them) do not shift.
  { operationId: 'HVAC_SPECIALIST_ENGAGE', message: 'Talk me through the flagged heat pump repair-or-replace recommendation from my home actions', category: 'PARAPHRASE' },
  // Later registrations are appended so the immutable fixture ids used by
  // calibration evidence never change meaning when the registry grows.
  { operationId: 'MAINTENANCE_FORECAST', message: 'What upcoming maintenance should I expect for the furnace and water heater?', category: 'PARAPHRASE' },
  { operationId: 'COVERAGE_COMPARISON_STATUS', message: 'Would we come out ahead switching insurance carriers?', category: 'PARAPHRASE' },
  { operationId: 'DOCUMENT_LOOKUP', message: 'What documents are on file for this address?', category: 'PARAPHRASE' },
  { operationId: 'SELLER_PREP_CHECKLIST', message: 'Am I ready to list this house yet?', category: 'COLLOQUIAL' },
  { operationId: 'SELLER_PREP_ITEM_DECISION', message: 'Go ahead and waive that sale readiness item for me', category: 'COLLOQUIAL' },
  // Capability-card audit (FRD Appendix D), second reference journey
  // (2026-09-22). Deliberately appended at the END of this array, not
  // inserted mid-list -- every fixtureId below is derived positionally
  // (index + 1), so an earlier insertion point would silently renumber
  // every fixture after it and desync askRoutingCalibrationEvidence.ts's
  // own position-keyed evidence rows for fixtures that were never touched.
  { operationId: 'HOME_EVENT_RADAR_FEED', message: 'Tell me what the radar has picked up near this address lately', category: 'COLLOQUIAL' },
  // Capability-card audit, first new operation for a capability with none (FRD v1.48). Appended at the END, as above.
  { operationId: 'BREAK_EVEN_ANALYSIS', message: 'How many years until this house has paid for itself, counting what it has gained in value?', category: 'PARAPHRASE' },
  { operationId: 'NEIGHBORHOOD_CHANGE_FEED', message: 'Has the city approved any new development close to our place?', category: 'COLLOQUIAL' },
  { operationId: 'PAST_HAZARD_EXPOSURE', message: 'What kind of storms or floods has this house seen over the years?', category: 'COLLOQUIAL' },
  { operationId: 'HOME_STATUS_BOARD', message: 'Which of our appliances need attention soon?', category: 'COLLOQUIAL' },
  { operationId: 'HOME_HABITS', message: 'Show me the habits the coach picked for our house', category: 'PARAPHRASE' },
  { operationId: 'HOME_DIGITAL_WILL', message: 'Is our home plan ready if we are away and someone takes over?', category: 'COLLOQUIAL' },
  { operationId: 'PLANT_CARE_OUTLOOK', message: 'Do my house plants need anything with this weather?', category: 'COLLOQUIAL' },
  { operationId: 'NEGOTIATION_SHIELD_CASES', message: 'Where do our negotiation reviews stand?', category: 'COLLOQUIAL' },
  { operationId: 'HOME_UPGRADE_SCENARIOS', message: 'How do our saved upgrade options compare on cost?', category: 'COLLOQUIAL' },
  { operationId: 'DIY_PROJECTS', message: 'Which of our DIY projects still have steps left?', category: 'COLLOQUIAL' },
  { operationId: 'PROJECT_TRACKER_PROJECTS', message: 'Which of our contractor projects are still open?', category: 'COLLOQUIAL' },
  { operationId: 'SERVICE_PRICE_CHECKS', message: 'What did the price radar say about our plumber quote?', category: 'COLLOQUIAL' },
  { operationId: 'HOME_TIMELINE_EVENTS', message: 'What does our home timeline show for the last few years?', category: 'COLLOQUIAL' },
  { operationId: 'MATERIAL_SPECS_LIST', message: 'What paint colour is in our dining room?', category: 'COLLOQUIAL' },
  { operationId: 'PROPERTY_BRIEFS_LIST', message: 'Is the property brief we sent our insurer still shared?', category: 'COLLOQUIAL' },
  { operationId: 'GUIDANCE_JOURNEYS_LIST', message: 'How many steps are left in our guided journeys?', category: 'COLLOQUIAL' },
  { operationId: 'HOA_COMPLIANCE_STATUS', message: 'How much are our HOA dues?', category: 'COLLOQUIAL' },
  { operationId: 'PRICE_FINALIZATIONS_LIST', message: 'What price did we lock in with the electrician?', category: 'COLLOQUIAL' },
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
  MAINTENANCE_FORECAST: 'A rule-based forecast predicts upcoming maintenance for recorded home systems, each with a predicted date, priority, and reasoning.',
  COVERAGE_GAPS: 'The coverage-gap review found two appliances without an active warranty or recorded insurance protection.',
  COVERAGE_COMPARISON_STATUS: 'The coverage comparison shows how your current verified policy stacks up against any alternative quotes or policy terms on file, and any keep-or-switch decision you have recorded.',
  INCIDENT_CLAIM_STATUS: 'The filed storm claim remains open and is awaiting the next insurer update.',
  CLAIM_FILE: 'A draft water-damage claim can be created after confirmation; it will not be sent to an insurer.',
  CLAIM_TRANSITION: 'The selected hail claim lifecycle change is ready for confirmation and canonical transition validation.',
  INCIDENT_CONTINUATION: 'After immediate danger has passed, the recorded incident can continue into a governed claim workflow.',
  SAVINGS_OPPORTUNITIES: 'The largest recorded household savings opportunity is the recurring utility expense.',
  OWNERSHIP_COSTS: 'The monthly cost of owning this home is led by insurance and property-tax expense categories.',
  INVENTORY_LOOKUP: 'The home inventory records the dryer model, installation year, and service history.',
  DOCUMENT_LOOKUP: 'Documents on file for this property are grouped by type, each with its verification status and upload date.',
  PROPERTY_SUMMARY: 'The home record is missing three governed details and has one stale field.',
  INTELLIGENCE_ENVELOPE_QUERY: 'The registered Envelope producers returned a bounded normalized view of this property intelligence.',
  HOME_EVENT_RADAR_FEED: "The canonical Home Event Radar feed shows this property's monitored events, grouped by source and severity.",
  HOME_ACTIONS: 'The Home Actions priority list puts the overdue safety inspection first.',
  OPERATIONAL_WORK_UPDATE: 'The selected home-work item can be accepted, deferred, snoozed, or completed through its governed workflow.',
  INSPECTION_FINDINGS: 'The confirmed inspection report has one unresolved major roof finding.',
  INSPECTION_FINDING_UPDATE: 'The selected inspection finding can be accepted as tracked work after confirmation.',
  DOCUMENT_PROMOTION_REVIEW: 'Two document-derived facts are waiting for homeowner confirmation before becoming trusted home records.',
  DOCUMENT_PROMOTION_CONFIRM: 'The selected extracted fact can be promoted into the canonical home record after confirmation.',
  CAPABILITY_DISCOVERY: 'The guided records workflow is available for organizing this home paperwork.',
  REPLACEMENT_GUIDANCE: 'The dishwasher age and repair cost make replacement the stronger planning option.',
  REFINANCE_ANALYSIS: 'The refinance analysis shows that refinancing the current mortgage does not yet improve the break-even numbers.',
  REFINANCE_RATE_MONITOR: 'A mortgage-rate alert can watch for the five-percent threshold after confirmation.',
  SELL_HOLD_RENT_ANALYSIS: 'The recorded assumptions currently favor becoming a landlord and renting over putting the house on the market.',
  BREAK_EVEN_ANALYSIS: 'This home is projected to break even in year six, when appreciation catches up with cumulative ownership costs.',
  NEIGHBORHOOD_CHANGE_FEED: 'The city approved one new development close to this home; it is listed with its possible relevance and the geography it matched.',
  PAST_HAZARD_EXPOSURE: 'This house has seen two storms and one flood over the years, according to the reviewed hazard records matched to it.',
  HOME_STATUS_BOARD: 'One of your appliances needs attention soon; two others are worth monitoring and the rest are in good shape.',
  HOME_DIGITAL_WILL: 'Your home plan is not ready yet for someone to take over while you are away; it still needs a primary trusted contact.',
  PLANT_CARE_OUTLOOK: "Yes, with heat in this week's forecast, check the soil of your house plants more often; the fern needs it soon.",
  NEGOTIATION_SHIELD_CASES: 'Two of your negotiation reviews are open: the roof quote review was analyzed last week and the premium increase review is still a draft.',
  HOME_UPGRADE_SCENARIOS: 'Of your saved upgrade options, repairing the water heater costs about $400–$700 upfront, while replacing it with a heat pump model costs $2,800–$4,200 and pays back in about 6 years.',
  DIY_PROJECTS: 'Two of your DIY projects still have steps left: repainting the hallway is 3 of 5 steps done and re-caulking the tub is still in planning.',
  PROJECT_TRACKER_PROJECTS: 'Two contractor projects are still open: the kitchen remodel with Apex Builders is in progress with $12,000 of $40,000 remaining, and the roof replacement is still in planning.',
  SERVICE_PRICE_CHECKS: 'The price radar found your $1,450 plumber quote for a water line repair above the expected $900 to $1,200 range.',
  HOME_TIMELINE_EVENTS: 'Your home timeline records a kitchen remodel in 2024, verified by the contract, a home inspection in 2023, and the purchase of the house in 2021.',
  MATERIAL_SPECS_LIST: 'The dining room paint is Sherwin-Williams Alabaster (SW 7008), eggshell finish.',
  PRICE_FINALIZATIONS_LIST: 'The price you locked in with Bright Electric is $2,400 for the panel upgrade, down from a $2,800 quote, finalized on September 12.',
  HOA_COMPLIANCE_STATUS: 'Our HOA dues are $250 monthly to Maple Ridge HOA; the next dues payment is due November 1.',
  GUIDANCE_JOURNEYS_LIST: 'Two guided journeys are in progress with four steps left between them; the next step on the water heater is to compare replacement quotes.',
  PROPERTY_BRIEFS_LIST: 'Yes. The property brief you sent your insurer is still shared through one live link, which expires on October 30, 2026.',
  HOME_HABITS: 'The coach is recommending three small habits for your home, each with how often to do it and why.',
  HOUSEHOLD_INVITATION: 'Your partner can be invited to this household after you confirm the role.',
  GUIDANCE_JOURNEY_CREATE: 'A guided project plan can be started with the first governed step.',
  QUOTE_COMPARISON_CREATE: 'A new contractor-bid comparison workspace is ready to create.',
  QUOTE_COMPARISON_REVIEW: 'The proposals differ most in scope, exclusions, and total price.',
  HOME_DEADLINE_MONITOR: 'The home-deadline monitor can watch the warranty expiration and create a reminder before it expires.',
  CAPITAL_RESERVE_PLAN: 'The reserve outlook shows the largest future expense in the roof-replacement window.',
  PROPERTY_TAX_APPEAL_READINESS: 'The property-tax assessment appeal is not ready because it still needs comparable-value evidence.',
  RENOVATION_PERMIT_READINESS: 'The remodel is blocked until the recorded permit approval is complete.',
  SELLER_PREP_CHECKLIST: 'Open seller-prep checklist items are listed by category with estimated cost ranges.',
  ROOM_RENAME: 'The selected room has a corrected name after your confirmation.',
  ROOM_CREATE: 'The new room is reviewed and then added to your home record after your confirmation.',
  INVENTORY_ITEM_CREATE: 'The new inventory item is reviewed and then added to your home record after your confirmation.',
  PROPERTY_CONTEXT_AREA_CAPTURE: 'Each missing home detail is reviewed and then saved to your home record after your confirmation.',
  WARRANTY_CORRECT: 'The selected warranty has a corrected provider name or expiry date after your confirmation.',
  HOME_EVENT_CORRECT: 'The timeline event correction is reviewed before it is recorded as a new revision.',
  HOME_EVENT_VISIBILITY: 'Who can see the timeline event is reviewed and then changed after your confirmation.',
  HOME_EVENT_RADAR_STATE: 'The selected monitored event is saved for you only; nobody else in the household sees the change.',
  HOME_EVENT_RADAR_MARK_DONE: 'The selected monitored event is marked done after confirmation, and the property radar risk is rechecked.',
  HOME_EVENT_RADAR_FEEDBACK: 'Your feedback that the selected monitored event is not relevant is recorded after confirmation.',
  HOME_EVENT_RADAR_TASK: 'A maintenance task for the selected radar action is added to your list after confirmation.',
  HOME_EVENT_RADAR_PREFERENCES: 'Your Home Event Radar notification settings are saved after confirmation.',
  INVENTORY_ITEM_CORRECT: 'The inventory item date is reviewed before it is corrected on the shared home record.',
  SELLER_PREP_ITEM_DECISION: 'The checklist item decision is reviewed before it is applied to the shared seller-prep checklist.',
  MAJOR_EVENT_ENTRY: 'Preparing the home to go on the market begins with records, repairs, and disclosure readiness.',
  EMERGENCY_BOUNDARY: 'Leave the area and contact emergency services because a carbon-monoxide alarm may indicate immediate danger.',
  UNSAFE_RESTRICTED_BOUNDARY: 'That is an unsafe restricted request: I cannot help conceal water damage, but I can help document and disclose it safely.',
  OUT_OF_SCOPE_BOUNDARY: 'Coding interview exercises are outside this home-concierge workspace.',
  GROUNDED_GUIDANCE: 'Basement dampness commonly involves drainage, grading, condensation, or plumbing and should be inspected at the source.',
  HVAC_DECISION_START: 'A new HVAC repair-or-replace decision is ready to start with heater condition, quote, and cost inputs.',
  HVAC_DECISION_CONTINUE: 'The active heating-system decision is waiting for one remaining quote.',
  HVAC_SPECIALIST_ENGAGE: 'The flagged HVAC repair-or-replace home action is handed to the HVAC Specialist, which reports its current repair-versus-replacement verdict on the same decision thread.',
  HVAC_DECISION_SCENARIO: 'The additional furnace bid changes the repair-versus-replacement comparison.',
  HVAC_DECISION_ABANDON: 'The active heating decision can be stopped after confirmation.',
  HVAC_PREFERENCE_SAVE: 'Your HVAC decision preference for lower upfront cost is ready to be saved after confirmation.',
  HVAC_PREFERENCE_FORGET: 'The ownership-horizon assumption can be removed from the heating decision.',
  HOME_CHANGE_SUMMARY: 'The home record recently changed in the roof, appliance, and insurance sections.',
  HVAC_DECISION_OUTCOME_REPORT: 'The newly installed heater can be recorded as the decision outcome.',
  HVAC_DECISION_OUTCOME_VIEW: 'The recorded HVAC decision outcome shows that the heating review ended with replacement of the old unit.',
  HVAC_DECISION_OUTCOME_UNLINK: 'The incorrect furnace-replacement outcome can be unlinked after confirmation.',
  BUYER_PLAN_STATUS: 'This purchase’s Buyer Plan is eighty percent complete, and the recorded next action has not yet been marked done.',
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
  BUYER_CONTRACT_TIMELINE: 'The attorney-review deadline in the confirmed contract has not yet been checked against the current addendum.',
  BUYER_NEGOTIATION_READINESS: 'The seller countered the roof-repair request with a partial credit that has not yet been accepted.',
  BUYER_COST_READINESS: 'Two open Buyer Plan tasks carry a recorded price tag, totaling twelve hundred dollars in near-term buyer expense.',
  BUYER_FINDING_DISPOSITION: 'The water-heater finding can be reclassified as post-close work after confirmation.',
  BUYER_LIFECYCLE_UPDATE: 'This purchase can be cancelled after confirmation, preserving completed work and uploaded evidence.',
  // Ask Cozy Stage 3, Phase 2 (implementation plan §8; FRD §19/§20).
  CAPTURE_FACT_CONFIRM: 'The stated property fact is ready to be saved to the canonical Living Home Record after confirmation.',
  CAPTURE_EVENT_CONFIRM: 'The described event is ready to be added to the canonical home timeline after confirmation.',
  // Ask Cozy Stage 3, Phase 3 warranty capture writer (implementation plan §9/§22).
  CAPTURE_WARRANTY_CONFIRM: 'The described warranty is ready to be saved to the canonical Living Home Record after confirmation.',
  // Ask Cozy Stage 3, Phase 2 external review (implementation plan §8/§4.2; FRD §23's UPLOAD_EVIDENCE resolution).
  CAPTURE_EVIDENCE_CONFIRM: 'The referenced document is ready to be attached as evidence to the canonical home timeline entry after confirmation.',
  // Ask Cozy Stage 3, Phase 6 (implementation plan §12; FRD §21).
  SELL_HOLD_RENT_GOAL_CAPTURE: 'A sell, hold, or rent decision thread for this home is attached and will resume automatically next time.',
});

export const ASK_ANSWER_RELEVANCE_CERTIFICATION_FIXTURES = Object.freeze(
  Object.values(ASK_OPERATION_DEFINITIONS).map((definition) => {
    const routingFixture = ASK_ROUTING_CERTIFICATION_FIXTURES.find((fixture) => fixture.operationId === definition.operationId);
    return Object.freeze({
      fixtureId: routingFixture?.fixtureId ?? `ask-internal-operation-${definition.operationId.toLowerCase()}`,
      operationId: definition.operationId,
      message: routingFixture?.message ?? definition.semantic.positiveExamples[0],
      answerOperationId: definition.operationId,
      answer: ASK_CERTIFIED_DIRECT_ANSWERS[definition.operationId],
      operationConfirmedByUser: !definition.messageRoutable,
    });
  }),
);

export const ASK_ANSWER_RELEVANCE_CROSS_OPERATION_NEGATIVE_MATRIX = Object.freeze(
  ASK_ANSWER_RELEVANCE_CERTIFICATION_FIXTURES.flatMap((fixture) => Object.entries(ASK_CERTIFIED_DIRECT_ANSWERS)
    .filter(([answerOperationId]) => answerOperationId !== fixture.operationId)
    .map(([answerOperationId, answer]) => Object.freeze({
      fixtureId: `${fixture.fixtureId}-wrong-${answerOperationId.toLowerCase()}`,
      operationId: fixture.operationId,
      answerOperationId: answerOperationId as AskOperationId,
      sourceOperationId: answerOperationId as AskOperationId,
      message: fixture.message,
      answer,
      expectedOutcome: 'FAIL_OR_UNKNOWN' as const,
    }))),
);
