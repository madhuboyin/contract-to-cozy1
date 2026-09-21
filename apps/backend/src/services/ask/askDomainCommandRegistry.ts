export const ASK_DOMAIN_COMMAND_IDS = [
  'MAINTENANCE_CREATE',
  'MAINTENANCE_COMPLETE',
  'MAINTENANCE_UPDATE',
  'HOUSEHOLD_INVITE',
  'GUIDANCE_JOURNEY_CREATE',
  'QUOTE_COMPARISON_CREATE',
  'REFINANCE_MONITOR_CREATE',
  'HOME_DEADLINE_MONITOR_CREATE',
  'HVAC_DECISION_START',
  'HVAC_DECISION_SCENARIO',
  'HVAC_DECISION_ABANDON',
  'HVAC_PREFERENCE_SAVE',
  'HVAC_PREFERENCE_FORGET',
  'HVAC_DECISION_OUTCOME_REPORT',
  'HVAC_DECISION_OUTCOME_UNLINK',
  'BUYER_TASK_COMPLETE',
  'BUYER_TASK_CREATE',
  'BUYER_TASK_UPDATE',
  'BUYER_FINDING_DISPOSITION',
  'BUYER_LIFECYCLE_UPDATE',
  'CLAIM_FILE',
  'CLAIM_TRANSITION',
  'INSPECTION_FINDING_UPDATE',
  'DOCUMENT_PROMOTION_CONFIRM',
  // Ask Cozy Stage 3, Phase 7 (implementation plan §13; FRD §31). The real
  // write path PropertySaleCaseService.setItemDecision exposes -- WAIVE/
  // PURSUE/REOPEN/UNPURSUE on a SaleReadinessItem -- deliberately scoped
  // out of the read-only Slice 1 (SELLER_PREP_CHECKLIST).
  'SELLER_PREP_ITEM_DECISION',
  'INVENTORY_ITEM_CORRECT',
  'HOME_EVENT_CORRECT',
  'WARRANTY_CORRECT',
  'ROOM_RENAME',
  'ROOM_CREATE',
  'INVENTORY_ITEM_CREATE',
  'PROPERTY_CONTEXT_AREA_CAPTURE',
  'OPERATIONAL_WORK_UPDATE',
  // Ask Cozy Stage 3, Phase 2 (implementation plan §8; FRD §19/§20).
  'CAPTURE_FACT_CONFIRM',
  'CAPTURE_EVENT_CONFIRM',
  // Ask Cozy Stage 3, Phase 3 warranty capture writer (implementation plan
  // §9/§22).
  'CAPTURE_WARRANTY_CONFIRM',
  // Ask Cozy Stage 3, Phase 2 external review (implementation plan §8/§4.2;
  // FRD §23's UPLOAD_EVIDENCE resolution).
  'CAPTURE_EVIDENCE_CONFIRM',
] as const;

export type AskDomainCommandId = typeof ASK_DOMAIN_COMMAND_IDS[number];
export type AskCommandRole = 'CONTRIBUTOR' | 'OWNER';

export interface AskDomainCommandDefinition {
  id: AskDomainCommandId;
  operationId: string;
  adapterKey: string;
  roleFloor: AskCommandRole;
  material: boolean;
  artifactType: string;
  supportsCancelBeforeExecution: boolean;
  correctionModes: readonly ('EDIT' | 'PAUSE' | 'RESUME' | 'STOP' | 'REVERSE' | 'REOPEN' | 'REVOKE')[];
  cancellation: {
    title: string;
    body: string;
    suggestion: string;
  };
}

const command = (
  id: AskDomainCommandId,
  operationId: string,
  adapterKey: string,
  roleFloor: AskCommandRole,
  artifactType: string,
  correctionModes: AskDomainCommandDefinition['correctionModes'] = [],
  cancellation: AskDomainCommandDefinition['cancellation'],
): AskDomainCommandDefinition => ({
  id,
  operationId,
  adapterKey,
  roleFloor,
  material: true,
  artifactType,
  supportsCancelBeforeExecution: true,
  correctionModes,
  cancellation,
});

export const ASK_DOMAIN_COMMAND_REGISTRY: Readonly<Record<AskDomainCommandId, AskDomainCommandDefinition>> = Object.freeze({
  MAINTENANCE_CREATE: command('MAINTENANCE_CREATE', 'MAINTENANCE_TASK_CREATE', 'maintenance.create', 'CONTRIBUTOR', 'PROPERTY_MAINTENANCE_TASK', ['EDIT', 'STOP'], { title: 'Maintenance task not created', body: 'No task or shared home record was changed.', suggestion: 'What maintenance is pending?' }),
  MAINTENANCE_COMPLETE: command('MAINTENANCE_COMPLETE', 'MAINTENANCE_TASK_COMPLETE', 'maintenance.complete', 'CONTRIBUTOR', 'PROPERTY_MAINTENANCE_TASK_COMPLETION', ['REOPEN'], { title: 'Task not completed', body: 'Task status, cost, recurring schedule, and downstream records were not changed.', suggestion: 'What maintenance is pending?' }),
  MAINTENANCE_UPDATE: command('MAINTENANCE_UPDATE', 'MAINTENANCE_TASK_UPDATE', 'maintenance.update', 'CONTRIBUTOR', 'PROPERTY_MAINTENANCE_TASK', ['EDIT', 'REOPEN', 'STOP'], { title: 'Maintenance task not updated', body: 'The task, schedule, assignment, and status were not changed.', suggestion: 'What maintenance is pending?' }),
  HOUSEHOLD_INVITE: command('HOUSEHOLD_INVITE', 'HOUSEHOLD_INVITATION', 'household.invitation', 'OWNER', 'HOUSEHOLD_INVITE', ['REVOKE'], { title: 'Invitation not created', body: 'No invitation or household access was created.', suggestion: 'Review household access' }),
  GUIDANCE_JOURNEY_CREATE: command('GUIDANCE_JOURNEY_CREATE', 'GUIDANCE_JOURNEY_CREATE', 'guidance.journey.create', 'CONTRIBUTOR', 'GUIDANCE_JOURNEY', ['STOP'], { title: 'Guided plan not started', body: 'No journey, milestones, or follow-up work was created.', suggestion: 'Show available home tools' }),
  QUOTE_COMPARISON_CREATE: command('QUOTE_COMPARISON_CREATE', 'QUOTE_COMPARISON_CREATE', 'quote-comparison.create', 'CONTRIBUTOR', 'QUOTE_COMPARISON_WORKSPACE', ['EDIT', 'STOP'], { title: 'Comparison workspace not created', body: 'No quote workspace or provider comparison was created.', suggestion: 'Show quote comparison tools' }),
  REFINANCE_MONITOR_CREATE: command('REFINANCE_MONITOR_CREATE', 'REFINANCE_RATE_MONITOR', 'refinance.monitor', 'CONTRIBUTOR', 'REFINANCE_RATE_MONITOR', ['EDIT', 'PAUSE', 'RESUME', 'STOP'], { title: 'Monitor not created', body: 'No mortgage-rate notification preference or threshold was changed.', suggestion: 'Set a different rate threshold' }),
  HOME_DEADLINE_MONITOR_CREATE: command('HOME_DEADLINE_MONITOR_CREATE', 'HOME_DEADLINE_MONITOR', 'home-deadline.monitor', 'CONTRIBUTOR', 'PROPERTY_MAINTENANCE_TASK', ['EDIT', 'STOP', 'REOPEN'], { title: 'Deadline reminder not created', body: 'No maintenance reminder or notification preference was changed.', suggestion: 'Review expiring coverage' }),
  HVAC_DECISION_START: command('HVAC_DECISION_START', 'HVAC_DECISION_START', 'decision-platform.hvac.start', 'CONTRIBUTOR', 'DECISION_THREAD', ['STOP'], { title: 'Decision thread not created', body: 'No durable HVAC repair/replace decision or recommendation snapshot was created.', suggestion: 'What needs my attention?' }),
  HVAC_DECISION_SCENARIO: command('HVAC_DECISION_SCENARIO', 'HVAC_DECISION_SCENARIO', 'decision-platform.hvac.scenario', 'CONTRIBUTOR', 'SCENARIO', ['STOP'], { title: 'Scenario not created', body: 'No counterfactual quote scenario was recorded; the current decision recommendation is unchanged.', suggestion: 'Show my HVAC decision' }),
  HVAC_DECISION_ABANDON: command('HVAC_DECISION_ABANDON', 'HVAC_DECISION_ABANDON', 'decision-platform.hvac.abandon', 'CONTRIBUTOR', 'DECISION_THREAD', ['REOPEN'], { title: 'Decision thread not abandoned', body: 'The decision thread remains active with its current recommendation.', suggestion: 'Show my HVAC decision' }),
  HVAC_PREFERENCE_SAVE: command('HVAC_PREFERENCE_SAVE', 'HVAC_PREFERENCE_SAVE', 'decision-platform.hvac.preference.save', 'CONTRIBUTOR', 'DECISION_PREFERENCE_VALUE', ['EDIT', 'REVOKE'], { title: 'Preference not saved', body: 'No decision preference was created or changed.', suggestion: 'Show my HVAC decision' }),
  HVAC_PREFERENCE_FORGET: command('HVAC_PREFERENCE_FORGET', 'HVAC_PREFERENCE_FORGET', 'decision-platform.hvac.preference.forget', 'CONTRIBUTOR', 'DECISION_PREFERENCE_VALUE', ['REOPEN'], { title: 'Preference not forgotten', body: 'The preference remains active and in use.', suggestion: 'Show my HVAC decision' }),
  HVAC_DECISION_OUTCOME_REPORT: command('HVAC_DECISION_OUTCOME_REPORT', 'HVAC_DECISION_OUTCOME_REPORT', 'decision-platform.hvac.outcome.report', 'CONTRIBUTOR', 'OUTCOME_OBSERVATION', ['EDIT'], { title: 'Outcome not recorded', body: 'No reported outcome or attribution was created; the decision thread is unchanged.', suggestion: 'Show my HVAC decision' }),
  HVAC_DECISION_OUTCOME_UNLINK: command('HVAC_DECISION_OUTCOME_UNLINK', 'HVAC_DECISION_OUTCOME_UNLINK', 'decision-platform.hvac.outcome.unlink', 'CONTRIBUTOR', 'OUTCOME_OBSERVATION', ['REOPEN'], { title: 'Outcome not disputed', body: 'The reported outcome remains as recorded.', suggestion: 'Show my HVAC decision' }),
  BUYER_TASK_COMPLETE: command('BUYER_TASK_COMPLETE', 'BUYER_TASK_COMPLETE', 'buyer.task.complete', 'CONTRIBUTOR', 'HOME_BUYER_TASK', ['REOPEN'], { title: 'Buyer Plan task not completed', body: 'Task status and closing readiness were not changed.', suggestion: 'What should I do next for this purchase?' }),
  BUYER_TASK_CREATE: command('BUYER_TASK_CREATE', 'BUYER_TASK_CREATE', 'buyer.task.create', 'CONTRIBUTOR', 'HOME_BUYER_TASK', ['EDIT', 'STOP'], { title: 'Closing checklist item not created', body: 'No task or shared Buyer Plan record was changed.', suggestion: 'What should I do next for this purchase?' }),
  BUYER_TASK_UPDATE: command('BUYER_TASK_UPDATE', 'BUYER_TASK_UPDATE', 'buyer.task.update', 'CONTRIBUTOR', 'HOME_BUYER_TASK', ['EDIT', 'STOP'], { title: 'Closing checklist item not updated', body: 'The task, due date, and assignment were not changed.', suggestion: 'What should I do next for this purchase?' }),
  BUYER_FINDING_DISPOSITION: command('BUYER_FINDING_DISPOSITION', 'BUYER_FINDING_DISPOSITION', 'buyer.finding.disposition', 'CONTRIBUTOR', 'INSPECTION_FINDING', ['EDIT'], { title: 'Finding not reclassified', body: 'The finding disposition, linked task, and journey were not changed.', suggestion: 'Which inspection findings still need a decision?' }),
  BUYER_LIFECYCLE_UPDATE: command('BUYER_LIFECYCLE_UPDATE', 'BUYER_LIFECYCLE_UPDATE', 'buyer.lifecycle.update', 'CONTRIBUTOR', 'HOME_BUYER_CHECKLIST', ['EDIT'], { title: 'Purchase lifecycle not changed', body: 'No cancellation or date change was recorded.', suggestion: 'What should I do next for this purchase?' }),
  CLAIM_FILE: command('CLAIM_FILE', 'CLAIM_FILE', 'incident-claim.file', 'CONTRIBUTOR', 'CLAIM', ['EDIT', 'STOP'], { title: 'Claim not created', body: 'No claim, checklist, Operational Work Item, or timeline event was created.', suggestion: 'Show my recorded claims' }),
  CLAIM_TRANSITION: command('CLAIM_TRANSITION', 'CLAIM_TRANSITION', 'incident-claim.transition', 'CONTRIBUTOR', 'CLAIM', ['EDIT', 'REOPEN'], { title: 'Claim status not changed', body: 'The claim, timeline, and linked Operational Work Item were not changed.', suggestion: 'Show my recorded claims' }),
  INSPECTION_FINDING_UPDATE: command('INSPECTION_FINDING_UPDATE', 'INSPECTION_FINDING_UPDATE', 'inspection-findings.update', 'CONTRIBUTOR', 'INSPECTION_FINDING', ['EDIT', 'REOPEN'], { title: 'Inspection finding not changed', body: 'The finding and any linked Operational Work Item remain unchanged.', suggestion: 'Show my open inspection findings' }),
  DOCUMENT_PROMOTION_CONFIRM: command('DOCUMENT_PROMOTION_CONFIRM', 'DOCUMENT_PROMOTION_CONFIRM', 'document-promotion.confirm', 'CONTRIBUTOR', 'DOCUMENT_PROMOTION', ['EDIT'], { title: 'Document candidate not promoted', body: 'No extracted candidate became canonical Home Record truth.', suggestion: 'Show pending document reviews' }),
  OPERATIONAL_WORK_UPDATE: command('OPERATIONAL_WORK_UPDATE', 'OPERATIONAL_WORK_UPDATE', 'home-operations.update', 'CONTRIBUTOR', 'OPERATIONAL_WORK_ITEM', ['EDIT', 'REOPEN', 'STOP'], { title: 'Operational Work not changed', body: 'The work item lifecycle, schedule, and evidence remain unchanged.', suggestion: 'Show my home operations' }),
  ROOM_CREATE: command('ROOM_CREATE', 'ROOM_CREATE', 'room.create', 'CONTRIBUTOR', 'INVENTORY_ROOM', ['EDIT', 'STOP'], { title: 'Room not added', body: 'No room was added.', suggestion: 'Show my rooms' }),
  INVENTORY_ITEM_CREATE: command('INVENTORY_ITEM_CREATE', 'INVENTORY_ITEM_CREATE', 'inventory.create', 'CONTRIBUTOR', 'INVENTORY_ITEM', ['EDIT', 'STOP'], { title: 'Item not added', body: 'No inventory item was added.', suggestion: 'Show my inventory' }),
  PROPERTY_CONTEXT_AREA_CAPTURE: command('PROPERTY_CONTEXT_AREA_CAPTURE', 'PROPERTY_CONTEXT_AREA_CAPTURE', 'property-context.area-capture', 'CONTRIBUTOR', 'PROPERTY_CONTEXT', ['EDIT', 'STOP'], { title: 'Home detail not saved', body: 'No home detail was saved.', suggestion: 'How complete is my home record?' }),
  ROOM_RENAME: command('ROOM_RENAME', 'ROOM_RENAME', 'room.rename', 'CONTRIBUTOR', 'INVENTORY_ROOM', ['EDIT', 'STOP'], { title: 'Room not renamed', body: 'The room was not changed.', suggestion: 'Show my rooms' }),
  WARRANTY_CORRECT: command('WARRANTY_CORRECT', 'WARRANTY_CORRECT', 'warranty.correct', 'CONTRIBUTOR', 'WARRANTY', ['EDIT', 'STOP'], { title: 'Warranty not changed', body: 'The warranty record was not changed.', suggestion: 'Show my warranties' }),
  HOME_EVENT_CORRECT: command('HOME_EVENT_CORRECT', 'HOME_EVENT_CORRECT', 'home-event.correct', 'CONTRIBUTOR', 'HOME_EVENT', ['EDIT', 'STOP'], { title: 'Timeline event not changed', body: 'The home timeline event was not changed.', suggestion: 'Show my home timeline' }),
  INVENTORY_ITEM_CORRECT: command('INVENTORY_ITEM_CORRECT', 'INVENTORY_ITEM_CORRECT', 'inventory.item-correct', 'CONTRIBUTOR', 'INVENTORY_ITEM', ['EDIT', 'STOP'], { title: 'Inventory record not changed', body: 'The inventory item was not changed.', suggestion: 'Show my home inventory' }),
  SELLER_PREP_ITEM_DECISION: command('SELLER_PREP_ITEM_DECISION', 'SELLER_PREP_ITEM_DECISION', 'seller-prep.item-decision', 'CONTRIBUTOR', 'SALE_READINESS_ITEM', ['REOPEN'], { title: 'Checklist item not changed', body: 'The seller-prep checklist item was not changed.', suggestion: 'Check my sale readiness' }),
  // Ask Cozy Stage 3, Phase 2 (implementation plan §8/§4.1; FRD §19/§20).
  // correctionModes: ['EDIT'] describes intent, not a wired mechanism --
  // §4.1 confirmed the correctionModes vocabulary itself is entirely
  // unconsumed metadata (nothing reads it to drive dispatch). The real
  // correction path is PropertyFactEvidence's existing supersededAt chain /
  // HomeEvent's existing supersedesEventId/isCurrent chain, not yet wired
  // for these two operations as of this slice (implementation plan §8's
  // status note) -- EDIT here just keeps this registry's own completeness
  // convention (every material command declares a correction affordance)
  // truthful about what's intended.
  CAPTURE_FACT_CONFIRM: command('CAPTURE_FACT_CONFIRM', 'CAPTURE_FACT_CONFIRM', 'capture.fact.confirm', 'CONTRIBUTOR', 'PROPERTY_FACT_EVIDENCE', ['EDIT'], { title: 'Fact not recorded', body: 'No property fact or evidence record was changed.', suggestion: 'Show my property record' }),
  CAPTURE_EVENT_CONFIRM: command('CAPTURE_EVENT_CONFIRM', 'CAPTURE_EVENT_CONFIRM', 'capture.event.confirm', 'CONTRIBUTOR', 'HOME_EVENT', ['EDIT'], { title: 'Event not recorded', body: 'No home timeline event was created.', suggestion: 'Show my home timeline' }),
  CAPTURE_WARRANTY_CONFIRM: command('CAPTURE_WARRANTY_CONFIRM', 'CAPTURE_WARRANTY_CONFIRM', 'capture.warranty.confirm', 'CONTRIBUTOR', 'WARRANTY', ['EDIT'], { title: 'Warranty not recorded', body: 'No warranty record was created.', suggestion: 'Show my property record' }),
  // Ask Cozy Stage 3, Phase 2 external review (implementation plan §8/§4.2;
  // FRD §23's UPLOAD_EVIDENCE resolution). correctionModes: ['EDIT'] is the
  // SAME "describes intent, not a wired mechanism" placeholder
  // CAPTURE_FACT_CONFIRM/CAPTURE_EVENT_CONFIRM already use above (§4.1: this
  // vocabulary is entirely unconsumed metadata, nothing reads it to drive
  // dispatch) -- kept here only so this registry's own completeness
  // invariant (every material command declares a correction affordance,
  // enforced by askGovernance.test.js) stays satisfied. Unlike FACT/EVENT,
  // there is genuinely no domain-level correction chain at all for a
  // HomeEventEvidence row (no supersession/supersedesEventId equivalent) --
  // the closest real "edit" is removing/re-attaching a document via the
  // traditional property record UI, outside Ask entirely.
  CAPTURE_EVIDENCE_CONFIRM: command('CAPTURE_EVIDENCE_CONFIRM', 'CAPTURE_EVIDENCE_CONFIRM', 'capture.evidence.confirm', 'CONTRIBUTOR', 'HOME_EVENT_EVIDENCE', ['EDIT'], { title: 'Evidence not attached', body: 'No document was attached as evidence to the home timeline event.', suggestion: 'Show my home timeline' }),
});

const BY_OPERATION = new Map(Object.values(ASK_DOMAIN_COMMAND_REGISTRY).map((definition) => [definition.operationId, definition]));

export function getAskDomainCommandByOperation(operationId: string): AskDomainCommandDefinition | null {
  return BY_OPERATION.get(operationId) ?? null;
}

export function validateAskDomainCommandRegistry(): string[] {
  const issues: string[] = [];
  const operationIds = new Set<string>();
  for (const definition of Object.values(ASK_DOMAIN_COMMAND_REGISTRY)) {
    if (operationIds.has(definition.operationId)) issues.push(`${definition.id}: duplicate operation`);
    operationIds.add(definition.operationId);
    if (!definition.adapterKey || !definition.artifactType || !definition.cancellation.title || !definition.cancellation.body) issues.push(`${definition.id}: incomplete adapter contract`);
    if (definition.material && !definition.supportsCancelBeforeExecution) issues.push(`${definition.id}: material command cannot be cancelled`);
  }
  return issues;
}
