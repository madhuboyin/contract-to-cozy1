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
