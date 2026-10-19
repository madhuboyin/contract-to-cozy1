import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import type { AskAccountRole } from './askAccountEligibility';
import { ensureAskServiceAccountEligibility, ensurePropertyAccess } from './askHandlerSupport';
import { loadOperatingMode } from './askRecordContext';
import { inventoryLifecycleHorizon, inventoryMissingFacts } from './handlers/inventory.handler';
import { visibleInventoryItemWhere } from '../riskAssetApplicability';
import type { HouseholdRole } from '@prisma/client';
import { HomeEventsService } from '../homeEvents.service';
import { loadCanonicalMaintenanceTaskSet } from '../skills/context/maintenanceTaskContext.provider';
import { formatAskMaintenanceScope, formatAskMaintenanceTitle } from './askMaintenancePresentation';
import { maintenanceMoney } from './handlers/maintenance.handler';
import { INSPECTION_REPORT_STATUS_LABELS, INSPECTION_REPORT_TYPE_LABELS } from './support/inspectionReportCommand';
import { warrantyStatus, WARRANTY_EXPIRING_DAYS, type WarrantyStatusKey } from './handlers/warranties.handler';
import { listPropertyDocuments, type PropertyDocument } from '../propertyDocuments/propertyDocumentInventory.service';
import { ASK_RECORD_SECTION_REGISTRY, evaluateRecordSectionApplicability, type AskRecordSectionId } from './governance/askRecordSectionRegistry';

export const ASK_RECORD_COLLECTION_CONTRACT_VERSION = 'ask-record-collection-v1' as const;
export const ASK_RECORD_COLLECTION_DEFAULT_LIMIT = 25;
export const ASK_RECORD_COLLECTION_MAX_LIMIT = 50;

/**
 * FR-REC-003: every collection page states the authoritative total, the delivered count, the continuation cursor, the sort, the
 * applied filters and search, and whether more rows exist. `truncated` is true exactly when `nextCursor` is present, so a page can never
 * claim completeness while withholding rows.
 */
export interface AskRecordCollectionPage<Row> {
  contractVersion: typeof ASK_RECORD_COLLECTION_CONTRACT_VERSION;
  propertyId: string;
  sectionId: AskRecordSectionId;
  generatedAt: string;
  /** The newest source date among the delivered scope, when the reader knows it. */
  freshAsOf: string | null;
  total: number;
  delivered: number;
  nextCursor: string | null;
  truncated: boolean;
  /** A plain-language limit of the source that the cursor cannot work around, or null. */
  notice: string | null;
  sort: { key: string; label: string };
  query: { search: string | null; filters: Record<string, string> };
  filterOptions: Array<{ key: string; label: string; options: Array<{ value: string; label: string }> }>;
  rows: Row[];
}

export interface AskRecordCollectionQuery {
  cursor?: string | null;
  limit?: number | null;
  search?: string | null;
  filters?: Record<string, string | undefined>;
}

export interface AskRecordRoomRow {
  id: string;
  name: string;
  type: string | null;
  floorLevel: number | null;
  itemCount: number;
  openTaskCount: number;
  updatedAt: string;
  /** The Ask question that opens this room's contents. */
  askQuestion: string;
}

const SearchSchema = z.string().trim().max(80);
const FLOOR_NONE = 'none';

class InvalidCollectionQueryError extends Error {
  code = 'ASK_INVALID_REQUEST';
}

function clampLimit(limit: number | null | undefined): number {
  if (limit == null) return ASK_RECORD_COLLECTION_DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) throw new InvalidCollectionQueryError('limit must be a positive integer.');
  return Math.min(limit, ASK_RECORD_COLLECTION_MAX_LIMIT);
}

function cleanSearch(search: string | null | undefined): string | null {
  const parsed = SearchSchema.safeParse(search ?? '');
  if (!parsed.success) throw new InvalidCollectionQueryError('search is too long.');
  return parsed.data || null;
}

// Keyset cursors carry the last delivered row's sort key, so a row added or removed between pages never duplicates or skips another.
const RoomCursorSchema = z.object({ s: z.number().int(), n: z.string(), i: z.string() });
const encodeCursor = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
function decodeCursor<T>(cursor: string | null | undefined, schema: z.ZodType<T>): T | null {
  if (!cursor) return null;
  try {
    return schema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
  } catch {
    throw new InvalidCollectionQueryError('cursor is not valid.');
  }
}

const readableEnum = (value: string | null): string | null => (value ? value.toLowerCase().split('_').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ') : null);

/** Reads one page of rooms. Pure database access: authorization and applicability are the caller's. */
export async function readRoomsPage(propertyId: string, query: AskRecordCollectionQuery): Promise<AskRecordCollectionPage<AskRecordRoomRow>> {
  const limit = clampLimit(query.limit);
  const search = cleanSearch(query.search);
  const floorFilter = query.filters?.floor?.trim() || null;
  let floorWhere: { floorLevel: number | null } | null = null;
  if (floorFilter) {
    if (floorFilter === FLOOR_NONE) floorWhere = { floorLevel: null };
    else if (/^-?\d{1,2}$/.test(floorFilter)) floorWhere = { floorLevel: Number(floorFilter) };
    else throw new InvalidCollectionQueryError('floor filter is not valid.');
  }
  const after = decodeCursor(query.cursor, RoomCursorSchema);

  const baseWhere = {
    propertyId,
    ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
    ...(floorWhere ?? {}),
  };
  const pageWhere = after
    ? {
      AND: [baseWhere, {
        OR: [
          { sortOrder: { gt: after.s } },
          { sortOrder: after.s, name: { gt: after.n } },
          { sortOrder: after.s, name: after.n, id: { gt: after.i } },
        ],
      }],
    }
    : baseWhere;

  const [rows, total, floors, floorlessCount] = await Promise.all([
    prisma.inventoryRoom.findMany({
      where: pageWhere,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      select: {
        id: true, name: true, type: true, updatedAt: true, floorLevel: true, sortOrder: true,
        _count: { select: { items: true, maintenanceTasks: { where: { status: { in: ['PENDING', 'IN_PROGRESS'] } } } } },
      },
    }),
    prisma.inventoryRoom.count({ where: baseWhere }),
    prisma.inventoryRoom.groupBy({ by: ['floorLevel'], where: { propertyId, floorLevel: { not: null } }, orderBy: { floorLevel: 'asc' } }),
    prisma.inventoryRoom.count({ where: { propertyId, floorLevel: null } }),
  ]);

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = rows.length > limit && last ? encodeCursor({ s: last.sortOrder, n: last.name, i: last.id }) : null;
  const floorOptions = [
    ...floors.flatMap((entry) => (entry.floorLevel === null ? [] : [{ value: String(entry.floorLevel), label: `Level ${entry.floorLevel}` }])),
    ...(floorlessCount > 0 ? [{ value: FLOOR_NONE, label: 'Floor not recorded' }] : []),
  ];

  return {
    contractVersion: ASK_RECORD_COLLECTION_CONTRACT_VERSION,
    propertyId,
    sectionId: 'rooms',
    generatedAt: new Date().toISOString(),
    freshAsOf: null,
    total,
    delivered: page.length,
    nextCursor,
    truncated: nextCursor !== null,
    notice: null,
    sort: { key: 'sortOrder', label: 'Home order, then name' },
    query: { search, filters: floorFilter ? { floor: floorFilter } : {} },
    filterOptions: floorOptions.length > 1 ? [{ key: 'floor', label: 'Floor', options: floorOptions }] : [],
    rows: page.map((room) => ({
      id: room.id,
      name: room.name,
      type: readableEnum(room.type),
      floorLevel: room.floorLevel,
      itemCount: room._count.items,
      openTaskCount: room._count.maintenanceTasks,
      updatedAt: room.updatedAt.toISOString(),
      askQuestion: `Show me the items in my ${room.name}.`,
    })),
  };
}

export interface AskRecordInventoryRow {
  id: string;
  name: string;
  category: string;
  /** Null when the condition is recorded as unknown. */
  condition: string | null;
  roomName: string | null;
  brandModel: string | null;
  verified: boolean;
  /** The facts Ask's inventory answer checks that are not recorded yet (brand, model, serial, purchase date, documents, coverage). */
  missingDetails: string[];
  /** Set when the expected end of life falls inside Ask's three-year horizon. */
  endOfLifeBy: string | null;
  updatedAt: string;
  /** The declared Ask action for one item; the inventory handler resolves the quoted name exactly. */
  askQuestion: string;
}

const INVENTORY_CATEGORIES = ['APPLIANCE', 'HVAC', 'PLUMBING', 'ELECTRICAL', 'ROOF_EXTERIOR', 'SAFETY', 'SMART_HOME', 'FURNITURE', 'ELECTRONICS', 'OTHER', 'INTERIOR', 'STRUCTURAL', 'EXTERIOR', 'SITE'] as const;
const INVENTORY_STATUSES = [
  { value: 'incomplete', label: 'Missing details' },
  { value: 'lifecycle', label: 'Nearing end of life' },
  { value: 'unverified', label: 'Not verified' },
] as const;
const InventoryCursorSchema = z.object({ u: z.string().datetime(), i: z.string() });

// "Not recorded" means null or blank, the same truthiness Ask's inventory answer applies.
const blank = (field: string) => ({ OR: [{ [field]: null }, { [field]: '' }] });

/** The where clause for each status focus. Mirrors `inventoryMissingFacts` field for field; a test holds the two together. */
export function inventoryStatusWhere(status: string, now = new Date()): Record<string, unknown> {
  if (status === 'incomplete') {
    return {
      OR: [
        { AND: [blank('brand'), blank('manufacturer')] },
        { AND: [blank('model'), blank('modelNumber')] },
        { AND: [blank('serialNo'), blank('serialNumber')] },
        { purchasedOn: null },
        { documents: { none: {} } },
        { AND: [{ warrantyId: null }, { insurancePolicyId: null }, { coverageEvidenceStatus: 'UNKNOWN' }] },
      ],
    };
  }
  if (status === 'lifecycle') return { expectedExpiryDate: { not: null, lte: inventoryLifecycleHorizon(now) } };
  if (status === 'unverified') return { isVerified: false };
  throw new InvalidCollectionQueryError('status filter is not valid.');
}

/** Reads one page of inventory: the visible items Ask's inventory answer lists, most recently updated first. */
export async function readInventoryPage(propertyId: string, query: AskRecordCollectionQuery): Promise<AskRecordCollectionPage<AskRecordInventoryRow>> {
  const limit = clampLimit(query.limit);
  const search = cleanSearch(query.search);
  const category = query.filters?.category?.trim() || null;
  const room = query.filters?.room?.trim() || null;
  const status = query.filters?.status?.trim() || null;
  if (category && !(INVENTORY_CATEGORIES as readonly string[]).includes(category)) throw new InvalidCollectionQueryError('category filter is not valid.');
  if (room && !/^[A-Za-z0-9-]{1,64}$/.test(room)) throw new InvalidCollectionQueryError('room filter is not valid.');
  const after = decodeCursor(query.cursor, InventoryCursorSchema);

  const clauses: Array<Record<string, unknown>> = [{ propertyId }, visibleInventoryItemWhere() as Record<string, unknown>];
  if (category) clauses.push({ category });
  if (room) clauses.push({ roomId: room });
  if (status) clauses.push(inventoryStatusWhere(status));
  if (search) {
    clauses.push({
      OR: ['name', 'brand', 'model', 'serialNo', 'manufacturer', 'modelNumber', 'serialNumber', 'upc', 'sku'].map((field) => ({ [field]: { contains: search, mode: 'insensitive' } })),
    });
  }
  const baseWhere = { AND: clauses };
  const pageWhere = after
    ? { AND: [...clauses, { OR: [{ updatedAt: { lt: new Date(after.u) } }, { updatedAt: new Date(after.u), id: { lt: after.i } }] }] }
    : baseWhere;
  const visibleWhere = { AND: [{ propertyId }, visibleInventoryItemWhere()] };

  const [rows, total, categories, rooms] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: pageWhere as never,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true, name: true, category: true, condition: true, isVerified: true, updatedAt: true, expectedExpiryDate: true,
        brand: true, manufacturer: true, model: true, modelNumber: true, serialNo: true, serialNumber: true, purchasedOn: true,
        warrantyId: true, insurancePolicyId: true, coverageEvidenceStatus: true,
        room: { select: { name: true } },
        documents: { select: { id: true }, take: 1 },
      },
    }),
    prisma.inventoryItem.count({ where: baseWhere as never }),
    prisma.inventoryItem.groupBy({ by: ['category'], where: visibleWhere as never, orderBy: { category: 'asc' } }),
    prisma.inventoryRoom.findMany({ where: { propertyId, items: { some: visibleInventoryItemWhere() } }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }], take: 100, select: { id: true, name: true } }),
  ]);

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = rows.length > limit && last ? encodeCursor({ u: last.updatedAt.toISOString(), i: last.id }) : null;
  const horizon = inventoryLifecycleHorizon();
  const filterOptions: AskRecordCollectionPage<unknown>['filterOptions'] = [
    { key: 'status', label: 'Status', options: INVENTORY_STATUSES.map((entry) => ({ value: entry.value, label: entry.label })) },
    ...(categories.length > 1 ? [{ key: 'category', label: 'Category', options: categories.map((entry) => ({ value: entry.category, label: readableEnum(entry.category) ?? entry.category })) }] : []),
    ...(rooms.length > 1 ? [{ key: 'room', label: 'Room', options: rooms.map((entry) => ({ value: entry.id, label: entry.name })) }] : []),
  ];

  return {
    contractVersion: ASK_RECORD_COLLECTION_CONTRACT_VERSION,
    propertyId,
    sectionId: 'inventory',
    generatedAt: new Date().toISOString(),
    freshAsOf: null,
    total,
    delivered: page.length,
    nextCursor,
    truncated: nextCursor !== null,
    notice: null,
    sort: { key: 'updatedAt', label: 'Recently updated' },
    query: { search, filters: Object.fromEntries(Object.entries({ category, room, status }).filter(([, value]) => value)) as Record<string, string> },
    filterOptions,
    rows: page.map((item) => ({
      id: item.id,
      name: item.name,
      category: readableEnum(item.category) ?? item.category,
      condition: item.condition === 'UNKNOWN' ? null : readableEnum(item.condition),
      roomName: item.room?.name ?? null,
      brandModel: [item.brand ?? item.manufacturer, item.model ?? item.modelNumber].filter(Boolean).join(' ') || null,
      verified: item.isVerified,
      missingDetails: inventoryMissingFacts(item),
      endOfLifeBy: item.expectedExpiryDate && item.expectedExpiryDate <= horizon ? item.expectedExpiryDate.toISOString() : null,
      updatedAt: item.updatedAt.toISOString(),
      askQuestion: `Show inventory item "${item.name}"`,
    })),
  };
}

export interface AskRecordDocumentRow {
  id: string;
  title: string;
  kind: string;
  kindLabel: string;
  /** The recorded verification status, or null when the store records none. */
  verification: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED' | null;
  /** Home Records only: extracted facts await review. */
  needsReview: boolean | null;
  expiry: 'CURRENT' | 'EXPIRING_SOON' | 'EXPIRED' | null;
  /** True for a row still held in the legacy vault, which is projected only until its domain is converted. */
  transitional: boolean;
  addedAt: string;
  updatedAt: string;
  /** Opens the documents answer for this kind of document: Ask has no per-document read yet, so detail and correction stay with that answer. */
  askQuestion: string;
}

const DOCUMENT_STATUS_LABELS: Record<string, string> = { VERIFIED: 'Verified', UNVERIFIED: 'Unverified', PENDING: 'Pending verification', REJECTED: 'Rejected', NEEDS_REVIEW: 'Needs review' };
const DocumentCursorSchema = z.object({ a: z.string().datetime(), i: z.string() });

function documentMatchesStatus(document: PropertyDocument, status: string): boolean {
  return status === 'NEEDS_REVIEW' ? document.needsReview === true : document.verification === status;
}

/**
 * Reads one page of the documents on file: the canonical inventory (Home Records plus the transitional legacy vault, with the caller's
 * record-level visibility already applied) with the same scope the index counts. That inventory is not database-paged because it spans two
 * stores, so filtering, search and the cursor are applied to its metadata rows (never file contents), newest first.
 */
export async function readDocumentsPage(
  context: { propertyId: string; role: HouseholdRole },
  query: AskRecordCollectionQuery,
  list: typeof listPropertyDocuments = listPropertyDocuments,
): Promise<AskRecordCollectionPage<AskRecordDocumentRow>> {
  const limit = clampLimit(query.limit);
  const search = cleanSearch(query.search);
  const status = query.filters?.status?.trim() || null;
  const kind = query.filters?.kind?.trim() || null;
  if (status && !(status in DOCUMENT_STATUS_LABELS)) throw new InvalidCollectionQueryError('status filter is not valid.');
  if (kind && !/^[A-Z_]{1,40}$/.test(kind)) throw new InvalidCollectionQueryError('kind filter is not valid.');
  const after = decodeCursor(query.cursor, DocumentCursorSchema);

  const inventory = await list({ propertyId: context.propertyId, role: context.role, includeLegacy: true, includeInventoryLinkedLegacy: true });
  const newestFirst = [...inventory.items].sort((left, right) => right.addedAt.getTime() - left.addedAt.getTime() || (left.id < right.id ? 1 : left.id > right.id ? -1 : 0));
  const needle = search?.toLowerCase() ?? null;
  const matching = newestFirst.filter((document) => (
    (!status || documentMatchesStatus(document, status))
    && (!kind || document.kind === kind)
    && (!needle || `${document.title} ${document.description ?? ''}`.toLowerCase().includes(needle))
  ));
  const afterTime = after ? new Date(after.a).getTime() : null;
  const remaining = after
    ? matching.filter((document) => document.addedAt.getTime() < afterTime! || (document.addedAt.getTime() === afterTime && document.id < after.i))
    : matching;
  const page = remaining.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = remaining.length > limit && last ? encodeCursor({ a: last.addedAt.toISOString(), i: last.id }) : null;

  const statusOptions = Object.keys(DOCUMENT_STATUS_LABELS)
    .filter((value) => inventory.items.some((document) => documentMatchesStatus(document, value)) || value === status)
    .map((value) => ({ value, label: DOCUMENT_STATUS_LABELS[value] }));
  const kindOptions = [...new Map(inventory.items.map((document) => [document.kind, document.kindLabel])).entries()]
    .sort((left, right) => left[1].localeCompare(right[1]))
    .map(([value, label]) => ({ value, label }));

  return {
    contractVersion: ASK_RECORD_COLLECTION_CONTRACT_VERSION,
    propertyId: context.propertyId,
    sectionId: 'documents',
    generatedAt: new Date().toISOString(),
    freshAsOf: null,
    total: matching.length,
    delivered: page.length,
    nextCursor,
    truncated: nextCursor !== null,
    notice: null,
    sort: { key: 'addedAt', label: 'Recently added' },
    query: { search, filters: Object.fromEntries(Object.entries({ status, kind }).filter(([, value]) => value)) as Record<string, string> },
    filterOptions: [
      ...(statusOptions.length > 1 ? [{ key: 'status', label: 'Status', options: statusOptions }] : []),
      ...(kindOptions.length > 1 ? [{ key: 'kind', label: 'Type', options: kindOptions }] : []),
    ],
    rows: page.map((document) => ({
      id: document.id,
      title: document.title,
      kind: document.kind,
      kindLabel: document.kindLabel,
      verification: document.verification,
      needsReview: document.needsReview,
      expiry: document.expiry,
      transitional: document.transitional,
      addedAt: document.addedAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
      askQuestion: `Show me my ${document.kindLabel.toLowerCase()}.`,
    })),
  };
}

export interface AskRecordWarrantyRow {
  id: string;
  providerName: string;
  category: string;
  categoryLabel: string;
  /** The linked inventory item's name, when the warranty is attached to one. */
  itemName: string | null;
  /** Coverage text exactly as recorded, shortened for a row. Policy number and cost are never read. */
  coverageSummary: string | null;
  status: WarrantyStatusKey;
  statusLabel: string;
  daysRemaining: number | null;
  startDate: string;
  expiryDate: string;
  hasDocuments: boolean;
  updatedAt: string;
  /** Opens the warranties answer for this category, the narrowest declared read Ask has. */
  askQuestion: string;
}

const WARRANTY_STATUS_ORDER: readonly WarrantyStatusKey[] = ['EXPIRING', 'NEEDS_REVIEW', 'ACTIVE', 'STARTS_LATER', 'EXPIRED'];
const WARRANTY_STATUS_LABELS: Record<WarrantyStatusKey, string> = {
  EXPIRING: `Expires within ${WARRANTY_EXPIRING_DAYS} days`, NEEDS_REVIEW: 'Dates need review', ACTIVE: 'Active', STARTS_LATER: 'Starts later', EXPIRED: 'Expired',
};
const WARRANTY_CATEGORIES = ['APPLIANCE', 'HVAC', 'ROOFING', 'PLUMBING', 'ELECTRICAL', 'STRUCTURAL', 'HOME_WARRANTY_PLAN', 'OTHER'] as const;
// The words Ask's warranty focus recognizes for each category, so a row's question lands on that category's answer (tested against `warrantyFocus`).
const WARRANTY_CATEGORY_QUESTION_WORDS: Record<string, string> = {
  APPLIANCE: 'appliance', HVAC: 'HVAC', ROOFING: 'roofing', PLUMBING: 'plumbing', ELECTRICAL: 'electrical', STRUCTURAL: 'structural', HOME_WARRANTY_PLAN: 'home warranty plan', OTHER: 'other',
};
const WarrantyCursorSchema = z.object({ r: z.number().int(), k: z.number(), i: z.string() });
const COVERAGE_SUMMARY_MAX = 140;

type WarrantyEntry = { row: AskRecordWarrantyRow; haystack: string; rank: number; key: number };

/**
 * Reads one page of the property's warranties, in Ask's own order: expiring first, then dates that need review, active, starting later,
 * and expired (most recently expired first). Status is the governed `warrantyStatus`, which depends on dates and a coverage evaluation, so
 * it is computed per row and the filters, search and cursor run over the property's warranty rows (a handful per home) in memory.
 */
export async function readWarrantiesPage(propertyId: string, query: AskRecordCollectionQuery, now = new Date()): Promise<AskRecordCollectionPage<AskRecordWarrantyRow>> {
  const limit = clampLimit(query.limit);
  const search = cleanSearch(query.search);
  const status = query.filters?.status?.trim() || null;
  const category = query.filters?.category?.trim() || null;
  if (status && !(WARRANTY_STATUS_ORDER as readonly string[]).includes(status)) throw new InvalidCollectionQueryError('status filter is not valid.');
  if (category && !(WARRANTY_CATEGORIES as readonly string[]).includes(category)) throw new InvalidCollectionQueryError('category filter is not valid.');
  const after = decodeCursor(query.cursor, WarrantyCursorSchema);

  const records = await prisma.warranty.findMany({
    where: { propertyId },
    orderBy: [{ expiryDate: 'asc' }, { id: 'asc' }],
    select: {
      id: true, propertyId: true, providerName: true, category: true, coverageDetails: true, startDate: true, expiryDate: true, updatedAt: true,
      inventoryItem: { select: { name: true } }, documents: { select: { id: true }, take: 1 },
    },
  });
  const entries: WarrantyEntry[] = records.map((record) => {
    const evaluated = warrantyStatus(record, propertyId, now);
    const coverage = record.coverageDetails?.trim() || null;
    const questionWord = WARRANTY_CATEGORY_QUESTION_WORDS[record.category] ?? 'recorded';
    return {
      haystack: [record.inventoryItem?.name, record.providerName, record.coverageDetails].filter(Boolean).join(' ').toLowerCase(),
      rank: WARRANTY_STATUS_ORDER.indexOf(evaluated.key),
      // Expired warranties list the most recently expired first; every other status lists the soonest expiry first.
      key: evaluated.key === 'EXPIRED' ? -record.expiryDate.getTime() : record.expiryDate.getTime(),
      row: {
        id: record.id,
        providerName: record.providerName,
        category: record.category,
        categoryLabel: readableEnum(record.category) ?? record.category,
        itemName: record.inventoryItem?.name ?? null,
        coverageSummary: coverage && coverage.length > COVERAGE_SUMMARY_MAX ? `${coverage.slice(0, COVERAGE_SUMMARY_MAX - 1).trimEnd()}…` : coverage,
        status: evaluated.key,
        statusLabel: WARRANTY_STATUS_LABELS[evaluated.key],
        daysRemaining: evaluated.daysRemaining,
        startDate: record.startDate.toISOString(),
        expiryDate: record.expiryDate.toISOString(),
        hasDocuments: record.documents.length > 0,
        updatedAt: record.updatedAt.toISOString(),
        askQuestion: `Show me my ${questionWord} warranties.`,
      },
    };
  }).sort((left, right) => left.rank - right.rank || left.key - right.key || (left.row.id < right.row.id ? -1 : left.row.id > right.row.id ? 1 : 0));

  const needle = search?.toLowerCase() ?? null;
  const matching = entries.filter((entry) => (!status || entry.row.status === status) && (!category || entry.row.category === category) && (!needle || entry.haystack.includes(needle)));
  const remaining = after
    ? matching.filter((entry) => entry.rank > after.r || (entry.rank === after.r && (entry.key > after.k || (entry.key === after.k && entry.row.id > after.i))))
    : matching;
  const page = remaining.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = remaining.length > limit && last ? encodeCursor({ r: last.rank, k: last.key, i: last.row.id }) : null;

  const statusOptions = WARRANTY_STATUS_ORDER.filter((value) => entries.some((entry) => entry.row.status === value) || value === status).map((value) => ({ value, label: WARRANTY_STATUS_LABELS[value] }));
  const categoryOptions = WARRANTY_CATEGORIES.filter((value) => entries.some((entry) => entry.row.category === value) || value === category).map((value) => ({ value, label: readableEnum(value) ?? value }));

  return {
    contractVersion: ASK_RECORD_COLLECTION_CONTRACT_VERSION,
    propertyId,
    sectionId: 'warranties',
    generatedAt: now.toISOString(),
    freshAsOf: null,
    total: matching.length,
    delivered: page.length,
    nextCursor,
    truncated: nextCursor !== null,
    notice: null,
    sort: { key: 'status', label: 'Expiring first, then by expiry date' },
    query: { search, filters: Object.fromEntries(Object.entries({ status, category }).filter(([, value]) => value)) as Record<string, string> },
    filterOptions: [
      ...(statusOptions.length > 1 ? [{ key: 'status', label: 'Status', options: statusOptions }] : []),
      ...(categoryOptions.length > 1 ? [{ key: 'category', label: 'Category', options: categoryOptions }] : []),
    ],
    rows: page.map((entry) => entry.row),
  };
}

export interface AskRecordTimelineRow {
  id: string;
  title: string;
  summary: string | null;
  type: string;
  typeLabel: string;
  occurredAt: string;
  /** How precise the recorded date is; the display must not invent a day for a month, year, range, or unknown date. */
  datePrecision: 'EXACT_DATE' | 'MONTH' | 'YEAR' | 'RANGE' | 'UNKNOWN';
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  verification: string;
  verificationLabel: string;
  providerName: string | null;
  /** True for a private event, which only its recorder is ever sent. */
  isPrivate: boolean;
  /** Ask has no per-event read; detail, evidence and correction stay with the Ask timeline answer. */
  askQuestion: null;
}

const TIMELINE_VERIFICATION = ['UNVERIFIED', 'PENDING_CONFIRMATION', 'HOMEOWNER_CONFIRMED', 'EVIDENCE_VERIFIED', 'DISPUTED'] as const;
const TimelineCursorSchema = z.object({ o: z.number(), i: z.string() });
const isoOrNullDate = (value: unknown): string | null => {
  if (!value) return null;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/**
 * Reads one page of the home timeline from `HomeEventsService.listAllCurrentEvents`: every current event, with the purchase
 * de-duplication and appliance-profile projection the Timeline page and Ask apply, and no 200-event limit. The privacy rule is Ask's: a
 * private event goes only to the person who recorded it. Filtering, search and the cursor run over those lean rows (no evidence graph).
 */
export async function readTimelinePage(
  context: { propertyId: string; userId: string },
  query: AskRecordCollectionQuery,
  list: (propertyId: string) => Promise<any[]> = (propertyId) => new HomeEventsService().listAllCurrentEvents(propertyId),
): Promise<AskRecordCollectionPage<AskRecordTimelineRow>> {
  const limit = clampLimit(query.limit);
  const search = cleanSearch(query.search);
  const type = query.filters?.type?.trim() || null;
  const verification = query.filters?.verification?.trim() || null;
  if (type && !/^[A-Z_]{1,40}$/.test(type)) throw new InvalidCollectionQueryError('type filter is not valid.');
  if (verification && !(TIMELINE_VERIFICATION as readonly string[]).includes(verification)) throw new InvalidCollectionQueryError('verification filter is not valid.');
  const after = decodeCursor(query.cursor, TimelineCursorSchema);

  const events = await list(context.propertyId);
  const visible = events.filter((event) => event.visibility !== 'PRIVATE' || event.createdById === context.userId);
  const time = (event: { occurredAt?: unknown }) => { const value = new Date(event.occurredAt as string).getTime(); return Number.isNaN(value) ? 0 : value; };
  const ordered = [...visible].sort((left, right) => time(right) - time(left) || (String(left.id) < String(right.id) ? 1 : String(left.id) > String(right.id) ? -1 : 0));
  const needle = search?.toLowerCase() ?? null;
  const matching = ordered.filter((event) => (
    (!type || event.type === type)
    && (!verification || event.verificationStatus === verification)
    && (!needle || `${event.title ?? ''} ${event.summary ?? ''} ${event.providerName ?? ''}`.toLowerCase().includes(needle))
  ));
  const remaining = after ? matching.filter((event) => time(event) < after.o || (time(event) === after.o && String(event.id) < after.i)) : matching;
  const page = remaining.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = remaining.length > limit && last ? encodeCursor({ o: time(last), i: String(last.id) }) : null;

  const typeOptions = [...new Set(visible.map((event) => String(event.type)))].sort().map((value) => ({ value, label: readableEnum(value) ?? value }));
  const verificationOptions = TIMELINE_VERIFICATION.filter((value) => visible.some((event) => event.verificationStatus === value) || value === verification).map((value) => ({ value, label: readableEnum(value) ?? value }));
  const newestEvent = ordered.find((event) => time(event) > 0);

  return {
    contractVersion: ASK_RECORD_COLLECTION_CONTRACT_VERSION,
    propertyId: context.propertyId,
    sectionId: 'timeline',
    generatedAt: new Date().toISOString(),
    freshAsOf: newestEvent ? new Date(time(newestEvent)).toISOString() : null,
    total: matching.length,
    delivered: page.length,
    nextCursor,
    truncated: nextCursor !== null,
    notice: null,
    sort: { key: 'occurredAt', label: 'Most recent first' },
    query: { search, filters: Object.fromEntries(Object.entries({ type, verification }).filter(([, value]) => value)) as Record<string, string> },
    filterOptions: [
      ...(verificationOptions.length > 1 ? [{ key: 'verification', label: 'Verification', options: verificationOptions }] : []),
      ...(typeOptions.length > 1 ? [{ key: 'type', label: 'Type', options: typeOptions }] : []),
    ],
    rows: page.map((event) => {
      const summary = typeof event.summary === 'string' ? event.summary.trim() : '';
      return {
        id: String(event.id),
        title: String(event.title ?? 'Untitled event'),
        summary: summary ? (summary.length > 140 ? `${summary.slice(0, 139).trimEnd()}…` : summary) : null,
        type: String(event.type),
        typeLabel: readableEnum(String(event.type)) ?? String(event.type),
        occurredAt: isoOrNullDate(event.occurredAt) ?? new Date(0).toISOString(),
        datePrecision: event.datePrecision ?? 'EXACT_DATE',
        dateRangeStart: isoOrNullDate(event.dateRangeStart),
        dateRangeEnd: isoOrNullDate(event.dateRangeEnd),
        verification: String(event.verificationStatus ?? 'UNVERIFIED'),
        verificationLabel: readableEnum(String(event.verificationStatus ?? 'UNVERIFIED')) ?? 'Unverified',
        providerName: event.providerName ?? null,
        isPrivate: event.visibility === 'PRIVATE',
        askQuestion: null,
      };
    }),
  };
}

export interface AskRecordMaintenanceRow {
  id: string;
  title: string;
  /** The item, room, or category the work was for, in Ask's wording. */
  scope: string;
  /** Null when the completion date was not recorded. */
  completedOn: string | null;
  actualCost: string | null;
  source: string;
  repeats: string | null;
  priority: string;
  askQuestion: null;
}

const MaintenanceCursorSchema = z.object({ d: z.number(), i: z.string() });
const UNDATED = 'undated';

/**
 * Reads one page of maintenance history: the completed tasks from the same canonical task set Ask's maintenance answer reads, most
 * recently completed first. A task completed without a recorded date lists last and says so. Open and cancelled work stay with the
 * Work destination and the maintenance answer.
 */
export async function readMaintenanceHistoryPage(
  context: { propertyId: string; userId: string },
  query: AskRecordCollectionQuery,
  load: typeof loadCanonicalMaintenanceTaskSet = loadCanonicalMaintenanceTaskSet,
): Promise<AskRecordCollectionPage<AskRecordMaintenanceRow>> {
  const limit = clampLimit(query.limit);
  const search = cleanSearch(query.search);
  const year = query.filters?.year?.trim() || null;
  if (year && year !== UNDATED && !/^\d{4}$/.test(year)) throw new InvalidCollectionQueryError('year filter is not valid.');
  const after = decodeCursor(query.cursor, MaintenanceCursorSchema);

  const { historical } = await load(context.userId, context.propertyId);
  // Undated completions sort after every dated one: their key is below any real timestamp.
  const key = (task: { lastCompletedDate: Date | null }) => (task.lastCompletedDate ? task.lastCompletedDate.getTime() : Number.NEGATIVE_INFINITY);
  const completed = historical.filter((task) => task.status === 'COMPLETED')
    .sort((left, right) => (key(right) === key(left) ? 0 : key(right) > key(left) ? 1 : -1) || (left.id < right.id ? 1 : left.id > right.id ? -1 : 0));
  const yearOf = (task: { lastCompletedDate: Date | null }) => (task.lastCompletedDate ? String(task.lastCompletedDate.getUTCFullYear()) : UNDATED);
  const needle = search?.toLowerCase() ?? null;
  const matching = completed.filter((task) => (
    (!year || yearOf(task) === year)
    && (!needle || [task.title, task.description, task.inventoryItem?.name, task.room?.name, task.category, task.assetType].filter(Boolean).join(' ').toLowerCase().includes(needle))
  ));
  // The cursor stores the date as a number; an undated task is stored as -1, which no real completion date can equal.
  const cursorKey = (task: { lastCompletedDate: Date | null }) => (task.lastCompletedDate ? task.lastCompletedDate.getTime() : -1);
  const remaining = after
    ? matching.filter((task) => cursorKey(task) < after.d || (cursorKey(task) === after.d && task.id < after.i))
    : matching;
  const page = remaining.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = remaining.length > limit && last ? encodeCursor({ d: cursorKey(last), i: last.id }) : null;

  const years = [...new Set(completed.map(yearOf))].sort((left, right) => (left === UNDATED ? 1 : right === UNDATED ? -1 : right.localeCompare(left)));
  const newestCompleted = completed.find((task) => task.lastCompletedDate);

  return {
    contractVersion: ASK_RECORD_COLLECTION_CONTRACT_VERSION,
    propertyId: context.propertyId,
    sectionId: 'maintenance-history',
    generatedAt: new Date().toISOString(),
    freshAsOf: newestCompleted?.lastCompletedDate?.toISOString() ?? null,
    total: matching.length,
    delivered: page.length,
    nextCursor,
    truncated: nextCursor !== null,
    notice: null,
    sort: { key: 'lastCompletedDate', label: 'Most recently completed' },
    query: { search, filters: year ? { year } : {} },
    filterOptions: years.length > 1 ? [{ key: 'year', label: 'Year', options: years.map((value) => ({ value, label: value === UNDATED ? 'Date not recorded' : value })) }] : [],
    rows: page.map((task) => ({
      id: task.id,
      title: formatAskMaintenanceTitle(task.title),
      scope: formatAskMaintenanceScope({ inventoryItemName: task.inventoryItem?.name, roomName: task.room?.name, category: task.category, assetType: task.assetType }),
      completedOn: task.lastCompletedDate ? task.lastCompletedDate.toISOString() : null,
      actualCost: maintenanceMoney(task.actualCost),
      source: String(task.source).toLowerCase().replace(/_/g, ' '),
      repeats: task.isRecurring && task.frequency ? String(task.frequency).toLowerCase().replace(/_/g, ' ') : null,
      priority: String(task.priority).toLowerCase(),
      askQuestion: null,
    })),
  };
}

export interface AskRecordInspectionRow {
  id: string;
  reportType: string;
  reportTypeLabel: string;
  inspectionDate: string;
  inspector: string | null;
  status: string;
  statusLabel: string;
  totalFindings: number;
  openFindings: number;
  safetyFindings: number;
  majorFindings: number;
  askQuestion: null;
}

const InspectionCursorSchema = z.object({ d: z.string().datetime(), i: z.string() });
const INSPECTION_TYPES = Object.keys(INSPECTION_REPORT_TYPE_LABELS);
const INSPECTION_STATUSES = ['PROCESSING', 'REVIEW_PENDING', 'CONFIRMED'] as const;

/** Reads one page of inspection reports (archived ones are not listed), newest inspection first, with a keyset cursor. */
export async function readInspectionsPage(propertyId: string, query: AskRecordCollectionQuery): Promise<AskRecordCollectionPage<AskRecordInspectionRow>> {
  const limit = clampLimit(query.limit);
  const search = cleanSearch(query.search);
  const reportType = query.filters?.type?.trim() || null;
  const status = query.filters?.status?.trim() || null;
  if (reportType && !INSPECTION_TYPES.includes(reportType)) throw new InvalidCollectionQueryError('type filter is not valid.');
  if (status && !(INSPECTION_STATUSES as readonly string[]).includes(status)) throw new InvalidCollectionQueryError('status filter is not valid.');
  const after = decodeCursor(query.cursor, InspectionCursorSchema);

  const clauses: Array<Record<string, unknown>> = [{ propertyId, status: { not: 'ARCHIVED' } }];
  if (reportType) clauses.push({ reportType });
  if (status) clauses.push({ status });
  if (search) clauses.push({ OR: ['inspectorName', 'inspectorCompany'].map((field) => ({ [field]: { contains: search, mode: 'insensitive' } })) });
  const baseWhere = { AND: clauses };
  const pageWhere = after
    ? { AND: [...clauses, { OR: [{ inspectionDate: { lt: new Date(after.d) } }, { inspectionDate: new Date(after.d), id: { lt: after.i } }] }] }
    : baseWhere;
  const scopeWhere = { propertyId, status: { not: 'ARCHIVED' } };

  const [rows, total, types, statuses] = await Promise.all([
    prisma.inspectionReport.findMany({
      where: pageWhere as never,
      orderBy: [{ inspectionDate: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: { id: true, reportType: true, inspectionDate: true, inspectorName: true, inspectorCompany: true, status: true, totalFindings: true, openFindings: true, safetyFindings: true, majorFindings: true },
    }),
    prisma.inspectionReport.count({ where: baseWhere as never }),
    prisma.inspectionReport.groupBy({ by: ['reportType'], where: scopeWhere as never, orderBy: { reportType: 'asc' } }),
    prisma.inspectionReport.groupBy({ by: ['status'], where: scopeWhere as never, orderBy: { status: 'asc' } }),
  ]);

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = rows.length > limit && last ? encodeCursor({ d: last.inspectionDate.toISOString(), i: last.id }) : null;
  const newest = await prisma.inspectionReport.findFirst({ where: scopeWhere as never, orderBy: [{ inspectionDate: 'desc' }, { id: 'desc' }], select: { inspectionDate: true } });
  const typeOptions = types.map((entry) => ({ value: entry.reportType as string, label: INSPECTION_REPORT_TYPE_LABELS[entry.reportType] ?? readableEnum(entry.reportType) ?? entry.reportType }));
  const statusOptions = statuses.map((entry) => ({ value: entry.status as string, label: INSPECTION_REPORT_STATUS_LABELS[entry.status] ?? entry.status }));

  return {
    contractVersion: ASK_RECORD_COLLECTION_CONTRACT_VERSION,
    propertyId,
    sectionId: 'inspections',
    generatedAt: new Date().toISOString(),
    freshAsOf: newest?.inspectionDate.toISOString() ?? null,
    total,
    delivered: page.length,
    nextCursor,
    truncated: nextCursor !== null,
    notice: null,
    sort: { key: 'inspectionDate', label: 'Newest inspection first' },
    query: { search, filters: Object.fromEntries(Object.entries({ type: reportType, status }).filter(([, value]) => value)) as Record<string, string> },
    filterOptions: [
      ...(statusOptions.length > 1 ? [{ key: 'status', label: 'Status', options: statusOptions }] : []),
      ...(typeOptions.length > 1 ? [{ key: 'type', label: 'Type', options: typeOptions }] : []),
    ],
    rows: page.map((report) => ({
      id: report.id,
      reportType: report.reportType,
      reportTypeLabel: INSPECTION_REPORT_TYPE_LABELS[report.reportType] ?? 'Inspection',
      inspectionDate: report.inspectionDate.toISOString(),
      inspector: [report.inspectorName, report.inspectorCompany].filter(Boolean).join(', ') || null,
      status: report.status,
      statusLabel: INSPECTION_REPORT_STATUS_LABELS[report.status] ?? report.status,
      totalFindings: report.totalFindings,
      openFindings: report.openFindings,
      safetyFindings: report.safetyFindings,
      majorFindings: report.majorFindings,
      askQuestion: null,
    })),
  };
}

export type AskRecordReaderContext = { propertyId: string; userId: string; role: HouseholdRole };
type SectionReader = (context: AskRecordReaderContext, query: AskRecordCollectionQuery) => Promise<AskRecordCollectionPage<unknown>>;

/** The sections with a connected paged reader. The registry's `pagedCollection` flag must agree with this map (tested). */
export const ASK_RECORD_COLLECTION_READERS: Readonly<Partial<Record<AskRecordSectionId, SectionReader>>> = Object.freeze({
  rooms: (context, query) => readRoomsPage(context.propertyId, query),
  inventory: (context, query) => readInventoryPage(context.propertyId, query),
  documents: readDocumentsPage,
  timeline: (context, query) => readTimelinePage(context, query),
  'maintenance-history': (context, query) => readMaintenanceHistoryPage(context, query),
  inspections: (context, query) => readInspectionsPage(context.propertyId, query),
  warranties: (context, query) => readWarrantiesPage(context.propertyId, query),
});

export class AskRecordSectionUnavailableError extends Error {
  code = 'ASK_RECORD_SECTION_UNAVAILABLE';
  constructor(public readonly reason: 'UNKNOWN_SECTION' | 'NOT_PAGED' | 'NOT_APPLICABLE' | 'CONTEXT_REQUIRED') {
    super(`Record section is unavailable: ${reason}.`);
  }
}

export class AskRecordSectionRestrictedError extends Error {
  code = 'ASK_PERMISSION_REQUIRED';
}

/** Reauthorizes on every call: account eligibility, current household role, role floor, and lifecycle applicability. */
export async function getAskRecordCollectionPage(
  userId: string,
  propertyId: string,
  sectionId: string,
  query: AskRecordCollectionQuery,
  accountRole?: AskAccountRole,
): Promise<AskRecordCollectionPage<unknown>> {
  await ensureAskServiceAccountEligibility(userId, accountRole);
  const access = await ensurePropertyAccess(userId, propertyId);
  const definition = ASK_RECORD_SECTION_REGISTRY.find((entry) => entry.id === sectionId);
  if (!definition) throw new AskRecordSectionUnavailableError('UNKNOWN_SECTION');
  const reader = ASK_RECORD_COLLECTION_READERS[definition.id];
  if (!definition.pagedCollection || !reader) throw new AskRecordSectionUnavailableError('NOT_PAGED');
  const applicability = evaluateRecordSectionApplicability(definition, { householdRole: access.role, operatingMode: await loadOperatingMode(userId, propertyId) });
  if (applicability === 'RESTRICTED') throw new AskRecordSectionRestrictedError('Your household role cannot read this section.');
  if (applicability === 'NOT_APPLICABLE') throw new AskRecordSectionUnavailableError('NOT_APPLICABLE');
  if (applicability === 'CONTEXT_REQUIRED') throw new AskRecordSectionUnavailableError('CONTEXT_REQUIRED');
  return reader({ propertyId, userId, role: access.role }, query);
}
