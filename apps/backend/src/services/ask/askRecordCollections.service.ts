import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import type { AskAccountRole } from './askAccountEligibility';
import { ensureAskServiceAccountEligibility, ensurePropertyAccess } from './askHandlerSupport';
import { loadOperatingMode } from './askRecordContext';
import { inventoryLifecycleHorizon, inventoryMissingFacts } from './handlers/inventory.handler';
import { visibleInventoryItemWhere } from '../riskAssetApplicability';
import type { HouseholdRole } from '@prisma/client';
import { HouseholdService } from '../household.service';
import { getProfile, listScenarios } from '../financing.service';
import { HomeBuyerTaskService } from '../HomeBuyerTask.service';
import { MORTGAGE_STATUS_LABELS, MORTGAGE_TYPE_LABELS, SCENARIO_STATUS_LABELS } from './support/financingRead';
import { evaluateCoverageRecord } from '../coverage/contextPolicy';
import { permitTrackerService } from '../permitTracker.service';
import { listProjects as listTrackedProjects } from '../projectTracker.service';
import { listRenovationCases } from '../renovationCase.service';
import { RENOVATION_CASE_TYPE_LABELS } from './support/renovationCaseStart';
import { PERMIT_CATEGORY_LABELS, PERMIT_OFFICIAL_STATUS_LABELS, PERMIT_REPORTED_STATUS_LABELS, PERMIT_WORK_TYPE_LABELS } from './support/permitTrackerRead';
import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from './handlers/projectTracker.handler';
import { OPEN_CLAIM_STATUSES, OPEN_INCIDENT_STATUSES } from './handlers/claims.handler';
import { HomeEventsService } from '../homeEvents.service';
import { loadCanonicalMaintenanceTaskSet } from '../skills/context/maintenanceTaskContext.provider';
import { formatAskMaintenanceScope, formatAskMaintenanceTitle } from './askMaintenancePresentation';
import { maintenanceMoney } from './handlers/maintenance.handler';
import { INSPECTION_REPORT_STATUS_LABELS, INSPECTION_REPORT_TYPE_LABELS } from './support/inspectionReportCommand';
import { warrantyStatus, WARRANTY_EXPIRING_DAYS, type WarrantyStatusKey } from './handlers/warranties.handler';
import { listPropertyDocuments, type PropertyDocument } from '../propertyDocuments/propertyDocumentInventory.service';
import { pendingDocumentPromotionCandidates, type DocumentPromotionCandidate } from './handlers/documents.handler';
import { ASK_RECORD_SECTION_REGISTRY, evaluateRecordSectionApplicability, type AskRecordSectionDefinition, type AskRecordSectionId, type AskRecordDetailCapability } from './governance/askRecordSectionRegistry';

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
  /** Facts about the whole section that need a higher role than the collection itself. Present only where a section has some. */
  detail?: AskRecordRestrictedDetail | null;
  /** FR-REC-004: whether a row of this section opens canonical per-record detail, or why it cannot. Set by the authorizing wrapper. */
  recordDetail?: AskRecordDetailCapability;
  sort: { key: string; label: string };
  query: { search: string | null; filters: Record<string, string> };
  filterOptions: Array<{ key: string; label: string; options: Array<{ value: string; label: string }> }>;
  rows: Row[];
}

export interface AskRecordRestrictedDetail {
  id: string;
  title: string;
  /** OWNER_ONLY: the caller is below the required role, so the facts were never read. */
  state: 'AVAILABLE' | 'NOT_RECORDED' | 'OWNER_ONLY';
  requiredRole: 'OWNER';
  facts: Array<{ label: string; value: string }>;
}

export interface AskRecordCollectionQuery {
  /** Internal: a caller that needs only the total (the index) skips any restricted detail so it is never read for nothing. */
  omitDetail?: boolean;
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
        _count: { select: { items: { where: visibleInventoryItemWhere() }, maintenanceTasks: { where: { status: { in: ['PENDING', 'IN_PROGRESS'] } } } } },
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
  /** A document's own id, or `candidate:<kind>:<id>` for a document-derived candidate awaiting review (candidates live in other tables). */
  id: string;
  /** A candidate is never trusted data until the household confirms it; it is listed with its own state, not as a document. */
  rowKind: 'DOCUMENT' | 'EXTRACTED_CANDIDATE';
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
const DocumentCursorSchema = z.object({ g: z.number().int(), a: z.string().datetime(), i: z.string() });
const CANDIDATE_KIND_LABELS: Record<DocumentPromotionCandidate['kind'], string> = {
  MATERIAL_EXTRACTION_REVIEW: 'Material extraction', INSPECTION_REPORT: 'Inspection report extraction', INSURANCE_POLICY_FACT: 'Insurance policy fact',
};
const DOCUMENT_STATES = ['document', 'candidate'] as const;
export const candidateRowId = (candidate: Pick<DocumentPromotionCandidate, 'kind' | 'id'>) => `candidate:${candidate.kind}:${candidate.id}`;

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
  loadCandidates: (propertyId: string) => Promise<DocumentPromotionCandidate[]> = (propertyId) => pendingDocumentPromotionCandidates(propertyId, null),
): Promise<AskRecordCollectionPage<AskRecordDocumentRow>> {
  const limit = clampLimit(query.limit);
  const search = cleanSearch(query.search);
  const status = query.filters?.status?.trim() || null;
  const kind = query.filters?.kind?.trim() || null;
  const state = query.filters?.state?.trim() || null;
  if (state && !(DOCUMENT_STATES as readonly string[]).includes(state)) throw new InvalidCollectionQueryError('state filter is not valid.');
  if (status && !(status in DOCUMENT_STATUS_LABELS)) throw new InvalidCollectionQueryError('status filter is not valid.');
  if (kind && !/^[A-Z_]{1,40}$/.test(kind)) throw new InvalidCollectionQueryError('kind filter is not valid.');
  const after = decodeCursor(query.cursor, DocumentCursorSchema);

  const [inventory, candidates] = await Promise.all([
    list({ propertyId: context.propertyId, role: context.role, includeLegacy: true, includeInventoryLinkedLegacy: true }),
    loadCandidates(context.propertyId),
  ]);
  // Candidates that await the household's review come first (they need a decision), then documents, each newest first.
  type Entry = { group: number; at: Date; id: string; row: AskRecordDocumentRow; haystack: string; kind: string; needsReview: boolean; verification: PropertyDocument['verification'] };
  const documentEntries: Entry[] = inventory.items.map((document) => ({
    group: 1, at: document.addedAt, id: document.id, kind: document.kind, needsReview: document.needsReview === true, verification: document.verification,
    haystack: `${document.title} ${document.description ?? ''}`.toLowerCase(),
    row: {
      id: document.id,
      rowKind: 'DOCUMENT',
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
    },
  }));
  const candidateEntries: Entry[] = candidates.map((candidate) => ({
    group: 0, at: candidate.updatedAt, id: candidateRowId(candidate), kind: candidate.kind, needsReview: true, verification: null,
    haystack: `${candidate.title} ${candidate.description}`.toLowerCase(),
    row: {
      id: candidateRowId(candidate),
      rowKind: 'EXTRACTED_CANDIDATE',
      title: candidate.title,
      kind: candidate.kind,
      kindLabel: CANDIDATE_KIND_LABELS[candidate.kind],
      verification: null,
      needsReview: true,
      expiry: null,
      transitional: false,
      addedAt: candidate.updatedAt.toISOString(),
      updatedAt: candidate.updatedAt.toISOString(),
      askQuestion: 'Review pending document extractions.',
    },
  }));
  const all = [...candidateEntries, ...documentEntries]
    .sort((left, right) => left.group - right.group || right.at.getTime() - left.at.getTime() || (left.id < right.id ? 1 : left.id > right.id ? -1 : 0));
  const needle = search?.toLowerCase() ?? null;
  const matchesStatus = (entry: Entry, value: string) => (value === 'NEEDS_REVIEW' ? entry.needsReview : entry.verification === value);
  const matching = all.filter((entry) => (
    (!status || matchesStatus(entry, status))
    && (!kind || entry.kind === kind)
    && (!state || (state === 'candidate' ? entry.group === 0 : entry.group === 1))
    && (!needle || entry.haystack.includes(needle))
  ));
  const afterTime = after ? new Date(after.a).getTime() : null;
  const remaining = after
    ? matching.filter((entry) => entry.group > after.g || (entry.group === after.g && (entry.at.getTime() < afterTime! || (entry.at.getTime() === afterTime && entry.id < after.i))))
    : matching;
  const page = remaining.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = remaining.length > limit && last ? encodeCursor({ g: last.group, a: last.at.toISOString(), i: last.id }) : null;

  const statusOptions = Object.keys(DOCUMENT_STATUS_LABELS)
    .filter((value) => all.some((entry) => matchesStatus(entry, value)) || value === status)
    .map((value) => ({ value, label: DOCUMENT_STATUS_LABELS[value] }));
  const kindOptions = [...new Map(all.map((entry) => [entry.kind, entry.row.kindLabel])).entries()]
    .sort((left, right) => left[1].localeCompare(right[1]))
    .map(([value, label]) => ({ value, label }));
  const stateOptions = candidateEntries.length > 0 || state === 'candidate'
    ? [{ value: 'document', label: 'Documents' }, { value: 'candidate', label: 'Awaiting your review' }]
    : [];

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
    sort: { key: 'addedAt', label: 'Awaiting review first, then recently added' },
    query: { search, filters: Object.fromEntries(Object.entries({ status, kind, state }).filter(([, value]) => value)) as Record<string, string> },
    filterOptions: [
      ...(stateOptions.length > 1 ? [{ key: 'state', label: 'Kind', options: stateOptions }] : []),
      ...(statusOptions.length > 1 ? [{ key: 'status', label: 'Status', options: statusOptions }] : []),
      ...(kindOptions.length > 1 ? [{ key: 'kind', label: 'Type', options: kindOptions }] : []),
    ],
    rows: page.map((entry) => entry.row),
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

export interface AskRecordPermitRow {
  id: string;
  title: string;
  description: string | null;
  /** The issuing authority's status. The household cannot change it. */
  officialStatus: string;
  officialStatusLabel: string;
  /** What the household or contractor reported, shown only while the official status is not confirmed. */
  reportedStatusLabel: string | null;
  closed: boolean;
  hasOpenInspections: boolean;
  issueDate: string | null;
  finaledDate: string | null;
  expirationDate: string | null;
  contractorName: string | null;
  verified: boolean;
  askQuestion: null;
}

const PERMIT_SOURCE_LIMIT = 500;
const PERMIT_CLOSED = new Set(['FINALED', 'EXPIRED', 'VOIDED']);
const PermitCursorSchema = z.object({ g: z.number().int(), d: z.number(), i: z.string() });
const dateKey = (iso: string | null | undefined): number => (iso ? new Date(iso).getTime() : -1);

/**
 * Reads one page of the home's permit records through `permitTrackerService.listPermits`, the read the Permit Tracker page and Ask use
 * (active records first, then closed out or no longer valid; newest issue date first). Official and reported status stay apart. That
 * service reads up to 500 records in one call; a home with more says so in `notice`.
 */
export async function readPermitsPage(
  propertyId: string,
  query: AskRecordCollectionQuery,
  list: typeof permitTrackerService.listPermits = (id, params) => permitTrackerService.listPermits(id, params),
): Promise<AskRecordCollectionPage<AskRecordPermitRow>> {
  const limit = clampLimit(query.limit);
  const search = cleanSearch(query.search);
  const status = query.filters?.status?.trim() || null;
  const category = query.filters?.category?.trim() || null;
  if (status && !(status in PERMIT_OFFICIAL_STATUS_LABELS)) throw new InvalidCollectionQueryError('status filter is not valid.');
  if (category && !(category in PERMIT_CATEGORY_LABELS)) throw new InvalidCollectionQueryError('category filter is not valid.');
  const after = decodeCursor(query.cursor, PermitCursorSchema);

  const source = await list(propertyId, { limit: PERMIT_SOURCE_LIMIT });
  const rows = (source.items as Array<Record<string, any>>).map((permit) => {
    const closed = PERMIT_CLOSED.has(permit.status);
    const reported = permit.reportedStatus ? PERMIT_REPORTED_STATUS_LABELS[permit.reportedStatus] ?? null : null;
    const row: AskRecordPermitRow = {
      id: permit.id,
      title: `${PERMIT_CATEGORY_LABELS[permit.category] ?? permit.category} permit${permit.permitNumber ? ` ${permit.permitNumber}` : ''}`,
      description: permit.description ?? (permit.workTypes?.length ? permit.workTypes.map(PERMIT_WORK_TYPE_LABELS).join(', ') : null),
      officialStatus: permit.status,
      officialStatusLabel: PERMIT_OFFICIAL_STATUS_LABELS[permit.status] ?? permit.status,
      reportedStatusLabel: permit.status === 'UNKNOWN' ? reported : null,
      closed,
      hasOpenInspections: Boolean(permit.hasOpenInspections),
      issueDate: permit.issueDate ?? null,
      finaledDate: permit.finaledDate ?? null,
      expirationDate: permit.expirationDate ?? null,
      contractorName: permit.contractorName ?? null,
      verified: Boolean(permit.isVerified),
      askQuestion: null,
    };
    return { row, category: String(permit.category), group: closed ? 1 : 0, key: dateKey(permit.issueDate), haystack: `${row.title} ${row.description ?? ''} ${row.contractorName ?? ''} ${permit.permitNumber ?? ''}`.toLowerCase() };
  }).sort((left, right) => left.group - right.group || right.key - left.key || (left.row.id < right.row.id ? -1 : left.row.id > right.row.id ? 1 : 0));

  const needle = search?.toLowerCase() ?? null;
  const matching = rows.filter((entry) => (!status || entry.row.officialStatus === status) && (!category || entry.category === category) && (!needle || entry.haystack.includes(needle)));
  const remaining = after
    ? matching.filter((entry) => entry.group > after.g || (entry.group === after.g && (entry.key < after.d || (entry.key === after.d && entry.row.id > after.i))))
    : matching;
  const page = remaining.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = remaining.length > limit && last ? encodeCursor({ g: last.group, d: last.key, i: last.row.id }) : null;

  const statusOptions = Object.keys(PERMIT_OFFICIAL_STATUS_LABELS).filter((value) => rows.some((entry) => entry.row.officialStatus === value) || value === status).map((value) => ({ value, label: PERMIT_OFFICIAL_STATUS_LABELS[value] }));
  const categoryOptions = Object.keys(PERMIT_CATEGORY_LABELS).filter((value) => rows.some((entry) => entry.category === value) || value === category).map((value) => ({ value, label: PERMIT_CATEGORY_LABELS[value] }));
  const newest = rows.map((entry) => entry.key).filter((key) => key > 0).sort((a, b) => b - a)[0];

  return {
    contractVersion: ASK_RECORD_COLLECTION_CONTRACT_VERSION,
    propertyId,
    sectionId: 'permits',
    generatedAt: new Date().toISOString(),
    freshAsOf: newest ? new Date(newest).toISOString() : null,
    total: matching.length,
    delivered: page.length,
    nextCursor,
    truncated: nextCursor !== null,
    notice: source.nextCursor ? `This lists the first ${PERMIT_SOURCE_LIMIT} permit records. More are recorded but cannot be listed here yet.` : null,
    sort: { key: 'status', label: 'Active first, then by issue date' },
    query: { search, filters: Object.fromEntries(Object.entries({ status, category }).filter(([, value]) => value)) as Record<string, string> },
    filterOptions: [
      ...(statusOptions.length > 1 ? [{ key: 'status', label: 'Status', options: statusOptions }] : []),
      ...(categoryOptions.length > 1 ? [{ key: 'category', label: 'Category', options: categoryOptions }] : []),
    ],
    rows: page.map((entry) => entry.row),
  };
}

export interface AskRecordProjectRow {
  /** Tracked projects and renovation cases are separate tables, so the key carries the kind (`project:<id>`, `renovation:<id>`). */
  id: string;
  kind: 'PROJECT' | 'RENOVATION_CASE';
  name: string;
  typeLabel: string;
  status: string;
  statusLabel: string;
  /** The contractor, or "DIY / household", or null when no provider is recorded. */
  providerLabel: string | null;
  /** A project's contract amount, or a renovation case's target budget. */
  contractLabel: string | null;
  paidLabel: string | null;
  remainingLabel: string | null;
  expectedEndDate: string | null;
  warrantyExpiresAt: string | null;
  /** Null for a renovation case, which keeps no milestones or issues of its own. */
  milestoneCount: number | null;
  issueCount: number | null;
  askQuestion: null;
}

const PROJECT_STATUSES = Object.keys(PROJECT_STATUS_LABELS);
/** Renovation case lifecycles that end the case; every other lifecycle is active work. */
const RENOVATION_COMPLETED_LIFECYCLES = new Set(['VERIFIED_COMPLETE', 'COMPLETED_WITH_OPEN_ITEMS', 'HISTORICAL_RESEARCH']);
const RENOVATION_LIFECYCLES = ['IDEA', 'FEASIBILITY', 'SCOPE_DEFINITION', 'REQUIREMENTS_RESEARCH', 'APPROVALS_IN_PROGRESS', 'PREPARING_TO_START', 'READY_TO_START', 'IN_EXECUTION', 'INSPECTION_AND_CLOSEOUT', 'VERIFIED_COMPLETE', 'ON_HOLD', 'CANCELLED', 'COMPLETED_WITH_OPEN_ITEMS', 'HISTORICAL_RESEARCH'];
const PROJECT_KINDS = ['PROJECT', 'RENOVATION_CASE'] as const;
const ProjectCursorSchema = z.object({ g: z.number().int(), c: z.number(), i: z.string() });
const projectMoney = (cents: number | null | undefined) => (cents == null ? null : `$${Math.round(cents / 100).toLocaleString('en-US')}`);

/**
 * Reads one page of tracked projects through `listProjects`, the read the Project Tracker page and Ask use: active projects first, then
 * completed, then cancelled, newest created first inside each group. Amounts are the recorded figures; an unknown contract amount has no
 * remaining balance.
 */
export async function readProjectsPage(
  propertyId: string,
  query: AskRecordCollectionQuery,
  list: typeof listTrackedProjects = listTrackedProjects,
  listCases: typeof listRenovationCases = listRenovationCases,
): Promise<AskRecordCollectionPage<AskRecordProjectRow>> {
  const limit = clampLimit(query.limit);
  const search = cleanSearch(query.search);
  const status = query.filters?.status?.trim() || null;
  const type = query.filters?.type?.trim() || null;
  const kind = query.filters?.kind?.trim() || null;
  if (status && !PROJECT_STATUSES.includes(status) && !RENOVATION_LIFECYCLES.includes(status)) throw new InvalidCollectionQueryError('status filter is not valid.');
  if (type && !(type in PROJECT_TYPE_LABELS) && !(type in RENOVATION_CASE_TYPE_LABELS)) throw new InvalidCollectionQueryError('type filter is not valid.');
  if (kind && !(PROJECT_KINDS as readonly string[]).includes(kind)) throw new InvalidCollectionQueryError('kind filter is not valid.');
  const after = decodeCursor(query.cursor, ProjectCursorSchema);

  const [projects, cases] = await Promise.all([list(propertyId), listCases(propertyId)]);
  const projectEntries = projects.map((project) => {
    const group = project.status === 'COMPLETED' ? 1 : project.status === 'CANCELLED' ? 2 : 0;
    const contract = project.currentContractAmountCents;
    const row: AskRecordProjectRow = {
      id: `project:${project.id}`,
      kind: 'PROJECT',
      name: project.name,
      typeLabel: PROJECT_TYPE_LABELS[project.projectType] ?? readableEnum(project.projectType) ?? project.projectType,
      status: project.status,
      statusLabel: PROJECT_STATUS_LABELS[project.status] ?? readableEnum(project.status) ?? project.status,
      providerLabel: project.contractorName ?? (project.fulfillmentMode === 'DIY' ? 'DIY / household' : null),
      contractLabel: projectMoney(contract),
      paidLabel: projectMoney(project.paidToDateCents) ?? '$0',
      remainingLabel: project.status !== 'COMPLETED' && contract != null ? projectMoney(contract - (project.paidToDateCents ?? 0)) : null,
      expectedEndDate: project.expectedEndDate ? new Date(project.expectedEndDate).toISOString() : null,
      warrantyExpiresAt: project.warrantyExpiresAt ? new Date(project.warrantyExpiresAt).toISOString() : null,
      milestoneCount: project._count?.milestones ?? 0,
      issueCount: project._count?.issues ?? 0,
      askQuestion: null,
    };
    return { row, group, type: String(project.projectType), key: new Date(project.createdAt).getTime(), haystack: `${project.name} ${project.contractorName ?? ''}`.toLowerCase() };
  });
  // Renovation cases (archived ones are not listed, as on the Renovation page): active until a completed lifecycle or cancellation.
  const caseEntries = cases.map((renovation) => {
    const group = renovation.lifecycle === 'CANCELLED' ? 2 : RENOVATION_COMPLETED_LIFECYCLES.has(renovation.lifecycle) ? 1 : 0;
    const row: AskRecordProjectRow = {
      id: `renovation:${renovation.id}`,
      kind: 'RENOVATION_CASE',
      name: renovation.name,
      typeLabel: RENOVATION_CASE_TYPE_LABELS[renovation.caseType] ?? readableEnum(renovation.caseType) ?? renovation.caseType,
      status: renovation.lifecycle,
      statusLabel: readableEnum(renovation.lifecycle) ?? renovation.lifecycle,
      providerLabel: null,
      contractLabel: projectMoney(renovation.targetBudgetCents),
      paidLabel: null,
      remainingLabel: null,
      expectedEndDate: renovation.targetEndDate ? new Date(renovation.targetEndDate).toISOString() : null,
      warrantyExpiresAt: null,
      milestoneCount: null,
      issueCount: null,
      askQuestion: null,
    };
    return { row, group, type: String(renovation.caseType), key: new Date(renovation.updatedAt).getTime(), haystack: `${renovation.name} ${renovation.objective ?? ''}`.toLowerCase() };
  });
  const entries = [...projectEntries, ...caseEntries].sort((left, right) => left.group - right.group || right.key - left.key || (left.row.id < right.row.id ? -1 : left.row.id > right.row.id ? 1 : 0));

  const needle = search?.toLowerCase() ?? null;
  const matching = entries.filter((entry) => (!status || entry.row.status === status) && (!type || entry.type === type) && (!kind || entry.row.kind === kind) && (!needle || entry.haystack.includes(needle)));
  const remaining = after
    ? matching.filter((entry) => entry.group > after.g || (entry.group === after.g && (entry.key < after.c || (entry.key === after.c && entry.row.id > after.i))))
    : matching;
  const page = remaining.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = remaining.length > limit && last ? encodeCursor({ g: last.group, c: last.key, i: last.row.id }) : null;

  const statusLabelOf = (value: string) => PROJECT_STATUS_LABELS[value] ?? readableEnum(value) ?? value;
  const typeLabelOf = (value: string) => PROJECT_TYPE_LABELS[value] ?? RENOVATION_CASE_TYPE_LABELS[value] ?? readableEnum(value) ?? value;
  const statusOptions = [...new Set([...PROJECT_STATUSES, ...RENOVATION_LIFECYCLES])].filter((value) => entries.some((entry) => entry.row.status === value) || value === status).map((value) => ({ value, label: statusLabelOf(value) }));
  const typeOptions = [...new Set([...Object.keys(PROJECT_TYPE_LABELS), ...Object.keys(RENOVATION_CASE_TYPE_LABELS)])].filter((value) => entries.some((entry) => entry.type === value) || value === type).map((value) => ({ value, label: typeLabelOf(value) }));
  const kindOptions = [{ value: 'PROJECT', label: 'Tracked projects' }, { value: 'RENOVATION_CASE', label: 'Renovation cases' }].filter((option) => entries.some((entry) => entry.row.kind === option.value) || option.value === kind);
  const newest = entries.map((entry) => entry.key).sort((a, b) => b - a)[0];

  return {
    contractVersion: ASK_RECORD_COLLECTION_CONTRACT_VERSION,
    propertyId,
    sectionId: 'projects-renovations',
    generatedAt: new Date().toISOString(),
    freshAsOf: newest ? new Date(newest).toISOString() : null,
    total: matching.length,
    delivered: page.length,
    nextCursor,
    truncated: nextCursor !== null,
    notice: null,
    sort: { key: 'status', label: 'Active first, then newest' },
    query: { search, filters: Object.fromEntries(Object.entries({ status, type, kind }).filter(([, value]) => value)) as Record<string, string> },
    filterOptions: [
      ...(kindOptions.length > 1 ? [{ key: 'kind', label: 'Kind', options: kindOptions }] : []),
      ...(statusOptions.length > 1 ? [{ key: 'status', label: 'Status', options: statusOptions }] : []),
      ...(typeOptions.length > 1 ? [{ key: 'type', label: 'Type', options: typeOptions }] : []),
    ],
    rows: page.map((entry) => entry.row),
  };
}

export interface AskRecordIncidentClaimRow {
  /** Incident and claim ids come from different tables, so the key carries the kind. */
  id: string;
  recordId: string;
  kind: 'INCIDENT' | 'CLAIM';
  title: string;
  summary: string | null;
  statusLabel: string;
  open: boolean;
  /** Incident severity or claim type, as recorded. */
  detailLabel: string | null;
  providerName: string | null;
  openedAt: string | null;
  closedAt: string | null;
  askQuestion: null;
}

const ICCursorSchema = z.object({ o: z.number(), i: z.string() });
const humanizeCode = (value: string | null | undefined) => (value ? value.toLowerCase().replace(/_/g, ' ') : null);

/**
 * Reads one page of incidents (not suppressed) and claims together, newest first, with their own open/closed states. Ask's answer reads
 * each bucket with a small fixed limit and no continuation; the Record lists every one. Incidents and claims are separate tables, so
 * the rows are merged in memory (a home has a handful of each).
 */
export async function readIncidentsClaimsPage(propertyId: string, query: AskRecordCollectionQuery): Promise<AskRecordCollectionPage<AskRecordIncidentClaimRow>> {
  const limit = clampLimit(query.limit);
  const search = cleanSearch(query.search);
  const kind = query.filters?.kind?.trim() || null;
  const state = query.filters?.state?.trim() || null;
  if (kind && kind !== 'INCIDENT' && kind !== 'CLAIM') throw new InvalidCollectionQueryError('kind filter is not valid.');
  if (state && state !== 'open' && state !== 'closed') throw new InvalidCollectionQueryError('state filter is not valid.');
  const after = decodeCursor(query.cursor, ICCursorSchema);

  const [incidents, claims] = await Promise.all([
    prisma.incident.findMany({ where: { propertyId, isSuppressed: false }, select: { id: true, title: true, summary: true, status: true, severity: true, openedAt: true, resolvedAt: true, typeKey: true } }),
    prisma.claim.findMany({ where: { propertyId }, select: { id: true, title: true, status: true, type: true, providerName: true, incidentAt: true, openedAt: true, closedAt: true, updatedAt: true } }),
  ]);
  const entries = [
    ...incidents.map((incident) => {
      const open = OPEN_INCIDENT_STATUSES.includes(incident.status);
      const when = incident.openedAt;
      return {
        key: when.getTime(), kind: 'INCIDENT' as const, open,
        row: { id: `incident:${incident.id}`, recordId: incident.id, kind: 'INCIDENT' as const, title: incident.title, summary: incident.summary ?? humanizeCode(incident.typeKey), statusLabel: humanizeCode(incident.status) ?? incident.status, open, detailLabel: incident.severity ? `${humanizeCode(incident.severity)} severity` : null, providerName: null, openedAt: when.toISOString(), closedAt: incident.resolvedAt?.toISOString() ?? null, askQuestion: null },
      };
    }),
    ...claims.map((claim) => {
      const open = OPEN_CLAIM_STATUSES.includes(claim.status);
      const when = claim.openedAt ?? claim.incidentAt ?? claim.updatedAt;
      return {
        key: when.getTime(), kind: 'CLAIM' as const, open,
        row: { id: `claim:${claim.id}`, recordId: claim.id, kind: 'CLAIM' as const, title: claim.title, summary: null, statusLabel: humanizeCode(claim.status) ?? claim.status, open, detailLabel: humanizeCode(claim.type), providerName: claim.providerName ?? null, openedAt: when.toISOString(), closedAt: claim.closedAt?.toISOString() ?? null, askQuestion: null },
      };
    }),
  ].sort((left, right) => right.key - left.key || (left.row.id < right.row.id ? -1 : left.row.id > right.row.id ? 1 : 0));

  const needle = search?.toLowerCase() ?? null;
  const matching = entries.filter((entry) => (
    (!kind || entry.kind === kind)
    && (!state || (state === 'open') === entry.open)
    && (!needle || `${entry.row.title} ${entry.row.summary ?? ''} ${entry.row.providerName ?? ''}`.toLowerCase().includes(needle))
  ));
  const remaining = after ? matching.filter((entry) => entry.key < after.o || (entry.key === after.o && entry.row.id > after.i)) : matching;
  const page = remaining.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = remaining.length > limit && last ? encodeCursor({ o: last.key, i: last.row.id }) : null;

  return {
    contractVersion: ASK_RECORD_COLLECTION_CONTRACT_VERSION,
    propertyId,
    sectionId: 'incidents-claims',
    generatedAt: new Date().toISOString(),
    freshAsOf: entries[0] ? new Date(entries[0].key).toISOString() : null,
    total: matching.length,
    delivered: page.length,
    nextCursor,
    truncated: nextCursor !== null,
    notice: null,
    sort: { key: 'openedAt', label: 'Most recent first' },
    query: { search, filters: Object.fromEntries(Object.entries({ kind, state }).filter(([, value]) => value)) as Record<string, string> },
    filterOptions: [
      { key: 'kind', label: 'Kind', options: [{ value: 'INCIDENT', label: 'Incidents' }, { value: 'CLAIM', label: 'Claims' }] },
      { key: 'state', label: 'State', options: [{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }] },
    ],
    rows: page.map((entry) => entry.row),
  };
}

export interface AskRecordPolicyRow {
  id: string;
  carrierName: string;
  coverageType: string | null;
  status: 'ACTIVE' | 'NEEDS_REVIEW' | 'STARTS_LATER' | 'EXPIRED';
  statusLabel: string;
  startDate: string | null;
  expiryDate: string | null;
  verified: boolean;
  lastVerifiedAt: string | null;
  askQuestion: null;
}

const POLICY_STATUS_ORDER = ['ACTIVE', 'NEEDS_REVIEW', 'STARTS_LATER', 'EXPIRED'] as const;
const POLICY_STATUS_LABELS: Record<(typeof POLICY_STATUS_ORDER)[number], string> = { ACTIVE: 'Active', NEEDS_REVIEW: 'Dates need review', STARTS_LATER: 'Starts later', EXPIRED: 'Expired' };
const PolicyCursorSchema = z.object({ r: z.number().int(), k: z.number(), i: z.string() });

/**
 * Reads one page of the home's insurance policy records, the same property-scoped rows `GET /properties/:id/insurance` returns to any
 * household member. Status is the governed `evaluateCoverageRecord`. The policy number, premium, deductible and coverage limits are
 * never selected: the Record names the policy, its carrier and type, its dates, and whether it has been verified.
 */
export async function readCoveragePoliciesPage(propertyId: string, query: AskRecordCollectionQuery, now = new Date()): Promise<AskRecordCollectionPage<AskRecordPolicyRow>> {
  const limit = clampLimit(query.limit);
  const search = cleanSearch(query.search);
  const status = query.filters?.status?.trim() || null;
  const coverageType = query.filters?.coverageType?.trim() || null;
  if (status && !(POLICY_STATUS_ORDER as readonly string[]).includes(status)) throw new InvalidCollectionQueryError('status filter is not valid.');
  if (coverageType && coverageType.length > 60) throw new InvalidCollectionQueryError('coverage type filter is not valid.');
  const after = decodeCursor(query.cursor, PolicyCursorSchema);

  const policies = await prisma.insurancePolicy.findMany({
    where: { propertyId },
    orderBy: [{ expiryDate: 'asc' }, { id: 'asc' }],
    select: { id: true, propertyId: true, carrierName: true, coverageType: true, isVerified: true, lastVerifiedAt: true, startDate: true, expiryDate: true },
  });
  const entries = policies.map((policy) => {
    const applicability = evaluateCoverageRecord(policy, propertyId, now);
    const key = applicability.lifecycle === 'FUTURE' ? 'STARTS_LATER' : applicability.lifecycle === 'EXPIRED' ? 'EXPIRED' : applicability.lifecycle === 'ACTIVE' ? 'ACTIVE' : 'NEEDS_REVIEW';
    return {
      rank: POLICY_STATUS_ORDER.indexOf(key),
      // Expired policies list the most recently expired first; every other status lists the soonest expiry first.
      sortKey: policy.expiryDate ? (key === 'EXPIRED' ? -policy.expiryDate.getTime() : policy.expiryDate.getTime()) : Number.POSITIVE_INFINITY,
      haystack: `${policy.carrierName} ${policy.coverageType ?? ''}`.toLowerCase(),
      row: {
        id: policy.id,
        carrierName: policy.carrierName,
        coverageType: policy.coverageType ?? null,
        status: key,
        statusLabel: POLICY_STATUS_LABELS[key],
        startDate: policy.startDate?.toISOString() ?? null,
        expiryDate: policy.expiryDate?.toISOString() ?? null,
        verified: policy.isVerified,
        lastVerifiedAt: policy.lastVerifiedAt?.toISOString() ?? null,
        askQuestion: null,
      } satisfies AskRecordPolicyRow,
    };
  }).sort((left, right) => left.rank - right.rank || (left.sortKey === right.sortKey ? 0 : left.sortKey < right.sortKey ? -1 : 1) || (left.row.id < right.row.id ? -1 : left.row.id > right.row.id ? 1 : 0));

  const needle = search?.toLowerCase() ?? null;
  const matching = entries.filter((entry) => (!status || entry.row.status === status) && (!coverageType || entry.row.coverageType === coverageType) && (!needle || entry.haystack.includes(needle)));
  // An undated policy has an infinite sort key, which JSON cannot carry; the cursor stores a sentinel above every real timestamp instead,
  // and the comparison uses the same stored form so undated policies are neither repeated nor skipped.
  const cursorKey = (value: number) => (Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER);
  const remaining = after
    ? matching.filter((entry) => entry.rank > after.r || (entry.rank === after.r && (cursorKey(entry.sortKey) > after.k || (cursorKey(entry.sortKey) === after.k && entry.row.id > after.i))))
    : matching;
  const page = remaining.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = remaining.length > limit && last ? encodeCursor({ r: last.rank, k: cursorKey(last.sortKey), i: last.row.id }) : null;

  const statusOptions = POLICY_STATUS_ORDER.filter((value) => entries.some((entry) => entry.row.status === value) || value === status).map((value) => ({ value, label: POLICY_STATUS_LABELS[value] }));
  const typeOptions = [...new Set(entries.map((entry) => entry.row.coverageType).filter((value): value is string => Boolean(value)))].sort().map((value) => ({ value, label: value }));
  const newest = policies.map((policy) => policy.expiryDate?.getTime() ?? 0).sort((a, b) => b - a)[0];

  return {
    contractVersion: ASK_RECORD_COLLECTION_CONTRACT_VERSION,
    propertyId,
    sectionId: 'coverage',
    generatedAt: now.toISOString(),
    freshAsOf: newest ? new Date(newest).toISOString() : null,
    total: matching.length,
    delivered: page.length,
    nextCursor,
    truncated: nextCursor !== null,
    notice: null,
    sort: { key: 'status', label: 'Active first, then by expiry date' },
    query: { search, filters: Object.fromEntries(Object.entries({ status, coverageType }).filter(([, value]) => value)) as Record<string, string> },
    filterOptions: [
      ...(statusOptions.length > 1 ? [{ key: 'status', label: 'Status', options: statusOptions }] : []),
      ...(typeOptions.length > 1 ? [{ key: 'coverageType', label: 'Coverage type', options: typeOptions }] : []),
    ],
    rows: page.map((entry) => entry.row),
  };
}

// A cursor over a multi-part sort key: the numeric parts compare in order, then the id. Used by the sections whose order has several parts.
const KeyCursorSchema = z.object({ k: z.array(z.number()).max(6), i: z.string() });
const afterKey = (entry: { key: number[]; id: string }, cursor: { k: number[]; i: string }): boolean => {
  for (let index = 0; index < cursor.k.length; index += 1) {
    if (entry.key[index] !== cursor.k[index]) return entry.key[index] > cursor.k[index];
  }
  return entry.id > cursor.i;
};
const byKey = (left: { key: number[]; id: string }, right: { key: number[]; id: string }): number => {
  for (let index = 0; index < left.key.length; index += 1) {
    if (left.key[index] !== right.key[index]) return left.key[index] < right.key[index] ? -1 : 1;
  }
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
};
const usd = (cents: number | null | undefined) => (cents == null ? null : `$${Math.round(cents / 100).toLocaleString('en-US')}`);
const FAR = 8_640_000_000_000_000; // a time later than any recorded date, for "no date" sorting last

export interface AskRecordFinancingScenarioRow {
  id: string;
  title: string;
  projectCostLabel: string;
  status: string;
  statusLabel: string;
  /** The way to pay the household selected, if any. */
  selectedOptionLabel: string | null;
  entryPointLabel: string | null;
  createdAt: string;
  askQuestion: null;
}

const FINANCING_STATUSES = ['DRAFT', 'SAVED'] as const;

/**
 * Reads one page of the home's saved financing scenarios (draft and saved), newest first, through `listScenarios`, the read the Financing
 * page and Ask use (any household member). The persisted financing profile (mortgage balance, rate, payment, and the rest) is owner-only
 * as a whole, so it appears only as `detail` and is read only for an OWNER; below that the detail says it is owner-only and the profile
 * is never loaded. The ownership-cost snapshot is not a read-only collection and is not included.
 */
/** The persisted financing profile is owner-only as a whole (owner ruling 2026-10-13); `financing.routes` requires it on the profile GET, and a test pins that. */
export const FINANCING_PROFILE_READ_FLOOR = 'OWNER' as const;

const usdExact = (cents: number | null | undefined) => (cents == null ? null : `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
const dayLabel = (value: unknown) => {
  if (!value) return null;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
};

/** The persisted profile's facts as labelled lines. Read only after the caller is known to be an OWNER. */
export function financingProfileFacts(profile: Record<string, any>): Array<{ label: string; value: string }> {
  const rate = profile.interestRateBps == null ? null : `${Number((profile.interestRateBps / 100).toFixed(2))}%`;
  const years = profile.remainingTermMonths ? `${Math.round((profile.remainingTermMonths / 12) * 10) / 10} years` : null;
  const balanceAsOf = dayLabel(profile.mortgageBalanceAsOfDate);
  return ([
    ['Mortgage', MORTGAGE_STATUS_LABELS[String(profile.mortgageStatus)] ?? null],
    ['Type', profile.mortgageType ? MORTGAGE_TYPE_LABELS[String(profile.mortgageType)] ?? String(profile.mortgageType) : null],
    ['Purchase price', usdExact(profile.purchasePriceCents)],
    ['Purchase date', dayLabel(profile.purchaseDate)],
    ['Original balance', usdExact(profile.originalMortgageBalanceCents)],
    ['Current balance', usdExact(profile.currentMortgageBalanceCents) ? `${usdExact(profile.currentMortgageBalanceCents)}${balanceAsOf ? ` as of ${balanceAsOf}` : ''}` : null],
    ['Interest rate', rate],
    ['Remaining term', years],
    ['Monthly payment', usdExact(profile.monthlyPaymentCents) ? `${usdExact(profile.monthlyPaymentCents)}/month` : null],
    ['Second mortgage', profile.hasSecondMortgage ? (usdExact(profile.secondMortgageBalanceCents) ?? 'Yes') : null],
    ['Private mortgage insurance', profile.hasPMI == null ? null : profile.hasPMI ? 'Yes' : 'No'],
  ] as Array<[string, string | null]>).filter((entry): entry is [string, string] => Boolean(entry[1])).map(([label, value]) => ({ label, value }));
}

export async function readFinancingScenariosPage(
  propertyId: string,
  query: AskRecordCollectionQuery,
  list: typeof listScenarios = listScenarios,
  access?: { role: HouseholdRole; loadProfile?: typeof getProfile },
): Promise<AskRecordCollectionPage<AskRecordFinancingScenarioRow>> {
  const limit = clampLimit(query.limit);
  const search = cleanSearch(query.search);
  const status = query.filters?.status?.trim() || null;
  if (status && !(FINANCING_STATUSES as readonly string[]).includes(status)) throw new InvalidCollectionQueryError('status filter is not valid.');
  const after = decodeCursor(query.cursor, KeyCursorSchema);

  const scenarios = await list(propertyId);
  const entries = scenarios.map((scenario) => ({
    id: scenario.id,
    key: [-new Date(scenario.createdAt).getTime()],
    haystack: String(scenario.title).toLowerCase(),
    row: {
      id: scenario.id,
      title: scenario.title,
      projectCostLabel: usd(scenario.projectCostCents) ?? '$0',
      status: String(scenario.status),
      statusLabel: SCENARIO_STATUS_LABELS[String(scenario.status)] ?? String(scenario.status),
      selectedOptionLabel: scenario.selectedOption ? readableEnum(String(scenario.selectedOption)) : null,
      entryPointLabel: scenario.entryPoint ? readableEnum(String(scenario.entryPoint)) : null,
      createdAt: new Date(scenario.createdAt).toISOString(),
      askQuestion: null,
    } satisfies AskRecordFinancingScenarioRow,
  })).sort(byKey);

  const needle = search?.toLowerCase() ?? null;
  const matching = entries.filter((entry) => (!status || entry.row.status === status) && (!needle || entry.haystack.includes(needle)));
  const remaining = after ? matching.filter((entry) => afterKey(entry, after)) : matching;
  const page = remaining.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = remaining.length > limit && last ? encodeCursor({ k: last.key, i: last.id }) : null;
  const statusOptions = FINANCING_STATUSES.filter((value) => entries.some((entry) => entry.row.status === value) || value === status).map((value) => ({ value, label: SCENARIO_STATUS_LABELS[value] }));

  let detail: AskRecordRestrictedDetail | null = null;
  if (access && !query.omitDetail) {
    if (access.role !== FINANCING_PROFILE_READ_FLOOR) {
      detail = { id: 'financing-profile', title: 'Mortgage and purchase details', state: 'OWNER_ONLY', requiredRole: 'OWNER', facts: [] };
    } else {
      const profile = await (access.loadProfile ?? getProfile)(propertyId);
      const facts = profile && profile.mortgageStatus !== 'UNKNOWN' ? financingProfileFacts(profile as unknown as Record<string, any>) : [];
      detail = { id: 'financing-profile', title: 'Mortgage and purchase details', state: facts.length ? 'AVAILABLE' : 'NOT_RECORDED', requiredRole: 'OWNER', facts };
    }
  }

  return {
    contractVersion: ASK_RECORD_COLLECTION_CONTRACT_VERSION,
    propertyId,
    sectionId: 'financing-ownership',
    generatedAt: new Date().toISOString(),
    freshAsOf: entries[0]?.row.createdAt ?? null,
    total: matching.length,
    delivered: page.length,
    nextCursor,
    truncated: nextCursor !== null,
    notice: null,
    detail,
    sort: { key: 'createdAt', label: 'Newest first' },
    query: { search, filters: status ? { status } : {} },
    filterOptions: statusOptions.length > 1 ? [{ key: 'status', label: 'Status', options: statusOptions }] : [],
    rows: page.map((entry) => entry.row),
  };
}

export interface AskRecordBuyerTaskRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  statusLabel: string;
  phase: string;
  phaseLabel: string;
  required: boolean;
  blocking: boolean;
  dueAt: string | null;
  completedAt: string | null;
  askQuestion: null;
}

const BUYER_STATUSES = ['PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'NOT_NEEDED', 'CANCELLED'];
const BUYER_PHASES = ['EXPLORING', 'OFFER_CONTRACT', 'DUE_DILIGENCE', 'CLOSING_PREP', 'MOVE_IN', 'FIRST_30_DAYS', 'DAYS_31_TO_90', 'RECURRING_HOME'];

/**
 * Reads one page of the Buyer Plan's tasks through `HomeBuyerTaskService.getTasks` (read-only; any household member), in the plan's own
 * order: by phase, then the plan's sort order. A home with no plan, or that is not a purchase, reads as an empty collection with a
 * plain-language notice; every other failure is rethrown so it is reported as unavailable rather than as "nothing recorded".
 */
export async function readBuyerRecordsPage(
  context: { propertyId: string; userId: string },
  query: AskRecordCollectionQuery,
  load: (userId: string, propertyId: string) => Promise<any[]> = (userId, propertyId) => HomeBuyerTaskService.getTasks(userId, propertyId),
): Promise<AskRecordCollectionPage<AskRecordBuyerTaskRow>> {
  const limit = clampLimit(query.limit);
  const search = cleanSearch(query.search);
  const status = query.filters?.status?.trim() || null;
  const phase = query.filters?.phase?.trim() || null;
  if (status && !BUYER_STATUSES.includes(status)) throw new InvalidCollectionQueryError('status filter is not valid.');
  if (phase && !BUYER_PHASES.includes(phase)) throw new InvalidCollectionQueryError('phase filter is not valid.');
  const after = decodeCursor(query.cursor, KeyCursorSchema);

  let tasks: any[] = [];
  let notice: string | null = null;
  try {
    tasks = await load(context.userId, context.propertyId);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Buyer plan not found.') notice = 'No Buyer Plan has been started for this home.';
    else if (message.startsWith('The buyer acquisition plan is only available')) notice = 'A Buyer Plan applies to a purchase or a recently purchased home.';
    else throw error;
  }

  const entries = tasks.map((task) => ({
    id: String(task.id),
    key: [BUYER_PHASES.indexOf(String(task.phase)), Number(task.sortOrder ?? 0)],
    haystack: `${task.title ?? ''} ${task.description ?? ''}`.toLowerCase(),
    phase: String(task.phase),
    row: {
      id: String(task.id),
      title: String(task.title),
      description: task.description ?? null,
      status: String(task.status),
      statusLabel: readableEnum(String(task.status)) ?? String(task.status),
      phase: String(task.phase),
      phaseLabel: readableEnum(String(task.phase)) ?? String(task.phase),
      required: Boolean(task.required),
      blocking: Boolean(task.blocking),
      dueAt: task.dueAt ? new Date(task.dueAt).toISOString() : null,
      completedAt: task.completedAt ? new Date(task.completedAt).toISOString() : null,
      askQuestion: null,
    } satisfies AskRecordBuyerTaskRow,
  })).sort(byKey);

  const needle = search?.toLowerCase() ?? null;
  const matching = entries.filter((entry) => (!status || entry.row.status === status) && (!phase || entry.phase === phase) && (!needle || entry.haystack.includes(needle)));
  const remaining = after ? matching.filter((entry) => afterKey(entry, after)) : matching;
  const page = remaining.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = remaining.length > limit && last ? encodeCursor({ k: last.key, i: last.id }) : null;
  const statusOptions = BUYER_STATUSES.filter((value) => entries.some((entry) => entry.row.status === value) || value === status).map((value) => ({ value, label: readableEnum(value) ?? value }));
  const phaseOptions = BUYER_PHASES.filter((value) => entries.some((entry) => entry.phase === value) || value === phase).map((value) => ({ value, label: readableEnum(value) ?? value }));
  const completions = entries.map((entry) => entry.row.completedAt).filter((value): value is string => Boolean(value)).sort().reverse();

  return {
    contractVersion: ASK_RECORD_COLLECTION_CONTRACT_VERSION,
    propertyId: context.propertyId,
    sectionId: 'buyer-records',
    generatedAt: new Date().toISOString(),
    freshAsOf: completions[0] ?? null,
    total: matching.length,
    delivered: page.length,
    nextCursor,
    truncated: nextCursor !== null,
    notice,
    sort: { key: 'phase', label: 'By plan phase' },
    query: { search, filters: Object.fromEntries(Object.entries({ status, phase }).filter(([, value]) => value)) as Record<string, string> },
    filterOptions: [
      ...(statusOptions.length > 1 ? [{ key: 'status', label: 'Status', options: statusOptions }] : []),
      ...(phaseOptions.length > 1 ? [{ key: 'phase', label: 'Phase', options: phaseOptions }] : []),
    ],
    rows: page.map((entry) => entry.row),
  };
}

export interface AskRecordSellerItemRow {
  id: string;
  title: string;
  detail: string | null;
  category: string;
  categoryLabel: string;
  requirementLabel: string;
  status: string;
  statusLabel: string;
  dueAt: string | null;
  costRangeLabel: string | null;
  askQuestion: null;
}

const SELLER_STATUS_ORDER = ['OPEN', 'PURSUING', 'WAIVED', 'RESOLVED'];
const SELLER_CATEGORIES = ['SAFETY_STRUCTURAL', 'SYSTEMS_MAINTENANCE', 'PERMITS_DISCLOSURE', 'DOCUMENTATION_RECORDS', 'FINANCIAL_DECISION', 'PRESENTATION'];

/**
 * Reads one page of the sale case's readiness items as stored, without refreshing them. Ask's checklist refreshes the items from the
 * home's records on every read (a write); the Record index and collection must not write, so this lists the persisted items and says
 * so in `notice`. Open items first, then pursued, waived, and resolved; earliest due first, then oldest first.
 */
export async function readSellerRecordsPage(propertyId: string, query: AskRecordCollectionQuery): Promise<AskRecordCollectionPage<AskRecordSellerItemRow>> {
  const limit = clampLimit(query.limit);
  const search = cleanSearch(query.search);
  const status = query.filters?.status?.trim() || null;
  const category = query.filters?.category?.trim() || null;
  if (status && !SELLER_STATUS_ORDER.includes(status)) throw new InvalidCollectionQueryError('status filter is not valid.');
  if (category && !SELLER_CATEGORIES.includes(category)) throw new InvalidCollectionQueryError('category filter is not valid.');
  const after = decodeCursor(query.cursor, KeyCursorSchema);

  const saleCase = await prisma.propertySaleCase.findUnique({ where: { propertyId }, select: { id: true } });
  const items = saleCase
    ? await prisma.saleReadinessItem.findMany({
      where: { saleCaseId: saleCase.id },
      select: { id: true, category: true, requirementClass: true, status: true, title: true, detail: true, dueAt: true, createdAt: true, estimatedCostMinCents: true, estimatedCostMaxCents: true },
    })
    : [];

  const entries = items.map((item) => ({
    id: item.id,
    key: [SELLER_STATUS_ORDER.indexOf(String(item.status)), item.dueAt ? item.dueAt.getTime() : FAR, item.createdAt.getTime()],
    haystack: `${item.title} ${item.detail ?? ''}`.toLowerCase(),
    row: {
      id: item.id,
      title: item.title,
      detail: item.detail ?? null,
      category: String(item.category),
      categoryLabel: readableEnum(String(item.category)) ?? String(item.category),
      requirementLabel: readableEnum(String(item.requirementClass)) ?? String(item.requirementClass),
      status: String(item.status),
      statusLabel: readableEnum(String(item.status)) ?? String(item.status),
      dueAt: item.dueAt?.toISOString() ?? null,
      costRangeLabel: item.estimatedCostMinCents != null && item.estimatedCostMaxCents != null ? `${usd(item.estimatedCostMinCents)} to ${usd(item.estimatedCostMaxCents)}` : null,
      askQuestion: null,
    } satisfies AskRecordSellerItemRow,
  })).sort(byKey);

  const needle = search?.toLowerCase() ?? null;
  const matching = entries.filter((entry) => (!status || entry.row.status === status) && (!category || entry.row.category === category) && (!needle || entry.haystack.includes(needle)));
  const remaining = after ? matching.filter((entry) => afterKey(entry, after)) : matching;
  const page = remaining.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = remaining.length > limit && last ? encodeCursor({ k: last.key, i: last.id }) : null;
  const statusOptions = SELLER_STATUS_ORDER.filter((value) => entries.some((entry) => entry.row.status === value) || value === status).map((value) => ({ value, label: readableEnum(value) ?? value }));
  const categoryOptions = SELLER_CATEGORIES.filter((value) => entries.some((entry) => entry.row.category === value) || value === category).map((value) => ({ value, label: readableEnum(value) ?? value }));

  return {
    contractVersion: ASK_RECORD_COLLECTION_CONTRACT_VERSION,
    propertyId,
    sectionId: 'seller-records',
    generatedAt: new Date().toISOString(),
    freshAsOf: null,
    total: matching.length,
    delivered: page.length,
    nextCursor,
    truncated: nextCursor !== null,
    notice: saleCase
      ? 'These are the sale checklist items as last refreshed. Open the seller checklist in Ask to refresh them from your latest records.'
      : 'No sale case has been started for this home.',
    sort: { key: 'status', label: 'Open first, then by due date' },
    query: { search, filters: Object.fromEntries(Object.entries({ status, category }).filter(([, value]) => value)) as Record<string, string> },
    filterOptions: [
      ...(statusOptions.length > 1 ? [{ key: 'status', label: 'Status', options: statusOptions }] : []),
      ...(categoryOptions.length > 1 ? [{ key: 'category', label: 'Category', options: categoryOptions }] : []),
    ],
    rows: page.map((entry) => entry.row),
  };
}

export interface AskRecordHouseholdMemberRow {
  id: string;
  /** The household display name, else the account name. Never an email address. */
  name: string;
  role: 'OWNER' | 'CONTRIBUTOR' | 'VIEWER';
  roleLabel: string;
  isPrimaryOwner: boolean;
  /** True for the person reading the list. */
  isYou: boolean;
  joinedAt: string;
  askQuestion: null;
}

const HOUSEHOLD_ROLES = ['OWNER', 'CONTRIBUTOR', 'VIEWER'] as const;
const HOUSEHOLD_ROLE_LABELS: Record<(typeof HOUSEHOLD_ROLES)[number], string> = { OWNER: 'Owner', CONTRIBUTOR: 'Contributor', VIEWER: 'Viewer' };

/**
 * Reads one page of who has access to the home, through `HouseholdService.listMembers`: the read `GET /household/members` serves to any
 * household member. This is a summary and nothing administrative: names, role, whether someone is the primary owner, and when they
 * joined. Email addresses, last-login times, and pending invitations (an OWNER-only read) are never returned, and role changes,
 * invitations, and removal stay with their owner-only commands.
 */
export async function readHouseholdAccessPage(
  context: { propertyId: string; userId: string },
  query: AskRecordCollectionQuery,
  list: (propertyId: string) => Promise<any[]> = (propertyId) => new HouseholdService().listMembers(propertyId),
): Promise<AskRecordCollectionPage<AskRecordHouseholdMemberRow>> {
  const limit = clampLimit(query.limit);
  const search = cleanSearch(query.search);
  const role = query.filters?.role?.trim() || null;
  if (role && !(HOUSEHOLD_ROLES as readonly string[]).includes(role)) throw new InvalidCollectionQueryError('role filter is not valid.');
  const after = decodeCursor(query.cursor, KeyCursorSchema);

  const members = await list(context.propertyId);
  const entries = members.map((member) => {
    const accountName = [member.user?.firstName, member.user?.lastName].filter(Boolean).join(' ').trim();
    const name = String(member.displayName ?? '').trim() || accountName || 'Household member';
    const joined = new Date(member.joinedAt).getTime();
    return {
      id: String(member.id),
      key: [member.isPrimaryOwner ? 0 : 1, Number.isNaN(joined) ? 0 : joined],
      haystack: name.toLowerCase(),
      row: {
        id: String(member.id),
        name,
        role: member.role as AskRecordHouseholdMemberRow['role'],
        roleLabel: HOUSEHOLD_ROLE_LABELS[member.role as keyof typeof HOUSEHOLD_ROLE_LABELS] ?? String(member.role),
        isPrimaryOwner: Boolean(member.isPrimaryOwner),
        isYou: member.userId === context.userId,
        joinedAt: new Date(member.joinedAt).toISOString(),
        askQuestion: null,
      } satisfies AskRecordHouseholdMemberRow,
    };
  }).sort(byKey);

  const needle = search?.toLowerCase() ?? null;
  const matching = entries.filter((entry) => (!role || entry.row.role === role) && (!needle || entry.haystack.includes(needle)));
  const remaining = after ? matching.filter((entry) => afterKey(entry, after)) : matching;
  const page = remaining.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = remaining.length > limit && last ? encodeCursor({ k: last.key, i: last.id }) : null;
  const roleOptions = HOUSEHOLD_ROLES.filter((value) => entries.some((entry) => entry.row.role === value) || value === role).map((value) => ({ value, label: HOUSEHOLD_ROLE_LABELS[value] }));

  return {
    contractVersion: ASK_RECORD_COLLECTION_CONTRACT_VERSION,
    propertyId: context.propertyId,
    sectionId: 'household-access',
    generatedAt: new Date().toISOString(),
    freshAsOf: null,
    total: matching.length,
    delivered: page.length,
    nextCursor,
    truncated: nextCursor !== null,
    notice: null,
    sort: { key: 'joinedAt', label: 'Primary owner first, then by join date' },
    query: { search, filters: role ? { role } : {} },
    filterOptions: roleOptions.length > 1 ? [{ key: 'role', label: 'Role', options: roleOptions }] : [],
    rows: page.map((entry) => entry.row),
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
  permits: (context, query) => readPermitsPage(context.propertyId, query),
  coverage: (context, query) => readCoveragePoliciesPage(context.propertyId, query),
  'financing-ownership': (context, query) => readFinancingScenariosPage(context.propertyId, query, listScenarios, { role: context.role }),
  'buyer-records': (context, query) => readBuyerRecordsPage(context, query),
  'seller-records': (context, query) => readSellerRecordsPage(context.propertyId, query),
  'household-access': (context, query) => readHouseholdAccessPage(context, query),
  'projects-renovations': (context, query) => readProjectsPage(context.propertyId, query),
  'incidents-claims': (context, query) => readIncidentsClaimsPage(context.propertyId, query),
  warranties: (context, query) => readWarrantiesPage(context.propertyId, query),
});

export class AskRecordSectionUnavailableError extends Error {
  code = 'ASK_RECORD_SECTION_UNAVAILABLE';
  constructor(public readonly reason: 'UNKNOWN_SECTION' | 'NOT_PAGED' | 'NO_DETAIL' | 'NOT_APPLICABLE' | 'CONTEXT_REQUIRED') {
    super(`Record section is unavailable: ${reason}.`);
  }
}

export class AskRecordSectionRestrictedError extends Error {
  code = 'ASK_PERMISSION_REQUIRED';
}

/**
 * Reauthorizes on every call: account eligibility, current household role, role floor, and lifecycle applicability. `precheck` runs on the
 * resolved section before the role and lifecycle checks, so a section that cannot serve the request reports that first.
 */
export async function authorizeAskRecordSection(
  userId: string,
  propertyId: string,
  sectionId: string,
  accountRole: AskAccountRole | undefined,
  precheck: (definition: AskRecordSectionDefinition) => void,
): Promise<{ definition: AskRecordSectionDefinition; role: HouseholdRole }> {
  await ensureAskServiceAccountEligibility(userId, accountRole);
  const access = await ensurePropertyAccess(userId, propertyId);
  const definition = ASK_RECORD_SECTION_REGISTRY.find((entry) => entry.id === sectionId);
  if (!definition) throw new AskRecordSectionUnavailableError('UNKNOWN_SECTION');
  precheck(definition);
  const applicability = evaluateRecordSectionApplicability(definition, { householdRole: access.role, operatingMode: await loadOperatingMode(userId, propertyId) });
  if (applicability === 'RESTRICTED') throw new AskRecordSectionRestrictedError('Your household role cannot read this section.');
  if (applicability === 'NOT_APPLICABLE') throw new AskRecordSectionUnavailableError('NOT_APPLICABLE');
  if (applicability === 'CONTEXT_REQUIRED') throw new AskRecordSectionUnavailableError('CONTEXT_REQUIRED');
  return { definition, role: access.role };
}

export async function getAskRecordCollectionPage(
  userId: string,
  propertyId: string,
  sectionId: string,
  query: AskRecordCollectionQuery,
  accountRole?: AskAccountRole,
): Promise<AskRecordCollectionPage<unknown>> {
  const { definition, role } = await authorizeAskRecordSection(userId, propertyId, sectionId, accountRole, (entry) => {
    if (!entry.pagedCollection || !ASK_RECORD_COLLECTION_READERS[entry.id]) throw new AskRecordSectionUnavailableError('NOT_PAGED');
  });
  const page = await ASK_RECORD_COLLECTION_READERS[definition.id]!({ propertyId, userId, role }, query);
  return { ...page, recordDetail: definition.recordDetail };
}
