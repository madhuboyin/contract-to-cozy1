// apps/backend/src/services/orchestrationCompletion.service.ts
import { prisma } from '../lib/prisma';
import { CompletionCreateInput, CompletionResponse } from './orchestration.service';

export async function createCompletion(params: {
  propertyId: string;
  actionKey: string;
  eventId: string;
  data: CompletionCreateInput;
  userId?: string | null;
}): Promise<CompletionResponse> {
  const { propertyId, actionKey, eventId, data, userId } = params;

  const completion = await prisma.orchestrationActionCompletion.create({
    data: {
      propertyId,
      actionKey,
      eventId,
      completedAt: new Date(data.completedAt),
      costAmount: data.cost ?? null,
      didItMyself: data.didItMyself ?? false,
      serviceProviderName: data.serviceProviderName ?? null,
      serviceProviderRating: data.serviceProviderRating ?? null,
      notes: data.notes ?? null,
      photoCount: data.photoIds?.length ?? 0,
      createdBy: userId ?? null,
    },
    include: {
      photos: {
        orderBy: { orderIndex: 'asc' },
      },
    },
  });

  // Link photos to completion if provided
  if (data.photoIds && data.photoIds.length > 0) {
    await prisma.orchestrationActionCompletionPhoto.updateMany({
      where: {
        id: { in: data.photoIds },
        completionId: null, // Only link orphaned photos
      },
      data: {
        completionId: completion.id,
      },
    });
  }

  return mapCompletionToResponse(completion);
}

export async function getCompletion(
  propertyId: string,
  completionId: string
): Promise<CompletionResponse | null> {
  const completion = await prisma.orchestrationActionCompletion.findFirst({
    where: {
      id: completionId,
      propertyId,
    },
    include: {
      photos: {
        orderBy: { orderIndex: 'asc' },
      },
    },
  });

  return completion ? mapCompletionToResponse(completion) : null;
}

export async function getCompletionByEventId(
  eventId: string
): Promise<CompletionResponse | null> {
  const completion = await prisma.orchestrationActionCompletion.findUnique({
    where: { eventId },
    include: {
      photos: {
        orderBy: { orderIndex: 'asc' },
      },
    },
  });

  return completion ? mapCompletionToResponse(completion) : null;
}

export async function updateCompletion(
  propertyId: string,
  completionId: string,
  data: Partial<CompletionCreateInput>
): Promise<CompletionResponse> {
  // Check if within 24 hours
  const existing = await prisma.orchestrationActionCompletion.findFirst({
    where: { id: completionId, propertyId },
  });

  if (!existing) {
    throw new Error('Completion not found');
  }

  const hoursSinceCreation =
    (Date.now() - existing.createdAt.getTime()) / (1000 * 60 * 60);
  
  if (hoursSinceCreation > 24) {
    throw new Error('Cannot edit completion after 24 hours');
  }

  const updated = await prisma.orchestrationActionCompletion.update({
    where: { id: completionId },
    data: {
      ...(data.completedAt && { completedAt: new Date(data.completedAt) }),
      ...(data.cost !== undefined && { costAmount: data.cost }),
      ...(data.didItMyself !== undefined && { didItMyself: data.didItMyself }),
      ...(data.serviceProviderName !== undefined && { serviceProviderName: data.serviceProviderName }),
      ...(data.serviceProviderRating !== undefined && { serviceProviderRating: data.serviceProviderRating }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.photoIds && { photoCount: data.photoIds.length }),
    },
    include: {
      photos: {
        orderBy: { orderIndex: 'asc' },
      },
    },
  });

  return mapCompletionToResponse(updated);
}

function mapCompletionToResponse(completion: any): CompletionResponse {
  return {
    id: completion.id,
    actionKey: completion.actionKey,
    completedAt: completion.completedAt.toISOString(),
    cost: completion.costAmount ? Number(completion.costAmount) : null,
    didItMyself: completion.didItMyself,
    serviceProviderName: completion.serviceProviderName,
    serviceProviderRating: completion.serviceProviderRating,
    notes: completion.notes,
    photoCount: completion.photoCount,
    photos: (completion.photos || []).map((p: any) => ({
      id: p.id,
      thumbnailUrl: p.thumbnailUrl,
      originalUrl: p.originalUrl,
      fileName: p.fileName,
      fileSize: p.fileSizeBytes,
      order: p.orderIndex,
    })),
    createdAt: completion.createdAt.toISOString(),
    updatedAt: completion.updatedAt.toISOString(),
  };
}