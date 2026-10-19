import { prisma } from '../../lib/prisma';
import type { AskAccountRole } from './askAccountEligibility';
import { visibleInventoryItemWhere } from '../riskAssetApplicability';
import { homeRecordsService } from '../homeRecords.service';
import { listPropertyDocuments } from '../propertyDocuments/propertyDocumentInventory.service';
import { warrantyStatus, WARRANTY_EXPIRING_DAYS } from './handlers/warranties.handler';
import type { AskRecordSectionDefinition, AskRecordSectionId } from './governance/askRecordSectionRegistry';
import {
  ASK_RECORD_DETAIL_CONTRACT_VERSION, AskRecordNotFoundError, NO_HISTORY, available, day, fact, notRecorded, observedAt, preciseDate, presence, readable, route, unavailable, unavailableRoute,
  type AskRecordDetail, type AskRecordRelated, type AskRecordHistoryEntry, type DetailBody, type DetailContext, type DetailReader,
} from './askRecordDetailSupport';
import { MORE_RECORD_DETAIL_READERS } from './askRecordDetailSections';

export * from './askRecordDetailSupport';
import { authorizeAskRecordSection, AskRecordSectionUnavailableError } from './askRecordCollections.service';

async function readRoomDetail(context: DetailContext, roomId: string): Promise<DetailBody> {
  const room = await prisma.inventoryRoom.findFirst({
    where: { id: roomId, propertyId: context.propertyId },
    select: {
      name: true, type: true, floorLevel: true, createdAt: true, updatedAt: true,
      _count: { select: { maintenanceTasks: { where: { status: { in: ['PENDING', 'IN_PROGRESS'] } } } } },
    },
  });
  if (!room) throw new AskRecordNotFoundError('Record not found.');
  const visibleItems = await prisma.inventoryItem.count({ where: { AND: [{ roomId, propertyId: context.propertyId }, visibleInventoryItemWhere()] } });
  const itemLabel = `${visibleItems} ${visibleItems === 1 ? 'item' : 'items'}`;
  const taskLabel = `${room._count.maintenanceTasks} open ${room._count.maintenanceTasks === 1 ? 'task' : 'tasks'}`;
  const home = 'Show me my home by room.';
  return {
    title: room.name,
    facts: [fact('Type', readable(room.type)), fact('Floor level', room.floorLevel === null ? null : String(room.floorLevel)), { label: 'Items', value: itemLabel }, { label: 'Open maintenance', value: taskLabel }],
    provenance: {
      source: unavailable('Room records do not store where they came from.'),
      observed: observedAt('Last updated', room.updatedAt),
      verification: unavailable('Rooms have no verification state.'),
      visibility: available('Every household member can see rooms.'),
      related: { state: 'AVAILABLE', records: [{ label: itemLabel, kindLabel: 'Inventory in this room', broken: null }, { label: taskLabel, kindLabel: 'Maintenance in this room', broken: null }], reason: null },
      history: NO_HISTORY('rooms'),
    },
    corrections: [
      route({ id: 'room-name', label: 'Rename room', operationId: 'ROOM_RENAME', role: context.role, openQuestion: home }),
      route({ id: 'room-type', label: 'Change room type', operationId: 'ROOM_RENAME', role: context.role, openQuestion: home }),
      route({ id: 'room-floor', label: 'Change floor level', operationId: 'ROOM_RENAME', role: context.role, openQuestion: home }),
    ],
  };
}

const INVENTORY_SOURCE_LABELS: Record<string, string> = { MANUAL: 'Entered by hand', BULK_UPLOAD: 'Bulk upload', MOBILE_SCAN: 'Scanned in the app', INTEGRATION: 'Imported from an integration' };

async function readInventoryDetail(context: DetailContext, itemId: string): Promise<DetailBody> {
  const item = await prisma.inventoryItem.findFirst({
    where: { AND: [{ id: itemId, propertyId: context.propertyId }, visibleInventoryItemWhere()] },
    select: {
      name: true, category: true, condition: true, brand: true, manufacturer: true, model: true, modelNumber: true, serialNo: true, serialNumber: true,
      installedOn: true, installedOnPrecision: true, purchasedOn: true, purchasedOnPrecision: true, lastServicedOn: true, expectedExpiryDate: true,
      purchaseCostCents: true, replacementCostCents: true, isVerified: true, verificationSource: true, sourceType: true, sourceFileName: true, importedAt: true,
      sourceOcrSessionId: true, updatedAt: true, createdAt: true, room: { select: { name: true } }, warranty: { select: { providerName: true } },
      linkedWarranties: { select: { providerName: true } }, insurancePolicy: { select: { carrierName: true } }, _count: { select: { documents: true } },
    },
  });
  if (!item) throw new AskRecordNotFoundError('Record not found.');
  const warranties = [...new Set([item.warranty?.providerName, ...item.linkedWarranties.map((entry) => entry.providerName)].filter((value): value is string => Boolean(value)))];
  const related: AskRecordRelated[] = [
    ...(item.room ? [{ label: item.room.name, kindLabel: 'Room', broken: null }] : []),
    ...warranties.map((label) => ({ label, kindLabel: 'Warranty', broken: null })),
    ...(item.insurancePolicy ? [{ label: item.insurancePolicy.carrierName, kindLabel: 'Insurance policy', broken: null }] : []),
    ...(item._count.documents > 0 ? [{ label: `${item._count.documents} ${item._count.documents === 1 ? 'document' : 'documents'}`, kindLabel: 'Attached documents', broken: null }] : []),
  ];
  const sourceBits = [INVENTORY_SOURCE_LABELS[item.sourceType] ?? readable(item.sourceType), item.sourceFileName, item.sourceOcrSessionId ? 'confirmed from a scan' : null].filter(Boolean);
  const question = `Show inventory item "${item.name}"`;
  return {
    title: item.name,
    facts: [
      fact('Category', readable(item.category)), fact('Condition', item.condition === 'UNKNOWN' ? null : readable(item.condition)), fact('Room', item.room?.name),
      fact('Brand', item.brand ?? item.manufacturer), fact('Model', item.model ?? item.modelNumber), presence('Serial number', item.serialNo ?? item.serialNumber),
      fact('Installed', preciseDate(item.installedOn, item.installedOnPrecision)), fact('Purchased', preciseDate(item.purchasedOn, item.purchasedOnPrecision)),
      fact('Last serviced', day(item.lastServicedOn)), fact('Expected lifecycle date', day(item.expectedExpiryDate)),
      presence('Purchase cost', item.purchaseCostCents), presence('Replacement cost', item.replacementCostCents),
    ],
    provenance: {
      source: available(sourceBits.join(' · '), item.importedAt?.toISOString() ?? null),
      observed: observedAt('Last updated', item.updatedAt),
      verification: item.isVerified
        ? available(item.verificationSource ? `Verified (${readable(item.verificationSource)})` : 'Verified')
        : notRecorded('Not verified.'),
      visibility: available('Every household member can see inventory that is part of the home record.'),
      related: { state: related.length ? 'AVAILABLE' : 'NOT_RECORDED', records: related, reason: related.length ? null : 'No room, warranty, policy, or document is linked.' },
      history: NO_HISTORY('inventory items'),
    },
    corrections: [route({ id: 'inventory-correct', label: 'Correct a detail', operationId: 'INVENTORY_ITEM_CORRECT', role: context.role, openQuestion: question })],
  };
}

const WARRANTY_STATUS_TEXT = { EXPIRING: `Expires within ${WARRANTY_EXPIRING_DAYS} days`, NEEDS_REVIEW: 'Dates need review', ACTIVE: 'Active', STARTS_LATER: 'Starts later', EXPIRED: 'Expired' } as const;
const WARRANTY_QUESTION_WORDS: Record<string, string> = { APPLIANCE: 'appliance', HVAC: 'HVAC', ROOFING: 'roofing', PLUMBING: 'plumbing', ELECTRICAL: 'electrical', STRUCTURAL: 'structural', HOME_WARRANTY_PLAN: 'home warranty plan', OTHER: 'other' };

async function readWarrantyDetail(context: DetailContext, warrantyId: string): Promise<DetailBody> {
  const warranty = await prisma.warranty.findFirst({
    where: { id: warrantyId, propertyId: context.propertyId },
    select: {
      id: true, propertyId: true, providerName: true, category: true, coverageDetails: true, policyNumber: true, cost: true, startDate: true, expiryDate: true,
      sourceExecutionId: true, updatedAt: true, homeownerProfile: { select: { userId: true } },
      inventoryItem: { select: { name: true } }, _count: { select: { documents: true } },
    },
  });
  if (!warranty) throw new AskRecordNotFoundError('Record not found.');
  const status = warrantyStatus(warranty, context.propertyId, context.now);
  const owned = warranty.homeownerProfile.userId === context.userId;
  const related: AskRecordRelated[] = [
    ...(warranty.inventoryItem ? [{ label: warranty.inventoryItem.name, kindLabel: 'Inventory item', broken: null }] : []),
    ...(warranty._count.documents > 0 ? [{ label: `${warranty._count.documents} ${warranty._count.documents === 1 ? 'document' : 'documents'}`, kindLabel: 'Attached documents', broken: null }] : []),
  ];
  return {
    title: `${warranty.providerName} warranty`,
    facts: [
      fact('Status', WARRANTY_STATUS_TEXT[status.key]), fact('Coverage type', readable(warranty.category)), fact('Starts', day(warranty.startDate)), fact('Expires', day(warranty.expiryDate)),
      fact('Coverage details', warranty.coverageDetails), presence('Policy number', warranty.policyNumber), presence('Cost', warranty.cost),
    ],
    provenance: {
      source: warranty.sourceExecutionId ? available('Added through Ask') : notRecorded('The warranty record does not say how it was added.'),
      observed: observedAt('Last updated', warranty.updatedAt),
      verification: unavailable('Warranties have no verification state.'),
      visibility: available('Every household member can see warranties.'),
      related: { state: related.length ? 'AVAILABLE' : 'NOT_RECORDED', records: related, reason: related.length ? null : 'No inventory item or document is linked.' },
      history: NO_HISTORY('warranties'),
    },
    // The warranty belongs to the profile of the member who added it, and Ask only lets that member correct it (existing rule, unchanged).
    corrections: [route({
      id: 'warranty-correct', label: 'Correct a detail', operationId: 'WARRANTY_CORRECT', role: context.role,
      openQuestion: `Show me my ${WARRANTY_QUESTION_WORDS[warranty.category] ?? 'recorded'} warranties.`,
      blockedReason: owned ? null : 'Only the member who added this warranty can correct it.',
    })],
  };
}

const RECORD_VISIBILITY_TEXT: Record<string, string> = { HOUSEHOLD: 'Every household member can see this record.', OWNER_ONLY: 'Only home owners can see this record.', RECIPIENT_SELECTED: 'Only home owners can see this record.' };
const LEGACY_REASON = 'This document is still in the older vault. Ask has no change command for it, and it has no versions or history to read.';

async function readDocumentDetail(context: DetailContext, documentId: string): Promise<DetailBody> {
  const inventory = await listPropertyDocuments({ propertyId: context.propertyId, role: context.role, includeLegacy: true, includeInventoryLinkedLegacy: true });
  const listed = inventory.items.find((entry) => entry.id === documentId);
  if (!listed) throw new AskRecordNotFoundError('Record not found.');
  const question = `Show me my ${listed.kindLabel.toLowerCase()}.`;
  const verification = listed.verification
    ? available(`${readable(listed.verification)}`, listed.verifiedAt?.toISOString() ?? null)
    : unavailable('This store records no verification status for the document.');

  if (listed.source !== 'HOME_RECORD') {
    return {
      title: listed.title,
      facts: [fact('Type', listed.kindLabel), fact('Description', listed.description), fact('Added', day(listed.addedAt))],
      provenance: {
        source: available('Older document vault (shown only until its domain is converted)'),
        observed: observedAt('Last updated', listed.updatedAt),
        verification,
        visibility: unavailable('The older vault applies no record-level visibility.'),
        related: { state: 'UNAVAILABLE', records: [], reason: 'The older vault keeps no links this view can read.' },
        history: NO_HISTORY('documents in the older vault'),
      },
      corrections: [unavailableRoute('document-state', 'Change record state', 'HOME_RECORD_STATE_COMMAND', LEGACY_REASON)],
    };
  }

  const record = await homeRecordsService.get(context.propertyId, documentId, context.role).catch((error: unknown) => {
    if ((error as { statusCode?: number; status?: number })?.statusCode === 404 || (error as { status?: number })?.status === 404) throw new AskRecordNotFoundError('Record not found.');
    throw error;
  });
  const actions = record.allowedActions;
  const archived = record.lifecycleStatus !== 'ACTIVE';
  const related: AskRecordRelated[] = record.links.map((link) => ({ label: link.label?.trim() || readable(link.entityType) || 'Linked record', kindLabel: readable(link.entityType) ?? 'Record', broken: link.broken }));
  const versionEntries: AskRecordHistoryEntry[] = [...record.versions]
    .sort((left, right) => right.versionNumber - left.versionNumber)
    .map((version) => ({ at: version.createdAt.toISOString(), label: `Version ${version.versionNumber} added` }));
  const effective = record.effectiveFrom || record.effectiveTo ? `${day(record.effectiveFrom) ?? 'earlier'} to ${day(record.effectiveTo) ?? 'no end date'}` : null;
  const stateRoute = (id: string, label: string, allowed: boolean, blocked: string) => route({
    id, label, operationId: 'HOME_RECORD_STATE_COMMAND', role: context.role, openQuestion: question, blockedReason: allowed ? null : blocked,
  });
  return {
    title: record.title,
    facts: [
      fact('Type', listed.kindLabel), fact('Description', record.description), fact('Status', archived ? readable(record.lifecycleStatus) : 'Active'),
      fact('In effect', effective), fact('Sensitivity', readable(record.sensitivity)), { label: 'Extracted details', value: record.needsReview ? 'Waiting for your review' : 'Nothing waiting' },
    ],
    provenance: {
      source: available(record.createdByUserId === context.userId ? 'Added by you' : 'Added by a household member', record.createdAt.toISOString()),
      observed: observedAt('Last updated', record.updatedAt),
      verification,
      visibility: available(RECORD_VISIBILITY_TEXT[record.visibility] ?? 'Only home owners can see this record.'),
      related: { state: related.length ? 'AVAILABLE' : 'NOT_RECORDED', records: related, reason: related.length ? null : 'No other record is linked.' },
      history: versionEntries.length
        ? { state: 'AVAILABLE', entries: versionEntries, reason: null }
        : { state: 'NOT_RECORDED', entries: [], reason: 'No file version is on record.' },
    },
    corrections: [
      stateRoute('document-verification', 'Record verification', actions.verify, 'This record is in the trash.'),
      stateRoute('document-effective-period', 'Set when it is in effect', actions.manageEffectivePeriod, 'This record is in the trash.'),
      stateRoute('document-archive', 'Archive', actions.archive, archived ? 'This record is not active.' : 'This record cannot be archived now.'),
    ],
  };
}


/** The sections with a connected detail reader. The registry's `recordDetail` capability must agree with this map (tested). */
export const ASK_RECORD_DETAIL_READERS: Readonly<Partial<Record<AskRecordSectionId, DetailReader>>> = Object.freeze({
  rooms: readRoomDetail, inventory: readInventoryDetail, documents: readDocumentDetail, warranties: readWarrantyDetail, ...MORE_RECORD_DETAIL_READERS,
});

/** Reauthorizes when the detail opens (account, current household role, section floor, lifecycle) and reads from the canonical owner. */
export async function getAskRecordDetail(userId: string, propertyId: string, sectionId: string, recordId: string, accountRole?: AskAccountRole, now = new Date()): Promise<AskRecordDetail> {
  const { definition, role } = await authorizeAskRecordSection(userId, propertyId, sectionId, accountRole, (entry: AskRecordSectionDefinition) => {
    if (entry.recordDetail.state !== 'CONNECTED' || !ASK_RECORD_DETAIL_READERS[entry.id]) throw new AskRecordSectionUnavailableError('NO_DETAIL');
  });
  const body = await ASK_RECORD_DETAIL_READERS[definition.id]!({ propertyId, userId, role, now }, recordId);
  return { contractVersion: ASK_RECORD_DETAIL_CONTRACT_VERSION, propertyId, sectionId: definition.id, recordId, generatedAt: now.toISOString(), ...body };
}
