import { prisma } from '../../../lib/prisma';
import { readAskOperationalControls } from '../../../config/askOperationalControls';
import { evaluateAskAudienceApplicability, getAskAudiencePolicy } from '../askAudiencePolicy';
import { ASK_EXPLORER_ENTRIES } from '../askExplorerRegistry';
import { ASK_OPERATION_DEFINITIONS, getAskOperationDefinition, type AskOperationId } from '../askOperationRegistry';
import { ASK_RECORD_COLLECTION_READERS } from '../askRecordCollections.service';
import { ASK_RECORD_SECTION_REGISTRY, evaluateRecordSectionApplicability } from '../governance/askRecordSectionRegistry';
import { ASK_ARTIFACT_TYPE_REGISTRY, evaluateArtifactTypeApplicability } from '../governance/askArtifactTypeRegistry';
import { ASK_WORK_PROVIDER_REGISTRY, evaluateWorkProviderApplicability, type AskWorkProviderId } from '../governance/askWorkProviderRegistry';
import { ASK_WORK_PROVIDER_READERS } from '../askWork.service';
import { ASK_SAVED_TYPE_READERS } from '../saved/savedTypeReaders';
import { getRecentAskSessions } from '../execution/askSessions';
import { skillRuntimeUnavailableReason } from '../capabilityHandlerRegistry';
import type { AskSearchContext, AskSearchProvider, AskSearchResult } from '../askSearch.contract';

const RECORD_TITLE_FIELDS = ['title', 'name', 'carrierName', 'providerName', 'reportTypeLabel'] as const;
const RECORD_STATUS_FIELDS = ['statusLabel', 'kindLabel', 'typeLabel'] as const;
const RECORD_DATE_FIELDS = ['updatedAt', 'addedAt', 'inspectionDate', 'openedAt', 'startDate', 'expiryDate'] as const;
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** The label a Record row is known by in its own list. A row the owner gives no label is named after its section, never invented. */
export function recordRowTitle(row: Record<string, unknown>, fallback: string): string {
  for (const field of RECORD_TITLE_FIELDS) {
    const value = text(row[field]);
    if (value) return value.length > 120 ? `${value.slice(0, 119)}…` : value;
  }
  return fallback;
}

// ── Record: every paged section, through its own reader (so its own role floor, visibility and privacy rules apply) ───────
const recordProviders: AskSearchProvider[] = ASK_RECORD_SECTION_REGISTRY.map((definition): AskSearchProvider => {
  const reader = ASK_RECORD_COLLECTION_READERS[definition.id];
  if (!reader || !definition.pagedCollection) {
    return { id: `RECORD_${definition.id}`, group: 'RECORD', label: definition.label, unavailableReason: 'This section is a summary, not a list of records, so it has nothing to search yet.' };
  }
  return {
    id: `RECORD_${definition.id}`,
    group: 'RECORD',
    label: definition.label,
    applicability: (context) => evaluateRecordSectionApplicability(definition, { householdRole: context.role, operatingMode: context.operatingMode }),
    search: async (context, query, limit) => {
      const page = await reader({ propertyId: context.propertyId, userId: context.userId, role: context.role }, { search: query, limit: limit + 1, omitDetail: true });
      const rows = (page.rows as Array<Record<string, unknown> & { id: string }>).slice(0, limit);
      return {
        more: page.rows.length > limit || page.total > limit,
        results: rows.map((row): AskSearchResult => ({
          resultKey: `record:${definition.id}:${row.id}`, group: 'RECORD', providerId: `RECORD_${definition.id}`, typeLabel: definition.label,
          title: recordRowTitle(row, definition.label), snippet: null, propertyId: context.propertyId,
          status: RECORD_STATUS_FIELDS.map((field) => text(row[field])).find(Boolean) ?? null,
          asOf: RECORD_DATE_FIELDS.map((field) => text(row[field])).find(Boolean) ?? null, freshness: null,
          destination: { kind: 'RECORD', sectionId: definition.id, recordId: row.id },
        })),
      };
    },
  };
});

// ── Work: the readers that can match on their own text; the rest are reported, not skipped ─────────────────────────────────
const UNSEARCHABLE_WORK: Partial<Record<AskWorkProviderId, string>> = {
  MONITORS: 'Monitors are not searchable by text yet.',
  QUEUED_JOBS: 'Report and score export jobs are not searchable by text yet.',
  SCHEDULED_FOLLOW_UPS: 'Scheduled follow-ups are searchable through the claim or project they belong to.',
};

const workProviders: AskSearchProvider[] = ASK_WORK_PROVIDER_REGISTRY.map((definition): AskSearchProvider => {
  const unavailableReason = UNSEARCHABLE_WORK[definition.id];
  if (unavailableReason) return { id: `WORK_${definition.id}`, group: 'WORK', label: definition.label, unavailableReason };
  return {
    id: `WORK_${definition.id}`,
    group: 'WORK',
    label: definition.label,
    applicability: (context) => (definition.reader.state === 'CONNECTED' ? evaluateWorkProviderApplicability(definition, { householdRole: context.role, operatingMode: context.operatingMode }) : 'NOT_APPLICABLE'),
    search: async (context, query, limit) => {
      const reader = ASK_WORK_PROVIDER_READERS[definition.id];
      if (!reader) throw new Error('No reader registered.');
      const page = await reader({ userId: context.userId, propertyId: context.propertyId, role: context.role, operatingMode: context.operatingMode }, { view: 'NEEDS_YOU', allViews: true, search: query, after: null, limit: limit + 1, status: null });
      return {
        more: page.rows.length > limit || (page.total ?? 0) > limit,
        results: page.rows.slice(0, limit).map((row): AskSearchResult => ({
          resultKey: row.workKey, group: 'WORK', providerId: `WORK_${definition.id}`, typeLabel: definition.label, title: row.title, snippet: row.summary,
          propertyId: context.propertyId, status: row.status.label, asOf: row.freshness.asOf, freshness: row.lifecycleView.toLowerCase().replace(/_/g, ' '),
          destination: { kind: 'WORK', workKey: row.workKey },
        })),
      };
    },
  };
});

// ── Saved: every connected artifact type, through its own reader ───────────────────────────────────────────────────────────
const savedProviders: AskSearchProvider[] = ASK_ARTIFACT_TYPE_REGISTRY.map((definition): AskSearchProvider => {
  if (definition.reader.state === 'UNAVAILABLE') return { id: `SAVED_${definition.id}`, group: 'SAVED', label: definition.label, unavailableReason: definition.reader.reason };
  return {
    id: `SAVED_${definition.id}`,
    group: 'SAVED',
    label: definition.label,
    applicability: (context) => evaluateArtifactTypeApplicability(definition, { householdRole: context.role, operatingMode: context.operatingMode }),
    search: async (context, query, limit) => {
      const reader = ASK_SAVED_TYPE_READERS[definition.id];
      if (!reader) throw new Error('No reader registered.');
      const preferences = await prisma.askSavedArtifactPreference.findMany({ where: { userId: context.userId, propertyId: context.propertyId }, select: { artifactKey: true } });
      const archivedByYouIds = preferences.filter((entry) => entry.artifactKey.startsWith(`${definition.keyPrefix}:`)).map((entry) => entry.artifactKey.slice(definition.keyPrefix.length + 1));
      const page = await reader(context, { after: null, limit: limit + 1, search: query, freshness: null, archived: 'ACTIVE', archivedByYouIds });
      return {
        more: page.rows.length > limit || (page.total ?? 0) > limit,
        results: page.rows.slice(0, limit).map((row): AskSearchResult => ({
          resultKey: row.artifactKey, group: 'SAVED', providerId: `SAVED_${definition.id}`, typeLabel: definition.label, title: row.title, snippet: row.summary,
          propertyId: context.propertyId, status: row.version.label, asOf: row.sourceAsOf, freshness: row.freshness.state.toLowerCase(),
          destination: { kind: 'SAVED', artifactKey: row.artifactKey },
        })),
      };
    },
  };
});

// ── History: the person's own conversations, through the existing conversation search (it already honors retention and ownership) ─
const historyProvider: AskSearchProvider = {
  id: 'HISTORY_CONVERSATIONS', group: 'HISTORY', label: 'Conversations',
  search: async (context, query, limit) => {
    const page = await getRecentAskSessions(context.userId, context.propertyId, undefined, query);
    return {
      more: page.items.length > limit || page.nextCursor !== null,
      results: page.items.slice(0, limit).map((item): AskSearchResult => ({
        resultKey: `history:${item.sessionId}`, group: 'HISTORY', providerId: 'HISTORY_CONVERSATIONS', typeLabel: 'Conversation', title: item.title, snippet: null,
        propertyId: item.property.id, status: item.archived ? 'Archived' : null, asOf: item.lastActiveAt, freshness: null,
        destination: { kind: 'HISTORY', sessionId: item.sessionId, executionId: item.latestExecutionId },
      })),
    };
  },
};

// ── Capabilities: the reviewed explorer entries this person can discover now ───────────────────────────────────────────────
function entryDiscoverable(operationId: AskOperationId, context: AskSearchContext): boolean {
  const controls = readAskOperationalControls();
  if (!controls.operationEnabled(operationId)) return false;
  if (skillRuntimeUnavailableReason(operationId, controls)) return false;
  const policy = getAskAudiencePolicy(operationId, getAskOperationDefinition(operationId).version);
  if (!policy) return true;
  return evaluateAskAudienceApplicability({ policy, accountRole: 'HOMEOWNER', householdRole: context.role, operatingMode: context.operatingMode, purpose: 'DISCOVERY' }).discoverable;
}

const capabilityProvider: AskSearchProvider = {
  id: 'CAPABILITIES', group: 'CAPABILITY', label: 'Things Ask can do',
  search: async (context, query, limit) => {
    const needle = query.toLowerCase();
    const matches = ASK_EXPLORER_ENTRIES
      .filter((entry) => entry.launch !== 'SELECTOR' && entry.operationId in ASK_OPERATION_DEFINITIONS)
      .filter((entry) => [entry.label, entry.question, ...entry.aliases].some((candidate) => candidate.toLowerCase().includes(needle)))
      .filter((entry) => entryDiscoverable(entry.operationId, context));
    return {
      more: matches.length > limit,
      // Selecting one only puts the reviewed question in Ask; routing, role checks, target selection and confirmation all still run there.
      results: matches.slice(0, limit).map((entry): AskSearchResult => ({
        resultKey: `capability:${entry.id}`, group: 'CAPABILITY', providerId: 'CAPABILITIES', typeLabel: 'Ask can', title: entry.label, snippet: entry.consequence ?? null,
        propertyId: context.propertyId, status: null, asOf: null, freshness: null, destination: { kind: 'CAPABILITY', question: entry.question, entryId: entry.id },
      })),
    };
  },
};

export const ASK_SEARCH_PROVIDERS: readonly AskSearchProvider[] = Object.freeze([...recordProviders, ...workProviders, ...savedProviders, historyProvider, capabilityProvider]);
