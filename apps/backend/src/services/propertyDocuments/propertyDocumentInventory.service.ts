// apps/backend/src/services/propertyDocuments/propertyDocumentInventory.service.ts
//
// The one canonical read of "the documents on file for this home".
//
// Home Records (PropertyRecord) is the canonical document store: it has versions, record-level visibility, retention, reviewed extraction and
// promotion. The legacy Document table is being retired, so this interface can TEMPORARILY project both stores while each domain's reader and
// writer are converted together. It is transition infrastructure, not a two-inventory product:
//   - Home Records is authoritative. A legacy row is explicitly marked `transitional`, and the legacy branch is removed (and eventually the
//     Document model) when no domain still requires it. Until then a caller asks for the legacy branch by name (`includeLegacy`).
//   - There is no dual-write and no attempt to reconcile the two stores: a document lives in exactly one of them.
//   - The two stores do not share a status vocabulary (legacy has a verification status; Home Records has needs-review, expiry and lifecycle),
//     so each row carries only the facts its own store records, never a fabricated mapping between them.
//   - Visibility is the caller's: Home Records applies the record-level rule (owner-only records are not returned to other roles); legacy
//     documents have no such concept.
import type { HouseholdRole, PropertyRecordType, DocumentType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { homeRecordsService } from '../homeRecords.service';
import { visibleRecordWhere } from '../homeRecordsAccess';

export type PropertyDocumentSource = 'HOME_RECORD' | 'LEGACY_DOCUMENT';

export interface PropertyDocument {
  id: string;
  source: PropertyDocumentSource;
  /** True for every legacy row: it is projected only until its domain is converted, then removed. */
  transitional: boolean;
  title: string;
  /** One key per kind of document, from the store's own vocabulary; `kindLabel` is what a homeowner reads. */
  kind: string;
  kindLabel: string;
  description: string | null;
  addedAt: Date;
  updatedAt: Date;
  /** Legacy only: the recorded verification status. Null for a Home Record. */
  verification: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED' | null;
  /** Home Records only: pending extracted facts await review. Null for a legacy row. */
  needsReview: boolean | null;
  /** Home Records only: from the record's effective-to date. Null when none is recorded or for a legacy row. */
  expiry: 'CURRENT' | 'EXPIRING_SOON' | 'EXPIRED' | null;
  /** Home Records only: what the caller's role may do is decided per record elsewhere; this is the record's own state. */
  lifecycle: 'ACTIVE' | 'ARCHIVED' | null;
  /** Home Records only. */
  sensitivity: string | null;
  visibility: string | null;
}

export interface PropertyDocumentInventory {
  items: PropertyDocument[];
  totals: { total: number; homeRecords: number; legacy: number };
}

const RECORD_KIND_LABEL: Record<PropertyRecordType, string> = {
  WARRANTY: 'Warranties', RECEIPT: 'Receipts', MANUAL: 'Manuals', INSPECTION_REPORT: 'Inspection reports', INVOICE: 'Invoices',
  CONTRACT: 'Contracts', PERMIT: 'Permits', INSURANCE_POLICY: 'Insurance policies', CLAIM: 'Claims', PHOTO: 'Photos',
  DEED: 'Deeds', TAX_DOCUMENT: 'Tax documents', UTILITY: 'Utility records', DISCLOSURE: 'Disclosures', SURVEY: 'Surveys',
  CLOSING_DOCUMENT: 'Closing documents', OTHER: 'Other',
};

// Legacy kinds that have a Home Records equivalent share its key (so the same kind of document groups together whichever store holds it);
// a legacy-only kind keeps its own key.
const LEGACY_KIND_KEY: Record<DocumentType, string> = {
  INSPECTION_REPORT: 'INSPECTION_REPORT', ESTIMATE: 'ESTIMATE', INVOICE: 'INVOICE', CONTRACT: 'CONTRACT', PERMIT: 'PERMIT', PHOTO: 'PHOTO',
  VIDEO: 'VIDEO', INSURANCE_CERTIFICATE: 'INSURANCE_CERTIFICATE', LICENSE: 'LICENSE', HOME_REPORT_PDF: 'HOME_REPORT_PDF', OTHER: 'OTHER',
};
const LEGACY_ONLY_KIND_LABEL: Record<string, string> = {
  ESTIMATE: 'Estimates', VIDEO: 'Videos', INSURANCE_CERTIFICATE: 'Insurance certificates', LICENSE: 'Licenses', HOME_REPORT_PDF: 'Home report PDFs',
};

/** The label for a kind key, whichever store it came from. */
export function propertyDocumentKindLabel(kind: string): string {
  return RECORD_KIND_LABEL[kind as PropertyRecordType] ?? LEGACY_ONLY_KIND_LABEL[kind] ?? kind;
}

export async function listPropertyDocuments(input: {
  propertyId: string;
  role: HouseholdRole;
  /** The transitional legacy branch. Named so a caller opts in knowingly; default is Home Records only. */
  includeLegacy?: boolean;
  /** Legacy documents attached to an inventory item of this property rather than to the property itself (legacy branch only). */
  includeInventoryLinkedLegacy?: boolean;
  /** Only documents of these kinds (kind keys from either store), for a picker such as "contracts". */
  kinds?: string[];
}): Promise<PropertyDocumentInventory> {
  const records = await homeRecordsService.list(input.propertyId, input.role, { lifecycleStatus: 'ACTIVE' });
  const fromRecords: PropertyDocument[] = records.map((record) => ({
    id: record.id, source: 'HOME_RECORD', transitional: false,
    title: record.title, kind: record.recordType, kindLabel: propertyDocumentKindLabel(record.recordType),
    description: record.description ?? null, addedAt: record.createdAt, updatedAt: record.updatedAt,
    verification: null, needsReview: record.needsReview, expiry: record.expiryStatus,
    lifecycle: record.lifecycleStatus === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
    sensitivity: record.sensitivity, visibility: record.visibility,
  }));

  let fromLegacy: PropertyDocument[] = [];
  if (input.includeLegacy) {
    const rows = await prisma.document.findMany({
      where: {
        deletedAt: null,
        ...(input.includeInventoryLinkedLegacy
          ? { OR: [{ propertyId: input.propertyId }, { inventoryItem: { propertyId: input.propertyId } }] }
          : { propertyId: input.propertyId }),
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, type: true, description: true, verificationStatus: true, createdAt: true, updatedAt: true },
    });
    fromLegacy = rows.map((row) => {
      const kind = LEGACY_KIND_KEY[row.type];
      return {
        id: row.id, source: 'LEGACY_DOCUMENT', transitional: true,
        title: row.name, kind, kindLabel: propertyDocumentKindLabel(kind), description: row.description ?? null,
        addedAt: row.createdAt, updatedAt: row.updatedAt,
        verification: row.verificationStatus, needsReview: null, expiry: null, lifecycle: 'ACTIVE', sensitivity: null, visibility: null,
      } satisfies PropertyDocument;
    });
  }

  const items = [...fromRecords, ...fromLegacy]
    .filter((item) => !input.kinds || input.kinds.includes(item.kind))
    .sort((left, right) => right.addedAt.getTime() - left.addedAt.getTime());
  return { items, totals: { total: items.length, homeRecords: fromRecords.length, legacy: fromLegacy.length } };
}

// Property-level signals (scores, pulse, quality) ask "how many documents does this home have", not "which ones may this person see". They
// count every active Home Record regardless of the caller's role, exactly as the property's other counts do, and never return a row.
const LINKED_ENTITY_TYPES = ['INVENTORY_ITEM', 'WARRANTY', 'INSURANCE_POLICY'] as const;

export async function countPropertyDocuments(input: {
  propertyId: string;
  /** The transitional legacy branch, named so a caller opts in knowingly. */
  includeLegacy?: boolean;
  /** Only documents attached to an inventory item, a warranty or an insurance policy (Home Records: an entity link; legacy: its own link columns). */
  linkedToOtherRecords?: boolean;
}): Promise<{ total: number; homeRecords: number; legacy: number }> {
  const homeRecords = await prisma.propertyRecord.count({
    where: {
      propertyId: input.propertyId,
      lifecycleStatus: 'ACTIVE',
      ...(input.linkedToOtherRecords ? { links: { some: { entityType: { in: [...LINKED_ENTITY_TYPES] } } } } : {}),
    },
  });
  const legacy = input.includeLegacy
    ? await prisma.document.count({
      where: {
        propertyId: input.propertyId,
        deletedAt: null,
        ...(input.linkedToOtherRecords ? { OR: [{ inventoryItemId: { not: null } }, { warrantyId: { not: null } }, { policyId: { not: null } }] } : {}),
      },
    })
    : 0;
  return { total: homeRecords + legacy, homeRecords, legacy };
}

/** The most recently updated document of one kind (a kind key from either store), or null. Home Records first, then the transitional legacy branch. */
export async function latestPropertyDocumentOfKind(input: {
  propertyId: string;
  kind: string;
  includeLegacy?: boolean;
}): Promise<{ id: string; source: PropertyDocumentSource; kind: string; updatedAt: Date } | null> {
  const record = await prisma.propertyRecord.findFirst({
    where: { propertyId: input.propertyId, lifecycleStatus: 'ACTIVE', recordType: input.kind as PropertyRecordType },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    select: { id: true, updatedAt: true },
  });
  const legacy = input.includeLegacy
    ? await prisma.document.findFirst({
      where: { propertyId: input.propertyId, deletedAt: null, type: input.kind as DocumentType },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: { id: true, updatedAt: true },
    })
    : null;
  const winner = [record ? { ...record, source: 'HOME_RECORD' as const } : null, legacy ? { ...legacy, source: 'LEGACY_DOCUMENT' as const } : null]
    .filter((row): row is { id: string; updatedAt: Date; source: PropertyDocumentSource } => row !== null)
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())[0];
  return winner ? { id: winner.id, source: winner.source, kind: input.kind, updatedAt: winner.updatedAt } : null;
}

/** A document a workflow refers to by id: enough to name it, show it and link it, nothing store-specific. */
export interface PropertyDocumentRef {
  id: string;
  source: PropertyDocumentSource;
  title: string;
  kind: string;
  kindLabel: string;
  addedAt: Date;
}

/**
 * Resolve the documents a workflow refers to by id (a workspace's title commitment, an insurance binder, walkthrough evidence). Home Records
 * applies the caller's record-level visibility and never returns a trashed record; an id that is not in this property, or not visible to this
 * role, simply does not resolve, so a caller that needs every id to exist compares the counts. A workflow whose reader and writer have both
 * moved to Home Records asks for Home Records only; the legacy branch exists for a workflow still writing legacy storage.
 */
export async function resolvePropertyDocuments(input: {
  propertyId: string;
  role: HouseholdRole;
  ids: Array<string | null | undefined>;
  includeLegacy?: boolean;
}): Promise<PropertyDocumentRef[]> {
  const ids = [...new Set(input.ids.filter((value): value is string => Boolean(value)))];
  if (ids.length === 0) return [];
  const records = await prisma.propertyRecord.findMany({
    where: { id: { in: ids }, propertyId: input.propertyId, lifecycleStatus: { not: 'TRASHED' }, ...visibleRecordWhere(input.role) },
    select: { id: true, title: true, recordType: true, createdAt: true },
  });
  const fromRecords: PropertyDocumentRef[] = records.map((record) => ({
    id: record.id, source: 'HOME_RECORD', title: record.title, kind: record.recordType, kindLabel: propertyDocumentKindLabel(record.recordType), addedAt: record.createdAt,
  }));
  let fromLegacy: PropertyDocumentRef[] = [];
  if (input.includeLegacy) {
    const found = new Set(fromRecords.map((row) => row.id));
    const rows = await prisma.document.findMany({
      where: { id: { in: ids.filter((id) => !found.has(id)) }, propertyId: input.propertyId, deletedAt: null },
      select: { id: true, name: true, type: true, createdAt: true },
    });
    fromLegacy = rows.map((row) => ({ id: row.id, source: 'LEGACY_DOCUMENT', title: row.name, kind: LEGACY_KIND_KEY[row.type], kindLabel: propertyDocumentKindLabel(LEGACY_KIND_KEY[row.type]), addedAt: row.createdAt }));
  }
  return [...fromRecords, ...fromLegacy];
}

/** Throws the caller's own not-found error unless every id resolves (a workflow must not store a reference it could not later show). */
export async function assertPropertyDocumentsExist(
  input: { propertyId: string; role: HouseholdRole; ids: Array<string | null | undefined>; includeLegacy?: boolean },
  notFound: () => Error,
): Promise<void> {
  const wanted = new Set(input.ids.filter((value): value is string => Boolean(value)));
  if (wanted.size === 0) return;
  const resolved = await resolvePropertyDocuments(input);
  if (resolved.length !== wanted.size) throw notFound();
}

/**
 * The shape the buyer workflow screens read for a document: a name, a kind and a date. A Home Record carries no legacy verification status, so
 * that field is null; `source` says which store the row came from.
 */
export function toWorkflowDocumentSummary(document: { id: string; source: PropertyDocumentSource; title: string; kind: string; addedAt: Date }) {
  return { id: document.id, name: document.title, type: document.kind, verificationStatus: null, source: document.source, createdAt: document.addedAt.toISOString() };
}
