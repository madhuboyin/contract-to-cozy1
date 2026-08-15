import type { AskOperationId } from './askOperationRegistry';

export interface AskRoutingCertificationFixture {
  operationId: AskOperationId;
  message: string;
  category: 'PARAPHRASE' | 'COLLOQUIAL' | 'PERTURBATION';
}

// Held-out wording: none of these strings is indexed as an operation-positive
// example. This prevents the quality report from certifying retrieval by
// querying the same sentences used to build the index.
export const ASK_ROUTING_CERTIFICATION_FIXTURES: readonly AskRoutingCertificationFixture[] = Object.freeze([
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
]);

const CERTIFIED_DIRECT_ANSWERS: Readonly<Record<AskOperationId, string>> = Object.freeze({
  MAINTENANCE_STATUS: 'Your upkeep list has two overdue jobs and one recently completed service.',
  MAINTENANCE_TASK_CREATE: 'A new chimney-inspection maintenance task is ready to be created after confirmation.',
  MAINTENANCE_TASK_COMPLETE: 'The selected filter-change maintenance task is recorded as completed.',
  MAINTENANCE_TASK_UPDATE: 'The selected roof-inspection task is scheduled for next week.',
  COVERAGE_GAPS: 'Two recorded appliances have neither active warranty nor recorded insurance protection.',
  INCIDENT_CLAIM_STATUS: 'The filed storm claim remains open and is awaiting the next insurer update.',
  SAVINGS_OPPORTUNITIES: 'The largest recorded household savings opportunity is the recurring utility expense.',
  OWNERSHIP_COSTS: 'Insurance and property tax are the largest categories in the recorded housing budget.',
  INVENTORY_LOOKUP: 'The home inventory records the dryer model, installation year, and service history.',
  PROPERTY_SUMMARY: 'The home record is missing three governed details and has one stale field.',
  HOME_ACTIONS: 'Focus first on the highest-priority home action: the overdue safety inspection.',
  CAPABILITY_DISCOVERY: 'The guided records workflow is available for organizing this home paperwork.',
  REPLACEMENT_GUIDANCE: 'The dishwasher age and repair cost make replacement the stronger planning option.',
  REFINANCE_ANALYSIS: 'Replacing the current home loan does not yet improve the refinance break-even numbers.',
  REFINANCE_RATE_MONITOR: 'A mortgage-rate alert can watch for the five-percent threshold after confirmation.',
  SELL_HOLD_RENT_ANALYSIS: 'The recorded assumptions currently favor becoming a landlord and renting over putting the house on the market.',
  HOUSEHOLD_INVITATION: 'Your partner can be invited to this household after you confirm the role.',
  GUIDANCE_JOURNEY_CREATE: 'A guided project plan can be started with the first governed step.',
  QUOTE_COMPARISON_CREATE: 'A new contractor-bid comparison workspace is ready to create.',
  QUOTE_COMPARISON_REVIEW: 'The proposals differ most in scope, exclusions, and total price.',
  HOME_DEADLINE_MONITOR: 'A warranty-expiration reminder can be created for the recorded deadline.',
  CAPITAL_RESERVE_PLAN: 'The reserve outlook shows the largest future expense in the roof-replacement window.',
  PROPERTY_TAX_APPEAL_READINESS: 'The appeal record still needs comparable evidence before it is ready.',
  RENOVATION_PERMIT_READINESS: 'The remodel is blocked until the recorded permit approval is complete.',
  MAJOR_EVENT_ENTRY: 'Preparing the home to go on the market begins with records, repairs, and disclosure readiness.',
  EMERGENCY_BOUNDARY: 'Leave the area and contact emergency services because a carbon-monoxide alarm may indicate immediate danger.',
  UNSAFE_RESTRICTED_BOUNDARY: 'I cannot help conceal water damage; I can help document it and follow the safe disclosure path.',
  OUT_OF_SCOPE_BOUNDARY: 'Coding interview exercises are outside this home-concierge workspace.',
  GROUNDED_GUIDANCE: 'Basement dampness commonly involves drainage, grading, condensation, or plumbing and should be inspected at the source.',
  HVAC_DECISION_START: 'The heater repair-or-replace review is ready to begin with condition, quote, and cost inputs.',
  HVAC_DECISION_CONTINUE: 'The active heating-system decision is waiting for one remaining quote.',
  HVAC_DECISION_SCENARIO: 'The additional furnace bid changes the repair-versus-replacement comparison.',
  HVAC_DECISION_ABANDON: 'The active heating decision can be stopped after confirmation.',
  HVAC_PREFERENCE_SAVE: 'The lower-upfront-cost HVAC preference can be saved after confirmation.',
  HVAC_PREFERENCE_FORGET: 'The ownership-horizon assumption can be removed from the heating decision.',
  HOME_CHANGE_SUMMARY: 'The home record recently changed in the roof, appliance, and insurance sections.',
  HVAC_DECISION_OUTCOME_REPORT: 'The newly installed heater can be recorded as the decision outcome.',
  HVAC_DECISION_OUTCOME_VIEW: 'The recorded heating decision ended with replacement of the old unit.',
  HVAC_DECISION_OUTCOME_UNLINK: 'The incorrect furnace-replacement outcome can be unlinked after confirmation.',
});

export const ASK_ANSWER_RELEVANCE_CERTIFICATION_FIXTURES = Object.freeze(
  ASK_ROUTING_CERTIFICATION_FIXTURES.map((fixture) => ({ ...fixture, answer: CERTIFIED_DIRECT_ANSWERS[fixture.operationId] })),
);
