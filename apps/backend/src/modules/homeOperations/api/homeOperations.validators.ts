import { z } from 'zod';
import {
  OperationalObligationType,
  OperationalWorkItemState,
  OperationalWorkSubjectType,
} from '@prisma/client';

export const ListWorkItemsQuerySchema = z.object({
  state: z.nativeEnum(OperationalWorkItemState).optional(),
  obligationType: z.nativeEnum(OperationalObligationType).optional(),
  ownerUserId: z.string().trim().min(1).optional(),
  subjectType: z.nativeEnum(OperationalWorkSubjectType).optional(),
  subjectId: z.string().trim().min(1).optional(),
});
