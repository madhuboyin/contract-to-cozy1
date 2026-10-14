// Documents a Project (or one of its payments, change orders, logs, issues and notes) may cite: Home Records only (owner rulings D-P1 to D-P8;
// docs/architecture/PROJECT_TRACKER_DOCUMENT_STORE_DESIGN.md). One rule for the desktop and Ask, enforced by the service:
//   - the same property,
//   - active (not archived, not trashed),
//   - visible to the whole household (a project is shared),
//   - a current version with a clean scan,
//   - any record type; the sensitivity label is returned for display and is never a filter.
// A legacy `Document` id is accepted only when the caller names it as already stored on that exact record (`transitionalLegacyIds`), is in the same
// property, and is never returned by the options list: no new write reproduces a legacy reference.
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';

export interface ProjectDocumentRef {
  id: string;
  source: 'HOME_RECORD' | 'LEGACY_DOCUMENT';
  title: string;
  recordType: string | null;
  sensitivity: string | null;
  /** The exact version a citation binds to (Home Records only). */
  versionId: string | null;
  mimeType: string | null;
}

const eligibleWhere = (propertyId: string) => ({
  propertyId,
  lifecycleStatus: 'ACTIVE' as const,
  visibility: 'HOUSEHOLD' as const,
  currentVersion: { is: { scanStatus: 'CLEAN' as const } },
});

/** What a person may choose, newest first. Legacy documents are never offered. */
export async function listProjectDocumentOptions(propertyId: string, take = 25): Promise<ProjectDocumentRef[]> {
  const rows = await prisma.propertyRecord.findMany({
    where: eligibleWhere(propertyId),
    orderBy: { updatedAt: 'desc' },
    take,
    select: { id: true, title: true, recordType: true, sensitivity: true, currentVersionId: true, currentVersion: { select: { mimeType: true } } },
  });
  return rows.map((row) => ({
    id: row.id, source: 'HOME_RECORD' as const, title: row.title, recordType: row.recordType, sensitivity: row.sensitivity,
    versionId: row.currentVersionId ?? null, mimeType: row.currentVersion?.mimeType ?? null,
  }));
}

export interface ProjectDocumentResolution {
  /** In the order requested, only the ones that resolved. */
  documents: ProjectDocumentRef[];
  /** Requested ids that are not eligible: missing, another property, not household-visible, archived, trashed or not clean. */
  unavailable: string[];
}

export async function resolveProjectDocuments(
  propertyId: string,
  ids: readonly (string | null | undefined)[],
  options: { transitionalLegacyIds?: readonly string[] } = {},
): Promise<ProjectDocumentResolution> {
  const requested = [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))];
  if (!requested.length) return { documents: [], unavailable: [] };
  const records = await prisma.propertyRecord.findMany({
    where: { ...eligibleWhere(propertyId), id: { in: requested } },
    select: { id: true, title: true, recordType: true, sensitivity: true, currentVersionId: true, currentVersion: { select: { mimeType: true } } },
  });
  const found = new Map<string, ProjectDocumentRef>(records.map((row) => [row.id, {
    id: row.id, source: 'HOME_RECORD', title: row.title, recordType: row.recordType, sensitivity: row.sensitivity,
    versionId: row.currentVersionId ?? null, mimeType: row.currentVersion?.mimeType ?? null,
  }]));
  const legacyAllowed = requested.filter((id) => !found.has(id) && (options.transitionalLegacyIds ?? []).includes(id));
  if (legacyAllowed.length) {
    const legacy = await prisma.document.findMany({ where: { id: { in: legacyAllowed }, propertyId, deletedAt: null }, select: { id: true, name: true, mimeType: true } });
    for (const row of legacy) {
      found.set(row.id, { id: row.id, source: 'LEGACY_DOCUMENT', title: row.name, recordType: null, sensitivity: null, versionId: null, mimeType: row.mimeType });
    }
  }
  return {
    documents: requested.flatMap((id) => (found.has(id) ? [found.get(id)!] : [])),
    unavailable: requested.filter((id) => !found.has(id)),
  };
}

/** Throws the caller's error unless every id is eligible; returns the resolved documents in request order. */
export async function assertProjectDocuments(
  propertyId: string,
  ids: readonly (string | null | undefined)[],
  failure: { message: string; status?: number; code: string },
  options: { transitionalLegacyIds?: readonly string[] } = {},
): Promise<ProjectDocumentRef[]> {
  const result = await resolveProjectDocuments(propertyId, ids, options);
  if (result.unavailable.length) {
    throw new APIError(failure.message, failure.status ?? 400, failure.code, { unavailable: result.unavailable });
  }
  return result.documents;
}
