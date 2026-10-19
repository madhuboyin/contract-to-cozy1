import { prisma } from '../../../lib/prisma';
import { ASK_ARTIFACT_TYPE_REGISTRY, type AskArtifactTypeDefinition } from '../governance/askArtifactTypeRegistry';
import type { AskSavedArtifact, AskSavedReadContext, AskSavedTypeReader } from '../askSaved.contract';
import { contains, createSavedReader, humanize } from './savedReaderSupport';

const definitionOf = (id: AskArtifactTypeDefinition['id']): AskArtifactTypeDefinition => ASK_ARTIFACT_TYPE_REGISTRY.find((entry) => entry.id === id)!;
const NONE = { id: { in: [] as string[] } };
const DAY_MS = 86_400_000;

/** Fields every type fills the same way; each reader supplies only what is specific to it. */
function envelope(typeId: AskArtifactTypeDefinition['id'], context: AskSavedReadContext, value: Pick<AskSavedArtifact, 'entity' | 'title' | 'summary' | 'createdAt' | 'updatedAt' | 'sourceAsOf' | 'freshness' | 'visibility' | 'reopen' | 'reopenUnavailableReason' | 'capabilities' | 'sortAt'> & {
  artifactId: string;
  version: { superseded?: boolean; supersededBy?: string | null; supersedes?: string | null; label: string };
  archivedByOwner: boolean;
}): AskSavedArtifact {
  const definition = definitionOf(typeId);
  const { artifactId, version, archivedByOwner, ...rest } = value;
  return {
    ...rest,
    artifactKey: `${definition.keyPrefix}:${artifactId}`,
    artifactType: typeId,
    category: definition.category,
    owner: definition.owner,
    propertyId: context.propertyId,
    sourceExecutionId: null,
    version: { behavior: definition.versionBehavior, superseded: version.superseded ?? false, supersededBy: version.supersededBy ?? null, supersedes: version.supersedes ?? null, label: version.label },
    archived: { byOwner: archivedByOwner, byYou: false },
  };
}

// ── Home report exports (the caller's own) ──────────────────────────────────────────────────────────────────────────────
const REPORT_TYPE_LABELS: Record<string, string> = { HOME_SUMMARY: 'Home summary', INVENTORY: 'Inventory', MAINTENANCE_HISTORY: 'Maintenance history', COVERAGE_SNAPSHOT: 'Coverage snapshot', HOME_REPORT_PACK: 'Home report pack' };
interface ReportRow { id: string; type: string; status: string; requestedAt: Date; completedAt: Date | null; expiresAt: Date | null; regeneratedFromId: string | null; shareToken: string | null; shareRevokedAt: Date | null }
interface ReportScope { supersededBy: Map<string, string> }

export const readSavedReportExports: AskSavedTypeReader = createSavedReader<ReportRow, ReportScope>({
  artifactType: 'HOME_REPORT_EXPORT', keyPrefix: 'report', sortField: 'requestedAt',
  // A regenerated export supersedes the one it came from; both stay.
  scope: async (context) => {
    const regenerated = await prisma.homeReportExport.findMany({ where: { userId: context.userId, propertyId: context.propertyId, regeneratedFromId: { not: null }, deletedAt: null }, select: { id: true, regeneratedFromId: true } });
    return { supersededBy: new Map(regenerated.flatMap((entry) => (entry.regeneratedFromId ? [[entry.regeneratedFromId, entry.id] as [string, string]] : []))) };
  },
  baseWhere: (context) => ({ userId: context.userId, propertyId: context.propertyId, deletedAt: null, status: { in: ['READY', 'EXPIRED'] } }),
  ownerArchivedWhere: () => NONE,
  freshnessWhere: (freshness, context, scope) => {
    const superseded = [...scope.supersededBy.keys()];
    const expired = { OR: [{ status: 'EXPIRED' }, { status: 'READY', expiresAt: { lte: context.now } }] };
    const unexpired = { status: 'READY', OR: [{ expiresAt: null }, { expiresAt: { gt: context.now } }] };
    if (freshness === 'SUPERSEDED') return { id: { in: superseded } };
    if (freshness === 'EXPIRED') return { AND: [expired, { id: { notIn: superseded } }] };
    if (freshness === 'CURRENT') return { AND: [unexpired, { id: { notIn: superseded } }] };
    return NONE;
  },
  searchWhere: (search) => ({ OR: [...Object.entries(REPORT_TYPE_LABELS).filter(([, label]) => label.toLowerCase().includes(search.toLowerCase())).map(([type]) => ({ type })), NONE] }),
  findMany: ({ where, take }) => prisma.homeReportExport.findMany({ where, take, select: { id: true, type: true, status: true, requestedAt: true, completedAt: true, expiresAt: true, regeneratedFromId: true, shareToken: true, shareRevokedAt: true }, orderBy: [{ requestedAt: 'desc' }, { id: 'asc' }] }) as Promise<ReportRow[]>,
  count: (where) => prisma.homeReportExport.count({ where }),
  toArtifact: (row, context, scope) => {
    const supersededBy = scope.supersededBy.get(row.id) ?? null;
    const expired = row.status === 'EXPIRED' || (row.expiresAt !== null && row.expiresAt <= context.now);
    const state = supersededBy ? 'SUPERSEDED' : expired ? 'EXPIRED' : 'CURRENT';
    return envelope('HOME_REPORT_EXPORT', context, {
      artifactId: row.id, entity: { type: 'HOME_REPORT_EXPORT', id: row.id }, title: `${REPORT_TYPE_LABELS[row.type] ?? humanize(row.type)} report`,
      summary: expired ? 'The file has expired.' : supersededBy ? 'A newer copy of this report was generated.' : null,
      createdAt: row.requestedAt.toISOString(), updatedAt: (row.completedAt ?? row.requestedAt).toISOString(), sourceAsOf: (row.completedAt ?? row.requestedAt).toISOString(), sortAt: row.requestedAt.toISOString(),
      freshness: { state, reason: state === 'EXPIRED' ? 'The report file expired.' : state === 'SUPERSEDED' ? 'Generated again later; this earlier copy is kept.' : null },
      visibility: { scope: 'REQUESTER_ONLY', sensitivity: 'SENSITIVE' },
      reopen: null, reopenUnavailableReason: 'Ask cannot reopen a generated report file. Its state and expiry are shown here.',
      capabilities: { export: state === 'CURRENT', share: state === 'CURRENT' && Boolean(row.shareToken) && row.shareRevokedAt === null },
      version: { label: `Generated ${row.requestedAt.toISOString().slice(0, 10)}`, supersededBy: supersededBy ? `report:${supersededBy}` : null, supersedes: row.regeneratedFromId ? `report:${row.regeneratedFromId}` : null, superseded: Boolean(supersededBy) },
      archivedByOwner: false,
    });
  },
});

// ── Quote comparisons ───────────────────────────────────────────────────────────────────────────────────────────────────
interface ComparisonRow { id: string; status: string; serviceCategory: string | null; scopeSummary: string | null; decisionSummary: string | null; selectedVendorName: string | null; decisionRecordedAt: Date | null; createdAt: Date; updatedAt: Date }

export const readSavedQuoteComparisons: AskSavedTypeReader = createSavedReader<ComparisonRow>({
  artifactType: 'QUOTE_COMPARISON', keyPrefix: 'comparison', sortField: 'updatedAt',
  baseWhere: (context) => ({ propertyId: context.propertyId }),
  ownerArchivedWhere: () => ({ status: 'ARCHIVED' }),
  freshnessWhere: (freshness) => (freshness === 'CURRENT' ? {} : NONE),
  searchWhere: (search) => ({ OR: [contains('scopeSummary', search), contains('selectedVendorName', search), contains('decisionSummary', search)] }),
  findMany: ({ where, take }) => prisma.quoteComparisonWorkspace.findMany({ where, take, select: { id: true, status: true, serviceCategory: true, scopeSummary: true, decisionSummary: true, selectedVendorName: true, decisionRecordedAt: true, createdAt: true, updatedAt: true }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] }) as Promise<ComparisonRow[]>,
  count: (where) => prisma.quoteComparisonWorkspace.count({ where }),
  toArtifact: (row, context) => envelope('QUOTE_COMPARISON', context, {
    artifactId: row.id, entity: { type: 'QUOTE_COMPARISON_WORKSPACE', id: row.id }, title: row.scopeSummary?.trim() || `${row.serviceCategory ? humanize(row.serviceCategory) : 'Service'} quotes`,
    summary: row.decisionSummary?.trim() || (row.selectedVendorName ? `Selected ${row.selectedVendorName}` : humanize(row.status)),
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), sourceAsOf: (row.decisionRecordedAt ?? row.updatedAt).toISOString(), sortAt: row.updatedAt.toISOString(),
    freshness: { state: 'CURRENT', reason: null }, visibility: { scope: 'HOUSEHOLD', sensitivity: 'STANDARD' },
    reopen: { operationId: 'QUOTE_COMPARISON_REVIEW', entityType: 'QUOTE_COMPARISON_WORKSPACE', entityId: row.id, decisionThreadId: null, contextVersion: row.updatedAt.toISOString() }, reopenUnavailableReason: null,
    capabilities: { export: false, share: false },
    version: { label: `${humanize(row.status)}, updated ${row.updatedAt.toISOString().slice(0, 10)}` }, archivedByOwner: row.status === 'ARCHIVED',
  }),
});

// ── Decision recommendations: every snapshot is a retained version ──────────────────────────────────────────────────────
const RESUMABLE_DECISION_FAMILIES = ['HVAC_REPAIR_REPLACE'];
interface DecisionRow {
  id: string; verdictCode: string; generatedAt: Date; supersedesSnapshotId: string | null;
  supersededBy: Array<{ id: string }>; currentForThread: { id: string } | null;
  decisionThread: { id: string; title: string; lifecycleStatus: string; contextStatus: string; decisionDefinitionId: string; primaryEntityType: string | null; primaryEntityId: string | null; version: number } | null;
}

export const readSavedDecisionRecommendations: AskSavedTypeReader = createSavedReader<DecisionRow>({
  artifactType: 'DECISION_RECOMMENDATION', keyPrefix: 'decision', sortField: 'generatedAt',
  baseWhere: (context) => ({ propertyId: context.propertyId, decisionThreadId: { not: null } }),
  ownerArchivedWhere: () => ({ decisionThread: { lifecycleStatus: { in: ['ABANDONED', 'ARCHIVED'] } } }),
  freshnessWhere: (freshness) => {
    if (freshness === 'SUPERSEDED') return { currentForThread: { is: null } };
    if (freshness === 'CURRENT') return { currentForThread: { isNot: null }, decisionThread: { contextStatus: 'CURRENT' } };
    if (freshness === 'STALE') return { currentForThread: { isNot: null }, decisionThread: { contextStatus: { not: 'CURRENT' } } };
    return NONE;
  },
  searchWhere: (search) => ({ OR: [{ decisionThread: contains('title', search) }, contains('verdictCode', search)] }),
  findMany: ({ where, take }) => prisma.recommendationSnapshot.findMany({
    where, take,
    select: {
      id: true, verdictCode: true, generatedAt: true, supersedesSnapshotId: true, supersededBy: { select: { id: true }, take: 1 }, currentForThread: { select: { id: true } },
      decisionThread: { select: { id: true, title: true, lifecycleStatus: true, contextStatus: true, decisionDefinitionId: true, primaryEntityType: true, primaryEntityId: true, version: true } },
    },
    orderBy: [{ generatedAt: 'desc' }, { id: 'asc' }],
  }) as Promise<DecisionRow[]>,
  count: (where) => prisma.recommendationSnapshot.count({ where }),
  toArtifact: (row, context) => {
    const thread = row.decisionThread;
    const superseded = row.currentForThread === null;
    const stale = !superseded && thread !== null && thread.contextStatus !== 'CURRENT';
    const resumable = thread !== null && RESUMABLE_DECISION_FAMILIES.includes(thread.decisionDefinitionId);
    return envelope('DECISION_RECOMMENDATION', context, {
      artifactId: row.id, entity: { type: 'RECOMMENDATION_SNAPSHOT', id: row.id }, title: `${thread?.title ?? 'Decision'} (recommendation)`, summary: `Recommendation: ${humanize(row.verdictCode)}`,
      createdAt: row.generatedAt.toISOString(), updatedAt: row.generatedAt.toISOString(), sourceAsOf: row.generatedAt.toISOString(), sortAt: row.generatedAt.toISOString(),
      freshness: { state: superseded ? 'SUPERSEDED' : stale ? 'STALE' : 'CURRENT', reason: superseded ? 'A newer recommendation replaced this one; this version is kept.' : stale ? 'Some of what this relied on has changed.' : null },
      visibility: { scope: 'HOUSEHOLD', sensitivity: 'SENSITIVE' },
      reopen: resumable && thread ? { operationId: 'HVAC_DECISION_CONTINUE', entityType: thread.primaryEntityType ?? 'DecisionThread', entityId: thread.primaryEntityId ?? thread.id, decisionThreadId: thread.id, contextVersion: String(thread.version) } : null,
      reopenUnavailableReason: resumable ? null : 'Ask cannot continue this kind of decision yet. Its saved recommendation is shown here.',
      capabilities: { export: false, share: false },
      version: { label: `Recommendation of ${row.generatedAt.toISOString().slice(0, 10)}`, superseded, supersededBy: row.supersededBy[0] ? `decision:${row.supersededBy[0].id}` : null, supersedes: row.supersedesSnapshotId ? `decision:${row.supersedesSnapshotId}` : null },
      archivedByOwner: thread !== null && ['ABANDONED', 'ARCHIVED'].includes(thread.lifecycleStatus),
    });
  },
});

// ── Property briefs ─────────────────────────────────────────────────────────────────────────────────────────────────────
const BRIEF_STALE_DAYS = 90;
interface BriefRow { id: string; title: string; purpose: string; status: string; asOf: Date; createdAt: Date; updatedAt: Date; shares: Array<{ status: string }> }

export const readSavedPropertyBriefs: AskSavedTypeReader = createSavedReader<BriefRow>({
  artifactType: 'PROPERTY_BRIEF', keyPrefix: 'brief', sortField: 'updatedAt',
  baseWhere: (context) => ({ propertyId: context.propertyId, status: { in: ['READY', 'SHARED', 'REVOKED', 'ARCHIVED'] } }),
  ownerArchivedWhere: () => ({ status: 'ARCHIVED' }),
  freshnessWhere: (freshness, context) => {
    const cutoff = new Date(context.now.getTime() - BRIEF_STALE_DAYS * DAY_MS);
    return freshness === 'CURRENT' ? { asOf: { gt: cutoff } } : freshness === 'STALE' ? { asOf: { lte: cutoff } } : NONE;
  },
  searchWhere: (search) => ({ OR: [contains('title', search)] }),
  findMany: ({ where, take }) => prisma.propertyBrief.findMany({ where, take, select: { id: true, title: true, purpose: true, status: true, asOf: true, createdAt: true, updatedAt: true, shares: { select: { status: true } } }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] }) as Promise<BriefRow[]>,
  count: (where) => prisma.propertyBrief.count({ where }),
  toArtifact: (row, context) => {
    const stale = context.now.getTime() - row.asOf.getTime() >= BRIEF_STALE_DAYS * DAY_MS;
    const activeShare = row.shares.some((share) => share.status === 'ACTIVE');
    return envelope('PROPERTY_BRIEF', context, {
      artifactId: row.id, entity: { type: 'PROPERTY_BRIEF', id: row.id }, title: row.title, summary: `${humanize(row.purpose)}${activeShare ? ' · shared' : row.status === 'REVOKED' ? ' · sharing revoked' : ''}`,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), sourceAsOf: row.asOf.toISOString(), sortAt: row.updatedAt.toISOString(),
      freshness: { state: stale ? 'STALE' : 'CURRENT', reason: stale ? `Built from facts as of ${row.asOf.toISOString().slice(0, 10)}.` : null },
      visibility: { scope: 'HOUSEHOLD', sensitivity: 'SENSITIVE' },
      reopen: { operationId: 'PROPERTY_BRIEFS_LIST', entityType: 'PROPERTY_BRIEF', entityId: row.id, decisionThreadId: null, contextVersion: row.updatedAt.toISOString() }, reopenUnavailableReason: null,
      capabilities: { export: false, share: context.role !== 'VIEWER' && (row.status === 'READY' || row.status === 'SHARED') },
      version: { label: `As of ${row.asOf.toISOString().slice(0, 10)}` }, archivedByOwner: row.status === 'ARCHIVED',
    });
  },
});

// ── Seasonal checklists ─────────────────────────────────────────────────────────────────────────────────────────────────
interface SeasonalRow { id: string; season: string; year: number; status: string; totalTasks: number; tasksCompleted: number; seasonEndDate: Date; generatedAt: Date; createdAt: Date; updatedAt: Date }
const startOfDay = (instant: Date) => new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()));

export const readSavedSeasonalChecklists: AskSavedTypeReader = createSavedReader<SeasonalRow>({
  artifactType: 'SEASONAL_CHECKLIST', keyPrefix: 'seasonal', sortField: 'updatedAt',
  baseWhere: (context) => ({ propertyId: context.propertyId }),
  ownerArchivedWhere: () => ({ status: 'DISMISSED' }),
  freshnessWhere: (freshness, context) => {
    const today = startOfDay(context.now);
    return freshness === 'CURRENT' ? { seasonEndDate: { gte: today } } : freshness === 'STALE' ? { seasonEndDate: { lt: today } } : NONE;
  },
  searchWhere: (search) => {
    const seasons = ['SPRING', 'SUMMER', 'FALL', 'WINTER'].filter((season) => season.toLowerCase().includes(search.toLowerCase()));
    const year = /^\d{4}$/.test(search.trim()) ? Number(search.trim()) : null;
    return { OR: [...(seasons.length ? [{ season: { in: seasons } }] : []), ...(year ? [{ year }] : []), NONE] };
  },
  findMany: ({ where, take }) => prisma.seasonalChecklist.findMany({ where, take, select: { id: true, season: true, year: true, status: true, totalTasks: true, tasksCompleted: true, seasonEndDate: true, generatedAt: true, createdAt: true, updatedAt: true }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] }) as Promise<SeasonalRow[]>,
  count: (where) => prisma.seasonalChecklist.count({ where }),
  toArtifact: (row, context) => {
    const past = row.seasonEndDate < startOfDay(context.now);
    return envelope('SEASONAL_CHECKLIST', context, {
      artifactId: row.id, entity: { type: 'SEASONAL_CHECKLIST', id: row.id }, title: `${humanize(row.season)} ${row.year} checklist`, summary: `${row.tasksCompleted} of ${row.totalTasks} tasks done`,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), sourceAsOf: row.generatedAt.toISOString(), sortAt: row.updatedAt.toISOString(),
      freshness: { state: past ? 'STALE' : 'CURRENT', reason: past ? 'This season has ended.' : null }, visibility: { scope: 'HOUSEHOLD', sensitivity: 'STANDARD' },
      reopen: { operationId: 'SEASONAL_HOME_CARE', entityType: 'SEASONAL_CHECKLIST', entityId: row.id, decisionThreadId: null, contextVersion: row.updatedAt.toISOString() }, reopenUnavailableReason: null,
      capabilities: { export: false, share: false },
      version: { label: `${humanize(row.season)} ${row.year}` }, archivedByOwner: row.status === 'DISMISSED',
    });
  },
});

// ── Computed analyses that keep every run: one version chain per logical identity ──────────────────────────────────────
interface ChainScope { latestIds: string[]; newerOf: Map<string, string>; previousOf: Map<string, string> }

/**
 * Builds supersession chains from rows ordered newest first. Runs only supersede others with the same logical identity (`groupOf`): a
 * 5-year sell/hold/rent result never supersedes a 10-year one, and one item's replace/repair analysis never supersedes another's.
 */
function chainScope(ordered: Array<{ id: string }>, groupOf: (row: { id: string }) => string): ChainScope {
  const latestIds: string[] = [];
  const newerOf = new Map<string, string>();
  const previousOf = new Map<string, string>();
  const lastSeen = new Map<string, string>();
  for (const row of ordered) {
    const group = groupOf(row);
    const above = lastSeen.get(group);
    if (!above) latestIds.push(row.id);
    else { previousOf.set(above, row.id); newerOf.set(row.id, above); }
    lastSeen.set(group, row.id);
  }
  return { latestIds, newerOf, previousOf };
}

interface AnalysisRow { id: string; years: number; winner: string; confidence: string; computedAt: Date; createdAt: Date; updatedAt: Date }

export const readSavedSellHoldRentAnalyses: AskSavedTypeReader = createSavedReader<AnalysisRow, ChainScope>({
  artifactType: 'SELL_HOLD_RENT_ANALYSIS', keyPrefix: 'analysis', sortField: 'computedAt',
  scope: async (context) => {
    const ordered = await prisma.sellHoldRentAnalysis.findMany({ where: { propertyId: context.propertyId }, select: { id: true, years: true }, orderBy: [{ computedAt: 'desc' }, { id: 'asc' }] });
    const years = new Map(ordered.map((entry) => [entry.id, String(entry.years)]));
    return chainScope(ordered, (row) => years.get(row.id) ?? '');
  },
  baseWhere: (context) => ({ propertyId: context.propertyId }),
  ownerArchivedWhere: () => NONE,
  freshnessWhere: (freshness, _context, scope) => {
    if (freshness === 'CURRENT') return { id: { in: scope.latestIds } };
    if (freshness === 'SUPERSEDED') return { id: { notIn: scope.latestIds } };
    return NONE;
  },
  searchWhere: (search) => ({ OR: [...['SELL', 'HOLD', 'RENT'].filter((winner) => winner.toLowerCase().includes(search.toLowerCase())).map((winner) => ({ winner })), NONE] }),
  findMany: ({ where, take }) => prisma.sellHoldRentAnalysis.findMany({ where, take, select: { id: true, years: true, winner: true, confidence: true, computedAt: true, createdAt: true, updatedAt: true }, orderBy: [{ computedAt: 'desc' }, { id: 'asc' }] }) as Promise<AnalysisRow[]>,
  count: (where) => prisma.sellHoldRentAnalysis.count({ where }),
  toArtifact: (row, context, scope) => {
    const superseded = !scope.latestIds.includes(row.id);
    const newer = scope.newerOf.get(row.id);
    const previous = scope.previousOf.get(row.id);
    return envelope('SELL_HOLD_RENT_ANALYSIS', context, {
      artifactId: row.id, entity: { type: 'SELL_HOLD_RENT_ANALYSIS', id: row.id }, title: `Sell, hold or rent (${row.years}-year view)`, summary: `Best option: ${humanize(row.winner)} · ${humanize(row.confidence)} confidence`,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), sourceAsOf: row.computedAt.toISOString(), sortAt: row.computedAt.toISOString(),
      freshness: { state: superseded ? 'SUPERSEDED' : 'CURRENT', reason: superseded ? `A newer ${row.years}-year analysis replaced this one; this version is kept.` : null },
      visibility: { scope: 'HOUSEHOLD', sensitivity: 'SENSITIVE' },
      // Asking for this analysis again computes a new one, so reopening it would not show this saved result; it is shown as saved instead.
      reopen: null, reopenUnavailableReason: 'Ask recomputes this analysis rather than reopening it. This saved copy shows the result as it was computed.',
      capabilities: { export: false, share: false },
      version: { label: `${row.years}-year view computed ${row.computedAt.toISOString().slice(0, 10)}`, superseded, supersededBy: newer ? `analysis:${newer}` : null, supersedes: previous ? `analysis:${previous}` : null },
      archivedByOwner: false,
    });
  },
});

// ── Capital timelines: one chain per planning horizon ──────────────────────────────────────────────────────────────────
interface CapitalRow { id: string; horizonYears: number; status: string; confidence: string; summary: string | null; computedAt: Date; createdAt: Date; updatedAt: Date }

export const readSavedCapitalTimelines: AskSavedTypeReader = createSavedReader<CapitalRow, ChainScope>({
  artifactType: 'CAPITAL_TIMELINE_ANALYSIS', keyPrefix: 'capital', sortField: 'computedAt',
  scope: async (context) => {
    const ordered = await prisma.homeCapitalTimelineAnalysis.findMany({ where: { propertyId: context.propertyId, status: { not: 'ERROR' } }, select: { id: true, horizonYears: true }, orderBy: [{ computedAt: 'desc' }, { id: 'asc' }] });
    const horizon = new Map(ordered.map((entry) => [entry.id, String(entry.horizonYears)]));
    return chainScope(ordered, (row) => horizon.get(row.id) ?? '');
  },
  baseWhere: (context) => ({ propertyId: context.propertyId, status: { not: 'ERROR' } }),
  ownerArchivedWhere: () => NONE,
  freshnessWhere: (freshness, _context, scope) => {
    if (freshness === 'SUPERSEDED') return { id: { notIn: scope.latestIds } };
    if (freshness === 'CURRENT') return { id: { in: scope.latestIds }, status: 'READY' };
    if (freshness === 'STALE') return { id: { in: scope.latestIds }, status: 'STALE' };
    return NONE;
  },
  searchWhere: (search) => ({ OR: [contains('summary', search), NONE] }),
  findMany: ({ where, take }) => prisma.homeCapitalTimelineAnalysis.findMany({ where, take, select: { id: true, horizonYears: true, status: true, confidence: true, summary: true, computedAt: true, createdAt: true, updatedAt: true }, orderBy: [{ computedAt: 'desc' }, { id: 'asc' }] }) as Promise<CapitalRow[]>,
  count: (where) => prisma.homeCapitalTimelineAnalysis.count({ where }),
  toArtifact: (row, context, scope) => {
    const superseded = !scope.latestIds.includes(row.id);
    const stale = !superseded && row.status === 'STALE';
    const newer = scope.newerOf.get(row.id);
    const previous = scope.previousOf.get(row.id);
    return envelope('CAPITAL_TIMELINE_ANALYSIS', context, {
      artifactId: row.id, entity: { type: 'CAPITAL_TIMELINE_ANALYSIS', id: row.id }, title: `Capital timeline (${row.horizonYears}-year view)`, summary: row.summary?.trim() || `${humanize(row.confidence)} confidence`,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), sourceAsOf: row.computedAt.toISOString(), sortAt: row.computedAt.toISOString(),
      freshness: { state: superseded ? 'SUPERSEDED' : stale ? 'STALE' : 'CURRENT', reason: superseded ? `A newer ${row.horizonYears}-year timeline replaced this one; this version is kept.` : stale ? 'Records it relied on have changed since it was computed.' : null },
      visibility: { scope: 'HOUSEHOLD', sensitivity: 'SENSITIVE' },
      reopen: null, reopenUnavailableReason: 'Ask recomputes the capital plan rather than reopening a stored timeline. This saved copy shows the result as it was computed.',
      capabilities: { export: false, share: false },
      version: { label: `${row.horizonYears}-year view computed ${row.computedAt.toISOString().slice(0, 10)}`, superseded, supersededBy: newer ? `capital:${newer}` : null, supersedes: previous ? `capital:${previous}` : null },
      archivedByOwner: false,
    });
  },
});

// ── Replace or repair analyses: the owner's own "current" marker decides supersession ───────────────────────────────────
interface ReplaceRepairRow { id: string; inventoryItemId: string; currentMarker: string | null; status: string; verdict: string; confidence: string; summary: string | null; computedAt: Date; createdAt: Date; updatedAt: Date; inventoryItem: { name: string | null } | null }
interface ReplaceRepairPrepared { currentByItem: Map<string, string> }

export const readSavedReplaceRepairAnalyses: AskSavedTypeReader = createSavedReader<ReplaceRepairRow>({
  artifactType: 'REPLACE_REPAIR_ANALYSIS', keyPrefix: 'replacerepair', sortField: 'computedAt',
  baseWhere: (context) => ({ propertyId: context.propertyId, status: { not: 'ERROR' } }),
  ownerArchivedWhere: () => NONE,
  freshnessWhere: (freshness) => {
    if (freshness === 'SUPERSEDED') return { currentMarker: null };
    if (freshness === 'CURRENT') return { currentMarker: { not: null }, status: 'READY' };
    if (freshness === 'STALE') return { currentMarker: { not: null }, status: 'STALE' };
    return NONE;
  },
  searchWhere: (search) => ({ OR: [{ inventoryItem: contains('name', search) }, contains('summary', search)] }),
  findMany: ({ where, take }) => prisma.replaceRepairAnalysis.findMany({ where, take, select: { id: true, inventoryItemId: true, currentMarker: true, status: true, verdict: true, confidence: true, summary: true, computedAt: true, createdAt: true, updatedAt: true, inventoryItem: { select: { name: true } } }, orderBy: [{ computedAt: 'desc' }, { id: 'asc' }] }) as Promise<ReplaceRepairRow[]>,
  count: (where) => prisma.replaceRepairAnalysis.count({ where }),
  // The analysis that replaced a superseded one is the item's current one: one batched lookup for the page.
  prepare: async (rows, context): Promise<ReplaceRepairPrepared> => {
    const items = [...new Set(rows.filter((row) => row.currentMarker === null).map((row) => row.inventoryItemId))];
    const current = items.length ? await prisma.replaceRepairAnalysis.findMany({ where: { propertyId: context.propertyId, inventoryItemId: { in: items }, currentMarker: { not: null } }, select: { id: true, inventoryItemId: true } }) : [];
    return { currentByItem: new Map(current.map((entry) => [entry.inventoryItemId, entry.id])) };
  },
  toArtifact: (row, context, _scope, prepared) => {
    const superseded = row.currentMarker === null;
    const stale = !superseded && row.status === 'STALE';
    const replacement = superseded ? (prepared as ReplaceRepairPrepared).currentByItem.get(row.inventoryItemId) : undefined;
    const name = row.inventoryItem?.name?.trim() || 'Item';
    return envelope('REPLACE_REPAIR_ANALYSIS', context, {
      artifactId: row.id, entity: { type: 'REPLACE_REPAIR_ANALYSIS', id: row.id }, title: `${name}: replace or repair`, summary: row.summary?.trim() || `Verdict: ${humanize(row.verdict)} · ${humanize(row.confidence)} confidence`,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), sourceAsOf: row.computedAt.toISOString(), sortAt: row.computedAt.toISOString(),
      freshness: { state: superseded ? 'SUPERSEDED' : stale ? 'STALE' : 'CURRENT', reason: superseded ? 'A newer analysis for this item replaced this one; this version is kept.' : stale ? 'Records it relied on have changed since it was computed.' : null },
      visibility: { scope: 'HOUSEHOLD', sensitivity: 'SENSITIVE' },
      reopen: null, reopenUnavailableReason: 'Ask recomputes replacement guidance rather than reopening a stored analysis. This saved copy shows the result as it was computed.',
      capabilities: { export: false, share: false },
      version: { label: `Computed ${row.computedAt.toISOString().slice(0, 10)}`, superseded, supersededBy: replacement ? `replacerepair:${replacement}` : null, supersedes: null },
      archivedByOwner: false,
    });
  },
});

// ── Coverage comparisons ────────────────────────────────────────────────────────────────────────────────────────────────
interface CoverageRow { id: string; status: string; equivalenceStatus: string; createdAt: Date; updatedAt: Date }

export const readSavedCoverageComparisons: AskSavedTypeReader = createSavedReader<CoverageRow>({
  artifactType: 'COVERAGE_COMPARISON', keyPrefix: 'coverage', sortField: 'updatedAt',
  baseWhere: (context) => ({ propertyId: context.propertyId }),
  ownerArchivedWhere: () => NONE,
  freshnessWhere: (freshness) => (freshness === 'CURRENT' ? {} : NONE),
  searchWhere: (search) => ({ OR: [contains('status', search), contains('equivalenceStatus', search)] }),
  findMany: ({ where, take }) => prisma.coverageComparison.findMany({ where, take, select: { id: true, status: true, equivalenceStatus: true, createdAt: true, updatedAt: true }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] }) as Promise<CoverageRow[]>,
  count: (where) => prisma.coverageComparison.count({ where }),
  toArtifact: (row, context) => envelope('COVERAGE_COMPARISON', context, {
    artifactId: row.id, entity: { type: 'COVERAGE_COMPARISON', id: row.id }, title: 'Coverage comparison', summary: `${humanize(row.status)} · ${humanize(row.equivalenceStatus)}`,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), sourceAsOf: row.updatedAt.toISOString(), sortAt: row.updatedAt.toISOString(),
    freshness: { state: 'CURRENT', reason: null }, visibility: { scope: 'HOUSEHOLD', sensitivity: 'SENSITIVE' },
    reopen: { operationId: 'COVERAGE_COMPARISON_STATUS', entityType: 'COVERAGE_COMPARISON', entityId: row.id, decisionThreadId: null, contextVersion: row.updatedAt.toISOString() }, reopenUnavailableReason: null,
    capabilities: { export: false, share: false },
    version: { label: `${humanize(row.status)}, updated ${row.updatedAt.toISOString().slice(0, 10)}` }, archivedByOwner: false,
  }),
});

// ── Financing scenarios ─────────────────────────────────────────────────────────────────────────────────────────────────
const RATE_STALE_DAYS = 90;
interface FinancingRow { id: string; title: string; status: string; projectCostCents: number; createdAt: Date; updatedAt: Date }

export const readSavedFinancingScenarios: AskSavedTypeReader = createSavedReader<FinancingRow>({
  artifactType: 'FINANCING_SCENARIO', keyPrefix: 'financing', sortField: 'updatedAt',
  baseWhere: (context) => ({ propertyId: context.propertyId }),
  ownerArchivedWhere: () => ({ status: 'ARCHIVED' }),
  freshnessWhere: (freshness, context) => {
    const cutoff = new Date(context.now.getTime() - RATE_STALE_DAYS * DAY_MS);
    return freshness === 'CURRENT' ? { createdAt: { gt: cutoff } } : freshness === 'STALE' ? { createdAt: { lte: cutoff } } : NONE;
  },
  searchWhere: (search) => ({ OR: [contains('title', search), contains('projectDescription', search)] }),
  findMany: ({ where, take }) => prisma.financingScenario.findMany({ where, take, select: { id: true, title: true, status: true, projectCostCents: true, createdAt: true, updatedAt: true }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] }) as Promise<FinancingRow[]>,
  count: (where) => prisma.financingScenario.count({ where }),
  toArtifact: (row, context) => {
    const stale = context.now.getTime() - row.createdAt.getTime() >= RATE_STALE_DAYS * DAY_MS;
    return envelope('FINANCING_SCENARIO', context, {
      artifactId: row.id, entity: { type: 'FINANCING_SCENARIO', id: row.id }, title: row.title, summary: `${humanize(row.status)} · project cost $${Math.round(row.projectCostCents / 100).toLocaleString('en-US')}`,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), sourceAsOf: row.createdAt.toISOString(), sortAt: row.updatedAt.toISOString(),
      freshness: { state: stale ? 'STALE' : 'CURRENT', reason: stale ? 'Its rates were captured more than 90 days ago and may have changed.' : null },
      visibility: { scope: 'HOUSEHOLD', sensitivity: 'SENSITIVE' },
      reopen: { operationId: 'FINANCING_OVERVIEW', entityType: 'FINANCING_SCENARIO', entityId: row.id, decisionThreadId: null, contextVersion: row.updatedAt.toISOString() }, reopenUnavailableReason: null,
      capabilities: { export: false, share: false },
      version: { label: `Calculated ${row.createdAt.toISOString().slice(0, 10)}` }, archivedByOwner: row.status === 'ARCHIVED',
    });
  },
});

// ── Home score reports (homeowner mode): the owner's own status says which one is current ─────────────────────────────────
interface ScoreReportRow { id: string; status: string; reportVersion: string; scoreModelVersion: string | null; generatedAt: Date; createdAt: Date; updatedAt: Date }

export const readSavedHomeScoreReports: AskSavedTypeReader = createSavedReader<ScoreReportRow>({
  artifactType: 'HOME_SCORE_REPORT', keyPrefix: 'scorereport', sortField: 'generatedAt',
  baseWhere: (context) => ({ propertyId: context.propertyId, reportMode: 'HOMEOWNER', status: { in: ['FINAL', 'SUPERSEDED', 'REVOKED'] } }),
  ownerArchivedWhere: () => ({ status: 'REVOKED' }),
  freshnessWhere: (freshness) => (freshness === 'CURRENT' ? { status: 'FINAL' } : freshness === 'SUPERSEDED' ? { status: 'SUPERSEDED' } : NONE),
  searchWhere: (search) => ({ OR: [...('home score report'.includes(search.toLowerCase()) || search.toLowerCase().includes('score') ? [{}] : []), contains('reportVersion', search), NONE] }),
  findMany: ({ where, take }) => prisma.homeScoreReport.findMany({ where, take, select: { id: true, status: true, reportVersion: true, scoreModelVersion: true, generatedAt: true, createdAt: true, updatedAt: true }, orderBy: [{ generatedAt: 'desc' }, { id: 'asc' }] }) as Promise<ScoreReportRow[]>,
  count: (where) => prisma.homeScoreReport.count({ where }),
  toArtifact: (row, context) => {
    const superseded = row.status === 'SUPERSEDED';
    return envelope('HOME_SCORE_REPORT', context, {
      artifactId: row.id, entity: { type: 'HOME_SCORE_REPORT', id: row.id }, title: 'Home score report', summary: `Report version ${row.reportVersion}${row.scoreModelVersion ? ` · model ${row.scoreModelVersion}` : ''}`,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), sourceAsOf: row.generatedAt.toISOString(), sortAt: row.generatedAt.toISOString(),
      freshness: { state: superseded ? 'SUPERSEDED' : 'CURRENT', reason: superseded ? 'A newer score report replaced this one; this version is kept.' : null },
      visibility: { scope: 'HOUSEHOLD', sensitivity: 'STANDARD' },
      reopen: null, reopenUnavailableReason: 'Ask cannot reopen a stored score report. Its state is shown here.',
      capabilities: { export: false, share: false },
      version: { label: `Generated ${row.generatedAt.toISOString().slice(0, 10)}`, superseded }, archivedByOwner: row.status === 'REVOKED',
    });
  },
});

// ── Saved refinance scenarios ───────────────────────────────────────────────────────────────────────────────────────────
interface RefinanceRow { id: string; targetRate: number; targetTerm: string; monthlySavings: unknown; createdAt: Date; updatedAt: Date }

export const readSavedRefinanceScenarios: AskSavedTypeReader = createSavedReader<RefinanceRow>({
  artifactType: 'REFINANCE_SCENARIO', keyPrefix: 'refinance', sortField: 'updatedAt',
  baseWhere: (context) => ({ propertyId: context.propertyId, isSaved: true }),
  ownerArchivedWhere: () => NONE,
  freshnessWhere: (freshness, context) => {
    const cutoff = new Date(context.now.getTime() - RATE_STALE_DAYS * DAY_MS);
    return freshness === 'CURRENT' ? { createdAt: { gt: cutoff } } : freshness === 'STALE' ? { createdAt: { lte: cutoff } } : NONE;
  },
  searchWhere: (search) => ({ OR: [...('refinance scenario'.includes(search.toLowerCase()) || search.toLowerCase().includes('refinance') ? [{}] : []), NONE] }),
  findMany: ({ where, take }) => prisma.refinanceScenarioSnapshot.findMany({ where, take, select: { id: true, targetRate: true, targetTerm: true, monthlySavings: true, createdAt: true, updatedAt: true }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] }) as Promise<RefinanceRow[]>,
  count: (where) => prisma.refinanceScenarioSnapshot.count({ where }),
  toArtifact: (row, context) => {
    const stale = context.now.getTime() - row.createdAt.getTime() >= RATE_STALE_DAYS * DAY_MS;
    const savings = row.monthlySavings == null ? null : Number(row.monthlySavings);
    return envelope('REFINANCE_SCENARIO', context, {
      artifactId: row.id, entity: { type: 'REFINANCE_SCENARIO', id: row.id }, title: `Refinance at ${row.targetRate}% (${humanize(row.targetTerm)})`,
      summary: savings === null || Number.isNaN(savings) ? 'Saved scenario' : `About $${Math.round(savings).toLocaleString('en-US')} a month`,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), sourceAsOf: row.createdAt.toISOString(), sortAt: row.updatedAt.toISOString(),
      freshness: { state: stale ? 'STALE' : 'CURRENT', reason: stale ? 'Its assumptions were captured more than 90 days ago and rates may have changed.' : null },
      visibility: { scope: 'HOUSEHOLD', sensitivity: 'SENSITIVE' },
      reopen: null, reopenUnavailableReason: 'Ask recalculates refinance analyses rather than reopening a saved scenario. This saved copy shows what was calculated.',
      capabilities: { export: false, share: false },
      version: { label: `Calculated ${row.createdAt.toISOString().slice(0, 10)}` }, archivedByOwner: false,
    });
  },
});

export const ASK_SAVED_TYPE_READERS: Partial<Record<AskArtifactTypeDefinition['id'], AskSavedTypeReader>> = {
  HOME_REPORT_EXPORT: readSavedReportExports,
  QUOTE_COMPARISON: readSavedQuoteComparisons,
  DECISION_RECOMMENDATION: readSavedDecisionRecommendations,
  PROPERTY_BRIEF: readSavedPropertyBriefs,
  SEASONAL_CHECKLIST: readSavedSeasonalChecklists,
  SELL_HOLD_RENT_ANALYSIS: readSavedSellHoldRentAnalyses,
  COVERAGE_COMPARISON: readSavedCoverageComparisons,
  FINANCING_SCENARIO: readSavedFinancingScenarios,
  REPLACE_REPAIR_ANALYSIS: readSavedReplaceRepairAnalyses,
  CAPITAL_TIMELINE_ANALYSIS: readSavedCapitalTimelines,
  HOME_SCORE_REPORT: readSavedHomeScoreReports,
  REFINANCE_SCENARIO: readSavedRefinanceScenarios,
};
