// apps/backend/src/services/homeEvents.service.ts
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { markReplaceRepairStale } from './replaceRepairAnalysis.service';

type ListQuery = {
  type?: any;
  importance?: any;
  roomId?: string;
  inventoryItemId?: string;
  claimId?: string;
  from?: string;
  to?: string;
  limit?: number;
};

function moneyToDecimalString(n?: number | null) {
  if (n === undefined || n === null) return null;
  return Number(n).toFixed(2);
}

function shouldInvalidateReplaceRepair(args: {
  inventoryItemId?: string | null;
  type?: string | null;
  subtype?: string | null;
  title?: string | null;
}) {
  if (!args.inventoryItemId) return false;

  const eventType = String(args.type || '').toUpperCase();
  if (eventType === 'REPAIR' || eventType === 'MAINTENANCE' || eventType === 'INSPECTION') {
    return true;
  }

  const descriptor = `${args.subtype ?? ''} ${args.title ?? ''}`.toUpperCase();
  return descriptor.includes('REPAIR') || descriptor.includes('REPLACE') || descriptor.includes('MAINTEN');
}

export class HomeEventsService {
  // ---- guards (ensure linked entities belong to property) ----

  private async assertRoomBelongs(propertyId: string, roomId?: string | null) {
    if (!roomId) return;
    const ok = await prisma.inventoryRoom.findFirst({ where: { id: roomId, propertyId }, select: { id: true } });
    if (!ok) throw new APIError('Room not found', 404, 'ROOM_NOT_FOUND');
  }

  private async assertItemBelongs(propertyId: string, inventoryItemId?: string | null) {
    if (!inventoryItemId) return;
    const ok = await prisma.inventoryItem.findFirst({ where: { id: inventoryItemId, propertyId }, select: { id: true } });
    if (!ok) throw new APIError('Inventory item not found', 404, 'ITEM_NOT_FOUND');
  }

  private async assertClaimBelongs(propertyId: string, claimId?: string | null) {
    if (!claimId) return;
    const ok = await prisma.claim.findFirst({ where: { id: claimId, propertyId }, select: { id: true } });
    if (!ok) throw new APIError('Claim not found', 404, 'CLAIM_NOT_FOUND');
  }

  private async assertExpenseBelongs(propertyId: string, expenseId?: string | null) {
    if (!expenseId) return;
    const ok = await prisma.expense.findFirst({
      where: { id: expenseId, propertyId },
      select: { id: true },
    });
    if (!ok) throw new APIError('Expense not found', 404, 'EXPENSE_NOT_FOUND');
  }

  // Document is property-scoped OR (propertyId null AND uploadedBy matches current homeownerProfile)
  private async assertDocumentAttachAllowed(args: {
    propertyId: string;
    documentId: string;
    homeownerProfileId?: string | null;
  }) {
    const doc = await prisma.document.findUnique({ where: { id: args.documentId } });
    if (!doc) throw new APIError('Document not found', 404, 'DOCUMENT_NOT_FOUND');

    const propertyMatch = doc.propertyId && doc.propertyId === args.propertyId;
    const userMatch = !doc.propertyId && args.homeownerProfileId && doc.uploadedBy === args.homeownerProfileId;

    if (!propertyMatch && !userMatch) {
      throw new APIError('Document not found or access denied', 404, 'DOCUMENT_ACCESS_DENIED');
    }
  }

  // ---- queries ----

  async listHomeEvents(propertyId: string, query: ListQuery) {
    const take = Math.min(Math.max(query.limit ?? 60, 1), 200);

    const where: any = { propertyId };

    if (query.type) where.type = query.type;
    if (query.importance) where.importance = query.importance;
    if (query.roomId) where.roomId = query.roomId;
    if (query.inventoryItemId) where.inventoryItemId = query.inventoryItemId;
    if (query.claimId) where.claimId = query.claimId;

    if (query.from || query.to) {
      where.occurredAt = {};
      if (query.from) where.occurredAt.gte = new Date(query.from);
      if (query.to) where.occurredAt.lte = new Date(query.to);
    }

    const events = await prisma.homeEvent.findMany({
      where,
      take,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      include: {
        documents: {
          include: { document: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    return events;
  }

  async getHomeEvent(propertyId: string, eventId: string) {
    const event = await prisma.homeEvent.findFirst({
      where: { id: eventId, propertyId },
      include: {
        documents: {
          include: { document: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!event) throw new APIError('Home event not found', 404, 'HOME_EVENT_NOT_FOUND');
    return event;
  }

  async createHomeEvent(args: { propertyId: string; userId?: string | null; body: any }) {
    const { propertyId, userId, body } = args;

    await this.assertRoomBelongs(propertyId, body.roomId ?? null);
    await this.assertItemBelongs(propertyId, body.inventoryItemId ?? null);
    await this.assertClaimBelongs(propertyId, body.claimId ?? null);
    await this.assertExpenseBelongs(propertyId, body.expenseId ?? null);

    // If idempotencyKey provided, try to return existing first (clean UX)
    if (body.idempotencyKey) {
      const existing = await prisma.homeEvent.findFirst({
        where: { propertyId, idempotencyKey: body.idempotencyKey },
        include: { documents: { include: { document: true } } },
      });
      if (existing) return existing;
    }

    try {
      const created = await prisma.homeEvent.create({
        data: {
          propertyId,
          createdById: userId ?? null,

          type: body.type,
          subtype: body.subtype ?? null,
          importance: body.importance ?? undefined,
          visibility: body.visibility ?? undefined,

          occurredAt: new Date(body.occurredAt),
          endAt: body.endAt ? new Date(body.endAt) : null,

          title: body.title,
          summary: body.summary ?? null,

          currency: body.currency ?? undefined,
          amount: moneyToDecimalString(body.amount),
          valueDelta: moneyToDecimalString(body.valueDelta),

          roomId: body.roomId ?? null,
          inventoryItemId: body.inventoryItemId ?? null,
          claimId: body.claimId ?? null,
          expenseId: body.expenseId ?? null,

          meta: body.meta ?? undefined,
          groupKey: body.groupKey ?? null,
          idempotencyKey: body.idempotencyKey ?? null,
        },
        include: {
          documents: {
            include: { document: true },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });

      if (
        shouldInvalidateReplaceRepair({
          inventoryItemId: created.inventoryItemId,
          type: created.type,
          subtype: created.subtype,
          title: created.title,
        })
      ) {
        await markReplaceRepairStale(propertyId, created.inventoryItemId || undefined);
      }

      return created;
    } catch (e: any) {
      // If unique propertyId+idempotencyKey violated, return existing
      if (e?.code === 'P2002' && body.idempotencyKey) {
        const existing = await prisma.homeEvent.findFirst({
          where: { propertyId, idempotencyKey: body.idempotencyKey },
          include: { documents: { include: { document: true } } },
        });
        if (existing) return existing;
      }
      throw e;
    }
  }

  async updateHomeEvent(propertyId: string, eventId: string, patch: any) {
    const existing = await prisma.homeEvent.findFirst({
      where: { id: eventId, propertyId },
      select: { id: true, inventoryItemId: true, type: true, subtype: true, title: true },
    });
    if (!existing) throw new APIError('Home event not found', 404, 'HOME_EVENT_NOT_FOUND');

    // If patch includes links, validate them
    await this.assertRoomBelongs(propertyId, patch.roomId ?? undefined);
    await this.assertItemBelongs(propertyId, patch.inventoryItemId ?? undefined);
    await this.assertClaimBelongs(propertyId, patch.claimId ?? undefined);
    await this.assertExpenseBelongs(propertyId, patch.expenseId ?? undefined);

    const updated = await prisma.homeEvent.update({
      where: { id: eventId },
      data: {
        type: patch.type ?? undefined,
        subtype: patch.subtype ?? undefined,
        importance: patch.importance ?? undefined,
        visibility: patch.visibility ?? undefined,

        occurredAt: patch.occurredAt ? new Date(patch.occurredAt) : undefined,
        endAt: patch.endAt ? new Date(patch.endAt) : (patch.endAt === null ? null : undefined),

        title: patch.title ?? undefined,
        summary: patch.summary ?? undefined,

        currency: patch.currency ?? undefined,
        amount: patch.amount !== undefined ? moneyToDecimalString(patch.amount) : undefined,
        valueDelta: patch.valueDelta !== undefined ? moneyToDecimalString(patch.valueDelta) : undefined,

        roomId: patch.roomId !== undefined ? patch.roomId : undefined,
        inventoryItemId: patch.inventoryItemId !== undefined ? patch.inventoryItemId : undefined,
        claimId: patch.claimId !== undefined ? patch.claimId : undefined,
        expenseId: patch.expenseId !== undefined ? patch.expenseId : undefined,

        meta: patch.meta ?? undefined,
        groupKey: patch.groupKey ?? undefined,
        idempotencyKey: patch.idempotencyKey ?? undefined,
      },
      include: {
        documents: {
          include: { document: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    const touchedItemIds = new Set<string>();
    if (
      shouldInvalidateReplaceRepair({
        inventoryItemId: existing.inventoryItemId,
        type: existing.type,
        subtype: existing.subtype,
        title: existing.title,
      }) &&
      existing.inventoryItemId
    ) {
      touchedItemIds.add(existing.inventoryItemId);
    }
    if (
      shouldInvalidateReplaceRepair({
        inventoryItemId: updated.inventoryItemId,
        type: updated.type,
        subtype: updated.subtype,
        title: updated.title,
      }) &&
      updated.inventoryItemId
    ) {
      touchedItemIds.add(updated.inventoryItemId);
    }
    for (const itemId of touchedItemIds) {
      await markReplaceRepairStale(propertyId, itemId);
    }

    return updated;
  }

  async deleteHomeEvent(propertyId: string, eventId: string) {
    const existing = await prisma.homeEvent.findFirst({
      where: { id: eventId, propertyId },
      select: { id: true, inventoryItemId: true, type: true, subtype: true, title: true },
    });
    if (!existing) throw new APIError('Home event not found', 404, 'HOME_EVENT_NOT_FOUND');

    await prisma.homeEvent.delete({ where: { id: eventId } });

    if (
      shouldInvalidateReplaceRepair({
        inventoryItemId: existing.inventoryItemId,
        type: existing.type,
        subtype: existing.subtype,
        title: existing.title,
      }) &&
      existing.inventoryItemId
    ) {
      await markReplaceRepairStale(propertyId, existing.inventoryItemId);
    }
  }

  async attachDocument(args: {
    propertyId: string;
    eventId: string;
    documentId: string;
    kind?: string;
    caption?: string | null;
    sortOrder?: number;
    homeownerProfileId?: string | null;
  }) {
    const event = await prisma.homeEvent.findFirst({
      where: { id: args.eventId, propertyId: args.propertyId },
      select: { id: true },
    });
    if (!event) throw new APIError('Home event not found', 404, 'HOME_EVENT_NOT_FOUND');

    await this.assertDocumentAttachAllowed({
      propertyId: args.propertyId,
      documentId: args.documentId,
      homeownerProfileId: args.homeownerProfileId ?? null,
    });

    const link = await prisma.homeEventDocument.upsert({
      where: { eventId_documentId: { eventId: args.eventId, documentId: args.documentId } },
      create: {
        eventId: args.eventId,
        documentId: args.documentId,
        kind: (args.kind as any) ?? 'OTHER',
        caption: args.caption ?? null,
        sortOrder: args.sortOrder ?? 0,
      },
      update: {
        kind: args.kind ? (args.kind as any) : undefined,
        caption: args.caption !== undefined ? args.caption : undefined,
        sortOrder: args.sortOrder !== undefined ? args.sortOrder : undefined,
      },
      include: { document: true },
    });

    return link;
  }

  async detachDocument(propertyId: string, eventId: string, documentId: string) {
    const event = await prisma.homeEvent.findFirst({
      where: { id: eventId, propertyId },
      select: { id: true },
    });
    if (!event) throw new APIError('Home event not found', 404, 'HOME_EVENT_NOT_FOUND');

    await prisma.homeEventDocument.delete({
      where: { eventId_documentId: { eventId, documentId } },
    });
  }
}
