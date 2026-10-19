import { z } from 'zod';
import type { HouseholdRole } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import type { AskAccountRole } from './askAccountEligibility';
import { loadOperatingMode } from './askRecordContext';
import type { AskOperatingMode } from '../skills/context/propertyJourneyContext.contract';
import { authorizeAskWork } from './askWork.service';
import {
  ASK_ARTIFACT_FRESHNESS_STATES, ASK_ARTIFACT_TYPE_REGISTRY, evaluateArtifactTypeApplicability, validateAskArtifactTypeRegistry,
  type AskArtifactFreshness, type AskArtifactTypeDefinition, type AskArtifactTypeId,
} from './governance/askArtifactTypeRegistry';
import {
  ASK_SAVED_CONTRACT_VERSION, ASK_SAVED_DEFAULT_LIMIT, ASK_SAVED_MAX_LIMIT, compareSavedArtifacts,
  type AskSavedArtifact, type AskSavedPage, type AskSavedResolution, type AskSavedTypeReader, type AskSavedTypeState, type AskSavedTypeStatus,
} from './askSaved.contract';
import { ASK_SAVED_TYPE_READERS } from './saved/savedTypeReaders';

export class AskSavedInvalidRequestError extends Error {
  code = 'ASK_INVALID_REQUEST';
}

export interface AskSavedQuery {
  cursor?: string | null;
  limit?: number | null;
  search?: string | null;
  artifactType?: string | null;
  freshness?: string | null;
  archived?: boolean | null;
}

interface ParsedSavedQuery {
  after: { sortAt: string; artifactKey: string } | null;
  limit: number;
  search: string | null;
  artifactType: AskArtifactTypeId | null;
  freshness: AskArtifactFreshness | null;
  archived: boolean;
}

const CursorSchema = z.object({ a: z.boolean(), t: z.string().min(1).max(40), k: z.string().min(1).max(300) });

export const encodeSavedCursor = (archived: boolean, boundary: { sortAt: string; artifactKey: string }): string =>
  Buffer.from(JSON.stringify({ a: archived, t: boundary.sortAt, k: boundary.artifactKey }), 'utf8').toString('base64url');

function parseSavedQuery(query: AskSavedQuery): ParsedSavedQuery {
  const archived = Boolean(query.archived);
  let after: ParsedSavedQuery['after'] = null;
  if (query.cursor) {
    try {
      const parsed = CursorSchema.parse(JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')));
      if (parsed.a !== archived) throw new Error('cursor archive mismatch');
      after = { sortAt: parsed.t, artifactKey: parsed.k };
    } catch {
      throw new AskSavedInvalidRequestError('cursor is not valid.');
    }
  }
  const limit = query.limit == null ? ASK_SAVED_DEFAULT_LIMIT : query.limit;
  if (!Number.isInteger(limit) || limit < 1) throw new AskSavedInvalidRequestError('limit must be a positive integer.');
  const search = query.search?.trim() || null;
  if (search && search.length > 80) throw new AskSavedInvalidRequestError('search is too long.');
  const artifactType = query.artifactType?.trim() || null;
  if (artifactType && !ASK_ARTIFACT_TYPE_REGISTRY.some((entry) => entry.id === artifactType)) throw new AskSavedInvalidRequestError('artifactType is not valid.');
  const freshness = query.freshness?.trim() || null;
  if (freshness && !(ASK_ARTIFACT_FRESHNESS_STATES as readonly string[]).includes(freshness)) throw new AskSavedInvalidRequestError('freshness is not valid.');
  return { after, limit: Math.min(limit, ASK_SAVED_MAX_LIMIT), search, artifactType: artifactType as AskArtifactTypeId | null, freshness: freshness as AskArtifactFreshness | null, archived };
}

export function validateAskSavedTypes(
  entries: readonly AskArtifactTypeDefinition[] = ASK_ARTIFACT_TYPE_REGISTRY,
  readers: Partial<Record<AskArtifactTypeId, AskSavedTypeReader>> = ASK_SAVED_TYPE_READERS,
): string[] {
  const issues = validateAskArtifactTypeRegistry(entries);
  for (const entry of entries) {
    if (entry.reader.state === 'CONNECTED' && !readers[entry.id]) issues.push(`${entry.id} is declared connected but has no registered Saved reader`);
    if (entry.reader.state === 'UNAVAILABLE' && readers[entry.id]) issues.push(`${entry.id} has a registered reader but is declared unavailable`);
  }
  return issues;
}

/** The canonical ids of each type that this person archived in Saved, from their own preference rows (no payload is stored). */
async function archivedByYouIds(userId: string, propertyId: string, registry: readonly AskArtifactTypeDefinition[]): Promise<Map<AskArtifactTypeId, string[]>> {
  const preferences = await prisma.askSavedArtifactPreference.findMany({ where: { userId, propertyId }, select: { artifactKey: true } });
  const byType = new Map<AskArtifactTypeId, string[]>();
  for (const preference of preferences) {
    const definition = registry.find((entry) => preference.artifactKey.startsWith(`${entry.keyPrefix}:`));
    if (!definition) continue;
    byType.set(definition.id, [...(byType.get(definition.id) ?? []), preference.artifactKey.slice(definition.keyPrefix.length + 1)]);
  }
  return byType;
}

const NOT_APPLICABLE_REASONS = {
  RESTRICTED: 'Your household role cannot see this kind of saved result.',
  NOT_APPLICABLE: 'This kind of saved result does not apply to this home right now.',
  CONTEXT_REQUIRED: 'More about this home is needed before this kind of saved result can be shown.',
} as const;

export function parseArtifactKey(artifactKey: string, registry: readonly AskArtifactTypeDefinition[] = ASK_ARTIFACT_TYPE_REGISTRY): { definition: AskArtifactTypeDefinition; entityId: string } | null {
  const definition = registry.find((entry) => artifactKey.startsWith(`${entry.keyPrefix}:`));
  const entityId = definition ? artifactKey.slice(definition.keyPrefix.length + 1) : '';
  return definition && entityId && entityId.length <= 160 ? { definition, entityId } : null;
}

/**
 * One page of Saved (FR-SAVED-002): browse, search, type and freshness filters, and the active or archived list. A type that is
 * restricted, not applicable or failing is reported with its state and makes the page partial; it is never omitted and never counted as
 * zero. Side-effect free.
 */
export async function composeAskSavedPage(
  input: { userId: string; propertyId: string; role: HouseholdRole; operatingMode: AskOperatingMode; now?: Date },
  parsed: ParsedSavedQuery,
  readers: Partial<Record<AskArtifactTypeId, AskSavedTypeReader>>,
  registry: readonly AskArtifactTypeDefinition[] = ASK_ARTIFACT_TYPE_REGISTRY,
  archivedIds: Map<AskArtifactTypeId, string[]> = new Map(),
): Promise<AskSavedPage> {
  const { userId, propertyId, role, operatingMode } = input;
  const now = input.now ?? new Date();
  const context = { userId, propertyId, role, operatingMode, now };
  const outcomes = await Promise.all(registry.filter((definition) => !parsed.artifactType || definition.id === parsed.artifactType).map(async (definition) => {
    const status = (state: AskSavedTypeState, reason: string | null, total: number | null = null, delivered = 0): AskSavedTypeStatus => ({ artifactType: definition.id, label: definition.label, state, reason, total, delivered });
    const none = (state: AskSavedTypeState, reason: string | null) => ({ definition, status: status(state, reason), rows: [] as AskSavedArtifact[], total: null as number | null, other: null as number | null });
    if (definition.reader.state === 'UNAVAILABLE') return none('UNAVAILABLE', definition.reader.reason);
    const applicability = evaluateArtifactTypeApplicability(definition, { householdRole: role, operatingMode });
    if (applicability !== 'APPLICABLE') return none(applicability, NOT_APPLICABLE_REASONS[applicability]);
    const reader = readers[definition.id];
    if (!reader) return none('UNAVAILABLE', 'No canonical reader is registered for this kind of saved result.');
    try {
      const result = await reader(context, {
        after: parsed.after, limit: parsed.limit + 1, search: parsed.search, freshness: parsed.freshness,
        archived: parsed.archived ? 'ARCHIVED' : 'ACTIVE', archivedByYouIds: archivedIds.get(definition.id) ?? [],
      });
      const rows = result.rows.filter((row) => row.propertyId === propertyId);
      return { definition, status: status('AVAILABLE', null, result.total, rows.length), rows, total: result.total, other: result.otherTotal };
    } catch (error) {
      logger.warn({ err: error, propertyId, artifactType: definition.id }, 'Ask Saved type failed');
      return none('FAILED', 'This kind of saved result could not be read right now.');
    }
  }));

  const ordered = outcomes.flatMap((outcome) => outcome.rows).sort(compareSavedArtifacts);
  const rows = ordered.slice(0, parsed.limit);
  const hasMore = ordered.length > parsed.limit;
  const last = rows[rows.length - 1];
  const statuses = outcomes.map((outcome) => outcome.status);
  const partial = statuses.some((entry) => entry.state !== 'AVAILABLE' && entry.state !== 'NOT_APPLICABLE');
  const complete = !partial && statuses.every((entry) => entry.state === 'NOT_APPLICABLE' || entry.total !== null);
  const sum = (pick: (outcome: (typeof outcomes)[number]) => number | null) => (complete ? outcomes.reduce((total, outcome) => total + (outcome.status.state === 'AVAILABLE' ? pick(outcome) ?? 0 : 0), 0) : null);
  const total = sum((outcome) => outcome.total);
  const other = sum((outcome) => outcome.other);
  const answered = new Set(statuses.filter((entry) => entry.state === 'AVAILABLE').map((entry) => entry.artifactType));
  return {
    contractVersion: ASK_SAVED_CONTRACT_VERSION,
    propertyId,
    generatedAt: now.toISOString(),
    archived: parsed.archived,
    total,
    totalScope: complete ? 'COMPLETE' : 'PARTIAL',
    partial,
    delivered: rows.length,
    nextCursor: hasMore && last ? encodeSavedCursor(parsed.archived, { sortAt: last.sortAt, artifactKey: last.artifactKey }) : null,
    truncated: hasMore,
    counts: { active: parsed.archived ? other : total, archived: parsed.archived ? total : other },
    sort: { key: 'sortAt', label: 'Most recent first' },
    query: { search: parsed.search, artifactType: parsed.artifactType, freshness: parsed.freshness },
    filterOptions: {
      types: registry.filter((definition) => answered.has(definition.id)).map((definition) => ({ value: definition.id, label: definition.label })),
      freshness: [{ value: 'CURRENT', label: 'Current' }, { value: 'STALE', label: 'Out of date' }, { value: 'EXPIRED', label: 'Expired' }, { value: 'SUPERSEDED', label: 'Replaced by a newer version' }],
    },
    types: statuses,
    rows,
  };
}

export async function getAskSavedPage(userId: string, propertyId: string, query: AskSavedQuery, accountRole?: AskAccountRole): Promise<AskSavedPage> {
  const parsed = parseSavedQuery(query);
  const { role } = await authorizeAskWork(userId, propertyId, accountRole);
  const operatingMode = await loadOperatingMode(userId, propertyId);
  return composeAskSavedPage({ userId, propertyId, role, operatingMode }, parsed, ASK_SAVED_TYPE_READERS, ASK_ARTIFACT_TYPE_REGISTRY, await archivedByYouIds(userId, propertyId, ASK_ARTIFACT_TYPE_REGISTRY));
}

/**
 * Opens one saved artifact (reopen across sessions): reauthorizes, applies the type's current read gate, and rereads the canonical
 * record. Losing the home or the role is ACCESS_LOST; a record that is gone is DELETED. A deleted or inaccessible source degrades to a
 * plain message and never to a stale copy, because no copy is kept.
 */
export async function resolveAskSavedArtifact(
  input: { userId: string; propertyId: string; role: HouseholdRole; operatingMode: AskOperatingMode; artifactKey: string; now?: Date },
  readers: Partial<Record<AskArtifactTypeId, AskSavedTypeReader>>,
  registry: readonly AskArtifactTypeDefinition[] = ASK_ARTIFACT_TYPE_REGISTRY,
  archivedIds: Map<AskArtifactTypeId, string[]> = new Map(),
): Promise<AskSavedResolution> {
  const base = { contractVersion: ASK_SAVED_CONTRACT_VERSION, propertyId: input.propertyId, artifactKey: input.artifactKey, artifact: null } as const;
  const parsed = parseArtifactKey(input.artifactKey, registry);
  if (!parsed) return { ...base, outcome: 'DELETED', message: 'This saved result could not be found.' };
  if (parsed.definition.reader.state === 'UNAVAILABLE') return { ...base, outcome: 'UNAVAILABLE', message: parsed.definition.reader.reason };
  const applicability = evaluateArtifactTypeApplicability(parsed.definition, { householdRole: input.role, operatingMode: input.operatingMode });
  if (applicability === 'RESTRICTED') return { ...base, outcome: 'ACCESS_LOST', message: 'Your household role can no longer open this.' };
  if (applicability !== 'APPLICABLE') return { ...base, outcome: 'UNAVAILABLE', message: 'This kind of saved result does not apply to this home right now.' };
  const reader = readers[parsed.definition.id];
  if (!reader) return { ...base, outcome: 'UNAVAILABLE', message: 'This kind of saved result cannot be opened right now.' };
  const result = await reader(
    { userId: input.userId, propertyId: input.propertyId, role: input.role, operatingMode: input.operatingMode, now: input.now ?? new Date() },
    { after: null, limit: 5, search: null, freshness: null, archived: 'ACTIVE', archivedByYouIds: archivedIds.get(parsed.definition.id) ?? [], entityId: parsed.entityId },
  );
  const artifact = result.rows.find((row) => row.artifactKey === input.artifactKey);
  return artifact ? { ...base, artifact, outcome: 'AVAILABLE', message: 'Ready to open.' } : { ...base, outcome: 'DELETED', message: 'This was removed, so there is nothing to open.' };
}

async function authorizeSaved(userId: string, propertyId: string, accountRole: AskAccountRole | undefined): Promise<{ role: HouseholdRole } | { accessLost: true }> {
  try {
    return { role: (await authorizeAskWork(userId, propertyId, accountRole)).role };
  } catch (error) {
    const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
    if (code === 'ASK_PROPERTY_NOT_FOUND' || code === 'ASK_PERMISSION_REQUIRED') return { accessLost: true };
    throw error;
  }
}

export async function resolveAskSavedArtifactForUser(userId: string, propertyId: string, artifactKey: string, accountRole?: AskAccountRole): Promise<AskSavedResolution> {
  if (!artifactKey || artifactKey.length > 320) throw new AskSavedInvalidRequestError('artifactKey is not valid.');
  const authorized = await authorizeSaved(userId, propertyId, accountRole);
  if ('accessLost' in authorized) return { contractVersion: ASK_SAVED_CONTRACT_VERSION, propertyId, artifactKey, outcome: 'ACCESS_LOST', artifact: null, message: 'You no longer have access to this home.' };
  const operatingMode = await loadOperatingMode(userId, propertyId);
  return resolveAskSavedArtifact({ userId, propertyId, role: authorized.role, operatingMode, artifactKey }, ASK_SAVED_TYPE_READERS, ASK_ARTIFACT_TYPE_REGISTRY, await archivedByYouIds(userId, propertyId, ASK_ARTIFACT_TYPE_REGISTRY));
}

/**
 * Archives or restores a saved artifact in this person's own Saved list (FR-SAVED-002). It writes one preference row and nothing else:
 * the canonical record, its retention and every other member's list are untouched. The artifact must open for the caller right now.
 */
export async function setAskSavedArchive(userId: string, propertyId: string, artifactKey: string, archived: boolean, accountRole?: AskAccountRole): Promise<AskSavedResolution> {
  const resolution = await resolveAskSavedArtifactForUser(userId, propertyId, artifactKey, accountRole);
  if (resolution.outcome !== 'AVAILABLE' || !resolution.artifact) return resolution;
  if (archived) {
    await prisma.askSavedArtifactPreference.upsert({ where: { userId_propertyId_artifactKey: { userId, propertyId, artifactKey } }, create: { userId, propertyId, artifactKey }, update: {} });
  } else {
    await prisma.askSavedArtifactPreference.deleteMany({ where: { userId, propertyId, artifactKey } });
  }
  return { ...resolution, artifact: { ...resolution.artifact, archived: { ...resolution.artifact.archived, byYou: archived } } };
}
