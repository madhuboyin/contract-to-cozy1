import type { HouseholdRole } from '@prisma/client';
import type { AskPresentationBlock } from '../../productFramework/ask/ask.contract';
import type { ComposedSkillContextEntry } from '../skills/context/skillContext.contract';
import { isAskActionAllowedForHouseholdRole } from './askAudiencePresentation';
import { getAskOperationDefinition, type AskOperationId, type AskOperationResult } from './askOperationRegistry';
import type { AskAnswerTrustEvidence, AskAuthoritativeSourceEvidence } from './askTrust.contract';
import { isReceiptFollowUpAction } from './support/receiptFollowUps';

type AskAction = Extract<AskPresentationBlock, { type: 'SUMMARY' }>['actions'][number];

const OPERATION_BOUNDARIES: Partial<Record<AskOperationId, ReadonlySet<string>>> = {
  MAINTENANCE_STATUS: new Set(['maintenance-purchase-date-missing', 'maintenance-record-boundary']),
  COVERAGE_GAPS: new Set(['coverage-boundary']),
  OWNERSHIP_COSTS: new Set(['ownership-cost-lens-boundary', 'ownership-cost-change-boundary', 'ownership-cost-forecast-boundary', 'ownership-cost-buffer-boundary']),
  HOME_ACTIONS: new Set(['home-actions-boundary', 'focused-home-action-boundary']),
  REPLACEMENT_GUIDANCE: new Set(['repair-replace-boundary']),
  REFINANCE_ANALYSIS: new Set(['refinance-boundary']),
  SELL_HOLD_RENT_ANALYSIS: new Set(['sell-hold-rent-boundary']),
  BREAK_EVEN_ANALYSIS: new Set(['break-even-boundary']),
  NEIGHBORHOOD_CHANGE_FEED: new Set(['neighborhood-change-boundary']),
  PAST_HAZARD_EXPOSURE: new Set(['past-hazard-boundary']),
  HOME_STATUS_BOARD: new Set(['status-board-boundary']),
  HOME_HABITS: new Set(['home-habits-boundary', 'home-habit-review-boundary']),
  HOME_HABIT_UPDATE: new Set(['home-habit-write-boundary']),
  HOME_DIGITAL_WILL: new Set(['digital-will-boundary']),
  PLANT_CARE_OUTLOOK: new Set(['plant-care-boundary']),
  NEGOTIATION_SHIELD_CASES: new Set(['negotiation-shield-boundary']),
  // The analysis receipt is the review, which carries the same boundary.
  NEGOTIATION_SHIELD_CASE_ANALYZE: new Set(['negotiation-shield-boundary']),
  HOME_UPGRADE_SCENARIOS: new Set(['home-upgrade-boundary']),
  DIY_PROJECTS: new Set(['diy-boundary']),
  DIY_PROJECT_GUIDE: new Set(['diy-step-safety', 'diy-guide-withdrawn', 'diy-guide-corrected', 'diy-project-guide-boundary', 'diy-task-link']),
  DIY_STEP_UPDATE: new Set(['diy-step-safety', 'diy-step-boundary']),
  DIY_PROJECT_COMPLETE: new Set(['diy-project-command-boundary']),
  DIY_COMPLETION_RECOVER: new Set(['diy-recover-boundary']),
  DIY_TEMPLATE_BROWSE: new Set(['diy-template-boundary']),
  MAINTENANCE_TEMPLATES_BROWSE: new Set(['maintenance-templates-boundary']),
  DIY_PROJECT_START: new Set(['diy-template-boundary']),
  DIY_PROJECT_ABANDON: new Set(['diy-project-command-boundary']),
  PROJECT_TRACKER_PROJECTS: new Set(['project-tracker-boundary']),
  SERVICE_PRICE_CHECKS: new Set(['service-price-radar-boundary']),
  HOME_TIMELINE_EVENTS: new Set(['home-timeline-boundary']),
  MATERIAL_SPECS_LIST: new Set(['material-specs-boundary']),
  PROPERTY_BRIEFS_LIST: new Set(['property-briefs-boundary']),
  GUIDANCE_JOURNEYS_LIST: new Set(['guidance-journeys-boundary']),
  GUIDANCE_JOURNEY_CONTINUE: new Set(['guidance-journey-boundary']),
  SEASONAL_HOME_CARE: new Set(['seasonal-home-care-boundary']),
  SEASONAL_CHECKLIST_SETUP: new Set(['seasonal-setup-boundary']),
  HOME_BASICS_GUIDE: new Set(['home-basics-boundary', 'home-basics-gas-emergency']),
  HIRING_GUIDE: new Set(['hiring-guide-boundary']),
  GUIDANCE_STEP_SKIP: new Set(['guidance-step-boundary']),
  GUIDANCE_JOURNEY_DISMISS: new Set(['guidance-step-boundary']),
  HOA_COMPLIANCE_STATUS: new Set(['hoa-compliance-boundary']),
  PRICE_FINALIZATIONS_LIST: new Set(['price-finalization-boundary']),
  PERMIT_TRACKER_STATUS: new Set(['permit-tracker-boundary']),
  COVERAGE_REVIEW_STATUS: new Set(['coverage-review-boundary']),
  FINANCING_OVERVIEW: new Set(['financing-boundary']),
  DO_NOTHING_SIMULATION: new Set(['do-nothing-boundary']),
  WARRANTY_LOOKUP: new Set(['warranty-boundary']),
  INCIDENT_CLAIM_STATUS: new Set(['claim-status-boundary']),
  DOCUMENT_LOOKUP: new Set(['document-lookup-boundary']),
  APPLIANCE_FAILURE_RISK: new Set(['appliance-oracle-boundary']),
  MAINTENANCE_BUDGET_FORECAST: new Set(['budget-forecast-boundary']),
  // FRD v1.64: the safety-first boundary was never declared, so the validator removed it and then withheld every
  // INCIDENT_CONTINUATION answer for having no direct answer ("I couldn't verify this answer").
  INCIDENT_CONTINUATION: new Set(['incident-continuation-boundary']),
  QUOTE_COMPARISON_REVIEW: new Set(['quote-review-boundary']),
  CAPITAL_RESERVE_PLAN: new Set(['capital-plan-boundary']),
  HOME_EVENT_RADAR_FEED: new Set(['home-event-radar-partial', 'radar-feed-boundary']),
  HOME_EVENT_RADAR_STATE: new Set(['radar-write-boundary']),
  HOME_EVENT_RADAR_MARK_DONE: new Set(['radar-write-boundary']),
  HOME_EVENT_RADAR_FEEDBACK: new Set(['radar-write-boundary']),
  HOME_EVENT_RADAR_TASK: new Set(['radar-write-boundary']),
  HOME_EVENT_RADAR_PREFERENCES: new Set(['radar-write-boundary']),
  PROPERTY_TAX_APPEAL_READINESS: new Set(['tax-coverage-boundary', 'tax-readiness-boundary']),
  RENOVATION_PERMIT_READINESS: new Set(['renovation-empty-boundary', 'renovation-readiness-boundary']),
  MAJOR_EVENT_ENTRY: new Set(['major-event-boundary']),
  EMERGENCY_BOUNDARY: new Set(['emergency-boundary']),
  UNSAFE_RESTRICTED_BOUNDARY: new Set(['unsafe-restricted-boundary']),
  OUT_OF_SCOPE_BOUNDARY: new Set(['out-of-scope-boundary']),
  GROUNDED_GUIDANCE: new Set(['grounded-professional-boundary']),
  HVAC_DECISION_START: new Set(['repair-replace-boundary']),
  HVAC_DECISION_SCENARIO: new Set(['repair-replace-boundary']),
  BUYER_PLAN_STATUS: new Set(['buyer-professional-boundary']),
  BUYER_DEADLINES: new Set(['buyer-professional-boundary']),
  BUYER_INSPECTION_REVIEW: new Set(['buyer-professional-boundary']),
  BUYER_FINANCING_READINESS: new Set(['buyer-professional-boundary']),
  BUYER_TITLE_ESCROW_READINESS: new Set(['buyer-professional-boundary']),
  BUYER_WALKTHROUGH_READINESS: new Set(['buyer-walkthrough-boundary']),
  BUYER_DISCLOSURE_FUNDS_READINESS: new Set(['buyer-disclosure-wire-boundary']),
  BUYER_CLOSING_DAY_READINESS: new Set(['buyer-closing-day-wire-boundary']),
  BUYER_CONTRACT_TIMELINE: new Set(['buyer-professional-boundary']),
  BUYER_NEGOTIATION_READINESS: new Set(['buyer-professional-boundary']),
  BUYER_COST_READINESS: new Set(['buyer-cost-boundary']),
};

const OPERATION_ACTION_IDS: Readonly<Partial<Record<AskOperationId, ReadonlySet<string>>>> = {
  MAINTENANCE_STATUS: new Set(['create-maintenance', 'maintenance-templates-browse', 'add-purchase-date', 'seasonal-retry', 'seasonal-show-pending', 'seasonal-show-completed', 'seasonal-show-dismissed', 'seasonal-show-maintenance', 'seasonal-item-add', 'seasonal-item-snooze', 'seasonal-item-dismiss', 'seasonal-item-restore']),
  // + the claim transition item actions (FRD v1.42); the inline claim detail shows only those legal from the live status.
  // FRD v1.43: INSPECTION_FINDINGS had no entry, so even its "Open Inspection Hub" link was stripped; the finding
  // actions are shown in the inline detail only when the live state allows them.
  INSPECTION_FINDINGS: new Set(['finding-accept', 'finding-dismiss', 'finding-resolve']),
  RECALL_REVIEW: new Set(['recall-confirm', 'recall-dismiss', 'recall-resolve']),
  // The Open Documents link was never declared, so the validator removed it from the answer and from its empty state (found in Documents D-1).
  INCIDENT_CLAIM_STATUS: new Set(['claim-file-start', 'claim-start', 'claim-submit', 'claim-under-review', 'claim-approve', 'claim-deny', 'claim-close', 'claim-checklist']),
  // Plus the row steps (FRD v1.323): save, dismiss, stop pursuing, record the outcome.
  SAVINGS_OPPORTUNITIES: new Set(['review-all-savings', 'savings-benefit-save', 'savings-benefit-dismiss', 'savings-benefit-stop', 'savings-benefit-outcome']),
  OWNERSHIP_COSTS: new Set([
    'ownership-cost-view-current', 'ownership-cost-view-changes', 'ownership-cost-view-forecast', 'ownership-cost-view-variability', 'ownership-cost-refresh-sources',
    'ownership-cost-review-property_tax', 'ownership-cost-review-insurance', 'ownership-cost-review-hoa', 'ownership-cost-review-utilities',
    'ownership-cost-review-mortgage_principal', 'ownership-cost-review-mortgage_interest', 'ownership-cost-review-pmi',
    'ownership-cost-review-recurring_home_service', 'ownership-cost-review-routine_maintenance', 'ownership-cost-review-known_repair',
    'ownership-cost-review-capital_project', 'ownership-cost-review-reserve_contribution', 'ownership-cost-monthly-buffer', 'ownership-cost-capital-reserve',
    'ownership-cost-save-forecast', 'ownership-cost-create-scenario', 'ownership-cost-rename-scenario', 'ownership-cost-archive-scenario', 'ownership-cost-delete-scenario',
    'ownership-cost-record-monthly-buffer', 'ownership-cost-record-capital-reserve', 'ownership-cost-change-accept', 'ownership-cost-change-save', 'ownership-cost-change-snooze',
    'ownership-cost-change-no-action', 'ownership-cost-change-resolve', 'ownership-cost-change-dismiss', 'ownership-cost-change-reopen', 'ownership-cost-toggle-notification',
  ]),
  OWNERSHIP_COST_COMMAND: new Set(['ownership-cost-show-current']),
  INVENTORY_LOOKUP: new Set(['add-inventory', 'show-inventory', 'add-inventory-item']),
  INVENTORY_ITEM_CORRECT: new Set(['view-inventory-item']),
  ROOM_CREATE: new Set(),
  PROPERTY_PURCHASE_DATE_SET: new Set(),
  HOME_JOURNEY_SET: new Set(),
  MATERIAL_SPEC_ADD: new Set(),
  HOME_PLANT_ADD: new Set(['add-room-for-plant']),
  ROOM_PLANT_RECOMMENDATIONS: new Set(['plant-recommendation-save', 'plant-recommendation-dismiss', 'plant-recommendation-add-home', 'find-plants-again']),
  HOME_HABITS_GENERATE: new Set(),
  DO_NOTHING_SIMULATION_RUN: new Set(),
  SERVICE_PRICE_CHECK_RUN: new Set(),
  INVENTORY_ITEM_CREATE: new Set(['open-rooms', 'view-inventory-item']),
  PROPERTY_CONTEXT_AREA_CAPTURE: new Set(['continue-area-capture']),
  // Every action id PROPERTY_SUMMARY actually emits: the contributor-only inline add workflow actions (Ask links to no desktop page).
  PROPERTY_SUMMARY: new Set(['add-warranty', 'add-timeline-event', 'add-room', 'add-inventory-item']),
  CAPTURE_EVENT_CONFIRM: new Set(['open-timeline', 'open-home-timeline']),
  CAPABILITY_DISCOVERY: new Set(['explore-available-tools', 'explore-tools']),
  REPLACEMENT_GUIDANCE: new Set(['open-inventory', 'open-repair-replace', 'show-inventory', 'add-inventory-item']),
  // FRD v1.45: the analysis also shows the homeowner's own rate monitors (MONITOR renders its own pause/resume/stop).
  REFINANCE_ANALYSIS: new Set([
    'refinance-test-scenario', 'refinance-start-monitor', 'refinance-compare-offers',
    'refinance-record-decision', 'refinance-adjust-scenario',
  ]),
  BREAK_EVEN_ANALYSIS: new Set(['rerun-break-even-5', 'rerun-break-even-10']),
  // The review's declared actions (each opens a confirmation) and its way back to the list.
  HOME_HABITS: new Set(['generate-home-habits', 'habit-adopt', 'habit-complete', 'habit-snooze', 'habit-skip', 'habit-dismiss', 'habits-back-to-list', 'habits-review-first', 'habits-show-maintenance', 'home-habit-coach-settings']),
  HOME_HABIT_UPDATE: new Set(['habits-back-to-list']),
  PLANT_CARE_OUTLOOK: new Set(['find-plants-for-room', 'add-home-plant']),
  DIY_PROJECTS: new Set(['diy-template-browse', 'diy-skill-profile', 'diy-project-note']),
  DIY_PROJECT_GUIDE: new Set(['diy-step-complete', 'diy-step-skip', 'diy-step-previous', 'diy-step-back', 'diy-step-reopen', 'diy-review-last-step', 'diy-project-finish', 'diy-project-more', 'diy-project-stop', 'diy-project-handoff', 'diy-record-again', 'diy-task-record-again']),
  DIY_PROJECT_START: new Set(['diy-start-guide']),
  DIY_STEP_UPDATE: new Set(['diy-continue-guide']),
  DIY_PROJECT_ABANDON: new Set(['diy-show-projects']),
  DIY_PROJECT_COMPLETE: new Set(['diy-show-projects']),
  DIY_COMPLETION_RECOVER: new Set(['diy-show-projects']),
  PROJECT_TRACKER_PROJECTS: new Set(['project-tracker-create', 'project-tracker-review', 'project-tracker-start', 'project-tracker-pause', 'project-tracker-resume', 'project-tracker-cancel', 'project-tracker-add-milestone', 'project-tracker-complete-milestone', 'project-tracker-mark-payment-paid', 'project-tracker-log-progress', 'project-tracker-log-issue', 'project-tracker-resolve-issue', 'project-tracker-add-payment', 'project-tracker-add-change-order', 'project-tracker-review-change-order', 'project-tracker-approve-change-order', 'project-tracker-reject-change-order', 'project-tracker-void-change-order', 'project-tracker-complete-project', 'project-tracker-share-closeout', 'project-tracker-edit-project', 'project-tracker-edit-milestone', 'project-tracker-delete-milestone', 'project-tracker-edit-payment', 'project-tracker-delete-payment', 'project-tracker-edit-change-order', 'project-tracker-delete-log', 'project-tracker-edit-issue', 'project-tracker-retry-alignment', 'project-tracker-replace-milestone-template', 'project-tracker-add-issue-note', 'project-tracker-escalate-issue', 'project-tracker-generate-dispute-package', 'project-tracker-add-material', 'project-tracker-edit-material', 'project-tracker-advance-material', 'project-tracker-substitute-material']),
  PROJECT_TRACKER_CREATE: new Set(['project-tracker-show-projects']),
  PROJECT_TRACKER_COMMAND: new Set(['project-tracker-show-projects']),
  SERVICE_PRICE_CHECKS: new Set(['check-service-quote']),
  HOME_TIMELINE_EVENTS: new Set(['home-timeline-log-event', 'correct-title', 'correct-occurredAt', 'correct-summary', 'correct-visibility']),
  MATERIAL_SPECS_LIST: new Set(['add-material-spec']),
  GUIDANCE_JOURNEYS_LIST: new Set(['start-guided-plan']),
  GUIDANCE_JOURNEY_CONTINUE: new Set(['continue-step-in-ask', 'dismiss-guided-journey']),
  // The answer's next steps (each opens a confirmation, an inline answer, or the home-record check) and the walkthrough's way on and back.
  SEASONAL_HOME_CARE: new Set(['seasonal-add-tasks', 'seasonal-walkthrough', 'seasonal-show-checklist', 'seasonal-update-home-details', 'seasonal-next-task', 'seasonal-back-to-plan']),
  SEASONAL_CHECKLIST_SETUP: new Set(['seasonal-show-checklist', 'seasonal-update-home-details']),
  // Home Basics deliberately has no local continuation carousel; the governed exact-four footer owns onward navigation.
  HOME_BASICS_GUIDE: new Set(),
  // The attached-document receipt: an inventory item opens inline in Ask; a warranty keeps its page link.
  CAPTURE_EVIDENCE_CONFIRM: new Set(['view-inventory-item', 'open-attached-record']),
  DO_NOTHING_SIMULATION: new Set(['run-do-nothing', 'do-nothing-scenario-create', 'do-nothing-scenario-edit', 'do-nothing-scenario-delete']),
  WARRANTY_LOOKUP: new Set(['add-warranty']),
  // FRD v1.78: plus the inline "Add purchase date" capture on appliances with no age.
  APPLIANCE_FAILURE_RISK: new Set(['correct-purchasedOn']),
  // FRD v1.64 gave INCIDENT_CONTINUATION two page links; Ask no longer links to desktop pages, so it offers starting a claim instead.
  INCIDENT_CONTINUATION: new Set(['claim-file-start']),
  // The row's Review action (opens one case's analysis and draft) and the review's way back to the list; the draft itself is text, not an action.
  NEGOTIATION_SHIELD_CASES: new Set(['negotiation-shield-review', 'negotiation-shield-back', 'negotiation-shield-start', 'negotiation-shield-analyze', 'negotiation-shield-edit', 'negotiation-shield-attach', 'price-finalization-start-negotiation']),
  // The receipt of a started review offers the slice 1 read of that case.
  NEGOTIATION_SHIELD_CASE_START: new Set(['negotiation-shield-review', 'negotiation-shield-analyze']),
  // The receipt is the review, whose way back and re-run actions it carries.
  NEGOTIATION_SHIELD_CASE_ANALYZE: new Set(['negotiation-shield-back', 'negotiation-shield-analyze', 'negotiation-shield-edit', 'negotiation-shield-attach', 'price-finalization-start-negotiation']),
  // The receipt of an attached document offers the read of that review and a run of its analysis.
  NEGOTIATION_SHIELD_CASE_ATTACH: new Set(['negotiation-shield-review', 'negotiation-shield-analyze']),
  // The readiness answer's empty state offers the start; the receipt of a started case offers that case's readiness check.
  RENOVATION_CASE_START: new Set(['renovation-case-readiness']),
  // Add and update lender conditions and title or escrow issues (register P2 Buyer Closing). Confirmation-gated, declared-action only.
  BUYER_CLOSING_ITEM_COMMAND: new Set(['buyer-closing-item-back']),
  // Plan and record the buyer's final walkthrough: the plan, observations, issues and completion (register P2 Buyer Closing). Confirmation-gated, declared-action only.
  BUYER_WALKTHROUGH_COMMAND: new Set(['buyer-walkthrough-back']),
  // Lender-condition and title-issue controls on the financing and title readiness answers (FRD v1.346).
  BUYER_FINANCING_READINESS: new Set(['closing-lender-condition-add', 'closing-lender-condition-update', 'closing-lender-appraisal', 'closing-lender-underwriting']),
  BUYER_TITLE_ESCROW_READINESS: new Set(['closing-title-issue-add', 'closing-title-issue-update']),
  // Final-walkthrough readiness answer: the plan, observation and completion actions and the observation and issue row actions (FRD v1.345).
  BUYER_WALKTHROUGH_READINESS: new Set(['walkthrough-plan', 'walkthrough-observation-add', 'walkthrough-observation-review', 'walkthrough-issue-add', 'walkthrough-issue-update', 'walkthrough-complete']),
  // Add a note to a DIY project in planning or in progress (register P2 DIY). Confirmation-gated, declared-action only.
  DIY_PROJECT_NOTE_COMMAND: new Set(['diy-projects-back']),
  // Set the caller's own DIY skill levels (register P2 DIY). One profile per user, so a viewer may set it. Confirmation-gated, declared-action only.
  DIY_SKILL_PROFILE_COMMAND: new Set(['diy-projects-back']),
  // Add a seasonal checklist task to maintenance, snooze it, set it aside, or bring it back (register P2 Seasonal Home Care). Confirmation-gated, declared-action only.
  SEASONAL_ITEM_COMMAND: new Set(['seasonal-item-back']),
  // Snooze or reschedule a Home Operations work item, or accept the routine low-risk candidates in bulk (register P2 Maintenance and Home Operations). Confirmation-gated, declared-action only.
  HOME_WORK_ITEM_COMMAND: new Set(['home-work-items-back']),
  // List the home's open Home Operations work items with state, due date and snooze (register P2 Maintenance and Home Operations). Read-only.
  HOME_WORK_ITEMS: new Set(['home-work-items-back', 'work-item-snooze', 'work-item-reschedule', 'work-items-accept-routine']),
  // Build a negotiation package from a confirmed pre-purchase inspection report: choose a decision per open finding and see the credit total (register P2 Inspection Hub). Calculation only; saves nothing.
  INSPECTION_NEGOTIATION_PACKAGE: new Set(['inspection-reports-back']),
  // Keep an eye on an inspection finding, or record the seller's plan to fix or disclose it (register P2 Inspection Hub). Confirmation-gated, declared-action only.
  INSPECTION_FINDING_DECISION_COMMAND: new Set(['inspection-reports-back']),
  // List the findings in one confirmed inspection report with their state and decisions (register P2 Inspection Hub). Read-only; launched from a report row.
  INSPECTION_REPORT_FINDINGS: new Set(['inspection-reports-back', 'inspection-finding-monitor', 'inspection-finding-fix', 'inspection-finding-disclose-price', 'inspection-finding-disclose-credit']),
  // Review and confirm an inspection report, with the write-back preview shown first (register P2 Inspection Hub). Confirmation-gated, declared-action only.
  INSPECTION_REPORT_COMMAND: new Set(['inspection-reports-back']),
  // Compare a confirmed inspection report with the confirmed one before it (register P2 Inspection Hub). Read-only; launched from a report row.
  INSPECTION_REPORT_COMPARE: new Set(['inspection-reports-back']),
  // List the home's inspection reports with their state and what can be done next (register P2 Inspection Hub). Read-only.
  INSPECTION_REPORTS: new Set(['inspection-reports-back', 'inspection-report-confirm', 'inspection-report-compare', 'inspection-report-findings', 'inspection-report-negotiation']),
  // Start the sale case, set its target dates and prep budget range, and record its stage (register P2 Seller Prep). Confirmation-gated, declared-action only; lists, contracts or closes nothing.
  SELLER_PREP_CASE_COMMAND: new Set(['seller-prep-back']),
  // Mark a claim checklist item done, not applicable or open again, and add a note to a claim's timeline (register P2 Claims). Confirmation-gated, declared-action only.
  CLAIM_CHECKLIST_VIEW: new Set(['claim-note', 'claim-checklist-done', 'claim-checklist-not-applicable', 'claim-checklist-reopen']),
  CLAIM_ACTIVITY_COMMAND: new Set(['claims-back']),
  // Save, change and delete Do-Nothing Simulator scenarios (register P2 Do-Nothing Simulator). Confirmation-gated, declared-action only; saving a scenario runs nothing.
  DO_NOTHING_SCENARIO_COMMAND: new Set(['do-nothing-back']),
  // Change the Home Habit Coach's property-wide settings: on or off, how many habits it shows, which kinds it hides (register P2 Home Habit Coach). Confirmation-gated, declared-action only.
  HOME_HABIT_PREFERENCES_COMMAND: new Set(['home-habits-back']),
  // Change the home's recorded mortgage and purchase facts (the financing profile). Owner only; confirmation-gated; declared-action only; exact before and after in the confirmation, redacted receipt (owner ruling 2026-10-13).
  FINANCING_OVERVIEW: new Set(['financing-profile-update']),
  FINANCING_PROFILE_COMMAND: new Set(['financing-profile-back']),
  // Create or stop a public, expiring link to explicitly selected, share-eligible Home Briefing updates (register P1 Home Briefing; owner ruling 2026-10-13). Owner only; confirmation-gated; declared-action only.
  HOME_BRIEFING_SHARE_COMMAND: new Set(['home-briefing-back', 'home-briefing-open-share']),
  // Set up or update the HOA details, add, change or remove an approval request as reported, and report a violation notice (register P2 HOA Compliance). Confirmation-gated, declared-action only; an association decision with its evidence stays on the page.
  HOA_COMPLIANCE_STATUS: new Set(['hoa-association', 'hoa-approval-add', 'hoa-approval-edit', 'hoa-approval-remove', 'hoa-violation-report']),
  HOA_COMPLIANCE_COMMAND: new Set(['hoa-back']),
  // Prepare the member's briefing, change their briefing settings, and mark an update seen, dismissed or not useful (register P1 Home Briefing). Confirmation-gated, declared-action only; the briefing is the caller's own.
  HOME_BRIEFING_VIEW: new Set(['home-briefing-generate', 'home-briefing-preferences', 'home-briefing-seen', 'home-briefing-dismiss', 'home-briefing-not-useful', 'home-briefing-share', 'home-briefing-share-revoke']),
  HOME_BRIEFING_COMMAND: new Set(['home-briefing-back']),
  // Follow, dismiss or mark not relevant a local change (register P1 Neighborhood Change Radar). A person's own reading, stored per user and match, so a viewer may set it. Confirmation-gated, declared-action only.
  NEIGHBORHOOD_CHANGE_FEED: new Set(['neighborhood-follow', 'neighborhood-dismiss', 'neighborhood-not-relevant']),
  NEIGHBORHOOD_INTERACTION_COMMAND: new Set(['neighborhood-back']),
  // Record what the household observed after a matched hazard event (register P1 Home Risk Replay). Confirmation-gated, declared-action only; behind the route's reviewed-source-coverage gate.
  PAST_HAZARD_EXPOSURE: new Set(['past-hazard-record-outcome']),
  PAST_HAZARD_OUTCOME_COMMAND: new Set(['past-hazard-back']),
  // Refresh a renovation case's readiness, acknowledge or withdraw the risk of an open item, and reopen an item that was marked satisfied (register P1 Renovation Risk Advisor). Confirmation-gated, declared-action only; acknowledging a risk is owner-only.
  RENOVATION_READINESS_COMMAND: new Set(['renovation-readiness-back']),
  // Save, dismiss, stop pursuing and record the outcome of a savings or benefit opportunity (register P1 Savings & Benefits). Confirmation-gated, declared-action only; primary owner only. Sensitive facts and partner handoffs are not here.
  SAVINGS_BENEFIT_COMMAND: new Set(['savings-benefit-back']),
  // Start a property tax appeal case, prepare its packet, record the filing, a response or hearing, a reminder and the decision (register P1 Property Tax). Confirmation-gated, declared-action only; primary owner only; Cozy prepares and records, it never files.
  PROPERTY_TAX_APPEAL_READINESS: new Set(['property-tax-appeal-start', 'property-tax-appeal-packet', 'property-tax-appeal-filing', 'property-tax-appeal-event', 'property-tax-appeal-reminder-add', 'property-tax-appeal-reminder-done', 'property-tax-appeal-reminder-dismiss', 'property-tax-appeal-determination']),
  PROPERTY_TAX_APPEAL_COMMAND: new Set(['property-tax-appeal-back']),
  // Correct a Status Board item's estimated condition, recommendation, dates and note, pin or hide it, and refresh the board (register P1 Status Board). Confirmation-gated, declared-action only; never by fuzzy retrieval.
  STATUS_BOARD_COMMAND: new Set(['status-board-back']),
  // Adjust what the Capital Timeline assumes for an item (register P1 Capital Timeline): planned date or window, cost range, remaining life, leave it off, or a note; and remove an adjustment. Confirmation-gated, declared-action only; never by fuzzy retrieval.
  CAPITAL_TIMELINE_COMMAND: new Set(['capital-timeline-back']),
  // Coverage Intelligence writes (register P0): prepare the coverage review, start a comparison against the verified policy, and record the keep / change / shop / defer decision. Owner-only, confirmation-gated, declared-action only; never by fuzzy retrieval.
  COVERAGE_COMMAND: new Set(['coverage-back', 'coverage-back-review']),
  // Manage a saved Home Upgrade Planner option (register P0 Home Digital Twin / Upgrade Planner): record the decision, rename, archive or restore, recalculate (queued job) and delete an archived option. Confirmation-gated, declared-action only; never by fuzzy retrieval.
  HOME_UPGRADE_COMMAND: new Set(['home-upgrade-back']),
  // Add, change and remove a permit record (register P0 Permits, slice PM-B). Records the REPORTED status; the official status is the authority's and is not set here. Confirmation-gated, declared-action only; never by fuzzy retrieval.
  PERMIT_TRACKER_COMMAND: new Set(['permit-tracker-back']),
  // Buyer-mode Negotiation Shield (register P0): start negotiating an inspection finding with the seller and record the seller's response and outcome. Confirmation-gated, declared-action only; never by fuzzy retrieval.
  NEGOTIATION_SHIELD_BUYER_COMMAND: new Set(['buyer-negotiation-back', 'buyer-negotiation-outcome']),
  // Record, change and finalize an accepted price (register P0 Price Finalization): from a Negotiation Shield review, a selected quote proposal or by hand. Confirmation-gated, declared-action only; never by fuzzy retrieval.
  PRICE_FINALIZATION_COMMAND: new Set(['price-finalization-finalize', 'price-finalization-edit', 'price-finalization-back']),
  // Manage the proposals of a quote comparison (register P0 Quote Comparison): add, select, reject or return, remove. Confirmation-gated, reached only by declared actions on the review; never by fuzzy retrieval.
  QUOTE_COMPARISON_COMMAND: new Set(['quote-comparison-back']),
  // The readiness answer's empty state offers Start a renovation case to a contributor or owner (a SUMMARY action, so a missing id is stripped).
  // Plus the readiness controls (FRD v1.324): refresh, acknowledge or withdraw the risk of an open item, reopen a satisfied one.
  RENOVATION_PERMIT_READINESS: new Set(['renovation-case-start', 'renovation-readiness-refresh', 'renovation-readiness-acknowledge', 'renovation-readiness-revoke', 'renovation-readiness-reopen']),
  // The receipt of saved details offers the read of that review and a run of its analysis.
  NEGOTIATION_SHIELD_CASE_UPDATE: new Set(['negotiation-shield-review', 'negotiation-shield-analyze']),
  PROPERTY_BRIEFS_LIST: new Set(['property-brief-preview', 'property-brief-prepare', 'property-brief-share', 'property-brief-republish', 'property-brief-test-share', 'property-brief-revoke-share']),
  // FRD v1.44: neither seller-prep operation had an entry, so every action they emitted (even the checklist link) was
  // stripped. The decision item actions are shown inline only when the item's live state allows them.
  SELLER_PREP_CHECKLIST: new Set(['sale-item-pursue', 'sale-item-unpursue', 'sale-item-waive', 'sale-item-reopen', 'seller-prep-case-start', 'seller-prep-case-dates', 'seller-prep-case-budget', 'seller-prep-case-status']),
  GUIDANCE_JOURNEY_CREATE: new Set(['open-journey']),
  QUOTE_COMPARISON_CREATE: new Set(['open-workspace']),
  QUOTE_COMPARISON_REVIEW: new Set(['create-comparison', 'quote-comparison-add-quote', 'quote-comparison-select-quote', 'quote-comparison-reject-quote', 'quote-comparison-restore-quote', 'quote-comparison-remove-quote', 'quote-comparison-edit-quote', 'quote-comparison-confirm-quote', 'quote-comparison-clarify-quote', 'quote-comparison-resolve-clarification', 'quote-comparison-close-decision', 'price-finalization-start-quote']),
  // The price records answer offers Record an accepted price (a SUMMARY action) and Finalize / Change the terms on a draft row.
  PRICE_FINALIZATIONS_LIST: new Set(['price-finalization-start-manual', 'price-finalization-finalize', 'price-finalization-edit']),
  // The permit list offers Add a permit (a SUMMARY action) and Change / Remove on a row to a contributor or owner.
  // The status board's next steps (FRD v1.319): refresh the board, correct one item; the install-date capture kept from the earlier slice.
  HOME_STATUS_BOARD: new Set(['status-board-refresh', 'status-board-correct', 'correct-installedOn']),
  PERMIT_TRACKER_STATUS: new Set(['permit-tracker-add', 'permit-tracker-edit', 'permit-tracker-remove']),
  // The comparison answer offers Start a comparison / Record my decision, and the review answer offers Review my coverage, to a contributor or owner.
  COVERAGE_COMPARISON_STATUS: new Set(['coverage-start-comparison', 'coverage-record-decision']),
  COVERAGE_REVIEW_STATUS: new Set(['coverage-generate-review']),
  // The upgrade options answer's Manage options rows offer these to a contributor or owner.
  HOME_UPGRADE_SCENARIOS: new Set(['home-upgrade-decide', 'home-upgrade-compute', 'home-upgrade-rename', 'home-upgrade-archive', 'home-upgrade-restore', 'home-upgrade-delete']),
  // The buyer negotiation list's rows offer Start negotiating and Record the seller response to a contributor or owner.
  BUYER_NEGOTIATION_READINESS: new Set(['buyer-negotiation-start', 'buyer-negotiation-outcome']),
  HOME_DEADLINE_MONITOR: new Set(['resolve-coverage-conflict']),
  // The page-link ids (open-inventory, open-timeline, open-reserve, open-reserve-fund) were retired with the desktop-link sweep.
  CAPITAL_RESERVE_PLAN: new Set(['add-inventory-item', 'rerun-horizon-5', 'rerun-horizon-10', 'reserve-fund-add-contribution', 'reserve-fund-set-balance', 'reserve-fund-remove-contribution', 'reserve-fund-recalculate', 'reserve-fund-posture-conservative', 'reserve-fund-posture-moderate', 'reserve-fund-posture-aggressive', 'reserve-fund-accept-reconciliation', 'capital-timeline-adjust', 'capital-timeline-remove-adjustment']),
  // The typed "change my reserve plan" choice and the posture picker offer the plan-wide actions that need no target entry.
  RESERVE_FUND_COMMAND: new Set(['reserve-fund-show-current', 'reserve-fund-add-contribution', 'reserve-fund-set-balance', 'reserve-fund-recalculate', 'reserve-fund-choose-posture', 'reserve-fund-posture-conservative', 'reserve-fund-posture-moderate', 'reserve-fund-posture-aggressive']),
  PROPERTY_BRIEF_COMMAND: new Set(['property-brief-show-current', 'property-brief-open-share']),
  // Item actions on the feed's events (FRD v1.40); the inline detail shows the ones valid for the live state.
  HOME_EVENT_RADAR_FEED: new Set(['radar-include-dismissed', 'radar-save', 'radar-unsave', 'radar-dismiss', 'radar-restore', 'radar-mark-done', 'radar-feedback', 'radar-plan-task', 'radar-notification-settings']),
  HVAC_DECISION_START: new Set(['add-inventory-item', 'view-inventory-item']),
  // FRD v1.46: + the blocking-task item action; the inline task detail shows it only while the live task is open.
  BUYER_DEADLINES: new Set(['buyer-task-complete']),
};

/**
 * Required context providers participate in canonical source-integrity
 * evaluation even when they fail. Optional providers participate only when
 * they actually returned usable data. An unavailable optional enhancement
 * must not invalidate an otherwise complete canonical read; adapters that
 * explicitly need that enhancement already return a typed limitation state.
 */
export function includeAskContextSourceEvidence(
  entry: Pick<ComposedSkillContextEntry, 'required' | 'status'>,
): boolean {
  return entry.status !== 'NOT_APPLICABLE' && (entry.required || entry.status === 'AVAILABLE');
}

/**
 * Statuses where the adapter completed a real, confident read against its
 * canonical source rather than failing, timing out, or lacking a
 * prerequisite. NOT_APPLICABLE/BLOCKED/NEEDS_ENTITY/NEEDS_CONFIRMATION are
 * not errors -- they are definite outcomes the adapter determined with full
 * data (a cash purchase has no financing to track; a viewer lacks
 * permission; a task needs disambiguation; a mutation is staged and ready).
 * Excluding them here silently strips every safe navigation action on those
 * responses downstream, since isAskActionApplicable requires authoritative
 * evidence. UNAVAILABLE and the terminal failure/pending statuses are
 * deliberately excluded: those genuinely lack a complete canonical read.
 */
const ASK_AUTHORITATIVE_EVIDENCE_STATUSES = new Set([
  'ANSWERED', 'COMPLETED', 'READY_WITH_LIMITATIONS', 'NOT_APPLICABLE', 'BLOCKED', 'NEEDS_ENTITY', 'NEEDS_CONFIRMATION',
]);

export function attachAskAuthoritativeSourceEvidence(
  result: AskOperationResult,
  evidence: AskAuthoritativeSourceEvidence[],
): AskOperationResult {
  const successful = ASK_AUTHORITATIVE_EVIDENCE_STATUSES.has(result.status);
  if (!successful) return result;
  return {
    ...result,
    parameters: {
      ...(result.parameters ?? {}),
      answerTrustEvidence: { schemaVersion: '1.0', sources: evidence } satisfies AskAnswerTrustEvidence,
    },
  };
}

export function completedAskAuthoritativeSourceEvidence(
  operationId: AskOperationId,
  observedAt = new Date().toISOString(),
): AskAuthoritativeSourceEvidence {
  return {
    sourceId: getAskOperationDefinition(operationId).adapterKey,
    operationId,
    status: 'COMPLETE',
    scope: 'FULL',
    freshness: 'CURRENT',
    observedAt,
  };
}

export function readAskAuthoritativeSourceEvidence(result: AskOperationResult): AskAuthoritativeSourceEvidence[] {
  const candidate = result.parameters?.answerTrustEvidence as Partial<AskAnswerTrustEvidence> | undefined;
  if (candidate?.schemaVersion !== '1.0' || !Array.isArray(candidate.sources)) return [];
  return candidate.sources.filter((source): source is AskAuthoritativeSourceEvidence => Boolean(
    source
    && typeof source.sourceId === 'string'
    && typeof source.operationId === 'string'
    && ['COMPLETE', 'PARTIAL', 'UNAVAILABLE'].includes(source.status)
    && ['FULL', 'LIMITED'].includes(source.scope)
    && ['CURRENT', 'STALE', 'UNKNOWN'].includes(source.freshness)
    && typeof source.observedAt === 'string',
  ));
}

export function authoritativeEvidenceState(
  result: AskOperationResult,
  operationId: AskOperationId,
): 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE' {
  const definition = getAskOperationDefinition(operationId);
  const matching = readAskAuthoritativeSourceEvidence(result)
    .filter((source) => source.operationId === operationId);
  const adapter = matching.find((source) => source.sourceId === definition.adapterKey);
  if (!adapter || adapter.status !== 'COMPLETE' || adapter.scope !== 'FULL' || adapter.freshness !== 'CURRENT') return 'UNAVAILABLE';
  if (matching.some((source) => source.status !== 'COMPLETE' || source.scope !== 'FULL' || source.freshness !== 'CURRENT')) return 'PARTIAL';
  return 'COMPLETE';
}

export function isBoundaryAllowedForOperation(operationId: AskOperationId, boundaryId: string, result?: AskOperationResult): boolean {
  if (boundaryId === 'ask-audience-applicability') return true;
  if (boundaryId === 'ask-audience-presentation') return Boolean(result && householdRoleFromResult(result));
  return OPERATION_BOUNDARIES[operationId]?.has(boundaryId) ?? false;
}

export function actionsForAskBlock(block: AskPresentationBlock): AskAction[] {
  const actions = 'actions' in block && Array.isArray(block.actions) ? block.actions : [];
  if (block.type === 'PRIORITY_LIST') {
    return [...actions, ...block.items.flatMap((item) => item.cta ? [item.cta] : [])];
  }
  return actions;
}

export function householdRoleFromResult(result: AskOperationResult): HouseholdRole | null {
  const role = (result.parameters?.audiencePresentation as { householdRole?: unknown } | undefined)?.householdRole;
  return role === 'OWNER' || role === 'CONTRIBUTOR' || role === 'VIEWER' ? role : null;
}

/**
 * Ask is the product surface (owner decision, 2026-10-10): an answer may link only to a place inside the conversation. A link to a desktop page
 * (any other /dashboard route) is removed here, in one place, for every block type, so no handler can send a homeowner out of Ask.
 */
export function isAskInConversationHref(href: string): boolean {
  if (!href.startsWith('/')) return false;
  const path = new URL(href, 'https://ask.local').pathname;
  return path === '/dashboard/ask' || path === '/dashboard/ask/';
}

export function isAskHrefSafeForProperty(href: string, propertyId?: string | null): boolean {
  if (!isAskInConversationHref(href)) return false;
  if (!propertyId) return true;
  const parsed = new URL(href, 'https://ask.local');
  const pathPropertyId = parsed.pathname.match(/\/dashboard\/properties\/([^/?#]+)/)?.[1];
  const queryPropertyId = parsed.searchParams.get('propertyId');
  if (pathPropertyId && decodeURIComponent(pathPropertyId) !== propertyId) return false;
  if (queryPropertyId && queryPropertyId !== propertyId) return false;
  return true;
}

export function nestedAskHrefs(block: AskPresentationBlock): string[] {
  if (block.type === 'CAPABILITY_LIST') return block.capabilities.map((capability) => capability.href);
  if (block.type === 'GROUPED_LIST') return block.sections.flatMap((section) => section.items.flatMap((item) => item.href ? [item.href] : []));
  if (block.type === 'TIMELINE') return block.items.flatMap((item) => item.href ? [item.href] : []);
  if (block.type === 'CHANGE_SUMMARY') return block.linkedAction ? [block.linkedAction.href] : [];
  if (block.type === 'OUTPUT_ARTIFACTS') return block.items.flatMap((item) => item.navigation ? [item.navigation.href] : []);
  if (block.type === 'RELATED_RECORDS') return block.relationships.flatMap((relationship) => relationship.navigation ? [relationship.navigation.href] : []);
  return [];
}

export function isAskActionApplicable(input: {
  action: AskAction;
  operationId: AskOperationId;
  propertyId?: string | null;
  householdRole: HouseholdRole | null;
  authoritativeSourceAvailable: boolean;
  trustedDynamicAction?: boolean;
}): boolean {
  const { action, operationId, propertyId, householdRole } = input;
  if (action.href && !isAskHrefSafeForProperty(action.href, propertyId)) return false;
  if (householdRole && !isAskActionAllowedForHouseholdRole(action, householdRole)) return false;
  const audienceAction = action.id === 'review-home-journey' && Boolean(householdRole);
  // Journey correction is a safe navigation action owned by audience policy,
  // not by an authoritative operation data source. It must remain available
  // when that policy is explaining why canonical execution did not run.
  if (audienceAction) return true;
  if (!input.authoritativeSourceAvailable) return false;

  // A property-scoped mutation cannot be presented without the audience policy
  // having established the viewer's role. This closes the former same-property
  // loophole while still allowing safe navigation actions.
  const mutation = /^(?:add|archive|cancel|change|complete|confirm|create|delete|disable|edit|enable|forget|invite|manage|mark|monitor|notify|pause|recalculate|record|remove|report|reschedule|run|save|schedule|send|set|start|stop|submit|unlink|update|upload)(?:[-_]|$)/i.test(action.id);
  if (getAskOperationDefinition(operationId).requiresProperty && mutation && !householdRole) return false;
  // A receipt's own "show me that record" question (exact match to receiptFollowUpAction) needs no per-operation entry.
  if (isReceiptFollowUpAction(action)) return true;
  const focusedHomeAction = operationId === 'HOME_ACTIONS' && action.id.startsWith('home-action-primary-');
  if (!input.trustedDynamicAction && !audienceAction && !focusedHomeAction
    && !(OPERATION_ACTION_IDS[operationId]?.has(action.id) ?? false)) return false;
  return true;
}
