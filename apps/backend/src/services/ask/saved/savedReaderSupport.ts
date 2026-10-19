import { prisma } from '../../../lib/prisma';
import type { AskArtifactTypeId } from '../governance/askArtifactTypeRegistry';
import type { AskSavedArtifact, AskSavedReadContext, AskSavedReadQuery, AskSavedTypeReader } from '../askSaved.contract';

type Where = Record<string, unknown>;

/** What a type supplies; the factory owns paging, archive filtering, counts, search and the source-execution lookup. */
export interface SavedReaderConfig<Row extends { id: string }, Scope = undefined> {
  artifactType: AskArtifactTypeId;
  keyPrefix: string;
  /** The column the shared (sortAt desc, key asc) order and keyset use. */
  sortField: string;
  /** Read once per request for things a where clause needs (for example the newest analysis id). */
  scope?: (context: AskSavedReadContext) => Promise<Scope>;
  baseWhere: (context: AskSavedReadContext, scope: Scope) => Where;
  /** Rows the canonical owner itself has archived. */
  ownerArchivedWhere: (context: AskSavedReadContext, scope: Scope) => Where;
  freshnessWhere: (freshness: NonNullable<AskSavedReadQuery['freshness']>, context: AskSavedReadContext, scope: Scope) => Where;
  searchWhere: (search: string) => Where;
  findMany: (args: { where: Where; take: number }) => Promise<Row[]>;
  count: (where: Where) => Promise<number>;
  /** Batched lookups for a page of rows (never one call per row). */
  prepare?: (rows: Row[], context: AskSavedReadContext) => Promise<unknown>;
  toArtifact: (row: Row, context: AskSavedReadContext, scope: Scope, prepared: unknown) => AskSavedArtifact;
}

export const contains = (field: string, search: string): Where => ({ [field]: { contains: search, mode: 'insensitive' } });

export function createSavedReader<Row extends { id: string }, Scope = undefined>(config: SavedReaderConfig<Row, Scope>): AskSavedTypeReader {
  return async (context, query) => {
    const scope = (config.scope ? await config.scope(context) : undefined) as Scope;
    const base = config.baseWhere(context, scope);
    const ownerArchived = config.ownerArchivedWhere(context, scope);
    const yourIds = [...query.archivedByYouIds];
    const archivedClause = (archived: 'ACTIVE' | 'ARCHIVED'): Where => (archived === 'ARCHIVED'
      ? { OR: [ownerArchived, { id: { in: yourIds } }] }
      : { NOT: { OR: [ownerArchived, { id: { in: yourIds } }] } });
    const filters = (archived: 'ACTIVE' | 'ARCHIVED'): Where => {
      const parts: Where[] = [base, archivedClause(archived)];
      if (query.freshness) parts.push(config.freshnessWhere(query.freshness, context, scope));
      if (query.search) parts.push(config.searchWhere(query.search));
      return { AND: parts };
    };
    const inView: Where = query.entityId ? { AND: [base, { id: query.entityId }] } : filters(query.archived);
    let where: Where = inView;
    if (query.after && !query.entityId) {
      const instant = new Date(query.after.sortAt);
      const prefix = `${config.keyPrefix}:`;
      const sameInstant: Where = query.after.artifactKey.startsWith(prefix) ? { id: { gt: query.after.artifactKey.slice(prefix.length) } } : prefix > query.after.artifactKey ? {} : { id: { in: [] } };
      where = { AND: [inView, { OR: [{ [config.sortField]: { lt: instant } }, { AND: [{ [config.sortField]: instant }, sameInstant] }] }] };
    }
    const [records, total, otherTotal] = await Promise.all([
      config.findMany({ where, take: query.limit }),
      config.count(inView),
      query.entityId ? Promise.resolve(null) : config.count(filters(query.archived === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE')),
    ]);
    const prepared = config.prepare ? await config.prepare(records, context) : undefined;
    const rows = records.map((record) => {
      const artifact = config.toArtifact(record, context, scope, prepared);
      return { ...artifact, archived: { ...artifact.archived, byYou: yourIds.includes(record.id) } };
    });
    // The producing execution, from the canonical owner's own receipt for this person: one batched lookup per page.
    if (rows.length) {
      const receipts = await prisma.askConfirmationReceipt.findMany({
        where: { artifactId: { in: rows.map((row) => row.entity.id) }, execution: { userId: context.userId, propertyId: context.propertyId } },
        select: { artifactId: true, executionId: true },
      });
      const byArtifact = new Map(receipts.map((receipt) => [receipt.artifactId, receipt.executionId]));
      for (const row of rows) row.sourceExecutionId = byArtifact.get(row.entity.id) ?? null;
    }
    return { rows, total, otherTotal };
  };
}

export const humanize = (value: string): string => { const text = value.toLowerCase().replace(/_/g, ' '); return text.charAt(0).toUpperCase() + text.slice(1); };
