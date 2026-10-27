import type { AskOperationId } from '../askOperationRegistry';

export interface OperationSpecificContinuationRecipe {
  label: string;
  message: string;
  operationId: AskOperationId;
  outcomeKey: string;
  reasonCode: string;
}
const recipe = (
  label: string,
  message: string,
  operationId: AskOperationId,
  outcomeKey: string,
  reasonCode: string,
): OperationSpecificContinuationRecipe => ({ label, message, operationId, outcomeKey, reasonCode });

/**
 * Phase 17 operation-specific continuation recipes. The key is the operation that produced the current result; every destination is
 * an existing typed Ask operation. These are domain continuations, not generic discovery starters, and are still rechecked by the
 * shared availability, authorization, lifecycle, deduplication and exact-four policy.
 */
export const OPERATION_SPECIFIC_CONTINUATION_RECIPES: Readonly<Partial<Record<AskOperationId, readonly OperationSpecificContinuationRecipe[]>>> = Object.freeze({
  MAINTENANCE_TASK_CREATE: [
    recipe('Review pending maintenance', 'What maintenance is pending?', 'MAINTENANCE_STATUS', 'REVIEW_MAINTENANCE_STATUS', 'TASK_CREATED_REVIEW_MAINTENANCE'),
    recipe('See what may be coming up', 'What maintenance might be coming up?', 'MAINTENANCE_FORECAST', 'REVIEW_MAINTENANCE_FORECAST', 'TASK_CREATED_REVIEW_FORECAST'),
  ],
  MAINTENANCE_TASK_COMPLETE: [
    recipe('Review pending maintenance', 'What maintenance is still pending?', 'MAINTENANCE_STATUS', 'REVIEW_MAINTENANCE_STATUS', 'TASK_COMPLETED_REVIEW_MAINTENANCE'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'TASK_COMPLETED_REVIEW_HOME_ACTIONS'),
  ],
  MAINTENANCE_STATUS: [
    recipe('See what may be coming up', 'What maintenance might be coming up?', 'MAINTENANCE_FORECAST', 'REVIEW_MAINTENANCE_FORECAST', 'MAINTENANCE_RELATED_FORECAST'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'MAINTENANCE_RELATED_HOME_ACTIONS'),
  ],
  MAINTENANCE_FORECAST: [
    recipe('Review pending maintenance', 'What maintenance is pending?', 'MAINTENANCE_STATUS', 'REVIEW_MAINTENANCE_STATUS', 'FORECAST_RELATED_MAINTENANCE'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'FORECAST_RELATED_HOME_ACTIONS'),
  ],
  MAINTENANCE_BUDGET_FORECAST: [
    recipe('Review the maintenance forecast', 'What maintenance might be coming up?', 'MAINTENANCE_FORECAST', 'REVIEW_MAINTENANCE_FORECAST', 'BUDGET_FORECAST_REVIEW_MAINTENANCE'),
    recipe('Review pending maintenance', 'What maintenance is pending?', 'MAINTENANCE_STATUS', 'REVIEW_MAINTENANCE_STATUS', 'BUDGET_FORECAST_REVIEW_STATUS'),
  ],
  MAINTENANCE_TEMPLATES_BROWSE: [
    recipe('Review pending maintenance', 'What maintenance is pending?', 'MAINTENANCE_STATUS', 'REVIEW_MAINTENANCE_STATUS', 'TEMPLATES_REVIEW_MAINTENANCE'),
    recipe('See what may be coming up', 'What maintenance might be coming up?', 'MAINTENANCE_FORECAST', 'REVIEW_MAINTENANCE_FORECAST', 'TEMPLATES_REVIEW_FORECAST'),
  ],
  HOME_ACTIONS: [
    recipe('Review pending maintenance', 'What maintenance is pending?', 'MAINTENANCE_STATUS', 'REVIEW_MAINTENANCE_STATUS', 'HOME_ACTIONS_RELATED_MAINTENANCE'),
    recipe('Review open inspection findings', 'Show my open inspection findings', 'INSPECTION_FINDINGS', 'REVIEW_INSPECTION_FINDINGS', 'HOME_ACTIONS_RELATED_INSPECTIONS'),
    recipe('Check recorded recalls', 'Show recalls that may affect my home', 'RECALL_REVIEW', 'REVIEW_RECALLS', 'HOME_ACTIONS_RELATED_RECALLS'),
  ],
  INVENTORY_LOOKUP: [
    recipe('Review recorded warranties', 'Show my recorded warranties', 'WARRANTY_LOOKUP', 'REVIEW_WARRANTIES', 'INVENTORY_RELATED_WARRANTIES'),
    recipe('Review home documents', 'Show my home documents', 'DOCUMENT_LOOKUP', 'REVIEW_DOCUMENTS', 'INVENTORY_RELATED_DOCUMENTS'),
    recipe('Check recorded recalls', 'Show recalls that may affect my home', 'RECALL_REVIEW', 'REVIEW_RECALLS', 'INVENTORY_RELATED_RECALLS'),
  ],
  WARRANTY_LOOKUP: [
    recipe('Review home inventory', 'Show my home inventory', 'INVENTORY_LOOKUP', 'REVIEW_HOME_INVENTORY', 'WARRANTY_RELATED_INVENTORY'),
    recipe('Review home documents', 'Show my home documents', 'DOCUMENT_LOOKUP', 'REVIEW_DOCUMENTS', 'WARRANTY_RELATED_DOCUMENTS'),
    recipe('Review coverage gaps', 'Show coverage gaps for my recorded items', 'COVERAGE_GAPS', 'REVIEW_COVERAGE_GAPS', 'WARRANTY_RELATED_COVERAGE'),
  ],
  DOCUMENT_LOOKUP: [
    recipe('Review extracted records', 'Show document-derived records awaiting review', 'DOCUMENT_PROMOTION_REVIEW', 'REVIEW_DOCUMENT_PROMOTIONS', 'DOCUMENTS_RELATED_PROMOTIONS'),
    recipe('Review recorded warranties', 'Show my recorded warranties', 'WARRANTY_LOOKUP', 'REVIEW_WARRANTIES', 'DOCUMENTS_RELATED_WARRANTIES'),
    recipe('Review home inventory', 'Show my home inventory', 'INVENTORY_LOOKUP', 'REVIEW_HOME_INVENTORY', 'DOCUMENTS_RELATED_INVENTORY'),
  ],
  DOCUMENT_PROMOTION_REVIEW: [
    recipe('Review home documents', 'Show my home documents', 'DOCUMENT_LOOKUP', 'REVIEW_DOCUMENTS', 'PROMOTIONS_RELATED_DOCUMENTS'),
    recipe('Review inspection findings', 'Show my inspection findings', 'INSPECTION_FINDINGS', 'REVIEW_INSPECTION_FINDINGS', 'PROMOTIONS_RELATED_INSPECTIONS'),
  ],
  DOCUMENT_PROMOTION_CONFIRM: [
    recipe('Review remaining extracted records', 'Show document-derived records awaiting review', 'DOCUMENT_PROMOTION_REVIEW', 'REVIEW_DOCUMENT_PROMOTIONS', 'PROMOTION_COMPLETED_REVIEW_REMAINING'),
    recipe('Review home documents', 'Show my home documents', 'DOCUMENT_LOOKUP', 'REVIEW_DOCUMENTS', 'PROMOTION_COMPLETED_REVIEW_DOCUMENTS'),
  ],
  RECALL_REVIEW: [
    recipe('Review home inventory', 'Show my home inventory', 'INVENTORY_LOOKUP', 'REVIEW_HOME_INVENTORY', 'RECALLS_RELATED_INVENTORY'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'RECALLS_RELATED_HOME_ACTIONS'),
  ],
  RECALL_MATCH_UPDATE: [
    recipe('Review remaining recalls', 'Show recalls that may affect my home', 'RECALL_REVIEW', 'REVIEW_RECALLS', 'RECALL_UPDATED_REVIEW_REMAINING'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'RECALL_UPDATED_REVIEW_HOME_ACTIONS'),
  ],
  INSPECTION_FINDINGS: [
    recipe('Review home documents', 'Show my home documents', 'DOCUMENT_LOOKUP', 'REVIEW_DOCUMENTS', 'INSPECTIONS_RELATED_DOCUMENTS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'INSPECTIONS_RELATED_HOME_ACTIONS'),
  ],
  INSPECTION_FINDING_UPDATE: [
    recipe('Review remaining findings', 'Show my open inspection findings', 'INSPECTION_FINDINGS', 'REVIEW_INSPECTION_FINDINGS', 'FINDING_UPDATED_REVIEW_REMAINING'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'FINDING_UPDATED_REVIEW_HOME_ACTIONS'),
  ],
  INSPECTION_FINDING_DECISION_COMMAND: [
    recipe('Review inspection findings', 'Show my inspection findings', 'INSPECTION_FINDINGS', 'REVIEW_INSPECTION_FINDINGS', 'FINDING_DECISION_REVIEW_FINDINGS'),
    recipe('Review inspection reports', 'Show my inspection reports', 'INSPECTION_REPORTS', 'REVIEW_INSPECTION_REPORTS', 'FINDING_DECISION_REVIEW_REPORTS'),
  ],
  INSPECTION_NEGOTIATION_PACKAGE: [
    recipe('Review inspection findings', 'Show my inspection findings', 'INSPECTION_FINDINGS', 'REVIEW_INSPECTION_FINDINGS', 'NEGOTIATION_PACKAGE_REVIEW_FINDINGS'),
    recipe('Review inspection reports', 'Show my inspection reports', 'INSPECTION_REPORTS', 'REVIEW_INSPECTION_REPORTS', 'NEGOTIATION_PACKAGE_REVIEW_REPORTS'),
  ],
  INSPECTION_REPORTS: [
    recipe('Review inspection findings', 'Show my inspection findings', 'INSPECTION_FINDINGS', 'REVIEW_INSPECTION_FINDINGS', 'REPORTS_REVIEW_FINDINGS'),
    recipe('Review related documents', 'Show my home documents', 'DOCUMENT_LOOKUP', 'REVIEW_DOCUMENTS', 'REPORTS_REVIEW_DOCUMENTS'),
  ],
  INSPECTION_REPORT_FINDINGS: [
    recipe('Review all inspection reports', 'Show my inspection reports', 'INSPECTION_REPORTS', 'REVIEW_INSPECTION_REPORTS', 'REPORT_FINDINGS_REVIEW_REPORTS'),
    recipe('Review tracked findings', 'Show my inspection findings', 'INSPECTION_FINDINGS', 'REVIEW_INSPECTION_FINDINGS', 'REPORT_FINDINGS_REVIEW_TRACKED'),
  ],
  INSPECTION_REPORT_COMPARE: [
    recipe('Review all inspection reports', 'Show my inspection reports', 'INSPECTION_REPORTS', 'REVIEW_INSPECTION_REPORTS', 'REPORT_COMPARE_REVIEW_REPORTS'),
    recipe('Review tracked findings', 'Show my inspection findings', 'INSPECTION_FINDINGS', 'REVIEW_INSPECTION_FINDINGS', 'REPORT_COMPARE_REVIEW_FINDINGS'),
  ],
  INSPECTION_REPORT_COMMAND: [
    recipe('Review inspection reports', 'Show my inspection reports', 'INSPECTION_REPORTS', 'REVIEW_INSPECTION_REPORTS', 'REPORT_UPDATED_REVIEW_REPORTS'),
    recipe('Review inspection findings', 'Show my inspection findings', 'INSPECTION_FINDINGS', 'REVIEW_INSPECTION_FINDINGS', 'REPORT_UPDATED_REVIEW_FINDINGS'),
  ],
  INCIDENT_CLAIM_STATUS: [
    recipe('Continue claim preparation', 'What should I do next for my active claim?', 'INCIDENT_CONTINUATION', 'CONTINUE_INCIDENT_WORK', 'CLAIMS_RELATED_CONTINUATION'),
    recipe('Review supporting documents', 'Show my home documents', 'DOCUMENT_LOOKUP', 'REVIEW_DOCUMENTS', 'CLAIMS_RELATED_DOCUMENTS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'CLAIMS_RELATED_HOME_ACTIONS'),
  ],
  INCIDENT_CONTINUATION: [
    recipe('Review claim status', 'Show my recorded claims', 'INCIDENT_CLAIM_STATUS', 'REVIEW_CLAIM_STATUS', 'INCIDENT_WORK_REVIEW_STATUS'),
    recipe('Review the claim checklist', 'Show the checklist for my active claim', 'CLAIM_CHECKLIST_VIEW', 'REVIEW_CLAIM_CHECKLIST', 'INCIDENT_WORK_REVIEW_CHECKLIST'),
  ],
  CLAIM_CHECKLIST_VIEW: [
    recipe('Review claim status', 'Show my recorded claims', 'INCIDENT_CLAIM_STATUS', 'REVIEW_CLAIM_STATUS', 'CLAIM_CHECKLIST_REVIEW_STATUS'),
    recipe('Continue claim preparation', 'What should I do next for my active claim?', 'INCIDENT_CONTINUATION', 'CONTINUE_INCIDENT_WORK', 'CLAIM_CHECKLIST_CONTINUE_WORK'),
  ],
  CLAIM_FILE: [
    recipe('Review recorded claims', 'Show my recorded claims', 'INCIDENT_CLAIM_STATUS', 'REVIEW_CLAIM_STATUS', 'CLAIM_FILED_REVIEW_STATUS'),
    recipe('Review the claim checklist', 'Show the checklist for my active claim', 'CLAIM_CHECKLIST_VIEW', 'REVIEW_CLAIM_CHECKLIST', 'CLAIM_FILED_REVIEW_CHECKLIST'),
  ],
  CLAIM_TRANSITION: [
    recipe('Review claim status', 'Show my recorded claims', 'INCIDENT_CLAIM_STATUS', 'REVIEW_CLAIM_STATUS', 'CLAIM_TRANSITIONED_REVIEW_STATUS'),
    recipe('Review the claim checklist', 'Show the checklist for my active claim', 'CLAIM_CHECKLIST_VIEW', 'REVIEW_CLAIM_CHECKLIST', 'CLAIM_TRANSITIONED_REVIEW_CHECKLIST'),
  ],
  CLAIM_ACTIVITY_COMMAND: [
    recipe('Review claim status', 'Show my recorded claims', 'INCIDENT_CLAIM_STATUS', 'REVIEW_CLAIM_STATUS', 'CLAIM_ACTIVITY_REVIEW_STATUS'),
    recipe('Continue the claim checklist', 'Show the checklist for my active claim', 'CLAIM_CHECKLIST_VIEW', 'REVIEW_CLAIM_CHECKLIST', 'CLAIM_ACTIVITY_REVIEW_CHECKLIST'),
  ],
  SEASONAL_CHECKLIST_SETUP: [
    recipe('Review this season', 'What should I take care of around my home this season?', 'SEASONAL_HOME_CARE', 'REVIEW_THIS_SEASON', 'SEASONAL_SETUP_REVIEW_CURRENT'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'SEASONAL_SETUP_REVIEW_HOME_ACTIONS'),
  ],
  SEASONAL_ITEM_COMMAND: [
    recipe('Review this season', 'What should I take care of around my home this season?', 'SEASONAL_HOME_CARE', 'REVIEW_THIS_SEASON', 'SEASONAL_ITEM_REVIEW_CURRENT'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'SEASONAL_ITEM_REVIEW_HOME_ACTIONS'),
  ],
  PROJECT_TRACKER_PROJECTS: [
    recipe('Review DIY projects', 'Show my DIY projects', 'DIY_PROJECTS', 'REVIEW_DIY_PROJECTS', 'PROJECTS_REVIEW_DIY'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'PROJECTS_REVIEW_HOME_ACTIONS'),
  ],
  PROJECT_TRACKER_CREATE: [
    recipe('Review tracked projects', 'Show my tracked projects', 'PROJECT_TRACKER_PROJECTS', 'REVIEW_PROJECTS', 'PROJECT_CREATED_REVIEW_PROJECTS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'PROJECT_CREATED_REVIEW_HOME_ACTIONS'),
  ],
  PROJECT_TRACKER_COMMAND: [
    recipe('Review tracked projects', 'Show my tracked projects', 'PROJECT_TRACKER_PROJECTS', 'REVIEW_PROJECTS', 'PROJECT_UPDATED_REVIEW_PROJECTS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'PROJECT_UPDATED_REVIEW_HOME_ACTIONS'),
  ],
  DIY_PROJECT_GUIDE: [
    recipe('Review DIY projects', 'Show my DIY projects', 'DIY_PROJECTS', 'REVIEW_DIY_PROJECTS', 'DIY_GUIDE_REVIEW_PROJECTS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'DIY_GUIDE_REVIEW_HOME_ACTIONS'),
  ],
  DIY_STEP_UPDATE: [
    recipe('Review DIY projects', 'Show my DIY projects', 'DIY_PROJECTS', 'REVIEW_DIY_PROJECTS', 'DIY_STEP_REVIEW_PROJECTS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'DIY_STEP_REVIEW_HOME_ACTIONS'),
  ],
  DIY_PROJECT_COMPLETE: [
    recipe('Review DIY projects', 'Show my DIY projects', 'DIY_PROJECTS', 'REVIEW_DIY_PROJECTS', 'DIY_COMPLETE_REVIEW_PROJECTS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'DIY_COMPLETE_REVIEW_HOME_ACTIONS'),
  ],
  DIY_PROJECT_ABANDON: [
    recipe('Review DIY projects', 'Show my DIY projects', 'DIY_PROJECTS', 'REVIEW_DIY_PROJECTS', 'DIY_ABANDON_REVIEW_PROJECTS'),
    recipe('Browse reviewed project ideas', 'Show reviewed DIY project ideas', 'DIY_TEMPLATE_BROWSE', 'BROWSE_REVIEWED_PROJECTS', 'DIY_ABANDON_BROWSE_TEMPLATES'),
  ],
  DIY_PROJECT_START: [
    recipe('Review DIY projects', 'Show my DIY projects', 'DIY_PROJECTS', 'REVIEW_DIY_PROJECTS', 'DIY_STARTED_REVIEW_PROJECTS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'DIY_STARTED_REVIEW_HOME_ACTIONS'),
  ],
  DIY_COMPLETION_RECOVER: [
    recipe('Review DIY projects', 'Show my DIY projects', 'DIY_PROJECTS', 'REVIEW_DIY_PROJECTS', 'DIY_RECOVERY_REVIEW_PROJECTS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'DIY_RECOVERY_REVIEW_HOME_ACTIONS'),
  ],
  DIY_PROJECT_NOTE_COMMAND: [
    recipe('Review DIY projects', 'Show my DIY projects', 'DIY_PROJECTS', 'REVIEW_DIY_PROJECTS', 'DIY_NOTE_REVIEW_PROJECTS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'DIY_NOTE_REVIEW_HOME_ACTIONS'),
  ],
  DIY_SKILL_PROFILE_COMMAND: [
    recipe('Browse reviewed project ideas', 'Show reviewed DIY project ideas', 'DIY_TEMPLATE_BROWSE', 'BROWSE_REVIEWED_PROJECTS', 'DIY_SKILLS_BROWSE_TEMPLATES'),
    recipe('Review DIY projects', 'Show my DIY projects', 'DIY_PROJECTS', 'REVIEW_DIY_PROJECTS', 'DIY_SKILLS_REVIEW_PROJECTS'),
  ],
  PLANT_CARE_OUTLOOK: [
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'PLANT_CARE_REVIEW_HOME_ACTIONS'),
    recipe('Review home inventory', 'Show my home inventory', 'INVENTORY_LOOKUP', 'REVIEW_HOME_INVENTORY', 'PLANT_CARE_REVIEW_INVENTORY'),
  ],
  ROOM_PLANT_RECOMMENDATIONS: [
    recipe('Review plant care', 'Show my plant care outlook', 'PLANT_CARE_OUTLOOK', 'REVIEW_PLANT_CARE', 'PLANT_RECOMMENDATIONS_REVIEW_CARE'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'PLANT_RECOMMENDATIONS_REVIEW_HOME_ACTIONS'),
  ],
  HOME_PLANT_ADD: [
    recipe('Review plant care', 'Show my plant care outlook', 'PLANT_CARE_OUTLOOK', 'REVIEW_PLANT_CARE', 'PLANT_ADDED_REVIEW_CARE'),
    recipe('Review home inventory', 'Show my home inventory', 'INVENTORY_LOOKUP', 'REVIEW_HOME_INVENTORY', 'PLANT_ADDED_REVIEW_INVENTORY'),
  ],
  HOME_HABIT_UPDATE: [
    recipe('Review home habits', 'Show my home habits', 'HOME_HABITS', 'REVIEW_HOME_HABITS', 'HABIT_UPDATED_REVIEW_HABITS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'HABIT_UPDATED_REVIEW_HOME_ACTIONS'),
  ],
  HOME_HABIT_PREFERENCES_COMMAND: [
    recipe('Review home habits', 'Show my home habits', 'HOME_HABITS', 'REVIEW_HOME_HABITS', 'HABIT_PREFERENCES_REVIEW_HABITS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'HABIT_PREFERENCES_REVIEW_HOME_ACTIONS'),
  ],
  HOME_HABITS_GENERATE: [
    recipe('Review home habits', 'Show my home habits', 'HOME_HABITS', 'REVIEW_HOME_HABITS', 'HABITS_GENERATED_REVIEW_HABITS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'HABITS_GENERATED_REVIEW_HOME_ACTIONS'),
  ],
  RENOVATION_PERMIT_READINESS: [
    recipe('Review permit status', 'Show my permit tracker status', 'PERMIT_TRACKER_STATUS', 'REVIEW_PERMITS', 'RENOVATION_READINESS_REVIEW_PERMITS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'RENOVATION_READINESS_REVIEW_HOME_ACTIONS'),
  ],
  RENOVATION_CASE_START: [
    recipe('Review renovation readiness', 'Show my renovation permit readiness', 'RENOVATION_PERMIT_READINESS', 'REVIEW_RENOVATION_READINESS', 'RENOVATION_STARTED_REVIEW_READINESS'),
    recipe('Review permit status', 'Show my permit tracker status', 'PERMIT_TRACKER_STATUS', 'REVIEW_PERMITS', 'RENOVATION_STARTED_REVIEW_PERMITS'),
  ],
  RENOVATION_READINESS_COMMAND: [
    recipe('Review renovation readiness', 'Show my renovation permit readiness', 'RENOVATION_PERMIT_READINESS', 'REVIEW_RENOVATION_READINESS', 'RENOVATION_UPDATED_REVIEW_READINESS'),
    recipe('Review permit status', 'Show my permit tracker status', 'PERMIT_TRACKER_STATUS', 'REVIEW_PERMITS', 'RENOVATION_UPDATED_REVIEW_PERMITS'),
  ],
  PERMIT_TRACKER_COMMAND: [
    recipe('Review permit status', 'Show my permit tracker status', 'PERMIT_TRACKER_STATUS', 'REVIEW_PERMITS', 'PERMIT_UPDATED_REVIEW_STATUS'),
    recipe('Review renovation readiness', 'Show my renovation permit readiness', 'RENOVATION_PERMIT_READINESS', 'REVIEW_RENOVATION_READINESS', 'PERMIT_UPDATED_REVIEW_READINESS'),
  ],
  PERMIT_TRACKER_STATUS: [
    recipe('Review renovation readiness', 'Show my renovation permit readiness', 'RENOVATION_PERMIT_READINESS', 'REVIEW_RENOVATION_READINESS', 'PERMIT_STATUS_REVIEW_READINESS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'PERMIT_STATUS_REVIEW_HOME_ACTIONS'),
  ],
  COVERAGE_GAPS: [
    recipe('Review coverage status', 'Show my coverage review status', 'COVERAGE_REVIEW_STATUS', 'REVIEW_COVERAGE_STATUS', 'COVERAGE_GAPS_REVIEW_STATUS'),
    recipe('Review recorded warranties', 'Show my recorded warranties', 'WARRANTY_LOOKUP', 'REVIEW_WARRANTIES', 'COVERAGE_GAPS_REVIEW_WARRANTIES'),
  ],
  COVERAGE_COMPARISON_STATUS: [
    recipe('Review coverage gaps', 'Show coverage gaps for my recorded items', 'COVERAGE_GAPS', 'REVIEW_COVERAGE_GAPS', 'COVERAGE_COMPARISON_REVIEW_GAPS'),
    recipe('Review coverage status', 'Show my coverage review status', 'COVERAGE_REVIEW_STATUS', 'REVIEW_COVERAGE_STATUS', 'COVERAGE_COMPARISON_REVIEW_STATUS'),
  ],
  COVERAGE_REVIEW_STATUS: [
    recipe('Review coverage gaps', 'Show coverage gaps for my recorded items', 'COVERAGE_GAPS', 'REVIEW_COVERAGE_GAPS', 'COVERAGE_STATUS_REVIEW_GAPS'),
    recipe('Review recorded warranties', 'Show my recorded warranties', 'WARRANTY_LOOKUP', 'REVIEW_WARRANTIES', 'COVERAGE_STATUS_REVIEW_WARRANTIES'),
  ],
  INSPECTION_REPORT_REVIEW: [
    recipe('Review guidance journeys', 'Show my guidance journeys', 'GUIDANCE_JOURNEYS_LIST', 'REVIEW_GUIDANCE_JOURNEYS', 'INSPECTION_REVIEW_REVIEW_JOURNEYS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'INSPECTION_REVIEW_REVIEW_HOME_ACTIONS'),
  ],
  GUIDANCE_STEP_DECLARE: [
    recipe('Review guidance journeys', 'Show my guidance journeys', 'GUIDANCE_JOURNEYS_LIST', 'REVIEW_GUIDANCE_JOURNEYS', 'GUIDANCE_STEP_DECLARE_REVIEW_JOURNEYS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'GUIDANCE_STEP_DECLARE_REVIEW_HOME_ACTIONS'),
  ],
  INSPECTION_FINDINGS_CHECK: [
    recipe('Review guidance journeys', 'Show my guidance journeys', 'GUIDANCE_JOURNEYS_LIST', 'REVIEW_GUIDANCE_JOURNEYS', 'INSPECTION_FINDINGS_CHECK_REVIEW_JOURNEYS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'INSPECTION_FINDINGS_CHECK_REVIEW_HOME_ACTIONS'),
  ],
  COVERAGE_RECORD_CHECK: [
    recipe('Review guidance journeys', 'Show my guidance journeys', 'GUIDANCE_JOURNEYS_LIST', 'REVIEW_GUIDANCE_JOURNEYS', 'COVERAGE_RECORD_CHECK_REVIEW_JOURNEYS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'COVERAGE_RECORD_CHECK_REVIEW_HOME_ACTIONS'),
  ],
  COVERAGE_TERM_REVIEW: [
    recipe('Review guidance journeys', 'Show my guidance journeys', 'GUIDANCE_JOURNEYS_LIST', 'REVIEW_GUIDANCE_JOURNEYS', 'COVERAGE_TERM_REVIEW_REVIEW_JOURNEYS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'COVERAGE_TERM_REVIEW_REVIEW_HOME_ACTIONS'),
  ],
  MAINTENANCE_EVIDENCE_ATTACH: [
    recipe('Review guidance journeys', 'Show my guidance journeys', 'GUIDANCE_JOURNEYS_LIST', 'REVIEW_GUIDANCE_JOURNEYS', 'MAINTENANCE_EVIDENCE_REVIEW_JOURNEYS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'MAINTENANCE_EVIDENCE_REVIEW_HOME_ACTIONS'),
  ],
  COVERAGE_ANALYSIS_RUN: [
    recipe('Review guidance journeys', 'Show my guidance journeys', 'GUIDANCE_JOURNEYS_LIST', 'REVIEW_GUIDANCE_JOURNEYS', 'COVERAGE_ANALYSIS_REVIEW_JOURNEYS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'COVERAGE_ANALYSIS_REVIEW_HOME_ACTIONS'),
  ],
  COVERAGE_COMMAND: [
    recipe('Review coverage status', 'Show my coverage review status', 'COVERAGE_REVIEW_STATUS', 'REVIEW_COVERAGE_STATUS', 'COVERAGE_UPDATED_REVIEW_STATUS'),
    recipe('Review coverage gaps', 'Show coverage gaps for my recorded items', 'COVERAGE_GAPS', 'REVIEW_COVERAGE_GAPS', 'COVERAGE_UPDATED_REVIEW_GAPS'),
  ],
  SAVINGS_OPPORTUNITIES: [
    recipe('Review ownership costs', 'Show my home ownership costs', 'OWNERSHIP_COSTS', 'REVIEW_OWNERSHIP_COSTS', 'SAVINGS_REVIEW_OWNERSHIP_COSTS'),
    recipe('Review capital outlook', 'Show my capital reserve outlook', 'CAPITAL_RESERVE_PLAN', 'REVIEW_CAPITAL_OUTLOOK', 'SAVINGS_REVIEW_CAPITAL'),
  ],
  SAVINGS_BENEFIT_COMMAND: [
    recipe('Review savings opportunities', 'Show savings opportunities for my home', 'SAVINGS_OPPORTUNITIES', 'REVIEW_SAVINGS', 'SAVINGS_UPDATED_REVIEW_OPPORTUNITIES'),
    recipe('Review ownership costs', 'Show my home ownership costs', 'OWNERSHIP_COSTS', 'REVIEW_OWNERSHIP_COSTS', 'SAVINGS_UPDATED_REVIEW_COSTS'),
  ],
  OWNERSHIP_COSTS: [
    recipe('Review savings opportunities', 'Show savings opportunities for my home', 'SAVINGS_OPPORTUNITIES', 'REVIEW_SAVINGS', 'OWNERSHIP_COSTS_REVIEW_SAVINGS'),
    recipe('Review capital outlook', 'Show my capital reserve outlook', 'CAPITAL_RESERVE_PLAN', 'REVIEW_CAPITAL_OUTLOOK', 'OWNERSHIP_COSTS_REVIEW_CAPITAL'),
  ],
  OWNERSHIP_COST_COMMAND: [
    recipe('Review ownership costs', 'Show my home ownership costs', 'OWNERSHIP_COSTS', 'REVIEW_OWNERSHIP_COSTS', 'OWNERSHIP_COST_UPDATED_REVIEW_COSTS'),
    recipe('Review savings opportunities', 'Show savings opportunities for my home', 'SAVINGS_OPPORTUNITIES', 'REVIEW_SAVINGS', 'OWNERSHIP_COST_UPDATED_REVIEW_SAVINGS'),
  ],
  FINANCING_OVERVIEW: [
    recipe('Review refinance options', 'Show my refinance analysis', 'REFINANCE_ANALYSIS', 'REVIEW_REFINANCE', 'FINANCING_REVIEW_REFINANCE'),
    recipe('Review ownership costs', 'Show my home ownership costs', 'OWNERSHIP_COSTS', 'REVIEW_OWNERSHIP_COSTS', 'FINANCING_REVIEW_OWNERSHIP_COSTS'),
  ],
  FINANCING_PROFILE_COMMAND: [
    recipe('Review financing overview', 'Show my home financing overview', 'FINANCING_OVERVIEW', 'REVIEW_FINANCING', 'FINANCING_PROFILE_REVIEW_OVERVIEW'),
    recipe('Review refinance options', 'Show my refinance analysis', 'REFINANCE_ANALYSIS', 'REVIEW_REFINANCE', 'FINANCING_PROFILE_REVIEW_REFINANCE'),
  ],
  REFINANCE_ANALYSIS: [
    recipe('Review financing overview', 'Show my home financing overview', 'FINANCING_OVERVIEW', 'REVIEW_FINANCING', 'REFINANCE_REVIEW_FINANCING'),
    recipe('Review ownership costs', 'Show my home ownership costs', 'OWNERSHIP_COSTS', 'REVIEW_OWNERSHIP_COSTS', 'REFINANCE_REVIEW_OWNERSHIP_COSTS'),
  ],
  REFINANCE_RATE_MONITOR: [
    recipe('Review refinance options', 'Show my refinance analysis', 'REFINANCE_ANALYSIS', 'REVIEW_REFINANCE', 'REFINANCE_MONITOR_REVIEW_ANALYSIS'),
    recipe('Review financing overview', 'Show my home financing overview', 'FINANCING_OVERVIEW', 'REVIEW_FINANCING', 'REFINANCE_MONITOR_REVIEW_FINANCING'),
  ],
  CAPITAL_RESERVE_PLAN: [
    recipe('Review ownership costs', 'Show my home ownership costs', 'OWNERSHIP_COSTS', 'REVIEW_OWNERSHIP_COSTS', 'CAPITAL_PLAN_REVIEW_OWNERSHIP_COSTS'),
    recipe('Review maintenance forecast', 'What maintenance might be coming up?', 'MAINTENANCE_FORECAST', 'REVIEW_MAINTENANCE_FORECAST', 'CAPITAL_PLAN_REVIEW_MAINTENANCE'),
  ],
  CAPITAL_TIMELINE_COMMAND: [
    recipe('Review capital outlook', 'Show my capital reserve outlook', 'CAPITAL_RESERVE_PLAN', 'REVIEW_CAPITAL_OUTLOOK', 'CAPITAL_UPDATED_REVIEW_PLAN'),
    recipe('Review maintenance forecast', 'What maintenance might be coming up?', 'MAINTENANCE_FORECAST', 'REVIEW_MAINTENANCE_FORECAST', 'CAPITAL_UPDATED_REVIEW_MAINTENANCE'),
  ],
  PROPERTY_TAX_APPEAL_READINESS: [
    recipe('Review ownership costs', 'Show my home ownership costs', 'OWNERSHIP_COSTS', 'REVIEW_OWNERSHIP_COSTS', 'TAX_APPEAL_REVIEW_OWNERSHIP_COSTS'),
    recipe('Review financing overview', 'Show my home financing overview', 'FINANCING_OVERVIEW', 'REVIEW_FINANCING', 'TAX_APPEAL_REVIEW_FINANCING'),
  ],
  PROPERTY_TAX_APPEAL_COMMAND: [
    recipe('Review appeal readiness', 'Show my property tax appeal readiness', 'PROPERTY_TAX_APPEAL_READINESS', 'REVIEW_TAX_APPEAL', 'TAX_APPEAL_UPDATED_REVIEW_READINESS'),
    recipe('Review ownership costs', 'Show my home ownership costs', 'OWNERSHIP_COSTS', 'REVIEW_OWNERSHIP_COSTS', 'TAX_APPEAL_UPDATED_REVIEW_COSTS'),
  ],
  PROPERTY_TAX_COMPARABLE_COMMAND: [
    recipe('Review appeal readiness', 'Show my property tax appeal readiness', 'PROPERTY_TAX_APPEAL_READINESS', 'REVIEW_TAX_APPEAL', 'TAX_COMPARABLE_REVIEW_READINESS'),
    recipe('Review ownership costs', 'Show my home ownership costs', 'OWNERSHIP_COSTS', 'REVIEW_OWNERSHIP_COSTS', 'TAX_COMPARABLE_REVIEW_COSTS'),
  ],
  SERVICE_PRICE_CHECKS: [
    recipe('Review quote comparisons', 'Show my quote comparisons', 'QUOTE_COMPARISON_REVIEW', 'REVIEW_QUOTES', 'SERVICE_PRICES_REVIEW_QUOTES'),
    recipe('Review finalized prices', 'Show my finalized service prices', 'PRICE_FINALIZATIONS_LIST', 'REVIEW_PRICE_FINALIZATIONS', 'SERVICE_PRICES_REVIEW_FINALIZED'),
  ],
  SERVICE_PRICE_CHECK_RUN: [
    recipe('Review service price checks', 'Show my service price checks', 'SERVICE_PRICE_CHECKS', 'REVIEW_SERVICE_PRICES', 'PRICE_CHECK_REVIEW_CHECKS'),
    recipe('Review quote comparisons', 'Show my quote comparisons', 'QUOTE_COMPARISON_REVIEW', 'REVIEW_QUOTES', 'PRICE_CHECK_REVIEW_QUOTES'),
  ],
  QUOTE_COMPARISON_CREATE: [
    recipe('Review quote comparisons', 'Show my quote comparisons', 'QUOTE_COMPARISON_REVIEW', 'REVIEW_QUOTES', 'QUOTE_CREATED_REVIEW_QUOTES'),
    recipe('Review service price checks', 'Show my service price checks', 'SERVICE_PRICE_CHECKS', 'REVIEW_SERVICE_PRICES', 'QUOTE_CREATED_REVIEW_PRICES'),
  ],
  QUOTE_COMPARISON_REVIEW: [
    recipe('Review service price checks', 'Show my service price checks', 'SERVICE_PRICE_CHECKS', 'REVIEW_SERVICE_PRICES', 'QUOTES_REVIEW_SERVICE_PRICES'),
    recipe('Review finalized prices', 'Show my finalized service prices', 'PRICE_FINALIZATIONS_LIST', 'REVIEW_PRICE_FINALIZATIONS', 'QUOTES_REVIEW_FINALIZED_PRICES'),
  ],
  QUOTE_COMPARISON_COMMAND: [
    recipe('Review quote comparisons', 'Show my quote comparisons', 'QUOTE_COMPARISON_REVIEW', 'REVIEW_QUOTES', 'QUOTE_UPDATED_REVIEW_QUOTES'),
    recipe('Review service price checks', 'Show my service price checks', 'SERVICE_PRICE_CHECKS', 'REVIEW_SERVICE_PRICES', 'QUOTE_UPDATED_REVIEW_PRICES'),
  ],
  PRICE_FINALIZATIONS_LIST: [
    recipe('Review quote comparisons', 'Show my quote comparisons', 'QUOTE_COMPARISON_REVIEW', 'REVIEW_QUOTES', 'FINALIZED_PRICES_REVIEW_QUOTES'),
    recipe('Review service price checks', 'Show my service price checks', 'SERVICE_PRICE_CHECKS', 'REVIEW_SERVICE_PRICES', 'FINALIZED_PRICES_REVIEW_CHECKS'),
  ],
  PRICE_FINALIZATION_COMMAND: [
    recipe('Review finalized prices', 'Show my finalized service prices', 'PRICE_FINALIZATIONS_LIST', 'REVIEW_PRICE_FINALIZATIONS', 'PRICE_FINALIZED_REVIEW_RECORDS'),
    recipe('Review quote comparisons', 'Show my quote comparisons', 'QUOTE_COMPARISON_REVIEW', 'REVIEW_QUOTES', 'PRICE_FINALIZED_REVIEW_QUOTES'),
  ],
  REPLACEMENT_GUIDANCE: [
    recipe('Review home inventory', 'Show my home inventory', 'INVENTORY_LOOKUP', 'REVIEW_HOME_INVENTORY', 'REPLACEMENT_REVIEW_INVENTORY'),
    recipe('Review recorded warranties', 'Show my recorded warranties', 'WARRANTY_LOOKUP', 'REVIEW_WARRANTIES', 'REPLACEMENT_REVIEW_WARRANTIES'),
  ],
  GUIDANCE_JOURNEYS_LIST: [
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'GUIDANCE_LIST_REVIEW_HOME_ACTIONS'),
    recipe('Review home summary', 'Show my home summary', 'PROPERTY_SUMMARY', 'REVIEW_HOME_SUMMARY', 'GUIDANCE_LIST_REVIEW_HOME'),
  ],
  GUIDANCE_JOURNEY_CONTINUE: [
    recipe('Review guidance journeys', 'Show my guidance journeys', 'GUIDANCE_JOURNEYS_LIST', 'REVIEW_GUIDANCE_JOURNEYS', 'GUIDANCE_CONTINUE_REVIEW_JOURNEYS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'GUIDANCE_CONTINUE_REVIEW_HOME_ACTIONS'),
  ],
  GUIDANCE_STEP_SKIP: [
    recipe('Review guidance journeys', 'Show my guidance journeys', 'GUIDANCE_JOURNEYS_LIST', 'REVIEW_GUIDANCE_JOURNEYS', 'GUIDANCE_SKIP_REVIEW_JOURNEYS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'GUIDANCE_SKIP_REVIEW_HOME_ACTIONS'),
  ],
  GUIDANCE_STEP_ACKNOWLEDGE: [
    recipe('Review guidance journeys', 'Show my guidance journeys', 'GUIDANCE_JOURNEYS_LIST', 'REVIEW_GUIDANCE_JOURNEYS', 'GUIDANCE_ACKNOWLEDGE_REVIEW_JOURNEYS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'GUIDANCE_ACKNOWLEDGE_REVIEW_HOME_ACTIONS'),
  ],
  GUIDANCE_JOURNEY_DISMISS: [
    recipe('Review guidance journeys', 'Show my guidance journeys', 'GUIDANCE_JOURNEYS_LIST', 'REVIEW_GUIDANCE_JOURNEYS', 'GUIDANCE_DISMISS_REVIEW_JOURNEYS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'GUIDANCE_DISMISS_REVIEW_HOME_ACTIONS'),
  ],
  GUIDANCE_JOURNEY_CREATE: [
    recipe('Review guidance journeys', 'Show my guidance journeys', 'GUIDANCE_JOURNEYS_LIST', 'REVIEW_GUIDANCE_JOURNEYS', 'GUIDANCE_CREATED_REVIEW_JOURNEYS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'GUIDANCE_CREATED_REVIEW_HOME_ACTIONS'),
  ],
  NEGOTIATION_SHIELD_CASES: [
    recipe('Review supporting documents', 'Show my home documents', 'DOCUMENT_LOOKUP', 'REVIEW_DOCUMENTS', 'NEGOTIATION_CASES_REVIEW_DOCUMENTS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'NEGOTIATION_CASES_REVIEW_HOME_ACTIONS'),
  ],
  NEGOTIATION_SHIELD_CASE_START: [
    recipe('Review negotiation cases', 'Show my negotiation cases', 'NEGOTIATION_SHIELD_CASES', 'REVIEW_NEGOTIATION_CASES', 'NEGOTIATION_STARTED_REVIEW_CASES'),
    recipe('Review supporting documents', 'Show my home documents', 'DOCUMENT_LOOKUP', 'REVIEW_DOCUMENTS', 'NEGOTIATION_STARTED_REVIEW_DOCUMENTS'),
  ],
  NEGOTIATION_SHIELD_BUYER_COMMAND: [
    recipe('Review negotiation cases', 'Show my negotiation cases', 'NEGOTIATION_SHIELD_CASES', 'REVIEW_NEGOTIATION_CASES', 'NEGOTIATION_BUYER_REVIEW_CASES'),
    recipe('Review supporting documents', 'Show my home documents', 'DOCUMENT_LOOKUP', 'REVIEW_DOCUMENTS', 'NEGOTIATION_BUYER_REVIEW_DOCUMENTS'),
  ],
  NEGOTIATION_SHIELD_CASE_ATTACH: [
    recipe('Review negotiation cases', 'Show my negotiation cases', 'NEGOTIATION_SHIELD_CASES', 'REVIEW_NEGOTIATION_CASES', 'NEGOTIATION_ATTACHMENT_REVIEW_CASES'),
    recipe('Review supporting documents', 'Show my home documents', 'DOCUMENT_LOOKUP', 'REVIEW_DOCUMENTS', 'NEGOTIATION_ATTACHMENT_REVIEW_DOCUMENTS'),
  ],
  NEGOTIATION_SHIELD_CASE_UPDATE: [
    recipe('Review negotiation cases', 'Show my negotiation cases', 'NEGOTIATION_SHIELD_CASES', 'REVIEW_NEGOTIATION_CASES', 'NEGOTIATION_UPDATED_REVIEW_CASES'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'NEGOTIATION_UPDATED_REVIEW_HOME_ACTIONS'),
  ],
  NEGOTIATION_SHIELD_CASE_ANALYZE: [
    recipe('Review negotiation cases', 'Show my negotiation cases', 'NEGOTIATION_SHIELD_CASES', 'REVIEW_NEGOTIATION_CASES', 'NEGOTIATION_ANALYZED_REVIEW_CASES'),
    recipe('Review supporting documents', 'Show my home documents', 'DOCUMENT_LOOKUP', 'REVIEW_DOCUMENTS', 'NEGOTIATION_ANALYZED_REVIEW_DOCUMENTS'),
  ],
  SELL_HOLD_RENT_ANALYSIS: [
    recipe('Review home summary', 'Show my home summary', 'PROPERTY_SUMMARY', 'REVIEW_HOME_SUMMARY', 'SELL_HOLD_RENT_REVIEW_HOME'),
    recipe('Review ownership costs', 'Show my home ownership costs', 'OWNERSHIP_COSTS', 'REVIEW_OWNERSHIP_COSTS', 'SELL_HOLD_RENT_REVIEW_COSTS'),
  ],
  SELL_HOLD_RENT_GOAL_CAPTURE: [
    recipe('Continue sell, hold, or rent planning', 'Continue my sell, hold, or rent plan', 'SELL_HOLD_RENT_ANALYSIS', 'CONTINUE_SELL_HOLD_RENT_PLAN', 'SELL_HOLD_RENT_GOAL_CONTINUE'),
    recipe('Review home summary', 'Show my home summary', 'PROPERTY_SUMMARY', 'REVIEW_HOME_SUMMARY', 'SELL_HOLD_RENT_GOAL_REVIEW_HOME'),
  ],
  SELLER_PREP_CHECKLIST: [
    recipe('Review home summary', 'Show my home summary', 'PROPERTY_SUMMARY', 'REVIEW_HOME_SUMMARY', 'SELLER_PREP_REVIEW_HOME'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'SELLER_PREP_REVIEW_HOME_ACTIONS'),
  ],
  SELLER_PREP_ITEM_DECISION: [
    recipe('Review seller preparation', 'Show my seller preparation checklist', 'SELLER_PREP_CHECKLIST', 'REVIEW_SELLER_PREP', 'SELLER_ITEM_REVIEW_CHECKLIST'),
    recipe('Review home summary', 'Show my home summary', 'PROPERTY_SUMMARY', 'REVIEW_HOME_SUMMARY', 'SELLER_ITEM_REVIEW_HOME'),
  ],
  SELLER_PREP_CASE_COMMAND: [
    recipe('Review seller preparation', 'Show my seller preparation checklist', 'SELLER_PREP_CHECKLIST', 'REVIEW_SELLER_PREP', 'SELLER_CASE_REVIEW_CHECKLIST'),
    recipe('Review home summary', 'Show my home summary', 'PROPERTY_SUMMARY', 'REVIEW_HOME_SUMMARY', 'SELLER_CASE_REVIEW_HOME'),
  ],
  MAJOR_EVENT_ENTRY: [
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'MAJOR_EVENT_REVIEW_HOME_ACTIONS'),
    recipe('Review home summary', 'Show my home summary', 'PROPERTY_SUMMARY', 'REVIEW_HOME_SUMMARY', 'MAJOR_EVENT_REVIEW_HOME'),
  ],
  HVAC_DECISION_START: [
    recipe('Continue the HVAC decision', 'Continue my HVAC repair-or-replace decision', 'HVAC_DECISION_CONTINUE', 'CONTINUE_ACTIVE_HVAC_DECISION', 'HVAC_STARTED_CONTINUE'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'HVAC_STARTED_REVIEW_HOME_ACTIONS'),
  ],
  HVAC_DECISION_CONTINUE: [
    recipe('Compare an HVAC scenario', 'Show an HVAC repair-or-replace scenario', 'HVAC_DECISION_SCENARIO', 'REVIEW_HVAC_SCENARIO', 'HVAC_CONTINUE_REVIEW_SCENARIO'),
    recipe('Review recorded HVAC outcome', 'Show my recorded HVAC decision outcome', 'HVAC_DECISION_OUTCOME_VIEW', 'REVIEW_HVAC_OUTCOME', 'HVAC_CONTINUE_REVIEW_OUTCOME'),
  ],
  HVAC_SPECIALIST_ENGAGE: [
    recipe('Continue the HVAC decision', 'Continue my HVAC repair-or-replace decision', 'HVAC_DECISION_CONTINUE', 'CONTINUE_ACTIVE_HVAC_DECISION', 'HVAC_SPECIALIST_CONTINUE'),
    recipe('Review recorded HVAC outcome', 'Show my recorded HVAC decision outcome', 'HVAC_DECISION_OUTCOME_VIEW', 'REVIEW_HVAC_OUTCOME', 'HVAC_SPECIALIST_REVIEW_OUTCOME'),
  ],
  HVAC_DECISION_SCENARIO: [
    recipe('Continue the HVAC decision', 'Continue my HVAC repair-or-replace decision', 'HVAC_DECISION_CONTINUE', 'CONTINUE_ACTIVE_HVAC_DECISION', 'HVAC_SCENARIO_CONTINUE'),
    recipe('Review recorded HVAC outcome', 'Show my recorded HVAC decision outcome', 'HVAC_DECISION_OUTCOME_VIEW', 'REVIEW_HVAC_OUTCOME', 'HVAC_SCENARIO_REVIEW_OUTCOME'),
  ],
  HVAC_DECISION_ABANDON: [
    recipe('Review replacement guidance', 'Should I repair or replace a major home system?', 'REPLACEMENT_GUIDANCE', 'REVIEW_REPLACEMENT', 'HVAC_ABANDON_REVIEW_REPLACEMENT'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'HVAC_ABANDON_REVIEW_HOME_ACTIONS'),
  ],
  HVAC_PREFERENCE_SAVE: [
    recipe('Continue the HVAC decision', 'Continue my HVAC repair-or-replace decision', 'HVAC_DECISION_CONTINUE', 'CONTINUE_ACTIVE_HVAC_DECISION', 'HVAC_PREFERENCE_CONTINUE'),
    recipe('Review replacement guidance', 'Should I repair or replace a major home system?', 'REPLACEMENT_GUIDANCE', 'REVIEW_REPLACEMENT', 'HVAC_PREFERENCE_REVIEW_REPLACEMENT'),
  ],
  HVAC_PREFERENCE_FORGET: [
    recipe('Continue the HVAC decision', 'Continue my HVAC repair-or-replace decision', 'HVAC_DECISION_CONTINUE', 'CONTINUE_ACTIVE_HVAC_DECISION', 'HVAC_PREFERENCE_FORGOTTEN_CONTINUE'),
    recipe('Review replacement guidance', 'Should I repair or replace a major home system?', 'REPLACEMENT_GUIDANCE', 'REVIEW_REPLACEMENT', 'HVAC_PREFERENCE_FORGOTTEN_REVIEW_REPLACEMENT'),
  ],
  HVAC_DECISION_OUTCOME_REPORT: [
    recipe('Review recorded HVAC outcome', 'Show my recorded HVAC decision outcome', 'HVAC_DECISION_OUTCOME_VIEW', 'REVIEW_HVAC_OUTCOME', 'HVAC_OUTCOME_REPORTED_REVIEW'),
    recipe('Continue the HVAC decision', 'Continue my HVAC repair-or-replace decision', 'HVAC_DECISION_CONTINUE', 'CONTINUE_ACTIVE_HVAC_DECISION', 'HVAC_OUTCOME_REPORTED_CONTINUE'),
  ],
  HVAC_DECISION_OUTCOME_VIEW: [
    recipe('Continue the HVAC decision', 'Continue my HVAC repair-or-replace decision', 'HVAC_DECISION_CONTINUE', 'CONTINUE_ACTIVE_HVAC_DECISION', 'HVAC_OUTCOME_VIEW_CONTINUE'),
    recipe('Review replacement guidance', 'Should I repair or replace a major home system?', 'REPLACEMENT_GUIDANCE', 'REVIEW_REPLACEMENT', 'HVAC_OUTCOME_VIEW_REPLACEMENT'),
  ],
  HVAC_DECISION_OUTCOME_UNLINK: [
    recipe('Review recorded HVAC outcome', 'Show my recorded HVAC decision outcome', 'HVAC_DECISION_OUTCOME_VIEW', 'REVIEW_HVAC_OUTCOME', 'HVAC_OUTCOME_UNLINKED_REVIEW'),
    recipe('Continue the HVAC decision', 'Continue my HVAC repair-or-replace decision', 'HVAC_DECISION_CONTINUE', 'CONTINUE_ACTIVE_HVAC_DECISION', 'HVAC_OUTCOME_UNLINKED_CONTINUE'),
  ],
  BUYER_PLAN_STATUS: [
    recipe('Review closing deadlines', 'What is due before closing?', 'BUYER_DEADLINES', 'REVIEW_BUYER_DEADLINES', 'BUYER_PLAN_REVIEW_DEADLINES'),
    recipe('Prepare for closing day', 'What do I need for closing day?', 'BUYER_CLOSING_DAY_READINESS', 'REVIEW_BUYER_CLOSING_DAY', 'BUYER_PLAN_REVIEW_CLOSING_DAY'),
  ],
  BUYER_DEADLINES: [
    recipe('Review contract dates', 'Show my confirmed contract timeline', 'BUYER_CONTRACT_TIMELINE', 'REVIEW_BUYER_CONTRACT_TIMELINE', 'BUYER_DEADLINES_REVIEW_CONTRACT'),
    recipe('Review the closing plan', 'What should I do next for this purchase?', 'BUYER_PLAN_STATUS', 'REVIEW_BUYER_PLAN', 'BUYER_DEADLINES_REVIEW_PLAN'),
  ],
  BUYER_DOCUMENT_READINESS: [
    recipe('Review title and escrow', 'What is still open with title or escrow?', 'BUYER_TITLE_ESCROW_READINESS', 'REVIEW_BUYER_TITLE_ESCROW', 'BUYER_DOCUMENTS_REVIEW_TITLE'),
    recipe('Review the closing plan', 'What should I do next for this purchase?', 'BUYER_PLAN_STATUS', 'REVIEW_BUYER_PLAN', 'BUYER_DOCUMENTS_REVIEW_PLAN'),
  ],
  BUYER_INSPECTION_REVIEW: [
    recipe('Review negotiation readiness', 'What should I discuss with my agent about the inspection?', 'BUYER_NEGOTIATION_READINESS', 'REVIEW_BUYER_NEGOTIATION', 'BUYER_INSPECTION_REVIEW_NEGOTIATION'),
    recipe('Review the closing plan', 'What should I do next for this purchase?', 'BUYER_PLAN_STATUS', 'REVIEW_BUYER_PLAN', 'BUYER_INSPECTION_REVIEW_PLAN'),
  ],
  BUYER_FINANCING_READINESS: [
    recipe('Review loan estimates', 'Show my purchase Loan Estimates', 'BUYER_LOAN_ESTIMATES', 'REVIEW_BUYER_LOAN_ESTIMATES', 'BUYER_FINANCING_REVIEW_ESTIMATES'),
    recipe('Review closing funds', 'Show my Closing Disclosure and funds readiness', 'BUYER_DISCLOSURE_FUNDS_READINESS', 'REVIEW_BUYER_DISCLOSURE_FUNDS', 'BUYER_FINANCING_REVIEW_FUNDS'),
  ],
  BUYER_TITLE_ESCROW_READINESS: [
    recipe('Review closing documents', 'Which closing records am I still missing?', 'BUYER_DOCUMENT_READINESS', 'REVIEW_BUYER_DOCUMENTS', 'BUYER_TITLE_REVIEW_DOCUMENTS'),
    recipe('Prepare for closing day', 'What do I need for closing day?', 'BUYER_CLOSING_DAY_READINESS', 'REVIEW_BUYER_CLOSING_DAY', 'BUYER_TITLE_REVIEW_CLOSING_DAY'),
  ],
  BUYER_WALKTHROUGH_READINESS: [
    recipe('Prepare for closing day', 'What do I need for closing day?', 'BUYER_CLOSING_DAY_READINESS', 'REVIEW_BUYER_CLOSING_DAY', 'BUYER_WALKTHROUGH_REVIEW_CLOSING_DAY'),
    recipe('Review inspection decisions', 'Which inspection findings still need a decision?', 'BUYER_INSPECTION_REVIEW', 'REVIEW_BUYER_INSPECTION', 'BUYER_WALKTHROUGH_REVIEW_INSPECTION'),
  ],
  BUYER_DISCLOSURE_FUNDS_READINESS: [
    recipe('Review financing readiness', 'What financing item could delay closing?', 'BUYER_FINANCING_READINESS', 'REVIEW_BUYER_FINANCING', 'BUYER_FUNDS_REVIEW_FINANCING'),
    recipe('Prepare for closing day', 'What do I need for closing day?', 'BUYER_CLOSING_DAY_READINESS', 'REVIEW_BUYER_CLOSING_DAY', 'BUYER_FUNDS_REVIEW_CLOSING_DAY'),
  ],
  BUYER_CLOSING_DAY_READINESS: [
    recipe('Review closing deadlines', 'What is due before closing?', 'BUYER_DEADLINES', 'REVIEW_BUYER_DEADLINES', 'BUYER_CLOSING_DAY_REVIEW_DEADLINES'),
    recipe('Review move readiness', 'What should I do before move-in?', 'BUYER_MOVE_STATUS', 'REVIEW_BUYER_MOVE', 'BUYER_CLOSING_DAY_REVIEW_MOVE'),
  ],
  BUYER_CONTRACT_TIMELINE: [
    recipe('Review closing deadlines', 'What is due before closing?', 'BUYER_DEADLINES', 'REVIEW_BUYER_DEADLINES', 'BUYER_CONTRACT_REVIEW_DEADLINES'),
    recipe('Review the closing plan', 'What should I do next for this purchase?', 'BUYER_PLAN_STATUS', 'REVIEW_BUYER_PLAN', 'BUYER_CONTRACT_REVIEW_PLAN'),
  ],
  BUYER_NEGOTIATION_READINESS: [
    recipe('Review inspection decisions', 'Which inspection findings still need a decision?', 'BUYER_INSPECTION_REVIEW', 'REVIEW_BUYER_INSPECTION', 'BUYER_NEGOTIATION_REVIEW_INSPECTION'),
    recipe('Review the closing plan', 'What should I do next for this purchase?', 'BUYER_PLAN_STATUS', 'REVIEW_BUYER_PLAN', 'BUYER_NEGOTIATION_REVIEW_PLAN'),
  ],
  BUYER_COST_READINESS: [
    recipe('Review closing funds', 'Show my Closing Disclosure and funds readiness', 'BUYER_DISCLOSURE_FUNDS_READINESS', 'REVIEW_BUYER_DISCLOSURE_FUNDS', 'BUYER_COST_REVIEW_FUNDS'),
    recipe('Review move readiness', 'What should I do before move-in?', 'BUYER_MOVE_STATUS', 'REVIEW_BUYER_MOVE', 'BUYER_COST_REVIEW_MOVE'),
  ],
  BUYER_MOVE_STATUS: [
    recipe('Review closing deadlines', 'What is due before closing?', 'BUYER_DEADLINES', 'REVIEW_BUYER_DEADLINES', 'BUYER_MOVE_REVIEW_DEADLINES'),
    recipe('Prepare for closing day', 'What do I need for closing day?', 'BUYER_CLOSING_DAY_READINESS', 'REVIEW_BUYER_CLOSING_DAY', 'BUYER_MOVE_REVIEW_CLOSING_DAY'),
  ],
  BUYER_LOAN_ESTIMATES: [
    recipe('Review financing readiness', 'What financing item could delay closing?', 'BUYER_FINANCING_READINESS', 'REVIEW_BUYER_FINANCING', 'BUYER_ESTIMATES_REVIEW_FINANCING'),
    recipe('Review closing funds', 'Show my Closing Disclosure and funds readiness', 'BUYER_DISCLOSURE_FUNDS_READINESS', 'REVIEW_BUYER_DISCLOSURE_FUNDS', 'BUYER_ESTIMATES_REVIEW_FUNDS'),
  ],
  BUYER_INSURANCE_READINESS: [
    recipe('Review financing readiness', 'What financing item could delay closing?', 'BUYER_FINANCING_READINESS', 'REVIEW_BUYER_FINANCING', 'BUYER_INSURANCE_REVIEW_FINANCING'),
    recipe('Review closing documents', 'Which closing records am I still missing?', 'BUYER_DOCUMENT_READINESS', 'REVIEW_BUYER_DOCUMENTS', 'BUYER_INSURANCE_REVIEW_DOCUMENTS'),
  ],
  BUYER_CONTRACT_COMMAND: [
    recipe('Review contract dates', 'Show my confirmed contract timeline', 'BUYER_CONTRACT_TIMELINE', 'REVIEW_BUYER_CONTRACT_TIMELINE', 'BUYER_CONTRACT_UPDATED_REVIEW_TIMELINE'),
    recipe('Review closing deadlines', 'What is due before closing?', 'BUYER_DEADLINES', 'REVIEW_BUYER_DEADLINES', 'BUYER_CONTRACT_UPDATED_REVIEW_DEADLINES'),
  ],
  BUYER_CLOSING_DISCLOSURE_COMMAND: [
    recipe('Review closing funds', 'Show my Closing Disclosure and funds readiness', 'BUYER_DISCLOSURE_FUNDS_READINESS', 'REVIEW_BUYER_DISCLOSURE_FUNDS', 'BUYER_DISCLOSURE_UPDATED_REVIEW_FUNDS'),
    recipe('Prepare for closing day', 'What do I need for closing day?', 'BUYER_CLOSING_DAY_READINESS', 'REVIEW_BUYER_CLOSING_DAY', 'BUYER_DISCLOSURE_UPDATED_REVIEW_CLOSING_DAY'),
  ],
  BUYER_LOAN_ESTIMATE_COMMAND: [
    recipe('Review loan estimates', 'Show my purchase Loan Estimates', 'BUYER_LOAN_ESTIMATES', 'REVIEW_BUYER_LOAN_ESTIMATES', 'BUYER_ESTIMATE_UPDATED_REVIEW_ESTIMATES'),
    recipe('Review financing readiness', 'What financing item could delay closing?', 'BUYER_FINANCING_READINESS', 'REVIEW_BUYER_FINANCING', 'BUYER_ESTIMATE_UPDATED_REVIEW_FINANCING'),
  ],
  BUYER_PLAN_SETUP_COMMAND: [
    recipe('Review the closing plan', 'What should I do next for this purchase?', 'BUYER_PLAN_STATUS', 'REVIEW_BUYER_PLAN', 'BUYER_SETUP_REVIEW_PLAN'),
    recipe('Review closing deadlines', 'What is due before closing?', 'BUYER_DEADLINES', 'REVIEW_BUYER_DEADLINES', 'BUYER_SETUP_REVIEW_DEADLINES'),
  ],
  BUYER_INSURANCE_COMMAND: [
    recipe('Review closing insurance', 'Show my homeowners insurance readiness for closing', 'BUYER_INSURANCE_READINESS', 'REVIEW_BUYER_INSURANCE', 'BUYER_INSURANCE_UPDATED_REVIEW_READINESS'),
    recipe('Review closing documents', 'Which closing records am I still missing?', 'BUYER_DOCUMENT_READINESS', 'REVIEW_BUYER_DOCUMENTS', 'BUYER_INSURANCE_UPDATED_REVIEW_DOCUMENTS'),
  ],
  BUYER_CLOSING_ITEM_COMMAND: [
    recipe('Prepare for closing day', 'What do I need for closing day?', 'BUYER_CLOSING_DAY_READINESS', 'REVIEW_BUYER_CLOSING_DAY', 'BUYER_CLOSING_ITEM_REVIEW_CLOSING_DAY'),
    recipe('Review the closing plan', 'What should I do next for this purchase?', 'BUYER_PLAN_STATUS', 'REVIEW_BUYER_PLAN', 'BUYER_CLOSING_ITEM_REVIEW_PLAN'),
  ],
  BUYER_WALKTHROUGH_COMMAND: [
    recipe('Review walkthrough readiness', 'Show my final walkthrough readiness', 'BUYER_WALKTHROUGH_READINESS', 'REVIEW_BUYER_WALKTHROUGH', 'BUYER_WALKTHROUGH_UPDATED_REVIEW_READINESS'),
    recipe('Prepare for closing day', 'What do I need for closing day?', 'BUYER_CLOSING_DAY_READINESS', 'REVIEW_BUYER_CLOSING_DAY', 'BUYER_WALKTHROUGH_UPDATED_REVIEW_CLOSING_DAY'),
  ],
  BUYER_TASK_COMPLETE: [
    recipe('Review the closing plan', 'What should I do next for this purchase?', 'BUYER_PLAN_STATUS', 'REVIEW_BUYER_PLAN', 'BUYER_TASK_COMPLETED_REVIEW_PLAN'),
    recipe('Review closing deadlines', 'What is still due before closing?', 'BUYER_DEADLINES', 'REVIEW_BUYER_DEADLINES', 'BUYER_TASK_COMPLETED_REVIEW_DEADLINES'),
  ],
  BUYER_TASK_CREATE: [
    recipe('Review the closing plan', 'What should I do next for this purchase?', 'BUYER_PLAN_STATUS', 'REVIEW_BUYER_PLAN', 'BUYER_TASK_CREATED_REVIEW_PLAN'),
    recipe('Review closing deadlines', 'What is due before closing?', 'BUYER_DEADLINES', 'REVIEW_BUYER_DEADLINES', 'BUYER_TASK_CREATED_REVIEW_DEADLINES'),
  ],
  BUYER_TASK_UPDATE: [
    recipe('Review the closing plan', 'What should I do next for this purchase?', 'BUYER_PLAN_STATUS', 'REVIEW_BUYER_PLAN', 'BUYER_TASK_UPDATED_REVIEW_PLAN'),
    recipe('Review closing deadlines', 'What is due before closing?', 'BUYER_DEADLINES', 'REVIEW_BUYER_DEADLINES', 'BUYER_TASK_UPDATED_REVIEW_DEADLINES'),
  ],
  BUYER_FINDING_DISPOSITION: [
    recipe('Review inspection decisions', 'Which inspection findings still need a decision?', 'BUYER_INSPECTION_REVIEW', 'REVIEW_BUYER_INSPECTION', 'BUYER_FINDING_REVIEW_INSPECTION'),
    recipe('Review negotiation readiness', 'What should I discuss with my agent about the inspection?', 'BUYER_NEGOTIATION_READINESS', 'REVIEW_BUYER_NEGOTIATION', 'BUYER_FINDING_REVIEW_NEGOTIATION'),
  ],
  BUYER_LIFECYCLE_UPDATE: [
    recipe('Review the buyer journey', 'What should I do next for this purchase?', 'BUYER_PLAN_STATUS', 'REVIEW_BUYER_PLAN', 'BUYER_LIFECYCLE_REVIEW_PLAN'),
    recipe('Review move readiness', 'What should I do before move-in?', 'BUYER_MOVE_STATUS', 'REVIEW_BUYER_MOVE', 'BUYER_LIFECYCLE_REVIEW_MOVE'),
  ],
  HOME_STATUS_BOARD: [
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'STATUS_BOARD_REVIEW_HOME_ACTIONS'),
    recipe('Review pending maintenance', 'What maintenance is pending?', 'MAINTENANCE_STATUS', 'REVIEW_MAINTENANCE_STATUS', 'STATUS_BOARD_REVIEW_MAINTENANCE'),
    recipe('Review replacement guidance', 'Should I repair or replace a major home system?', 'REPLACEMENT_GUIDANCE', 'REVIEW_REPLACEMENT', 'STATUS_BOARD_REVIEW_REPLACEMENT'),
  ],
  STATUS_BOARD_COMMAND: [
    recipe('Review the status board', 'Show my status board', 'HOME_STATUS_BOARD', 'REVIEW_STATUS_BOARD', 'STATUS_BOARD_UPDATED_REVIEW_BOARD'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'STATUS_BOARD_UPDATED_REVIEW_ACTIONS'),
  ],
  HOME_TIMELINE_EVENTS: [
    recipe('Review recent home changes', 'What changed around my home lately?', 'HOME_CHANGE_SUMMARY', 'REVIEW_HOME_CHANGES', 'HOME_TIMELINE_REVIEW_CHANGES'),
    recipe('Review home summary', 'Show my home summary', 'PROPERTY_SUMMARY', 'REVIEW_HOME_SUMMARY', 'HOME_TIMELINE_REVIEW_SUMMARY'),
  ],
  HOME_EVENT_VISIBILITY: [
    recipe('Review the home timeline', 'Open my home timeline', 'HOME_TIMELINE_EVENTS', 'REVIEW_HOME_TIMELINE', 'HOME_EVENT_VISIBILITY_REVIEW_TIMELINE'),
    recipe('Review home summary', 'Show my home summary', 'PROPERTY_SUMMARY', 'REVIEW_HOME_SUMMARY', 'HOME_EVENT_VISIBILITY_REVIEW_SUMMARY'),
  ],
  HOME_CHANGE_SUMMARY: [
    recipe('Review the home timeline', 'Open my home timeline', 'HOME_TIMELINE_EVENTS', 'REVIEW_HOME_TIMELINE', 'HOME_CHANGES_REVIEW_TIMELINE'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'HOME_CHANGES_REVIEW_ACTIONS'),
  ],
  HOME_BRIEFING_VIEW: [
    recipe('Review recent home changes', 'What changed around my home lately?', 'HOME_CHANGE_SUMMARY', 'REVIEW_HOME_CHANGES', 'HOME_BRIEFING_REVIEW_CHANGES'),
    recipe('Review monitored events', 'Show my home event radar feed', 'HOME_EVENT_RADAR_FEED', 'REVIEW_RADAR_FEED', 'HOME_BRIEFING_REVIEW_RADAR'),
  ],
  HOME_BRIEFING_COMMAND: [
    recipe('Review my home briefing', 'Show my home briefing', 'HOME_BRIEFING_VIEW', 'REVIEW_HOME_BRIEFING', 'HOME_BRIEFING_UPDATED_REVIEW_BRIEFING'),
    recipe('Review recent home changes', 'What changed around my home lately?', 'HOME_CHANGE_SUMMARY', 'REVIEW_HOME_CHANGES', 'HOME_BRIEFING_UPDATED_REVIEW_CHANGES'),
  ],
  HOME_BRIEFING_SHARE_COMMAND: [
    recipe('Review my home briefing', 'Show my home briefing', 'HOME_BRIEFING_VIEW', 'REVIEW_HOME_BRIEFING', 'HOME_BRIEFING_SHARE_REVIEW_BRIEFING'),
    recipe('Review recent home changes', 'What changed around my home lately?', 'HOME_CHANGE_SUMMARY', 'REVIEW_HOME_CHANGES', 'HOME_BRIEFING_SHARE_REVIEW_CHANGES'),
  ],
  HOME_EVENT_RADAR_FEED: [
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'RADAR_FEED_REVIEW_HOME_ACTIONS'),
    recipe('Review home work items', 'Show my home operations work items', 'HOME_WORK_ITEMS', 'REVIEW_HOME_WORK_ITEMS', 'RADAR_FEED_REVIEW_WORK_ITEMS'),
  ],
  HOME_EVENT_RADAR_STATE: [
    recipe('Review monitored events', 'Show my home event radar feed', 'HOME_EVENT_RADAR_FEED', 'REVIEW_RADAR_FEED', 'RADAR_STATE_REVIEW_FEED'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'RADAR_STATE_REVIEW_ACTIONS'),
  ],
  HOME_EVENT_RADAR_MARK_DONE: [
    recipe('Review monitored events', 'Show my home event radar feed', 'HOME_EVENT_RADAR_FEED', 'REVIEW_RADAR_FEED', 'RADAR_DONE_REVIEW_FEED'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'RADAR_DONE_REVIEW_ACTIONS'),
  ],
  HOME_EVENT_RADAR_FEEDBACK: [
    recipe('Review monitored events', 'Show my home event radar feed', 'HOME_EVENT_RADAR_FEED', 'REVIEW_RADAR_FEED', 'RADAR_FEEDBACK_REVIEW_FEED'),
  ],
  HOME_EVENT_RADAR_PREFERENCES: [
    recipe('Review monitored events', 'Show my home event radar feed', 'HOME_EVENT_RADAR_FEED', 'REVIEW_RADAR_FEED', 'RADAR_PREFERENCES_REVIEW_FEED'),
    recipe('Review my home briefing', 'Show my home briefing', 'HOME_BRIEFING_VIEW', 'REVIEW_HOME_BRIEFING', 'RADAR_PREFERENCES_REVIEW_BRIEFING'),
  ],
  HOME_EVENT_RADAR_TASK: [
    recipe('Review monitored events', 'Show my home event radar feed', 'HOME_EVENT_RADAR_FEED', 'REVIEW_RADAR_FEED', 'RADAR_TASK_REVIEW_FEED'),
    recipe('Review home work items', 'Show my home operations work items', 'HOME_WORK_ITEMS', 'REVIEW_HOME_WORK_ITEMS', 'RADAR_TASK_REVIEW_WORK_ITEMS'),
  ],
  HOME_WORK_ITEMS: [
    recipe('Review pending maintenance', 'What maintenance is pending?', 'MAINTENANCE_STATUS', 'REVIEW_MAINTENANCE_STATUS', 'HOME_WORK_ITEMS_REVIEW_MAINTENANCE'),
    recipe('Review open inspection findings', 'Show my open inspection findings', 'INSPECTION_FINDINGS', 'REVIEW_INSPECTION_FINDINGS', 'HOME_WORK_ITEMS_REVIEW_INSPECTIONS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'HOME_WORK_ITEMS_REVIEW_ACTIONS'),
  ],
  HOME_WORK_ITEM_COMMAND: [
    recipe('Review home work items', 'Show my home operations work items', 'HOME_WORK_ITEMS', 'REVIEW_HOME_WORK_ITEMS', 'HOME_WORK_ITEM_UPDATED_REVIEW_ITEMS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'HOME_WORK_ITEM_UPDATED_REVIEW_ACTIONS'),
  ],
  PROPERTY_SUMMARY: [
    recipe('Review the status board', 'Show my status board', 'HOME_STATUS_BOARD', 'REVIEW_STATUS_BOARD', 'PROPERTY_SUMMARY_REVIEW_STATUS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'PROPERTY_SUMMARY_REVIEW_ACTIONS'),
  ],
  HOME_DEADLINE_MONITOR: [
    recipe('Review home work items', 'Show my home operations work items', 'HOME_WORK_ITEMS', 'REVIEW_HOME_WORK_ITEMS', 'HOME_DEADLINE_REVIEW_WORK_ITEMS'),
    recipe('Review pending maintenance', 'What maintenance is pending?', 'MAINTENANCE_STATUS', 'REVIEW_MAINTENANCE_STATUS', 'HOME_DEADLINE_REVIEW_MAINTENANCE'),
  ],
  APPLIANCE_FAILURE_RISK: [
    recipe('Review replacement guidance', 'Should I repair or replace a major home system?', 'REPLACEMENT_GUIDANCE', 'REVIEW_REPLACEMENT', 'APPLIANCE_RISK_REVIEW_REPLACEMENT'),
    recipe('Review the status board', 'Show my status board', 'HOME_STATUS_BOARD', 'REVIEW_STATUS_BOARD', 'APPLIANCE_RISK_REVIEW_STATUS'),
  ],
  BREAK_EVEN_ANALYSIS: [
    recipe('Review ownership costs', 'Show my home ownership costs', 'OWNERSHIP_COSTS', 'REVIEW_OWNERSHIP_COSTS', 'BREAK_EVEN_REVIEW_COSTS'),
    recipe('Review sell, hold, or rent options', 'Should I sell, hold, or rent this home?', 'SELL_HOLD_RENT_ANALYSIS', 'CONTINUE_SELL_HOLD_RENT_PLAN', 'BREAK_EVEN_REVIEW_STRATEGY'),
  ],
  CAPTURE_EVIDENCE_CONFIRM: [
    recipe('Review home documents', 'Show my home documents', 'DOCUMENT_LOOKUP', 'REVIEW_DOCUMENTS', 'EVIDENCE_CAPTURED_REVIEW_DOCUMENTS'),
    recipe('Review the home timeline', 'Open my home timeline', 'HOME_TIMELINE_EVENTS', 'REVIEW_HOME_TIMELINE', 'EVIDENCE_CAPTURED_REVIEW_TIMELINE'),
  ],
  CAPTURE_FACT_CONFIRM: [
    recipe('Review home summary', 'Show my home summary', 'PROPERTY_SUMMARY', 'REVIEW_HOME_SUMMARY', 'FACT_CAPTURED_REVIEW_SUMMARY'),
    recipe('Review the status board', 'Show my status board', 'HOME_STATUS_BOARD', 'REVIEW_STATUS_BOARD', 'FACT_CAPTURED_REVIEW_STATUS'),
  ],
  DO_NOTHING_SCENARIO_COMMAND: [
    recipe('Review the do-nothing simulation', 'Show my do-nothing simulation', 'DO_NOTHING_SIMULATION', 'REVIEW_DO_NOTHING_SIMULATION', 'DO_NOTHING_SCENARIO_REVIEW_SIMULATION'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'DO_NOTHING_SCENARIO_REVIEW_ACTIONS'),
  ],
  DO_NOTHING_SIMULATION: [
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'DO_NOTHING_REVIEW_ACTIONS'),
    recipe('Review ownership costs', 'Show my home ownership costs', 'OWNERSHIP_COSTS', 'REVIEW_OWNERSHIP_COSTS', 'DO_NOTHING_REVIEW_COSTS'),
  ],
  DO_NOTHING_SIMULATION_RUN: [
    recipe('Review the do-nothing simulation', 'Show my do-nothing simulation', 'DO_NOTHING_SIMULATION', 'REVIEW_DO_NOTHING_SIMULATION', 'DO_NOTHING_RUN_REVIEW_SIMULATION'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'DO_NOTHING_RUN_REVIEW_ACTIONS'),
  ],
  HIRING_GUIDE: [
    recipe('Review quote comparisons', 'Show my quote comparisons', 'QUOTE_COMPARISON_REVIEW', 'REVIEW_QUOTES', 'HIRING_GUIDE_REVIEW_QUOTES'),
    recipe('Review service prices', 'Show my service price checks', 'SERVICE_PRICE_CHECKS', 'REVIEW_SERVICE_PRICES', 'HIRING_GUIDE_REVIEW_PRICES'),
  ],
  HOA_COMPLIANCE_COMMAND: [
    recipe('Review HOA records', 'Show my HOA records', 'HOA_COMPLIANCE_STATUS', 'REVIEW_HOA_STATUS', 'HOA_UPDATED_REVIEW_STATUS'),
    recipe('Review renovation readiness', 'Show my renovation permit readiness', 'RENOVATION_PERMIT_READINESS', 'REVIEW_RENOVATION_READINESS', 'HOA_UPDATED_REVIEW_RENOVATION'),
  ],
  HOA_COMPLIANCE_STATUS: [
    recipe('Review renovation readiness', 'Show my renovation permit readiness', 'RENOVATION_PERMIT_READINESS', 'REVIEW_RENOVATION_READINESS', 'HOA_STATUS_REVIEW_RENOVATION'),
    recipe('Review home documents', 'Show my home documents', 'DOCUMENT_LOOKUP', 'REVIEW_DOCUMENTS', 'HOA_STATUS_REVIEW_DOCUMENTS'),
  ],
  HOME_BASICS_GUIDE: [
    recipe('Review the status board', 'Show my status board', 'HOME_STATUS_BOARD', 'REVIEW_STATUS_BOARD', 'HOME_BASICS_REVIEW_STATUS'),
    recipe('Review pending maintenance', 'What maintenance is pending?', 'MAINTENANCE_STATUS', 'REVIEW_MAINTENANCE_STATUS', 'HOME_BASICS_REVIEW_MAINTENANCE'),
  ],
  HOME_DIGITAL_WILL: [
    recipe('Review home documents', 'Show my home documents', 'DOCUMENT_LOOKUP', 'REVIEW_DOCUMENTS', 'HOME_CONTINUITY_REVIEW_DOCUMENTS'),
    recipe('Review home summary', 'Show my home summary', 'PROPERTY_SUMMARY', 'REVIEW_HOME_SUMMARY', 'HOME_CONTINUITY_REVIEW_SUMMARY'),
  ],
  HOME_JOURNEY_SET: [
    recipe('Review home summary', 'Show my home summary', 'PROPERTY_SUMMARY', 'REVIEW_HOME_SUMMARY', 'HOME_JOURNEY_REVIEW_SUMMARY'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'HOME_JOURNEY_REVIEW_ACTIONS'),
  ],
  HOME_RECORD_STATE_COMMAND: [
    recipe('Review home documents', 'Show my home documents', 'DOCUMENT_LOOKUP', 'REVIEW_DOCUMENTS', 'HOME_RECORD_UPDATED_REVIEW_DOCUMENTS'),
    recipe('Review home summary', 'Show my home summary', 'PROPERTY_SUMMARY', 'REVIEW_HOME_SUMMARY', 'HOME_RECORD_UPDATED_REVIEW_SUMMARY'),
  ],
  HOME_UPGRADE_COMMAND: [
    recipe('Review upgrade options', 'Show my upgrade planner options', 'HOME_UPGRADE_SCENARIOS', 'REVIEW_HOME_UPGRADES', 'HOME_UPGRADE_UPDATED_REVIEW_SCENARIOS'),
    recipe('Review replacement guidance', 'Should I repair or replace a major home system?', 'REPLACEMENT_GUIDANCE', 'REVIEW_REPLACEMENT', 'HOME_UPGRADE_UPDATED_REVIEW_REPLACEMENT'),
  ],
  HOME_UPGRADE_SCENARIOS: [
    recipe('Review replacement guidance', 'Should I repair or replace a major home system?', 'REPLACEMENT_GUIDANCE', 'REVIEW_REPLACEMENT', 'HOME_UPGRADES_REVIEW_REPLACEMENT'),
    recipe('Review capital outlook', 'Show my capital reserve outlook', 'CAPITAL_RESERVE_PLAN', 'REVIEW_CAPITAL_OUTLOOK', 'HOME_UPGRADES_REVIEW_CAPITAL'),
  ],
  HOUSEHOLD_INVITATION: [
    recipe('Review home continuity', 'Show my home continuity plan', 'HOME_DIGITAL_WILL', 'REVIEW_HOME_CONTINUITY', 'HOUSEHOLD_INVITE_REVIEW_CONTINUITY'),
    recipe('Review home summary', 'Show my home summary', 'PROPERTY_SUMMARY', 'REVIEW_HOME_SUMMARY', 'HOUSEHOLD_INVITE_REVIEW_SUMMARY'),
  ],
  INTELLIGENCE_ENVELOPE_QUERY: [
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'INTELLIGENCE_REVIEW_ACTIONS'),
    recipe('Review monitored events', 'Show my home event radar feed', 'HOME_EVENT_RADAR_FEED', 'REVIEW_RADAR_FEED', 'INTELLIGENCE_REVIEW_RADAR'),
  ],
  MATERIAL_SPECS_LIST: [
    recipe('Review home inventory', 'Show my home inventory', 'INVENTORY_LOOKUP', 'REVIEW_HOME_INVENTORY', 'MATERIAL_SPECS_REVIEW_INVENTORY'),
    recipe('Review home documents', 'Show my home documents', 'DOCUMENT_LOOKUP', 'REVIEW_DOCUMENTS', 'MATERIAL_SPECS_REVIEW_DOCUMENTS'),
  ],
  MATERIAL_SPEC_UPDATE: [
    recipe('Review material specs', 'Show my material specs', 'MATERIAL_SPECS_LIST', 'REVIEW_MATERIAL_SPECS', 'MATERIAL_UPDATED_REVIEW_SPECS'),
  ],
  MATERIAL_SPEC_ADD: [
    recipe('Review material specs', 'Show my material specs', 'MATERIAL_SPECS_LIST', 'REVIEW_MATERIAL_SPECS', 'MATERIAL_ADDED_REVIEW_SPECS'),
    recipe('Review home summary', 'Show my home summary', 'PROPERTY_SUMMARY', 'REVIEW_HOME_SUMMARY', 'MATERIAL_ADDED_REVIEW_SUMMARY'),
  ],
  NEIGHBORHOOD_CHANGE_FEED: [
    recipe('Review monitored events', 'Show my home event radar feed', 'HOME_EVENT_RADAR_FEED', 'REVIEW_RADAR_FEED', 'NEIGHBORHOOD_REVIEW_RADAR'),
    recipe('Review past hazard exposure', 'Show my home risk replay', 'PAST_HAZARD_EXPOSURE', 'REVIEW_PAST_HAZARDS', 'NEIGHBORHOOD_REVIEW_HAZARDS'),
  ],
  NEIGHBORHOOD_INTERACTION_COMMAND: [
    recipe('Review neighborhood changes', 'Show my Around Your Home feed', 'NEIGHBORHOOD_CHANGE_FEED', 'REVIEW_NEIGHBORHOOD_CHANGES', 'NEIGHBORHOOD_UPDATED_REVIEW_FEED'),
    recipe('Review monitored events', 'Show my home event radar feed', 'HOME_EVENT_RADAR_FEED', 'REVIEW_RADAR_FEED', 'NEIGHBORHOOD_UPDATED_REVIEW_RADAR'),
  ],
  OPERATIONAL_WORK_UPDATE: [
    recipe('Review home work items', 'Show my home operations work items', 'HOME_WORK_ITEMS', 'REVIEW_HOME_WORK_ITEMS', 'OPERATIONAL_WORK_REVIEW_ITEMS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'OPERATIONAL_WORK_REVIEW_ACTIONS'),
  ],
  PAST_HAZARD_EXPOSURE: [
    recipe('Review monitored events', 'Show my home event radar feed', 'HOME_EVENT_RADAR_FEED', 'REVIEW_RADAR_FEED', 'PAST_HAZARDS_REVIEW_RADAR'),
    recipe('Review coverage gaps', 'Show coverage gaps for my recorded items', 'COVERAGE_GAPS', 'REVIEW_COVERAGE_GAPS', 'PAST_HAZARDS_REVIEW_COVERAGE'),
  ],
  PAST_HAZARD_OUTCOME_COMMAND: [
    recipe('Review past hazard exposure', 'Show my home risk replay', 'PAST_HAZARD_EXPOSURE', 'REVIEW_PAST_HAZARDS', 'PAST_HAZARD_OUTCOME_REVIEW_EXPOSURE'),
    recipe('Review the home timeline', 'Open my home timeline', 'HOME_TIMELINE_EVENTS', 'REVIEW_HOME_TIMELINE', 'PAST_HAZARD_OUTCOME_REVIEW_TIMELINE'),
  ],
  ENVIRONMENT_REPORT: [
    recipe('Review monitored events', 'Show my home event radar feed', 'HOME_EVENT_RADAR_FEED', 'REVIEW_RADAR_FEED', 'ENVIRONMENT_REPORT_REVIEW_RADAR'),
    recipe('Review past hazard exposure', 'Show my home risk replay', 'PAST_HAZARD_EXPOSURE', 'REVIEW_PAST_HAZARDS', 'ENVIRONMENT_REPORT_REVIEW_HAZARDS'),
  ],
  ENVIRONMENT_REPORT_COMMAND: [
    recipe('Review environment report', 'Show my environment report', 'ENVIRONMENT_REPORT', 'REVIEW_ENVIRONMENT_REPORT', 'ENVIRONMENT_REPORT_COMMAND_REVIEW_REPORT'),
    recipe('Review maintenance tasks', 'What maintenance is pending?', 'MAINTENANCE_STATUS', 'REVIEW_MAINTENANCE_STATUS', 'ENVIRONMENT_REPORT_COMMAND_REVIEW_MAINTENANCE'),
  ],
  PROPERTY_BRIEFS_LIST: [
    recipe('Review home summary', 'Show my home summary', 'PROPERTY_SUMMARY', 'REVIEW_HOME_SUMMARY', 'PROPERTY_BRIEFS_REVIEW_SUMMARY'),
    recipe('Review the home timeline', 'Open my home timeline', 'HOME_TIMELINE_EVENTS', 'REVIEW_HOME_TIMELINE', 'PROPERTY_BRIEFS_REVIEW_TIMELINE'),
  ],
  PROPERTY_BRIEF_COMMAND: [
    recipe('Review property briefs', 'Open my saved property briefs', 'PROPERTY_BRIEFS_LIST', 'REVIEW_PROPERTY_BRIEFS', 'PROPERTY_BRIEF_UPDATED_REVIEW_BRIEFS'),
    recipe('Review home summary', 'Show my home summary', 'PROPERTY_SUMMARY', 'REVIEW_HOME_SUMMARY', 'PROPERTY_BRIEF_UPDATED_REVIEW_SUMMARY'),
  ],
  PROPERTY_CONTEXT_AREA_CAPTURE: [
    recipe('Review home summary', 'Show my home summary', 'PROPERTY_SUMMARY', 'REVIEW_HOME_SUMMARY', 'PROPERTY_CONTEXT_REVIEW_SUMMARY'),
    recipe('Review the status board', 'Show my status board', 'HOME_STATUS_BOARD', 'REVIEW_STATUS_BOARD', 'PROPERTY_CONTEXT_REVIEW_STATUS'),
  ],
  PROPERTY_PURCHASE_DATE_SET: [
    recipe('Review home summary', 'Show my home summary', 'PROPERTY_SUMMARY', 'REVIEW_HOME_SUMMARY', 'PURCHASE_DATE_REVIEW_SUMMARY'),
    recipe('Review maintenance forecast', 'What maintenance might be coming up?', 'MAINTENANCE_FORECAST', 'REVIEW_MAINTENANCE_FORECAST', 'PURCHASE_DATE_REVIEW_FORECAST'),
  ],
  RESERVE_FUND_COMMAND: [
    recipe('Review capital outlook', 'Show my capital reserve outlook', 'CAPITAL_RESERVE_PLAN', 'REVIEW_CAPITAL_OUTLOOK', 'RESERVE_FUND_REVIEW_CAPITAL'),
    recipe('Review ownership costs', 'Show my home ownership costs', 'OWNERSHIP_COSTS', 'REVIEW_OWNERSHIP_COSTS', 'RESERVE_FUND_REVIEW_COSTS'),
  ],
  // Commands and reads that had no reviewed continuation (coverage ledger). A command receipt returns to the read that owns the record it changed;
  // a read points to its closest related read. Every destination is an existing Ask operation, rechecked by the shared availability, role and exact-four policy.
  HOME_DIGITAL_WILL_CREATE: [
    recipe('Review my continuity plan', 'Show my home continuity plan', 'HOME_DIGITAL_WILL', 'REVIEW_HOME_CONTINUITY', 'CONTINUITY_PLAN_REVIEW'),
  ],
  HOME_RECORD_EXPORT: [
    recipe('Check my export', 'Check my export status', 'HOME_RECORD_EXPORT_STATUS', 'REVIEW_EXPORT_STATUS', 'EXPORT_REVIEW_STATUS'),
  ],
  HOME_RECORD_EXPORT_SHARE: [
    recipe('Check my export', 'Check my export status', 'HOME_RECORD_EXPORT_STATUS', 'REVIEW_EXPORT_STATUS', 'EXPORT_SHARE_REVIEW_STATUS'),
  ],
  HOME_RECORD_EXPORT_STATUS: [
    recipe('Check my home record', 'How complete is my home record?', 'PROPERTY_SUMMARY', 'REVIEW_COMPLETENESS', 'EXPORT_STATUS_REVIEW_COMPLETENESS'),
  ],
  HOUSEHOLD_ACCESS_SUMMARY: [
    recipe('Browse my home record', 'Browse my home record', 'PROPERTY_SUMMARY', 'REVIEW_HOME_SUMMARY', 'HOUSEHOLD_ACCESS_REVIEW_RECORD'),
  ],
  NOTIFICATIONS_OVERVIEW: [
    recipe('Review notification settings', 'Show my notification settings', 'NOTIFICATION_SETTINGS_OVERVIEW', 'REVIEW_NOTIFICATION_SETTINGS', 'NOTIFICATIONS_REVIEW_SETTINGS'),
    recipe('See what needs me', 'Show my work', 'WORK_OVERVIEW', 'REVIEW_WORK', 'NOTIFICATIONS_REVIEW_WORK'),
  ],
  NOTIFICATION_COMMAND: [
    recipe('Review my notifications', 'Show my notifications', 'NOTIFICATIONS_OVERVIEW', 'REVIEW_NOTIFICATIONS', 'NOTIFICATION_COMMAND_REVIEW'),
  ],
  NOTIFICATION_SETTINGS_COMMAND: [
    recipe('Review notification settings', 'Show my notification settings', 'NOTIFICATION_SETTINGS_OVERVIEW', 'REVIEW_NOTIFICATION_SETTINGS', 'NOTIFICATION_SETTINGS_COMMAND_REVIEW'),
  ],
  NOTIFICATION_SETTINGS_OVERVIEW: [
    recipe('Review my notifications', 'Show my notifications', 'NOTIFICATIONS_OVERVIEW', 'REVIEW_NOTIFICATIONS', 'NOTIFICATION_SETTINGS_REVIEW_NOTIFICATIONS'),
  ],
  REFINANCE_COMMAND: [
    recipe('Review my refinance options', 'Should I refinance now?', 'REFINANCE_ANALYSIS', 'REVIEW_REFINANCE', 'REFINANCE_COMMAND_REVIEW'),
  ],
  RISK_MITIGATION_PLAN: [
    recipe('Check my coverage gaps', 'Which items are missing coverage?', 'COVERAGE_GAPS', 'REVIEW_COVERAGE_GAPS', 'RISK_PLAN_REVIEW_COVERAGE'),
    recipe('Review pending maintenance', 'What maintenance is pending?', 'MAINTENANCE_STATUS', 'REVIEW_MAINTENANCE_STATUS', 'RISK_PLAN_REVIEW_MAINTENANCE'),
  ],
  SAVED_ARCHIVE_COMMAND: [
    recipe('Review my saved results', 'Show my saved results', 'SAVED_RESULTS', 'REVIEW_SAVED_RESULTS', 'SAVED_ARCHIVE_REVIEW'),
  ],
  SAVED_RESULTS: [
    recipe('See what needs me', 'Show my work', 'WORK_OVERVIEW', 'REVIEW_WORK', 'SAVED_RESULTS_REVIEW_WORK'),
  ],
  SELL_HOLD_RENT_COMMAND: [
    recipe('Review sell, hold, or rent', 'Should I sell, hold, or rent this home?', 'SELL_HOLD_RENT_ANALYSIS', 'CONTINUE_SELL_HOLD_RENT_PLAN', 'SELL_HOLD_RENT_COMMAND_REVIEW'),
  ],
  WORK_OVERVIEW: [
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'WORK_REVIEW_HOME_ACTIONS'),
    recipe('Review my saved results', 'Show my saved results', 'SAVED_RESULTS', 'REVIEW_SAVED_RESULTS', 'WORK_REVIEW_SAVED'),
  ],
  WORK_REQUEST_COMMAND: [
    recipe('See what is under way', 'What work is under way?', 'WORK_OVERVIEW', 'REVIEW_WORK', 'WORK_REQUEST_REVIEW_WORK'),
  ],
});

export function operationSpecificContinuationOutcomeKeys(sourceOperationId: string): readonly string[] {
  return (OPERATION_SPECIFIC_CONTINUATION_RECIPES[sourceOperationId as AskOperationId] ?? [])
    .map((entry) => `${entry.operationId}:${entry.outcomeKey}`);
}
