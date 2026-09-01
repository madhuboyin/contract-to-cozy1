// apps/backend/src/services/homeEvents.service.ts
import { createHash } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { markReplaceRepairStale } from './replaceRepairAnalysis.service';
import { markDoNothingRunsStale } from './doNothingSimulator.service';
import { formatMajorApplianceType, inferMajorApplianceType, majorApplianceTypeFromSourceHash } from './majorAppliance.util';
import {
  buildUnifiedEventEnvelope,
  mergeTimelineProjectionEntries,
  timelineEntryFromEvent,
  timelineEntryFromSignal,
  TimelineProjectionEntry,
} from './eventSignalProjection.service';
import { SharedSignalKey, signalService } from './signal.service';
import { recordHomeEventOutcome } from './decisionPlatform/outcomeObservationService';

type ListQuery = {
  type?: any;
  importance?: any;
  roomId?: string;
  inventoryItemId?: string;
  claimId?: string;
  from?: string;
  to?: string;
  limit?: number;
  includeSignals?: boolean;
};

function moneyToDecimalString(n?: number | null) {
  if (n === undefined || n === null) return null;
  return Number(n).toFixed(2);
}

function homeEventEvidenceKey(input: {
  documentId?: string | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  evidenceType: string;
  note?: string | null;
}) {
  if (input.documentId) return `document:${input.documentId}`;
  if (input.sourceEntityType && input.sourceEntityId) {
    return `source:${input.sourceEntityType}:${input.sourceEntityId}`;
  }
  return `attestation:${createHash('sha256')
    .update(`${input.evidenceType}:${input.note ?? ''}`)
    .digest('hex')}`;
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

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function normalizeTimelineTitle(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/^purchased(?:\s*:)?\s*/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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

  private async assertParentEventBelongs(propertyId: string, parentEventId?: string | null) {
    if (!parentEventId) return;
    const ok = await prisma.homeEvent.findFirst({
      where: { id: parentEventId, propertyId, isCurrent: true, deletedAt: null },
      select: { id: true },
    });
    if (!ok) throw new APIError('Parent event not found', 404, 'PARENT_EVENT_NOT_FOUND');
  }

  private async assertNoParentCycle(propertyId: string, eventId: string, parentEventId?: string | null) {
    let cursor = parentEventId ?? null;
    const visited = new Set<string>();
    while (cursor) {
      if (cursor === eventId || visited.has(cursor)) {
        throw new APIError('Timeline story grouping cannot contain a cycle.', 422, 'HOME_EVENT_PARENT_CYCLE');
      }
      visited.add(cursor);
      const parent = await prisma.homeEvent.findFirst({
        where: { id: cursor, propertyId, isCurrent: true, deletedAt: null },
        select: { parentEventId: true },
      });
      cursor = parent?.parentEventId ?? null;
    }
  }

  private async assertEvidenceSourceBelongs(
    propertyId: string,
    sourceEntityType?: string | null,
    sourceEntityId?: string | null,
  ) {
    if (!sourceEntityType || !sourceEntityId) return;
    const type = sourceEntityType.trim().toUpperCase();
    const record = type === 'CLAIM'
      ? await prisma.claim.findFirst({ where: { id: sourceEntityId, propertyId }, select: { id: true } })
      : type === 'INSPECTIONREPORT'
        ? await prisma.inspectionReport.findFirst({ where: { id: sourceEntityId, propertyId }, select: { id: true } })
        : type === 'PROJECTRECORD'
          ? await prisma.projectRecord.findFirst({ where: { id: sourceEntityId, propertyId }, select: { id: true } })
          : type === 'PROPERTYMAINTENANCETASK'
            ? await prisma.propertyMaintenanceTask.findFirst({ where: { id: sourceEntityId, propertyId }, select: { id: true } })
            : null;
    if (!record) {
      throw new APIError(
        'The selected evidence record does not belong to this property.',
        404,
        'HOME_EVENT_EVIDENCE_SOURCE_NOT_FOUND',
      );
    }
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

  async listHomeEvents(propertyId: string, query: ListQuery): Promise<{
    events: any[];
    signalEvents: TimelineProjectionEntry[];
    timelineEntries: TimelineProjectionEntry[];
  }> {
    const take = Math.min(Math.max(query.limit ?? 60, 1), 200);
    const shouldNormalizePurchases = !query.type || String(query.type).toUpperCase() === 'PURCHASE';
    const shouldInjectCanonicalAppliances =
      shouldNormalizePurchases &&
      !query.importance &&
      !query.roomId &&
      !query.inventoryItemId &&
      !query.claimId &&
      !query.from &&
      !query.to;

    const where: any = { propertyId, isCurrent: true, deletedAt: null };

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

    const fetchTake = shouldNormalizePurchases ? Math.min(take * 2, 400) : take;

    const events = await prisma.homeEvent.findMany({
      where,
      take: fetchTake,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      include: {
        documents: {
          include: { document: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        inventoryItem: {
          select: { id: true, name: true, sourceHash: true },
        },
        evidence: { orderBy: { createdAt: 'asc' } },
        verificationRecords: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });

    const normalizedEvents = shouldNormalizePurchases ? this.collapseDuplicatePurchaseEvents(events) : events;
    const canonicalBackfilledEvents = shouldInjectCanonicalAppliances
      ? await this.injectMissingCanonicalApplianceEvents(propertyId, normalizedEvents)
      : normalizedEvents;
    const sorted = canonicalBackfilledEvents.sort((a, b) => {
      const byDate = new Date(b.occurredAt || 0).getTime() - new Date(a.occurredAt || 0).getTime();
      if (byDate !== 0) return byDate;
      return String(b.id || '').localeCompare(String(a.id || ''));
    });

    const projectedEventsBase = sorted.slice(0, take).map(({ inventoryItem, ...event }) => event);

    // Home Records evidence links back via PropertyRecordLink (entityType
    // HOME_EVENT), not a Prisma relation on HomeEvent itself, so it can't be
    // pulled in via the `include` above — batched by event id here instead
    // of a per-event query. See getHomeEvent() for the single-event version.
    const eventIds = projectedEventsBase.map((event) => event.id);
    const propertyRecordLinks = eventIds.length > 0
      ? await prisma.propertyRecordLink.findMany({
        where: { entityType: 'HOME_EVENT', entityId: { in: eventIds } },
        include: {
          record: { select: { id: true, title: true, recordType: true, lifecycleStatus: true } },
          version: { select: { id: true, versionNumber: true, scanStatus: true, integrityStatus: true } },
        },
      })
      : [];
    const recordLinksByEventId = new Map<string, typeof propertyRecordLinks>();
    for (const link of propertyRecordLinks) {
      const existing = recordLinksByEventId.get(link.entityId);
      if (existing) existing.push(link);
      else recordLinksByEventId.set(link.entityId, [link]);
    }
    const projectedEvents = projectedEventsBase.map((event) => ({
      ...event,
      propertyRecordLinks: recordLinksByEventId.get(event.id) ?? [],
    }));
    // Analytical signals are not durable property history. They are available
    // only to explicit legacy/debug callers and never enter the default view.
    const includeSignals = query.includeSignals === true;

    const signalEvents = includeSignals
      ? await this.buildSignalTimelineEntries(propertyId, take)
      : [];
    const eventTimelineEntries = projectedEvents.map((event) => this.mapHomeEventToTimelineEntry(event));
    const timelineEntries = mergeTimelineProjectionEntries([...eventTimelineEntries, ...signalEvents], take * 2);

    return {
      events: projectedEvents,
      signalEvents,
      timelineEntries,
    };
  }

  private mapHomeEventToTimelineEntry(event: any): TimelineProjectionEntry {
    const envelope = buildUnifiedEventEnvelope({
      eventType: String(event.type || 'OTHER'),
      propertyId: event.propertyId,
      sourceModel: 'HomeEventsService',
      sourceId: String(event.id),
      occurredAt: event.occurredAt,
      roomId: event.roomId ?? null,
      payloadJson: {
        subtype: event.subtype ?? null,
        importance: event.importance ?? null,
        amount: event.amount ?? null,
        currency: event.currency ?? null,
        observationKind: event.observationKind,
        datePrecision: event.datePrecision,
        verificationStatus: event.verificationStatus,
        sourceType: event.sourceType,
        parentEventId: event.parentEventId ?? null,
        groupType: event.groupType ?? null,
        revision: event.revision ?? 1,
        correctionReason: event.correctionReason ?? null,
        meta: event.meta ?? null,
        synthetic: event.meta?.synthetic === true,
      },
    });

    return timelineEntryFromEvent(envelope, String(event.title || 'Home event'), event.summary ?? null);
  }

  private async buildSignalTimelineEntries(propertyId: string, _take: number): Promise<TimelineProjectionEntry[]> {
    // Only surface signals that represent real ownership moments, not internal analysis artifacts.
    // RISK_SPIKE, COST_ANOMALY, RISK_ACCUMULATION, SYSTEM_DEGRADATION, COST_PRESSURE_PATTERN are
    // emitted every analysis run and produce noisy, technical-sounding clutter.
    const milestoneSignalKeys: SharedSignalKey[] = [
      'MAINT_ADHERENCE',
      'COVERAGE_GAP',
      'SAVINGS_REALIZATION',
      'FINANCIAL_DISCIPLINE',
    ];

    // getLatestSignalsByKey returns at most one entry per key — no spam.
    const latestByKey = await signalService.getLatestSignalsByKey(propertyId, milestoneSignalKeys, {
      freshOnly: true,
    });

    return Object.values(latestByKey)
      .filter((signal): signal is NonNullable<typeof signal> => Boolean(signal))
      .map((signal) => timelineEntryFromSignal(signal!));
  }

  private canonicalPurchaseKey(event: any): string | null {
    if (String(event?.type || '').toUpperCase() !== 'PURCHASE') return null;

    const sourceHashType = majorApplianceTypeFromSourceHash(event?.inventoryItem?.sourceHash);
    if (sourceHashType) return `appliance:${sourceHashType}`;

    const title = String(event?.title || '');
    if (!/^purchased\b/i.test(title)) return null;

    const inferredFromTitle = inferMajorApplianceType(title);
    if (inferredFromTitle) return `appliance:${inferredFromTitle}`;

    const normalized = normalizeTimelineTitle(title);
    return normalized ? `purchase:${normalized}` : null;
  }

  private collapseDuplicatePurchaseEvents(events: any[]) {
    const passthrough: any[] = [];
    const groupedPurchases = new Map<string, any[]>();

    for (const event of events) {
      const key = this.canonicalPurchaseKey(event);
      if (!key) {
        passthrough.push(event);
        continue;
      }
      if (!groupedPurchases.has(key)) {
        groupedPurchases.set(key, []);
      }
      groupedPurchases.get(key)!.push(event);
    }

    const collapsedPurchases = Array.from(groupedPurchases.entries()).map(([key, duplicates]) => {
      if (duplicates.length === 1) return duplicates[0];

      const sortedByDate = [...duplicates].sort(
        (a, b) => new Date(a?.occurredAt || 0).getTime() - new Date(b?.occurredAt || 0).getTime()
      );
      const earliest = sortedByDate[0];
      const latest = sortedByDate[sortedByDate.length - 1];
      const preferredEvent =
        sortedByDate.find((entry) => (entry.documents || []).length > 0) ??
        [...sortedByDate].reverse().find((entry) => Boolean(entry.createdById)) ??
        latest;
      const inferredType = key.startsWith('appliance:')
        ? key.replace('appliance:', '')
        : inferMajorApplianceType(earliest.title);
      const canonicalTitle = inferredType
        ? `Purchased: ${formatMajorApplianceType(inferredType)}`
        : earliest.title;
      const rangeLabel =
        toIsoDate(new Date(earliest.occurredAt)) === toIsoDate(new Date(latest.occurredAt))
          ? `on ${toIsoDate(new Date(earliest.occurredAt))}`
          : `from ${toIsoDate(new Date(earliest.occurredAt))} to ${toIsoDate(new Date(latest.occurredAt))}`;
      const mergedSummary = [preferredEvent.summary, `Consolidated ${duplicates.length} similar purchase entries ${rangeLabel}.`]
        .filter(Boolean)
        .join(' ');

      return {
        ...preferredEvent,
        title: canonicalTitle,
        summary: mergedSummary || null,
      };
    });

    return [...passthrough, ...collapsedPurchases];
  }

  private async injectMissingCanonicalApplianceEvents(propertyId: string, events: any[]) {
    const existingTypes = new Set<string>();
    events.forEach((event) => {
      const key = this.canonicalPurchaseKey(event);
      if (key?.startsWith('appliance:')) {
        existingTypes.add(key.replace('appliance:', ''));
      }
    });

    const canonicalAppliances = await prisma.inventoryItem.findMany({
      where: {
        propertyId,
        sourceHash: { startsWith: 'property_appliance::' },
      },
      select: {
        id: true,
        name: true,
        sourceHash: true,
        installedOn: true,
        purchasedOn: true,
        createdAt: true,
      },
      orderBy: [{ purchasedOn: 'desc' }, { createdAt: 'desc' }],
    });

    const syntheticEvents = canonicalAppliances
      .map((appliance) => {
        const applianceType = majorApplianceTypeFromSourceHash(appliance.sourceHash);
        if (!applianceType || existingTypes.has(applianceType)) return null;

        const referenceDate = appliance.purchasedOn;
        if (!referenceDate) return null;

        return {
          id: `synthetic-appliance-${applianceType.toLowerCase()}`,
          propertyId,
          createdById: null,
          roomId: null,
          inventoryItemId: appliance.id,
          claimId: null,
          expenseId: null,
          type: 'PURCHASE',
          subtype: 'APPLIANCE_INVENTORY',
          importance: 'LOW',
          visibility: 'HOUSEHOLD',
          occurredAt: referenceDate,
          endAt: null,
          title: `Purchased: ${formatMajorApplianceType(applianceType)}`,
          summary: 'Captured from property appliance profile. Add purchase records to improve timeline precision.',
          amount: null,
          currency: 'USD',
          valueDelta: null,
          meta: {
            synthetic: true,
            source: 'property_appliance_inventory',
            applianceType,
          },
          groupKey: null,
          idempotencyKey: null,
          sourceBadge: 'INFERRED',
          observationKind: 'INFERRED',
          datePrecision: 'EXACT_DATE',
          verificationStatus: 'PENDING_CONFIRMATION',
          sourceType: 'INFERENCE',
          sourceEntityType: 'InventoryItem',
          sourceEntityId: appliance.id,
          sourceAsOf: appliance.createdAt,
          revision: 1,
          isCurrent: true,
          deletedAt: null,
          confidenceScore: null,
          provenanceId: null,
          createdAt: referenceDate,
          updatedAt: referenceDate,
          documents: [],
          inventoryItem: {
            id: appliance.id,
            name: appliance.name,
            sourceHash: appliance.sourceHash,
          },
        };
      })
      .filter(Boolean);

    return [...events, ...syntheticEvents];
  }

  async getHomeEvent(propertyId: string, eventId: string) {
    const event = await prisma.homeEvent.findFirst({
      where: { id: eventId, propertyId },
      include: {
        documents: {
          include: { document: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        evidence: {
          include: { document: true, addedBy: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'asc' },
        },
        verificationRecords: { orderBy: { createdAt: 'desc' } },
        supersedesEvent: {
          select: { id: true, revision: true, correctionReason: true, updatedAt: true },
        },
        supersededByEvents: {
          select: { id: true, revision: true, correctionReason: true, updatedAt: true },
          orderBy: { revision: 'asc' },
        },
        parentEvent: { select: { id: true, title: true, groupType: true } },
        childEvents: {
          where: { deletedAt: null },
          select: { id: true, title: true, occurredAt: true, datePrecision: true },
          orderBy: { occurredAt: 'asc' },
        },
      },
    });
    if (!event) throw new APIError('Home event not found', 404, 'HOME_EVENT_NOT_FOUND');

    // Home Records evidence (e.g. a reviewed warranty/receipt promotion —
    // see homeRecordsExtraction.service.ts) links back here via a typed
    // PropertyRecordLink (entityType HOME_EVENT) rather than the legacy
    // Document model that `documents`/`evidence` above read from. Slice 6 of
    // HOME_CONTINUITY_AND_RECORDS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md
    // calls for surfacing this so an event's detail shows how it's known,
    // not just what happened.
    const propertyRecordLinks = await prisma.propertyRecordLink.findMany({
      where: { entityType: 'HOME_EVENT', entityId: eventId },
      include: {
        record: { select: { id: true, title: true, recordType: true, lifecycleStatus: true } },
        version: { select: { id: true, versionNumber: true, scanStatus: true, integrityStatus: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return { ...event, propertyRecordLinks };
  }

  async createHomeEvent(args: { propertyId: string; userId?: string | null; body: any }) {
    const { propertyId, userId, body } = args;

    await this.assertRoomBelongs(propertyId, body.roomId ?? null);
    await this.assertItemBelongs(propertyId, body.inventoryItemId ?? null);
    await this.assertClaimBelongs(propertyId, body.claimId ?? null);
    await this.assertExpenseBelongs(propertyId, body.expenseId ?? null);
    await this.assertParentEventBelongs(propertyId, body.parentEventId ?? null);

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
          datePrecision: body.datePrecision ?? 'EXACT_DATE',
          dateRangeStart: body.dateRangeStart ? new Date(body.dateRangeStart) : null,
          dateRangeEnd: body.dateRangeEnd ? new Date(body.dateRangeEnd) : null,

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
          observationKind: 'USER_REPORTED',
          verificationStatus: 'UNVERIFIED',
          sourceType: 'USER',
          sourceEntityType: 'User',
          sourceEntityId: userId ?? null,
          sourceAsOf: new Date(),
          parentEventId: body.parentEventId ?? null,
          groupType: body.groupType ?? null,
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
        await markDoNothingRunsStale(propertyId);
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

  async updateHomeEvent(propertyId: string, eventId: string, patch: any, userId: string) {
    const existing = await prisma.homeEvent.findFirst({
      where: { id: eventId, propertyId, isCurrent: true, deletedAt: null },
      include: { documents: true, evidence: true },
    });
    if (!existing) throw new APIError('Home event not found', 404, 'HOME_EVENT_NOT_FOUND');
    if (patch.parentEventId === existing.id) {
      throw new APIError('An event cannot be its own parent.', 422, 'HOME_EVENT_PARENT_CYCLE');
    }

    // If patch includes links, validate them
    await this.assertRoomBelongs(propertyId, patch.roomId ?? undefined);
    await this.assertItemBelongs(propertyId, patch.inventoryItemId ?? undefined);
    await this.assertClaimBelongs(propertyId, patch.claimId ?? undefined);
    await this.assertExpenseBelongs(propertyId, patch.expenseId ?? undefined);
    await this.assertParentEventBelongs(propertyId, patch.parentEventId ?? undefined);
    if (patch.parentEventId !== undefined) {
      await this.assertNoParentCycle(propertyId, existing.id, patch.parentEventId);
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.homeEvent.update({
        where: { id: existing.id },
        data: {
          isCurrent: false,
          projectId: null,
          idempotencyKey: null,
        },
      });
      const replacement = await tx.homeEvent.create({
        data: {
          propertyId,
          createdById: userId,
          roomId: patch.roomId !== undefined ? patch.roomId : existing.roomId,
          inventoryItemId: patch.inventoryItemId !== undefined
            ? patch.inventoryItemId : existing.inventoryItemId,
          claimId: patch.claimId !== undefined ? patch.claimId : existing.claimId,
          expenseId: patch.expenseId !== undefined ? patch.expenseId : existing.expenseId,
          projectId: existing.projectId,
          type: patch.type ?? existing.type,
          subtype: patch.subtype !== undefined ? patch.subtype : existing.subtype,
          importance: patch.importance ?? existing.importance,
          visibility: patch.visibility ?? existing.visibility,
          occurredAt: patch.occurredAt ? new Date(patch.occurredAt) : existing.occurredAt,
          endAt: patch.endAt !== undefined
            ? (patch.endAt ? new Date(patch.endAt) : null) : existing.endAt,
          datePrecision: patch.datePrecision ?? existing.datePrecision,
          dateRangeStart: patch.dateRangeStart !== undefined
            ? (patch.dateRangeStart ? new Date(patch.dateRangeStart) : null)
            : existing.dateRangeStart,
          dateRangeEnd: patch.dateRangeEnd !== undefined
            ? (patch.dateRangeEnd ? new Date(patch.dateRangeEnd) : null)
            : existing.dateRangeEnd,
          title: patch.title ?? existing.title,
          summary: patch.summary !== undefined ? patch.summary : existing.summary,
          amount: patch.amount !== undefined ? moneyToDecimalString(patch.amount) : existing.amount,
          currency: patch.currency !== undefined ? patch.currency : existing.currency,
          valueDelta: patch.valueDelta !== undefined
            ? moneyToDecimalString(patch.valueDelta) : existing.valueDelta,
          meta: patch.meta !== undefined ? patch.meta : (existing.meta ?? undefined),
          groupKey: patch.groupKey !== undefined ? patch.groupKey : existing.groupKey,
          idempotencyKey: existing.idempotencyKey,
          sourceBadge: 'USER_REPORTED',
          confidenceScore: existing.confidenceScore,
          provenanceId: existing.provenanceId,
          guidanceJourneyId: existing.guidanceJourneyId,
          isRetrospective: existing.isRetrospective,
          observationKind: 'USER_REPORTED',
          verificationStatus: existing.verificationStatus === 'EVIDENCE_VERIFIED'
            ? 'PENDING_CONFIRMATION' : 'UNVERIFIED',
          sourceType: 'USER',
          sourceEntityType: 'HomeEvent',
          sourceEntityId: existing.id,
          sourceAsOf: new Date(),
          revision: existing.revision + 1,
          supersedesEventId: existing.id,
          parentEventId: patch.parentEventId !== undefined
            ? patch.parentEventId : existing.parentEventId,
          groupType: patch.groupType !== undefined ? patch.groupType : existing.groupType,
          correctionReason: patch.correctionReason,
          documents: {
            create: existing.documents.map((document) => ({
              documentId: document.documentId,
              kind: document.kind,
              caption: document.caption,
              sortOrder: document.sortOrder,
            })),
          },
          evidence: {
            create: existing.evidence.map((evidence) => ({
              evidenceType: evidence.evidenceType,
              evidenceKey: evidence.evidenceKey,
              documentId: evidence.documentId,
              sourceEntityType: evidence.sourceEntityType,
              sourceEntityId: evidence.sourceEntityId,
              observedAt: evidence.observedAt,
              note: evidence.note,
              addedByUserId: evidence.addedByUserId,
            })),
          },
        },
        include: {
          documents: {
            include: { document: true },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });
      // Children belong to the logical story, not to one historical revision
      // of its parent. Move current children atomically to the replacement.
      await tx.homeEvent.updateMany({
        where: {
          propertyId,
          parentEventId: existing.id,
          isCurrent: true,
          deletedAt: null,
        },
        data: { parentEventId: replacement.id },
      });
      return replacement;
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
    if (touchedItemIds.size > 0) {
      await markDoNothingRunsStale(propertyId);
    }

    return updated;
  }

  async deleteHomeEvent(args: {
    propertyId: string;
    eventId: string;
    userId: string;
    householdRole?: string;
    reason: string;
  }) {
    const existing = await prisma.homeEvent.findFirst({
      where: { id: args.eventId, propertyId: args.propertyId, isCurrent: true, deletedAt: null },
      select: {
        id: true,
        createdById: true,
        observationKind: true,
        verificationStatus: true,
        inventoryItemId: true,
        type: true,
        subtype: true,
        title: true,
      },
    });
    if (!existing) throw new APIError('Home event not found', 404, 'HOME_EVENT_NOT_FOUND');
    const canDelete = existing.observationKind === 'USER_REPORTED'
      && existing.verificationStatus !== 'EVIDENCE_VERIFIED'
      && (existing.createdById === args.userId || args.householdRole === 'OWNER');
    if (!canDelete) {
      throw new APIError(
        'Verified, inferred, and system records must be corrected or superseded, not deleted.',
        409,
        'HOME_EVENT_DELETE_REQUIRES_CORRECTION',
      );
    }
    await prisma.homeEvent.update({
      where: { id: existing.id },
      data: {
        deletedAt: new Date(),
        deletedByUserId: args.userId,
        deletionReason: args.reason,
        isCurrent: false,
      },
    });

    if (
      shouldInvalidateReplaceRepair({
        inventoryItemId: existing.inventoryItemId,
        type: existing.type,
        subtype: existing.subtype,
        title: existing.title,
      }) &&
      existing.inventoryItemId
    ) {
      await markReplaceRepairStale(args.propertyId, existing.inventoryItemId);
      await markDoNothingRunsStale(args.propertyId);
    }
  }

  async confirmHomeEvent(args: {
    propertyId: string;
    eventId: string;
    userId: string;
    status: 'HOMEOWNER_CONFIRMED' | 'DISPUTED';
    reason: string;
  }) {
    const event = await prisma.homeEvent.findFirst({
      where: {
        id: args.eventId,
        propertyId: args.propertyId,
        isCurrent: true,
        deletedAt: null,
      },
    });
    if (!event) throw new APIError('Home event not found', 404, 'HOME_EVENT_NOT_FOUND');
    if (!['INFERRED', 'USER_REPORTED', 'SYSTEM_GENERATED'].includes(event.observationKind)) {
      throw new APIError(
        'Observed or evidence-derived records require evidence review, not attestation.',
        409,
        'HOME_EVENT_CONFIRMATION_NOT_APPLICABLE',
      );
    }
    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.homeEvent.update({
        where: { id: event.id },
        data: {
          verificationStatus: args.status,
          confirmedAt: args.status === 'HOMEOWNER_CONFIRMED' ? new Date() : null,
          confirmedByUserId: args.status === 'HOMEOWNER_CONFIRMED' ? args.userId : null,
        },
      });
      await tx.homeEventVerificationRecord.create({
        data: {
          eventId: event.id,
          status: args.status,
          actorUserId: args.userId,
          reason: args.reason,
        },
      });
      // Home Intelligence Functional Completeness FRD Phase 4 review
      // finding 4 gap fix (HI-OUT-005): the first creation path for the
      // HOME_EVENT source type. Confirming corroborates the event; disputing
      // is not a positive outcome, so only HOMEOWNER_CONFIRMED records one.
      if (args.status === 'HOMEOWNER_CONFIRMED') {
        await recordHomeEventOutcome({ propertyId: args.propertyId, homeEventId: event.id, userId: args.userId }, tx);
      }
      return updated;
    });
    return updated;
  }

  // A privacy preference, not a factual correction — deliberately does not
  // go through updateHomeEvent's supersede-with-a-new-revision flow (which
  // would also reset verificationStatus off EVIDENCE_VERIFIED and change the
  // event's id, breaking anything referencing it by sourceEntityId). This is
  // the setter half of HomeEventVisibility (schema had the
  // PRIVATE/HOUSEHOLD/SHARE_LINK/RESALE_PACK enum since an earlier slice
  // but nothing ever let a homeowner set it) — see propertyBrief.service
  // .ts's assembleSections for the enforcement half: PRIVATE is excluded
  // from every Property Brief purpose, and RESALE_PACK is *required* for
  // the two resale-safe purposes (PROSPECTIVE_BUYER/LISTING_AGENT).
  // SHARE_LINK stays unsettable here — no downstream consumer yet.
  async setVisibility(args: {
    propertyId: string;
    eventId: string;
    visibility: 'PRIVATE' | 'HOUSEHOLD' | 'RESALE_PACK';
  }) {
    const result = await prisma.homeEvent.updateMany({
      where: {
        id: args.eventId,
        propertyId: args.propertyId,
        isCurrent: true,
        deletedAt: null,
      },
      data: { visibility: args.visibility },
    });
    if (result.count === 0) throw new APIError('Home event not found', 404, 'HOME_EVENT_NOT_FOUND');
  }

  async addEvidence(args: {
    propertyId: string;
    eventId: string;
    userId: string;
    homeownerProfileId?: string | null;
    evidenceType: string;
    documentId?: string | null;
    sourceEntityType?: string | null;
    sourceEntityId?: string | null;
    observedAt?: string | null;
    note?: string | null;
  }) {
    const event = await prisma.homeEvent.findFirst({
      where: { id: args.eventId, propertyId: args.propertyId, isCurrent: true, deletedAt: null },
      select: { id: true },
    });
    if (!event) throw new APIError('Home event not found', 404, 'HOME_EVENT_NOT_FOUND');
    if (args.documentId) {
      await this.assertDocumentAttachAllowed({
        propertyId: args.propertyId,
        documentId: args.documentId,
        homeownerProfileId: args.homeownerProfileId ?? null,
      });
    }
    await this.assertEvidenceSourceBelongs(
      args.propertyId,
      args.sourceEntityType,
      args.sourceEntityId,
    );
    return prisma.$transaction(async (tx) => {
      const evidence = await tx.homeEventEvidence.create({
        data: {
          eventId: event.id,
          evidenceType: args.evidenceType as any,
          evidenceKey: homeEventEvidenceKey(args),
          documentId: args.documentId ?? null,
          sourceEntityType: args.sourceEntityType ?? null,
          sourceEntityId: args.sourceEntityId ?? null,
          observedAt: args.observedAt ? new Date(args.observedAt) : null,
          note: args.note ?? null,
          addedByUserId: args.userId,
        },
        include: { document: true },
      });
      await tx.homeEvent.update({
        where: { id: event.id },
        data: { verificationStatus: 'PENDING_CONFIRMATION' },
      });
      await tx.homeEventVerificationRecord.create({
        data: {
          eventId: event.id,
          status: 'PENDING_CONFIRMATION',
          actorUserId: args.userId,
          reason: 'Evidence added for review.',
        },
      });
      return evidence;
    });
  }

  async exportSelectedEvents(propertyId: string, eventIds: string[]) {
    const events = await prisma.homeEvent.findMany({
      where: { propertyId, id: { in: [...new Set(eventIds)] }, deletedAt: null },
      orderBy: { occurredAt: 'asc' },
      include: {
        documents: { include: { document: true } },
        evidence: { include: { document: true } },
        verificationRecords: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (events.length !== new Set(eventIds).size) {
      throw new APIError(
        'One or more selected events were not found.',
        404,
        'HOME_EVENT_EXPORT_SELECTION_INVALID',
      );
    }
    return {
      generatedAt: new Date(),
      propertyId,
      selectedEventCount: events.length,
      events,
      limitations: [
        'This is a selected home-history export, not a comprehensive property record.',
        'Date precision, observation kind, verification, revisions, and sources must be interpreted per event.',
      ],
    };
  }

  async getAnnualRecap(propertyId: string, year: number) {
    const from = new Date(Date.UTC(year, 0, 1));
    const to = new Date(Date.UTC(year + 1, 0, 1));
    const events = await prisma.homeEvent.findMany({
      where: {
        propertyId,
        isCurrent: true,
        deletedAt: null,
        occurredAt: { gte: from, lt: to },
      },
      orderBy: { occurredAt: 'asc' },
      select: {
        id: true,
        type: true,
        title: true,
        occurredAt: true,
        datePrecision: true,
        observationKind: true,
        verificationStatus: true,
        groupKey: true,
        parentEventId: true,
      },
    });
    return {
      propertyId,
      year,
      eventCount: events.length,
      verifiedCount: events.filter((event) =>
        ['HOMEOWNER_CONFIRMED', 'EVIDENCE_VERIFIED'].includes(event.verificationStatus)).length,
      inferredCount: events.filter((event) => event.observationKind === 'INFERRED').length,
      events,
      limitations: events.length === 0
        ? ['No recorded current events fall within this year; this is not confirmation that nothing occurred.']
        : ['This recap reflects selected current Home Timeline records only.'],
    };
  }

  async attachDocument(args: {
    propertyId: string;
    eventId: string;
    documentId: string;
    kind?: string;
    caption?: string | null;
    sortOrder?: number;
    homeownerProfileId?: string | null;
    userId?: string | null;
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
    await prisma.homeEventEvidence.upsert({
      where: {
        eventId_evidenceKey: {
          eventId: args.eventId,
          evidenceKey: `document:${args.documentId}`,
        },
      },
      create: {
        eventId: args.eventId,
        evidenceType: 'DOCUMENT',
        evidenceKey: `document:${args.documentId}`,
        documentId: args.documentId,
        addedByUserId: args.userId ?? null,
      },
      update: {},
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
