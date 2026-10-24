// How Ask treats each guided-journey step, by the tool the step launches.
// (Guided journey continuation design, section 3.3.)
//
//   IN_ASK         an Ask operation exists AND reports the step's completion with proof (design 3.4)
//   INLINE_CAPTURE the step only needs context facts Ask can capture inline
//   NAVIGATE       keep the link to the step's tool, with the reason
//
// Tool keys are all NAVIGATE by default; a STEP moves to IN_ASK only after its Ask operation reports that step's
// completion (Phase 0 did that for two recall steps; see ASK_GUIDANCE_IN_ASK_STEPS below).
// A test requires every tool key used by the template registry to be classified, so a new template step cannot
// silently default.

import { DO_NOTHING_RUN_MESSAGE, SERVICE_PRICE_CHECK_MESSAGE } from './support/homeToolRunConstants';
import { NEGOTIATION_SHIELD_START_MESSAGE } from './support/negotiationShieldStart';

export type AskGuidanceStepMode = 'IN_ASK' | 'INLINE_CAPTURE' | 'NAVIGATE';

const NOT_YET = 'Ask does not complete this step with recorded proof yet, so completing it is not currently available in Ask.';

export const ASK_GUIDANCE_STEP_TOOL_MODES: Readonly<Record<string, { mode: AskGuidanceStepMode; reason: string }>> = Object.freeze({
  booking: { mode: 'NAVIGATE', reason: 'Booking a provider is an external flow Ask does not run.' },
  'capital-timeline': { mode: 'NAVIGATE', reason: NOT_YET },
  'coverage-intelligence': { mode: 'NAVIGATE', reason: NOT_YET },
  'do-nothing-simulator': { mode: 'NAVIGATE', reason: NOT_YET },
  documents: { mode: 'NAVIGATE', reason: NOT_YET },
  frontend: { mode: 'NAVIGATE', reason: 'This step needs its own proof, which Ask cannot record yet, so completing it is not currently available in Ask.' },
  'guidance-overview': { mode: 'NAVIGATE', reason: NOT_YET },
  'history-verify': { mode: 'NAVIGATE', reason: NOT_YET },
  'home-event-radar': { mode: 'NAVIGATE', reason: NOT_YET },
  'home-savings': { mode: 'NAVIGATE', reason: NOT_YET },
  incidents: { mode: 'NAVIGATE', reason: NOT_YET },
  'inspection-report': { mode: 'NAVIGATE', reason: NOT_YET },
  maintenance: { mode: 'NAVIGATE', reason: NOT_YET },
  'negotiation-shield': { mode: 'NAVIGATE', reason: NOT_YET },
  'ownership-costs': { mode: 'NAVIGATE', reason: NOT_YET },
  'price-finalization': { mode: 'NAVIGATE', reason: NOT_YET },
  'project-completion': { mode: 'NAVIGATE', reason: NOT_YET },
  'project-tracker': { mode: 'NAVIGATE', reason: NOT_YET },
  'quote-comparison': { mode: 'NAVIGATE', reason: NOT_YET },
  recalls: { mode: 'NAVIGATE', reason: NOT_YET },
  'replace-repair': { mode: 'NAVIGATE', reason: NOT_YET },
  'replacement-model-comparison': { mode: 'NAVIGATE', reason: NOT_YET },
  'replacement-plan-followup': { mode: 'NAVIGATE', reason: NOT_YET },
  'replacement-planning': { mode: 'NAVIGATE', reason: NOT_YET },
  'replacement-priorities-capture': { mode: 'NAVIGATE', reason: NOT_YET },
  'replacement-purchase-finalization': { mode: 'NAVIGATE', reason: NOT_YET },
  'replacement-purchase-options': { mode: 'NAVIGATE', reason: NOT_YET },
  'service-price-radar': { mode: 'NAVIGATE', reason: NOT_YET },
});

// Phase 2 (design 3.3: "by toolKey, and stepKey where a tool needs it"). A step is IN_ASK only when an Ask operation
// performs the domain write AND reports THIS step's completion with proof, exactly as the page does. The recalls tool
// has three steps but only two are reported by a recall write (guidanceToolReporting.buildRecallMatchCompletion:
// `safety_alert` on confirm, `recall_resolution` on dismiss and resolve); `review_remedy_instructions` is reported by
// nothing in Ask, so it stays NAVIGATE. A test ties this table to the reporting helper so they cannot drift.
// `outcome` is what finishing the step records, said before the homeowner starts. `carriesStep` sends the step with the launch, for an operation that
// reports the step itself (the do-nothing run); the recall review finds its own matches and needs no step.
export type AskGuidanceInAskStep = { operationId: string; message: string; label: string; reason: string; outcome: string; carriesStep?: boolean };

export const ASK_GUIDANCE_IN_ASK_STEPS: Readonly<Record<string, AskGuidanceInAskStep>> = Object.freeze({
  'recalls:safety_alert': {
    operationId: 'RECALL_REVIEW', message: 'Show my open recall matches', label: 'Review recall matches here',
    reason: 'You can confirm the recall match here; it is recorded on this journey.',
    outcome: 'Your confirmation of the recall match is recorded as this step\'s proof.',
  },
  'recalls:recall_resolution': {
    operationId: 'RECALL_REVIEW', message: 'Show my open recall matches', label: 'Review recall matches here',
    reason: 'You can dismiss or resolve the recall match here; it is recorded on this journey.',
    outcome: 'Dismissing or resolving the recall match is recorded as this step\'s proof.',
  },
  // The Do-Nothing Simulator's confirmed run is the same write the page makes, and reports the step it was started from (see reportDoNothingRun).
  'do-nothing-simulator:compare_action_options': {
    operationId: 'DO_NOTHING_SIMULATION_RUN', message: DO_NOTHING_RUN_MESSAGE, label: 'Run the simulation', carriesStep: true,
    reason: 'You can run the simulation here; the result is recorded on this journey.',
    outcome: 'A saved simulation run is recorded as this step\'s proof.',
  },
  // A saved price check is the proof that a quote was validated. The page sends the journey with the check; Ask now reports it the same way.
  'service-price-radar:validate_price': {
    operationId: 'SERVICE_PRICE_CHECK_RUN', message: SERVICE_PRICE_CHECK_MESSAGE, label: 'Check a quote', carriesStep: true,
    reason: 'You can check a contractor quote here; the saved check is recorded on this journey.',
    outcome: 'A saved quote check is recorded as this step\'s proof.',
  },
  // A multi-stage flow: the step opens the start (reusing an existing review of the kind), then the analysis. The step id follows every stage and is
  // re-read at each one; the step completes only when the analysis is saved.
  'negotiation-shield:prepare_negotiation': {
    operationId: 'NEGOTIATION_SHIELD_CASE_START', message: NEGOTIATION_SHIELD_START_MESSAGE, label: 'Start a negotiation review', carriesStep: true,
    reason: 'You can start and analyze a negotiation review here; the saved analysis is recorded on this journey.',
    outcome: 'A saved analysis of your negotiation review is recorded as this step\'s proof.',
  },
  'do-nothing-simulator:model_cost_of_delay': {
    operationId: 'DO_NOTHING_SIMULATION_RUN', message: DO_NOTHING_RUN_MESSAGE, label: 'Run the simulation', carriesStep: true,
    reason: 'You can run the simulation here; the result is recorded on this journey.',
    outcome: 'A saved simulation run is recorded as this step\'s proof.',
  },
});

/** An unclassified (or absent) tool key is NAVIGATE: Ask never claims to handle a step it has not been cleared for. */
export function askGuidanceStepMode(toolKey: string | null | undefined, stepKey?: string | null): { mode: AskGuidanceStepMode; reason: string; inAsk?: AskGuidanceInAskStep } {
  const inAsk = toolKey && stepKey ? ASK_GUIDANCE_IN_ASK_STEPS[`${toolKey}:${stepKey}`] : undefined;
  if (inAsk) return { mode: 'IN_ASK', reason: inAsk.reason, inAsk };
  return (toolKey ? ASK_GUIDANCE_STEP_TOOL_MODES[toolKey] : undefined)
    ?? { mode: 'NAVIGATE', reason: NOT_YET };
}
