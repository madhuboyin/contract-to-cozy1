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
});

export function operationSpecificContinuationOutcomeKeys(sourceOperationId: string): readonly string[] {
  return (OPERATION_SPECIFIC_CONTINUATION_RECIPES[sourceOperationId as AskOperationId] ?? [])
    .map((entry) => `${entry.operationId}:${entry.outcomeKey}`);
}
