import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import type { AskAccountRole } from './askAccountEligibility';
import { ensureAskServiceAccountEligibility, ensurePropertyAccess } from './askHandlerSupport';
import { loadOperatingMode } from './askRecordIndex.service';
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
  total: number;
  delivered: number;
  nextCursor: string | null;
  truncated: boolean;
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
    total,
    delivered: page.length,
    nextCursor,
    truncated: nextCursor !== null,
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

type SectionReader = (propertyId: string, query: AskRecordCollectionQuery) => Promise<AskRecordCollectionPage<unknown>>;

/** The sections with a connected paged reader. The registry's `pagedCollection` flag must agree with this map (tested). */
export const ASK_RECORD_COLLECTION_READERS: Readonly<Partial<Record<AskRecordSectionId, SectionReader>>> = Object.freeze({
  rooms: readRoomsPage,
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
  return reader(propertyId, query);
}
