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
});

export function operationSpecificContinuationOutcomeKeys(sourceOperationId: string): readonly string[] {
  return (OPERATION_SPECIFIC_CONTINUATION_RECIPES[sourceOperationId as AskOperationId] ?? [])
    .map((entry) => `${entry.operationId}:${entry.outcomeKey}`);
}
