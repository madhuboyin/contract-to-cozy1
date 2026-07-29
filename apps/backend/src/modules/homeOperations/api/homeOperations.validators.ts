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
});

export const RecordDuplicateDecisionSchema = z.object({
  supersededByWorkItemId: z.string().trim().min(1),
});

export const RecordEvidenceSchema = z.object({
  evidenceType: z.nativeEnum(OperationalWorkEvidenceType),
  evidenceEntityId: z.string().trim().min(1),
  verificationStatus: z.nativeEnum(OperationalWorkEvidenceVerificationStatus).optional(),
  observedAt: z.string().datetime().optional(),
});
