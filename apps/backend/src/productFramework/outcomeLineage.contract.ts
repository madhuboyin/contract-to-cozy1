import { z } from 'zod';

export const NORTH_STAR_EVENT_TYPES = [
  'ENTRY_CONTEXT_CAPTURED',
  'ACTIVE_TRIGGER_IDENTIFIED',
  'HOME_ACTION_IDENTIFIED',
  'HOME_ACTION_SURFACED',
  'HOME_ACTION_RESOLUTION_RECORDED',
  'HOME_ACTION_OUTCOME_VERIFIED',
] as const;

export const IMPORTANT_ACTION_REASONS = [
  'SAFETY_OR_ACTIVE_DAMAGE',
  'MATERIAL_FINANCIAL_CONSEQUENCE',
  'MATERIAL_DEADLINE_OR_RIGHT',
  'HOMEOWNER_DECLARED_IMPORTANT',
  'MAJOR_MOMENT_DEPENDENCY',
  'REVIEWED_DOMAIN_RULE',
] as const;

export const ACTION_RESOLUTION_DISPOSITIONS = [
  'COMPLETED',
  'INTENTIONALLY_DEFERRED',
  'DELIBERATELY_DISMISSED',
  'SAFE_ESCALATION',
] as const;

export const OutcomeLineageSchema = z.object({
  entryId: z.string().trim().min(1).max(160),
  triggerId: z.string().trim().min(1).max(160),
  signalId: z.string().trim().min(1).max(160).nullable(),
  actionId: z.string().trim().min(1).max(160),
  recommendationVersion: z.string().trim().min(1).max(80),
  journeyId: z.string().trim().min(1).max(160).nullable(),
  decisionId: z.string().trim().min(1).max(160).nullable(),
  executionId: z.string().trim().min(1).max(160).nullable(),
  verificationId: z.string().trim().min(1).max(160).nullable(),
  outcomeId: z.string().trim().min(1).max(160).nullable(),
});

export const NorthStarActionRecordSchema = z.object({
  lineage: OutcomeLineageSchema,
  importantReasons: z.array(z.enum(IMPORTANT_ACTION_REASONS)).min(1),
  identifiedAt: z.string().datetime(),
  actionWindowClosesAt: z.string().datetime().nullable(),
  resolution: z.object({
    disposition: z.enum(ACTION_RESOLUTION_DISPOSITIONS),
    resolvedAt: z.string().datetime(),
    reason: z.string().trim().min(1).max(1000),
    consequenceAcknowledged: z.boolean(),
    nextTriggerAt: z.string().datetime().nullable(),
    unresolvedSafetyRequirement: z.boolean(),
    verificationStatus: z.enum(['NOT_REQUIRED', 'PENDING', 'VERIFIED', 'FAILED']),
  }).nullable(),
});

export type OutcomeLineage = z.infer<typeof OutcomeLineageSchema>;
export type NorthStarActionRecord = z.infer<typeof NorthStarActionRecordSchema>;

export type NorthStarEvaluation = {
  important: boolean;
  identifiedEarly: boolean;
  successfullyResolved: boolean;
  eligibleForNumerator: boolean;
  reasons: string[];
};

export function evaluateNorthStarAction(input: unknown): NorthStarEvaluation {
  const record = NorthStarActionRecordSchema.parse(input);
  const reasons: string[] = [];
  const important = record.importantReasons.length > 0;
  const identifiedEarly = record.actionWindowClosesAt == null ||
    new Date(record.identifiedAt).getTime() <= new Date(record.actionWindowClosesAt).getTime();

  if (!identifiedEarly) reasons.push('ACTION_IDENTIFIED_AFTER_WINDOW_CLOSED');

  let successfullyResolved = false;
  const resolution = record.resolution;
  if (!resolution) {
    reasons.push('ACTION_NOT_RESOLVED');
  } else if (resolution.disposition === 'COMPLETED') {
    successfullyResolved = resolution.verificationStatus === 'VERIFIED' ||
      resolution.verificationStatus === 'NOT_REQUIRED';
    if (!successfullyResolved) reasons.push('COMPLETION_NOT_VERIFIED');
  } else if (resolution.disposition === 'INTENTIONALLY_DEFERRED') {
    successfullyResolved = Boolean(resolution.nextTriggerAt) &&
      resolution.consequenceAcknowledged &&
      !resolution.unresolvedSafetyRequirement;
    if (!successfullyResolved) reasons.push('DEFERMENT_MISSING_SAFE_FOLLOW_UP');
  } else if (resolution.disposition === 'DELIBERATELY_DISMISSED') {
    successfullyResolved = resolution.consequenceAcknowledged &&
      !resolution.unresolvedSafetyRequirement;
    if (!successfullyResolved) reasons.push('DISMISSAL_LEFT_UNRESOLVED_SAFETY_REQUIREMENT');
  } else if (resolution.disposition === 'SAFE_ESCALATION') {
    successfullyResolved = resolution.consequenceAcknowledged &&
      resolution.verificationStatus !== 'FAILED';
    if (!successfullyResolved) reasons.push('ESCALATION_NOT_ACKNOWLEDGED');
  }

  return {
    important,
    identifiedEarly,
    successfullyResolved,
    eligibleForNumerator: important && identifiedEarly && successfullyResolved,
    reasons,
  };
}
