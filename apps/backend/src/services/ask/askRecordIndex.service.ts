import type { HouseholdRole } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import type { AskOperatingMode } from '../skills/context/propertyJourneyContext.contract';
import { getPropertyRecordOverview } from '../propertyRecordOverview.service';
import type { AskAccountRole } from './askAccountEligibility';
import { ensureAskServiceAccountEligibility, ensurePropertyAccess } from './askHandlerSupport';
import { loadOperatingMode } from './askRecordContext';
import { ASK_RECORD_COLLECTION_READERS } from './askRecordCollections.service';
import {
  ASK_RECORD_SECTION_REGISTRY,
  evaluateRecordSectionApplicability,
  type AskRecordSectionDefinition,
  type AskRecordSectionId,
} from './governance/askRecordSectionRegistry';

export const ASK_RECORD_INDEX_CONTRACT_VERSION = 'ask-record-index-v1' as const;

/**
 * - AVAILABLE: the count came from the canonical reader.
 * - UNAVAILABLE: no count could be read; `reasonCode` says whether the reader is not connected yet or its provider failed.
 * - NOT_APPLICABLE: the home's lifecycle stage makes the section inapplicable.
 * - CONTEXT_REQUIRED: applicability depends on a lifecycle stage the homeowner has not told Cozy.
 * - RESTRICTED: the viewer's household role is below the section's floor, so no content is returned.
 */
export type AskRecordSectionState = 'AVAILABLE' | 'UNAVAILABLE' | 'NOT_APPLICABLE' | 'CONTEXT_REQUIRED' | 'RESTRICTED';
export type AskRecordSectionReason = 'READER_NOT_CONNECTED' | 'PROVIDER_FAILED' | 'LIFECYCLE_INAPPLICABLE' | 'LIFECYCLE_CONTEXT_REQUIRED' | 'ROLE_FLOOR';

export interface AskRecordIndexSection {
  id: AskRecordSectionId;
  label: string;
  scope: string;
  state: AskRecordSectionState;
  reasonCode: AskRecordSectionReason | null;
  count: number | null;
  countLabel: string | null;
  /** The newest source time the canonical reader supplied; null when it supplies none. */
  freshAsOf: string | null;
  freshnessSource: string;
  /** True when the Record destination can page this section's complete collection. */
  pagedCollection: boolean;
  /** The Ask question that opens the section. Withheld for restricted and inapplicable sections. */
  primaryAction: { label: string; question: string } | null;
}

export interface AskRecordIndex {
  contractVersion: typeof ASK_RECORD_INDEX_CONTRACT_VERSION;
  propertyId: string;
  generatedAt: string;
  accessRole: HouseholdRole;
  operatingMode: AskOperatingMode;
  property: { name: string | null; address: string; city: string; state: string } | null;
  completeness: { state: 'AVAILABLE' | 'UNAVAILABLE'; percent: number | null; pendingDetails: number | null };
  /** True when any section could not be read because its provider failed. Sections that are simply not connected do not set it. */
  partial: boolean;
  sections: AskRecordIndexSection[];
}

type Overview = Awaited<ReturnType<typeof getPropertyRecordOverview>>;
/** Section totals read through the section's own paged collection reader; 'FAILED' means the reader threw. */
export type AskRecordCollectionTotals = Partial<Record<AskRecordSectionId, { total: number; freshAsOf: string | null } | 'FAILED'>>;

const COLLECTION_COUNT_NOUNS: Partial<Record<AskRecordSectionId, [string, string]>> = {
  timeline: ['event', 'events'],
  'maintenance-history': ['completed task', 'completed tasks'],
  inspections: ['report', 'reports'],
  permits: ['permit', 'permits'],
  coverage: ['policy', 'policies'],
  'projects-renovations': ['project', 'projects'],
  'incidents-claims': ['incident or claim', 'incidents and claims'],
};

type SectionRead = { count: number | null; countLabel: string | null; freshAsOf: Date | string | null | undefined; failed: boolean };

const plural = (count: number, singular: string, pluralForm = `${singular}s`) => (count === 1 ? singular : pluralForm);
const isoOrNull = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const newest = (values: Array<Date | string | null | undefined>): Date | null => {
  const times = values.filter((value): value is Date | string => Boolean(value)).map((value) => new Date(value)).filter((date) => !Number.isNaN(date.getTime()));
  return times.length ? new Date(Math.max(...times.map((date) => date.getTime()))) : null;
};

/** Reads the section's count from the canonical overview. Only sections with a connected collection reader appear here. */
function readOverviewSection(id: AskRecordSectionId, overview: Overview | null): SectionRead {
  const failed: SectionRead = { count: null, countLabel: null, freshAsOf: null, failed: true };
  if (!overview) return failed;
  const { sections, context } = overview;
  switch (id) {
    case 'property-facts':
      return context.status === 'AVAILABLE'
        ? { count: context.knownFactCount, countLabel: plural(context.knownFactCount, 'known fact'), freshAsOf: null, failed: false }
        : failed;
    case 'rooms':
      return sections.rooms.status === 'AVAILABLE'
        ? { count: sections.rooms.data.count, countLabel: plural(sections.rooms.data.count, 'room'), freshAsOf: newest(sections.rooms.data.items.map((room) => room.updatedAt)), failed: false }
        : failed;
    case 'inventory':
      return sections.inventory.status === 'AVAILABLE'
        ? { count: sections.inventory.data.totalCount, countLabel: plural(sections.inventory.data.totalCount, 'item'), freshAsOf: newest(sections.inventory.data.items.map((item) => item.updatedAt)), failed: false }
        : failed;
    case 'documents':
      return sections.documents.status === 'AVAILABLE'
        ? { count: sections.documents.data.totalCount, countLabel: plural(sections.documents.data.totalCount, 'document'), freshAsOf: sections.documents.data.latest?.addedAt ?? null, failed: false }
        : failed;
    case 'warranties':
      return sections.warranties.status === 'AVAILABLE'
        ? { count: sections.warranties.data.totalCount, countLabel: plural(sections.warranties.data.totalCount, 'warranty', 'warranties'), freshAsOf: null, failed: false }
        : failed;
    case 'household-access':
      return sections.household.status === 'AVAILABLE'
        ? { count: sections.household.data.totalCount, countLabel: plural(sections.household.data.totalCount, 'member'), freshAsOf: null, failed: false }
        : failed;
    default:
      return failed;
  }
}

function buildSection(
  definition: AskRecordSectionDefinition,
  input: { accessRole: HouseholdRole; operatingMode: AskOperatingMode; overview: Overview | null; collectionTotals?: AskRecordCollectionTotals },
): AskRecordIndexSection {
  const base = { id: definition.id, label: definition.label, scope: definition.scope, freshnessSource: definition.freshnessSource, pagedCollection: false };
  const withheld = { count: null, countLabel: null, freshAsOf: null, primaryAction: null };
  const applicability = evaluateRecordSectionApplicability(definition, { householdRole: input.accessRole, operatingMode: input.operatingMode });
  if (applicability === 'RESTRICTED') return { ...base, ...withheld, state: 'RESTRICTED', reasonCode: 'ROLE_FLOOR' };
  if (applicability === 'NOT_APPLICABLE') return { ...base, ...withheld, state: 'NOT_APPLICABLE', reasonCode: 'LIFECYCLE_INAPPLICABLE' };
  if (applicability === 'CONTEXT_REQUIRED') return { ...base, ...withheld, state: 'UNAVAILABLE', reasonCode: 'LIFECYCLE_CONTEXT_REQUIRED' };

  // The action is an Ask question that already runs through the section's own operations, so it stays available when only the
  // index-level count is missing.
  const primaryAction = { ...definition.primaryAction };
  if (definition.collectionReader === null) {
    return { ...base, count: null, countLabel: null, freshAsOf: null, primaryAction, state: 'UNAVAILABLE', reasonCode: 'READER_NOT_CONNECTED' };
  }
  if (definition.collectionReader === 'PAGED_COLLECTION') {
    const totals = input.collectionTotals?.[definition.id];
    if (totals === undefined) return { ...base, count: null, countLabel: null, freshAsOf: null, primaryAction, state: 'UNAVAILABLE', reasonCode: 'READER_NOT_CONNECTED' };
    if (totals === 'FAILED') return { ...base, count: null, countLabel: null, freshAsOf: null, primaryAction, state: 'UNAVAILABLE', reasonCode: 'PROVIDER_FAILED' };
    const noun = COLLECTION_COUNT_NOUNS[definition.id] ?? ['record', 'records'];
    return { ...base, pagedCollection: definition.pagedCollection, count: totals.total, countLabel: totals.total === 1 ? noun[0] : noun[1], freshAsOf: totals.freshAsOf, primaryAction, state: 'AVAILABLE', reasonCode: null };
  }
  const read = readOverviewSection(definition.id, input.overview);
  if (read.failed) return { ...base, count: null, countLabel: null, freshAsOf: null, primaryAction, state: 'UNAVAILABLE', reasonCode: 'PROVIDER_FAILED' };
  return { ...base, pagedCollection: definition.pagedCollection, count: read.count, countLabel: read.countLabel, freshAsOf: isoOrNull(read.freshAsOf), primaryAction, state: 'AVAILABLE', reasonCode: null };
}

/**
 * Pure composition of the index so role, lifecycle, and partial-provider behavior are testable without a database. Every registered
 * section is always present; a section that cannot be read reports why instead of disappearing.
 */
export function composeAskRecordIndex(input: {
  propertyId: string;
  accessRole: HouseholdRole;
  operatingMode: AskOperatingMode;
  overview: Overview | null;
  property: AskRecordIndex['property'];
  collectionTotals?: AskRecordCollectionTotals;
  generatedAt?: string;
  registry?: readonly AskRecordSectionDefinition[];
}): AskRecordIndex {
  const sections = (input.registry ?? ASK_RECORD_SECTION_REGISTRY).map((definition) => buildSection(definition, input));
  const context = input.overview?.context;
  const completeness = context?.status === 'AVAILABLE'
    ? {
      state: 'AVAILABLE' as const,
      percent: context.completeness.completenessPercent,
      pendingDetails: context.completeness.scopes.reduce((sum, scope) => sum + scope.missingFactKeys.length + scope.conflictedFactKeys.length + scope.staleFactKeys.length, 0),
    }
    : { state: 'UNAVAILABLE' as const, percent: null, pendingDetails: null };
  return {
    contractVersion: ASK_RECORD_INDEX_CONTRACT_VERSION,
    propertyId: input.propertyId,
    generatedAt: input.generatedAt ?? input.overview?.generatedAt ?? new Date().toISOString(),
    accessRole: input.accessRole,
    operatingMode: input.operatingMode,
    property: input.property,
    completeness,
    partial: sections.some((entry) => entry.reasonCode === 'PROVIDER_FAILED'),
    sections,
  };
}

export async function getAskRecordIndex(userId: string, propertyId: string, accountRole?: AskAccountRole): Promise<AskRecordIndex> {
  await ensureAskServiceAccountEligibility(userId, accountRole);
  const access = await ensurePropertyAccess(userId, propertyId);
  const [overview, operatingMode, property] = await Promise.all([
    getPropertyRecordOverview(propertyId, userId, 'ASK').catch((error) => {
      logger.warn({ err: error, propertyId, userId }, 'Record index overview failed closed');
      return null;
    }),
    loadOperatingMode(userId, propertyId),
    prisma.property.findUnique({ where: { id: propertyId }, select: { name: true, address: true, city: true, state: true } }).catch(() => null),
  ]);
  // Sections whose count comes from their own paged reader: only the applicable ones are read, each failing on its own.
  const collectionTotals: AskRecordCollectionTotals = {};
  await Promise.all(ASK_RECORD_SECTION_REGISTRY
    .filter((definition) => definition.collectionReader === 'PAGED_COLLECTION'
      && evaluateRecordSectionApplicability(definition, { householdRole: access.role, operatingMode }) === 'APPLICABLE')
    .map(async (definition) => {
      const reader = ASK_RECORD_COLLECTION_READERS[definition.id];
      try {
        const page = reader ? await reader({ propertyId, userId, role: access.role }, { limit: 1 }) : null;
        collectionTotals[definition.id] = page ? { total: page.total, freshAsOf: page.freshAsOf } : 'FAILED';
      } catch (error) {
        logger.warn({ err: error, propertyId, userId, sectionId: definition.id }, 'Record index section count failed closed');
        collectionTotals[definition.id] = 'FAILED';
      }
    }));
  return composeAskRecordIndex({ propertyId, accessRole: access.role, operatingMode, overview, property, collectionTotals });
}
