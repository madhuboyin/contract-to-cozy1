// The home records an Ask quote check can be tied to, the same four kinds the Service Price Radar page offers (inventory item, room,
// home record, incident). Bounded and property-scoped; the radar re-validates the choice against the property when the check is saved.
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { visibleRecordWhere } from '../../homeRecordsAccess';
import { SERVICE_RADAR_LINKED_ENTITY_TYPE_VALUES, type ServiceRadarLinkedEntityTypeValue } from '../../servicePriceRadar.types';

export const SERVICE_PRICE_NO_LINK_VALUE = '__NO_LINK__';
export const SERVICE_PRICE_LINK_TYPE_LABELS: Record<string, string> = { SYSTEM: 'Item', APPLIANCE: 'Appliance', ROOM: 'Room', DOCUMENT: 'Record', INCIDENT: 'Incident' };
const LINK_OPTION_TYPES = ['SYSTEM', 'ROOM', 'DOCUMENT', 'INCIDENT'] as const;
/** What the form may submit: only the kinds it offers, each backed by a record the radar validates against the property. OTHER and APPLIANCE are never accepted from intake. */
const INTAKE_LINK_TYPES: readonly string[] = LINK_OPTION_TYPES;

/** `TYPE:id` as the form stores it, or null when it is not a well-formed choice of one of `allowed` (default: the intake kinds). */
export function parseServicePriceLink(value: string | null | undefined, allowed: readonly string[] = INTAKE_LINK_TYPES): { linkedEntityType: ServiceRadarLinkedEntityTypeValue; linkedEntityId: string } | null {
  const text = String(value ?? '');
  const at = text.indexOf(':');
  if (at < 1) return null;
  const type = text.slice(0, at);
  const id = text.slice(at + 1);
  if (!id || !(SERVICE_RADAR_LINKED_ENTITY_TYPE_VALUES as readonly string[]).includes(type) || !allowed.includes(type)) return null;
  return { linkedEntityType: type as ServiceRadarLinkedEntityTypeValue, linkedEntityId: id };
}

/** `ensureItemId`: an inventory item the form should offer even when it is not among the recent ones (the item a journey step is about); it must belong to this home. */
export async function loadServicePriceLinkOptions(propertyId: string, role: HouseholdRole, ensureItemId: string | null = null): Promise<Array<{ label: string; value: string }>> {
  const [items, rooms, records, incidents] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { propertyId }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, name: true } }),
    prisma.inventoryRoom.findMany({ where: { propertyId }, orderBy: { name: 'asc' }, take: 6, select: { id: true, name: true } }),
    prisma.propertyRecord.findMany({ where: { propertyId, lifecycleStatus: 'ACTIVE', ...visibleRecordWhere(role) }, orderBy: { updatedAt: 'desc' }, take: 6, select: { id: true, title: true } }),
    prisma.incident.findMany({ where: { propertyId }, orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, title: true } }),
  ]);
  const option = (type: (typeof LINK_OPTION_TYPES)[number], id: string, name: string) => ({ label: `${SERVICE_PRICE_LINK_TYPE_LABELS[type]}: ${name}`.slice(0, 120), value: `${type}:${id}` });
  const pinned = ensureItemId && !items.some((row) => row.id === ensureItemId)
    ? await prisma.inventoryItem.findFirst({ where: { id: ensureItemId, propertyId }, select: { id: true, name: true } }) : null;
  return [
    ...(pinned ? [option('SYSTEM', pinned.id, pinned.name)] : []),
    ...items.map((row) => option('SYSTEM', row.id, row.name)), ...rooms.map((row) => option('ROOM', row.id, row.name)),
    ...records.map((row) => option('DOCUMENT', row.id, row.title)), ...incidents.map((row) => option('INCIDENT', row.id, row.title)),
  ];
}

/** The kinds a saved check can already carry (Desktop can store an appliance), for reading checks back by record. */
export const SERVICE_PRICE_STORED_LINK_TYPES: readonly string[] = SERVICE_RADAR_LINKED_ENTITY_TYPE_VALUES.filter((type) => type !== 'OTHER');
