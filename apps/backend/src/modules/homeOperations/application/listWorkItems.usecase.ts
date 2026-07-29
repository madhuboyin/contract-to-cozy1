import type { OperationalObligationType, OperationalWorkItemState, OperationalWorkSubjectType } from '@prisma/client';
import { listWorkItemsForProperty } from '../infrastructure/workItemRepository';

export interface ListWorkItemsInput {
  propertyId: string;
  state?: OperationalWorkItemState;
  obligationType?: OperationalObligationType;
  ownerUserId?: string;
  subjectType?: OperationalWorkSubjectType;
  subjectId?: string;
}

export async function listWorkItems(input: ListWorkItemsInput) {
  const items = await listWorkItemsForProperty(input);
  return items.map((item) => ({
    id: item.id,
    workKey: item.workKey,
    subjectType: item.subjectType,
    subjectId: item.subjectId,
    obligationType: item.obligationType,
    state: item.state,
    acceptanceState: item.acceptanceState,
    disposition: item.disposition,
    priority: item.priority,
    safetyTier: item.safetyTier,
    title: item.title,
    homeownerReason: item.homeownerReason,
    expectedOutcome: item.expectedOutcome,
    dueWindowStart: item.dueWindowStart,
    dueAt: item.dueAt,
    dueWindowEnd: item.dueWindowEnd,
    ownerUserId: item.ownerUserId,
    confidence: item.confidence,
    missingContext: item.missingContext,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));
}
