import type { HouseholdRole } from '@prisma/client';
import {
  defaultPackSectionsForType,
  isReportPackSectionId,
  REPORT_PACK_SECTION_IDS,
  type ReportPackSectionId,
  type ReportPackSelection,
} from '../planningContext/reportPackSections';
import { ASK_RECORD_SECTION_REGISTRY, recordSectionRoleFloor, type AskRecordSectionDefinition } from './governance/askRecordSectionRegistry';

const ROLE_RANK: Record<HouseholdRole, number> = { VIEWER: 0, CONTRIBUTOR: 1, OWNER: 2 };
const MAX_REQUESTED = 24;

export class InvalidExportSelectionError extends Error {
  code = 'EXPORT_SELECTION_INVALID';
  constructor(message: string, public readonly unavailable: ReportPackSelection['unavailable'] = []) {
    super(message);
  }
}

/**
 * Validates an export request's section choice against the Record section registry and returns the selection that is stored with the
 * export. An id the registry does not know is rejected. A registered section the pack cannot carry, or that the caller's role may not
 * read, is not an error: it is recorded as unavailable with its reason so the receipt can disclose it. A request that leaves nothing to
 * export is rejected. With no choice, the export `type` decides, as it always named a narrower pack.
 */
export function normalizeAskRecordExportRequest(input: {
  sections: unknown;
  type?: string | null;
  role: HouseholdRole;
  registry?: readonly AskRecordSectionDefinition[];
}): ReportPackSelection {
  const registry = input.registry ?? ASK_RECORD_SECTION_REGISTRY;
  if (input.sections === undefined || input.sections === null) {
    const included = defaultPackSectionsForType(input.type);
    return { version: 1, requested: [...included], included, unavailable: [] };
  }
  const list = Array.isArray(input.sections)
    ? input.sections
    : (input.sections && typeof input.sections === 'object' && Array.isArray((input.sections as { include?: unknown }).include) ? (input.sections as { include: unknown[] }).include : null);
  if (!list) throw new InvalidExportSelectionError('sections must be a list of section ids, or an object with an include list.');
  if (list.length > MAX_REQUESTED) throw new InvalidExportSelectionError(`At most ${MAX_REQUESTED} sections can be requested.`);
  if (list.some((value) => typeof value !== 'string' || !value.trim() || value.length > 40)) throw new InvalidExportSelectionError('Every section id must be a short, non-empty string.');

  const requested = [...new Set((list as string[]).map((value) => value.trim()))];
  const known = new Map(registry.map((definition) => [definition.id as string, definition]));
  const unknown = requested.filter((id) => !known.has(id));
  if (unknown.length) throw new InvalidExportSelectionError(`Unknown section: ${unknown.join(', ')}.`);

  const included: ReportPackSectionId[] = [];
  const unavailable: ReportPackSelection['unavailable'] = [];
  for (const id of requested) {
    const definition = known.get(id)!;
    const floor = recordSectionRoleFloor(definition);
    if (definition.exportEligibility.state !== 'IN_PACK' || !isReportPackSectionId(id)) unavailable.push({ id, reason: 'NOT_IN_PACK' });
    else if (floor && ROLE_RANK[input.role] < ROLE_RANK[floor]) unavailable.push({ id, reason: 'RESTRICTED' });
    else included.push(id);
  }
  if (!included.length) throw new InvalidExportSelectionError('None of the requested sections can be exported.', unavailable);
  return { version: 1, requested, included: REPORT_PACK_SECTION_IDS.filter((id) => included.includes(id)), unavailable };
}
