import { z } from 'zod';

export const MAINTENANCE_EVIDENCE_ATTACH_MESSAGE = 'Attach evidence to a maintenance task.';
export const MAINTENANCE_EVIDENCE_CAPTURE_KEY = 'MAINTENANCE_EVIDENCE_INPUTS';
export const MAINTENANCE_TASK_ENTITY_TYPE = 'PROPERTY_MAINTENANCE_TASK';
/** The form's answer: the Home Records that are the evidence (chosen from Home Records or uploaded straight into them). */
export const MaintenanceEvidenceAnswerSchema = z.object({
  recordIds: z.array(z.string().min(1)).min(1).max(20),
}).strict();
export type MaintenanceEvidenceAnswer = z.infer<typeof MaintenanceEvidenceAnswerSchema>;
