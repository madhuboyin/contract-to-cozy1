import { z } from 'zod';
import {
  OperationalObligationType,
  OperationalWorkItemState,
  OperationalWorkItemDisposition,
  OperationalWorkSubjectType,
  OperationalWorkEvidenceType,
  OperationalWorkEvidenceVerificationStatus,
} from '@prisma/client';

export const ListWorkItemsQuerySchema = z.object({
  state: z.nativeEnum(OperationalWorkItemState).optional(),
  obligationType: z.nativeEnum(OperationalObligationType).optional(),
  ownerUserId: z.string().trim().min(1).optional(),
  subjectType: z.nativeEnum(OperationalWorkSubjectType).optional(),
  subjectId: z.string().trim().min(1).optional(),
});

// Home Operations Slice 8: the write API — every mutation Slice 1 already
// built usecases for but never exposed via a route.

export const AssignOwnerSchema = z.object({
  ownerUserId: z.string().trim().min(1).nullable(),
});

export const AddWatcherSchema = z.object({
  userId: z.string().trim().min(1),
});

export const TransitionWorkItemSchema = z.object({
  to: z.nativeEnum(OperationalWorkItemState),
  disposition: z.nativeEnum(OperationalWorkItemDisposition).optional(),
  // Item #19 (§5.15) Slice 1: a real future date for DEFERRED (deferredUntil)
  // or BLOCKED (nextReviewAt) — e.g. "defer until next month," not "defer as
  // of right now." Ignored by the usecase for every other target state.
  deferUntil: z.string().datetime().optional(),
});

// Item #19 (§5.15) Slice 1: snooze vs. reschedule vs. defer are distinct
// operations — see the item's plan. Snooze never touches state or due
// fields; reschedule deliberately overwrites the commitment; defer routes
// through TransitionWorkItemSchema above (a state change to DEFERRED).

export const SnoozeWorkItemSchema = z.object({
  snoozedUntil: z.string().datetime().nullable(),
});

export const RescheduleWorkItemSchema = z.object({
  dueWindowStart: z.string().datetime().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  dueWindowEnd: z.string().datetime().nullable().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one of dueWindowStart, dueAt, or dueWindowEnd must be provided.' },
);

export const RecordDuplicateDecisionSchema = z.object({
  supersededByWorkItemId: z.string().trim().min(1),
});

export const RecordEvidenceSchema = z.object({
  evidenceType: z.nativeEnum(OperationalWorkEvidenceType),
  evidenceEntityId: z.string().trim().min(1),
  verificationStatus: z.nativeEnum(OperationalWorkEvidenceVerificationStatus).optional(),
  observedAt: z.string().datetime().optional(),
});
