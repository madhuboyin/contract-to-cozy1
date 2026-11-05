import type { HouseholdRole, PropertyRecordLinkEntityType, PropertyRecordLinkPurpose } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { DEFAULT_LINKED_RECORD_ROLE, visibleRecordWhere } from './homeRecordsAccess';

/**
 * The Home Records linked to an entity (an inventory item today), for a screen that otherwise shows only the legacy documents attached to it.
 *
 * Findings Implementation Plan Phase 6, F6-3 (owner decision OD-6.3: a bridge read for inventory items first). Until the legacy `Document` relations
 * are retargeted, a record linked to an inventory item from the Home Records page is stored as a PropertyRecordLink, which the inventory screens
 * did not read; the document appeared on the Home Records page but not on the item. This is a read-only bridge. It writes nothing, and the legacy
 * `documents` relation is unchanged and still authoritative for what it holds.
 *
 * Visibility is the caller's: an owner-only record is returned to an owner and to no one else, and an omitted role is the least privileged. A trashed
 * record is not shown. Archived records are, with their lifecycle, so the screen can say so.
 */
export interface LinkedRecordRef {
  linkId: string;
  recordId: string;
  title: string;
  recordType: string;
  lifecycleStatus: string;
  purpose: PropertyRecordLinkPurpose;
}

export async function linkedRecordsByEntity(input: {
  propertyId: string;
  entityType: PropertyRecordLinkEntityType;
  entityIds: readonly string[];
  role?: HouseholdRole;
}): Promise<Map<string, LinkedRecordRef[]>> {
  const byEntity = new Map<string, LinkedRecordRef[]>();
  const ids = [...new Set(input.entityIds)];
  if (ids.length === 0) return byEntity;
  const links = await prisma.propertyRecordLink.findMany({
    where: {
      entityType: input.entityType,
      entityId: { in: ids },
      record: { propertyId: input.propertyId, lifecycleStatus: { not: 'TRASHED' }, ...visibleRecordWhere(input.role ?? DEFAULT_LINKED_RECORD_ROLE) },
    },
    include: { record: { select: { id: true, title: true, recordType: true, lifecycleStatus: true } } },
    orderBy: { createdAt: 'desc' },
  });
  for (const link of links) {
    const list = byEntity.get(link.entityId) ?? [];
    list.push({
      linkId: link.id, recordId: link.record.id, title: link.record.title, recordType: link.record.recordType,
      lifecycleStatus: link.record.lifecycleStatus, purpose: link.purpose,
    });
    byEntity.set(link.entityId, list);
  }
  return byEntity;
}

/** The ids of this property's entities of one type that have at least one visible linked record, for a "has documents" filter. */
export async function entityIdsWithLinkedRecords(input: {
  propertyId: string;
  entityType: PropertyRecordLinkEntityType;
  role?: HouseholdRole;
}): Promise<Set<string>> {
  const rows = await prisma.propertyRecordLink.findMany({
    where: {
      entityType: input.entityType,
      record: { propertyId: input.propertyId, lifecycleStatus: { not: 'TRASHED' }, ...visibleRecordWhere(input.role ?? DEFAULT_LINKED_RECORD_ROLE) },
    },
    select: { entityId: true },
    distinct: ['entityId'],
  });
  return new Set(rows.map((row) => row.entityId));
}
