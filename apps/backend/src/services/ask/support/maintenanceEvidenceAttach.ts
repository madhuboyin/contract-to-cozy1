import { z } from 'zod';

export const MAINTENANCE_EVIDENCE_ATTACH_MESSAGE = 'Attach evidence to a maintenance task.';
export const MAINTENANCE_EVIDENCE_CAPTURE_KEY = 'MAINTENANCE_EVIDENCE_INPUTS';
export const MAINTENANCE_TASK_ENTITY_TYPE = 'PROPERTY_MAINTENANCE_TASK';
/** The form's answer: the Home Records that are the evidence (chosen from Home Records or uploaded straight into them). */
export const MaintenanceEvidenceAnswerSchema = z.object({
  recordIds: z.array(z.string().min(1)).min(1).max(20),
}).strict();
export type MaintenanceEvidenceAnswer = z.infer<typeof MaintenanceEvidenceAnswerSchema>;

/** The "Use an existing task" form of the same operation: link a task already in this home's Maintenance to the journey step. Never matched by title, category or asset. */
export const MAINTENANCE_LINK_EXISTING_MESSAGE = 'Use an existing maintenance task for this step.';
export const MAINTENANCE_LINK_CAPTURE_KEY = 'MAINTENANCE_LINK_INPUTS';
export const MaintenanceLinkAnswerSchema = z.object({ taskId: z.string().min(1) }).strict();
export type MaintenanceLinkAnswer = z.infer<typeof MaintenanceLinkAnswerSchema>;
