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
import { PROJECT_TRACKER_CREATE_MESSAGE } from './support/projectTrackerConstants';
import { GUIDANCE_STEP_ACKNOWLEDGE_MESSAGE } from './support/guidanceAcknowledge';
import { COVERAGE_ANALYSIS_RUN_MESSAGE } from './support/coverageAnalysisRun';
import { INSPECTION_FINDINGS_CHECK_MESSAGE } from './support/inspectionFindingsCheck';
import { COVERAGE_RECORD_CHECK_MESSAGE } from './support/coverageRecordCheck';
import { COVERAGE_TERM_REVIEW_MESSAGE } from './support/coverageTermReview';
import { MAINTENANCE_EVIDENCE_ATTACH_MESSAGE } from './support/maintenanceEvidenceAttach';
import { INSPECTION_REPORT_REVIEW_MESSAGE } from './support/inspectionReportReview';

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
// reports the step itself: as the launch entity ('ENTITY', a start that has no entity of its own) or as the separate `guidanceStepId` ('FIELD', a read whose
// answer opens commands on other entities, which then belong to the same step). The recall review finds its own matches and needs no step.
export type AskGuidanceInAskStep = { operationId: string; message: string; label: string; reason: string; outcome: string; carriesStep?: 'ENTITY' | 'FIELD' };

export const ASK_GUIDANCE_IN_ASK_STEPS: Readonly<Record<string, AskGuidanceInAskStep>> = Object.freeze({
  'recalls:safety_alert': {
    operationId: 'RECALL_REVIEW', message: 'Show my open recall matches', label: 'Review recall matches here', carriesStep: 'FIELD',
    reason: 'You can confirm the recall match here; it is recorded on this journey.',
    outcome: 'Your confirmation of the recall match is recorded as this step\'s proof.',
  },
  'recalls:recall_resolution': {
    operationId: 'RECALL_REVIEW', message: 'Show my open recall matches', label: 'Review recall matches here', carriesStep: 'FIELD',
    reason: 'You can dismiss or resolve the recall match here; it is recorded on this journey.',
    outcome: 'Dismissing or resolving the recall match is recorded as this step\'s proof.',
  },
  // The Do-Nothing Simulator's confirmed run is the same write the page makes, and reports the step it was started from (see reportDoNothingRun).
  'do-nothing-simulator:compare_action_options': {
    operationId: 'DO_NOTHING_SIMULATION_RUN', message: DO_NOTHING_RUN_MESSAGE, label: 'Run the simulation', carriesStep: 'ENTITY',
    reason: 'You can run the simulation here; the result is recorded on this journey.',
    outcome: 'A saved simulation run is recorded as this step\'s proof.',
  },
  // A saved price check is the proof that a quote was validated. The page sends the journey with the check; Ask now reports it the same way.
  'service-price-radar:validate_price': {
    operationId: 'SERVICE_PRICE_CHECK_RUN', message: SERVICE_PRICE_CHECK_MESSAGE, label: 'Check a quote', carriesStep: 'ENTITY',
    reason: 'You can check a contractor quote here; the saved check is recorded on this journey.',
    outcome: 'A saved quote check is recorded as this step\'s proof.',
  },
  // The same saved price check proves a cleaning quote was reviewed.
  'service-price-radar:get_cleaning_quotes': {
    operationId: 'SERVICE_PRICE_CHECK_RUN', message: SERVICE_PRICE_CHECK_MESSAGE, label: 'Check the cleaning quote', carriesStep: 'ENTITY',
    reason: 'You can check a cleaning quote here; the saved check is recorded on this journey.',
    outcome: 'A saved quote check is recorded as this step\'s proof.',
  },
  // A true review step: a typed, durable acknowledgement is the proof (proof policy ACKNOWLEDGEMENT; no other step may use it).
  'guidance-overview:review_signal': {
    operationId: 'GUIDANCE_STEP_ACKNOWLEDGE', message: GUIDANCE_STEP_ACKNOWLEDGE_MESSAGE, label: 'Mark as reviewed', carriesStep: 'ENTITY',
    reason: 'You can mark this review step as reviewed here; your review is recorded with the time.',
    outcome: 'Your review of the signal, recorded with the time and the signal version, is this step\'s proof.',
  },
  // A fresh, persisted coverage evaluation scoped to the journey's subject (its item, or the property) is the proof for every coverage check step; opening a review is not.
  'coverage-intelligence:check_coverage': {
    operationId: 'COVERAGE_ANALYSIS_RUN', message: COVERAGE_ANALYSIS_RUN_MESSAGE, label: 'Run a coverage check', carriesStep: 'ENTITY',
    reason: 'You can run the coverage check here; the saved evaluation is recorded on this journey.',
    outcome: 'A fresh, saved coverage evaluation for this journey\'s subject is recorded as this step\'s proof.',
  },
  'coverage-intelligence:check_replacement_coverage': {
    operationId: 'COVERAGE_ANALYSIS_RUN', message: COVERAGE_ANALYSIS_RUN_MESSAGE, label: 'Run a coverage check', carriesStep: 'ENTITY',
    reason: 'You can run the coverage check here; the saved evaluation is recorded on this journey.',
    outcome: 'A fresh, saved coverage evaluation for this journey\'s subject is recorded as this step\'s proof.',
  },
  'coverage-intelligence:check_inspection_coverage': {
    operationId: 'COVERAGE_ANALYSIS_RUN', message: COVERAGE_ANALYSIS_RUN_MESSAGE, label: 'Run a coverage check', carriesStep: 'ENTITY',
    reason: 'You can run the coverage check here; the saved evaluation is recorded on this journey.',
    outcome: 'A fresh, saved coverage evaluation for this journey\'s subject is recorded as this step\'s proof.',
  },
  'coverage-intelligence:check_recall_coverage': {
    operationId: 'COVERAGE_ANALYSIS_RUN', message: COVERAGE_ANALYSIS_RUN_MESSAGE, label: 'Run a coverage check', carriesStep: 'ENTITY',
    reason: 'You can run the coverage check here; the saved evaluation is recorded on this journey.',
    outcome: 'A fresh, saved coverage evaluation for this journey\'s subject is recorded as this step\'s proof.',
  },
  'coverage-intelligence:check_weather_coverage': {
    operationId: 'COVERAGE_ANALYSIS_RUN', message: COVERAGE_ANALYSIS_RUN_MESSAGE, label: 'Run a coverage check', carriesStep: 'ENTITY',
    reason: 'You can run the coverage check here; the saved evaluation is recorded on this journey.',
    outcome: 'A fresh, saved coverage evaluation for this journey\'s subject is recorded as this step\'s proof.',
  },
  'coverage-intelligence:check_financial_coverage': {
    operationId: 'COVERAGE_ANALYSIS_RUN', message: COVERAGE_ANALYSIS_RUN_MESSAGE, label: 'Run a coverage check', carriesStep: 'ENTITY',
    reason: 'You can run the coverage check here; the saved evaluation is recorded on this journey.',
    outcome: 'A fresh, saved coverage evaluation for this journey\'s subject is recorded as this step\'s proof.',
  },
  'coverage-intelligence:check_inaction_coverage': {
    operationId: 'COVERAGE_ANALYSIS_RUN', message: COVERAGE_ANALYSIS_RUN_MESSAGE, label: 'Run a coverage check', carriesStep: 'ENTITY',
    reason: 'You can run the coverage check here; the saved evaluation is recorded on this journey.',
    outcome: 'A fresh, saved coverage evaluation for this journey\'s subject is recorded as this step\'s proof.',
  },
  'coverage-intelligence:check_compliance_coverage': {
    operationId: 'COVERAGE_ANALYSIS_RUN', message: COVERAGE_ANALYSIS_RUN_MESSAGE, label: 'Run a coverage check', carriesStep: 'ENTITY',
    reason: 'You can run the coverage check here; the saved evaluation is recorded on this journey.',
    outcome: 'A fresh, saved coverage evaluation for this journey\'s subject is recorded as this step\'s proof.',
  },
  // A review of the inspection report the journey is about: an append-only review record of this version of the report (reading a report is never proof).
  'inspection-report:review_inspection_report': {
    operationId: 'INSPECTION_REPORT_REVIEW', message: INSPECTION_REPORT_REVIEW_MESSAGE, label: 'Mark the report as reviewed', carriesStep: 'ENTITY',
    reason: 'You can mark the inspection report as reviewed here; your review is recorded on this journey.',
    outcome: 'Your review of this version of the report is recorded as this step\'s proof.',
  },
  'inspection-report:review_maintenance_report': {
    operationId: 'INSPECTION_REPORT_REVIEW', message: INSPECTION_REPORT_REVIEW_MESSAGE, label: 'Mark the report as reviewed', carriesStep: 'ENTITY',
    reason: 'You can mark the inspection report as reviewed here; your review is recorded on this journey.',
    outcome: 'Your review of this version of the report is recorded as this step\'s proof.',
  },
  'inspection-report:review_post_repair_report': {
    operationId: 'INSPECTION_REPORT_REVIEW', message: INSPECTION_REPORT_REVIEW_MESSAGE, label: 'Mark the report as reviewed', carriesStep: 'ENTITY',
    reason: 'You can mark the inspection report as reviewed here; your review is recorded on this journey.',
    outcome: 'Your review of this version of the report is recorded as this step\'s proof.',
  },
  'inspection-report:review_pre_purchase_report': {
    operationId: 'INSPECTION_REPORT_REVIEW', message: INSPECTION_REPORT_REVIEW_MESSAGE, label: 'Mark the report as reviewed', carriesStep: 'ENTITY',
    reason: 'You can mark the inspection report as reviewed here; your review is recorded on this journey.',
    outcome: 'Your review of this version of the report is recorded as this step\'s proof.',
  },
  // The compliance task step: completed by a task explicitly linked to this step being completed WITH Home Record evidence. The step opens the evidence form for its linked task (or offers to create one);
  // creating a task from the step links it, and completing it without evidence leaves the step open until evidence is attached.
  'maintenance:complete_compliance_task': {
    operationId: 'MAINTENANCE_EVIDENCE_ATTACH', message: MAINTENANCE_EVIDENCE_ATTACH_MESSAGE, label: 'Add task evidence', carriesStep: 'ENTITY',
    reason: 'You can create the compliance task, complete it and attach its evidence here; the step is done when the task is completed with evidence.',
    outcome: 'The task you linked to this step, completed with Home Record evidence, is recorded as this step\'s proof.',
  },
  // A person's persisted review of the CURRENT policy or warranty terms (opening the coverage tool is never proof).
  'coverage-intelligence:review_current_policy_context': {
    operationId: 'COVERAGE_TERM_REVIEW', message: COVERAGE_TERM_REVIEW_MESSAGE, label: 'Mark policy terms as reviewed', carriesStep: 'ENTITY',
    reason: 'You can review your current policy terms here; your review is recorded on this journey.',
    outcome: 'Your review of the current terms is recorded as this step\'s proof.',
  },
  'coverage-intelligence:review_current_warranty_context': {
    operationId: 'COVERAGE_TERM_REVIEW', message: COVERAGE_TERM_REVIEW_MESSAGE, label: 'Mark warranty terms as reviewed', carriesStep: 'ENTITY',
    reason: 'You can review your current warranty terms here; your review is recorded on this journey.',
    outcome: 'Your review of the current terms is recorded as this step\'s proof.',
  },
  // The saved, active policy or warranty decides (an upload or a say-so is not coverage).
  'documents:activate_warranty_coverage': {
    operationId: 'COVERAGE_RECORD_CHECK', message: COVERAGE_RECORD_CHECK_MESSAGE, label: 'Check my saved plan', carriesStep: 'ENTITY',
    reason: 'Once your plan is saved, check it here; the step is completed on the saved record.',
    outcome: 'The active plan you saved is recorded as this step\'s proof.',
  },
  'documents:bind_policy_and_record_documents': {
    operationId: 'COVERAGE_RECORD_CHECK', message: COVERAGE_RECORD_CHECK_MESSAGE, label: 'Check my saved plan', carriesStep: 'ENTITY',
    reason: 'Once your plan is saved, check it here; the step is completed on the saved record.',
    outcome: 'The active plan you saved is recorded as this step\'s proof.',
  },
  // "Act on findings" is done when every finding the journey is about has a decision (the findings decide, a checklist does not).
  'guidance-overview:act_on_inspection_findings': {
    operationId: 'INSPECTION_FINDINGS_CHECK', message: INSPECTION_FINDINGS_CHECK_MESSAGE, label: 'Check my finding decisions', carriesStep: 'ENTITY',
    reason: 'Once you have decided what to do about each finding, check it here; the step is completed on those decisions.',
    outcome: 'Your decisions on the findings are recorded as this step\'s proof.',
  },
  // The expense's allocation, explicitly confirmed by the homeowner (a calculated line item is not proof). The step opens the capital reserve plan; confirming one expense's funding from it
  // (the plan's own row action, started from this execution) completes the step when the journey is about that very expense.
  'capital-timeline:fund_capital_expense': {
    operationId: 'CAPITAL_RESERVE_PLAN', message: 'Show my capital reserve plan', label: 'Open the reserve plan', carriesStep: 'FIELD',
    reason: 'You can confirm the funding for this expense in the reserve plan; your confirmation is recorded on this journey.',
    outcome: 'Your confirmation of this expense\'s funding plan is recorded as this step\'s proof.',
  },
  // A multi-stage flow: the step opens the start (reusing an existing review of the kind), then the analysis. The step id follows every stage and is
  // re-read at each one; the step completes only when the analysis is saved.
  'negotiation-shield:prepare_negotiation': {
    operationId: 'NEGOTIATION_SHIELD_CASE_START', message: NEGOTIATION_SHIELD_START_MESSAGE, label: 'Start a negotiation review', carriesStep: 'ENTITY',
    reason: 'You can start and analyze a negotiation review here; the saved analysis is recorded on this journey.',
    outcome: 'A saved analysis of your negotiation review is recorded as this step\'s proof.',
  },
  // The comparison is opened for this step; the decision recorded from it (the answer's own command, started from the comparison's execution) completes it.
  'coverage-intelligence:compare_coverage_options': {
    operationId: 'COVERAGE_COMPARISON_STATUS', message: 'Show my coverage comparison', label: 'Open the coverage comparison', carriesStep: 'FIELD',
    reason: 'You can compare your coverage and record your decision here; the decision is recorded on this journey.',
    outcome: 'Your recorded coverage decision is recorded as this step\'s proof.',
  },
  // The step opens the price records answer; a record started or finalized from it belongs to this step. Finalizing is the proof; starting a record is not.
  'price-finalization:finalize_price': {
    operationId: 'PRICE_FINALIZATIONS_LIST', message: 'Show my price finalizations', label: 'Open price records', carriesStep: 'FIELD',
    reason: 'You can record and finalize the accepted price here; finalizing it is recorded on this journey.',
    outcome: 'Your finalized accepted price and terms are recorded as this step\'s proof.',
  },
  // A project started for this step stores the journey; creating it is the proof. The closing steps below are reported when the project is completed with a verified
  // outcome (the same shared reporter the Desktop page uses, to the journey the project was created for), so their action opens the project, not a new flow.
  'project-tracker:confirm_scope_and_provider': {
    operationId: 'PROJECT_TRACKER_CREATE', message: PROJECT_TRACKER_CREATE_MESSAGE, label: 'Start a project', carriesStep: 'ENTITY',
    reason: 'You can start the project here; creating it is recorded on this journey.',
    outcome: 'The project you start is recorded as this step\'s proof.',
  },
  'project-tracker:track_work': {
    operationId: 'PROJECT_TRACKER_PROJECTS', message: 'Show my project tracker', label: 'Open your project',
    reason: 'You can complete the project here with a verified outcome; its closing steps are recorded on this journey.',
    outcome: 'Completing the project with a verified outcome records this step\'s proof.',
  },
  'project-completion:capture_proof': {
    operationId: 'PROJECT_TRACKER_PROJECTS', message: 'Show my project tracker', label: 'Open your project',
    reason: 'You can complete the project here with a verified outcome; its closing steps are recorded on this journey.',
    outcome: 'Completing the project with a verified outcome records this step\'s proof.',
  },
  'project-completion:set_future_care': {
    operationId: 'PROJECT_TRACKER_PROJECTS', message: 'Show my project tracker', label: 'Open your project',
    reason: 'You can complete the project here with a verified outcome; its closing steps are recorded on this journey.',
    outcome: 'Completing the project with a verified outcome records this step\'s proof.',
  },
  'project-completion:update_home_record': {
    operationId: 'PROJECT_TRACKER_PROJECTS', message: 'Show my project tracker', label: 'Open your project',
    reason: 'You can complete the project here with a verified outcome; its closing steps are recorded on this journey.',
    outcome: 'Completing the project with a verified outcome records this step\'s proof.',
  },
  'project-completion:verify_outcome': {
    operationId: 'PROJECT_TRACKER_PROJECTS', message: 'Show my project tracker', label: 'Open your project',
    reason: 'You can complete the project here with a verified outcome; its closing steps are recorded on this journey.',
    outcome: 'Completing the project with a verified outcome records this step\'s proof.',
  },
  'do-nothing-simulator:model_cost_of_delay': {
    operationId: 'DO_NOTHING_SIMULATION_RUN', message: DO_NOTHING_RUN_MESSAGE, label: 'Run the simulation', carriesStep: 'ENTITY',
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
