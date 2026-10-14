// The repair check for project document links (owner ruling D-P1; docs/architecture/PROJECT_TRACKER_DOCUMENT_STORE_DESIGN.md §7).
//
// A project's stored Home Record id (and, for evidence, its bound version) is the durable reference; a PropertyRecordLink is its projection for deletion
// impact. Writers keep the two together in one transaction, but ids written before links existed, or by anything that bypassed the helper, can drift.
// `findProjectDocumentLinkProblems` is read only and names exactly what drifted; `repairProjectDocumentLinks` makes the projection match the stored
// reference, never the other way round, and a legacy id (which has no Home Record to link) is left alone. A dry run changes nothing.
import { prisma } from '../lib/prisma';
import type { ProjectLinkEntity, ProjectLinkPurpose } from './projectDocumentLinks';

export type LinkProblemKind = 'MISSING_LINK' | 'VERSION_MISMATCH' | 'ORPHAN_LINK' | 'EVIDENCE_VERSION_UNBOUND';

export interface LinkProblem {
  kind: LinkProblemKind;
  entityType: ProjectLinkEntity;
  entityId: string;
  purpose: ProjectLinkPurpose;
  recordId: string;
  /** What the stored reference says the link should bind (null: the record's current version at repair time). */
  expectedVersionId: string | null;
  actualVersionId: string | null;
  linkId: string | null;
}

interface Expected { entityType: ProjectLinkEntity; entityId: string; purpose: ProjectLinkPurpose; recordId: string; boundVersionId: string | null | undefined; immutable: boolean }
const ENTITY_TYPES: ProjectLinkEntity[] = ['PROJECT', 'PROJECT_PAYMENT', 'PROJECT_CHANGE_ORDER', 'PROJECT_PROGRESS_LOG', 'PROJECT_ISSUE', 'PROJECT_ISSUE_NOTE'];

const versionMap = (value: unknown): Record<string, string | null> => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, string | null> : {});

async function collectExpected(filter: { propertyId?: string; projectId?: string }): Promise<Expected[]> {
  const projectWhere = { ...(filter.propertyId ? { propertyId: filter.propertyId } : {}), ...(filter.projectId ? { id: filter.projectId } : {}) };
  const childWhere = { project: projectWhere };
  const [projects, payments, orders, logs, issues, notes] = await Promise.all([
    prisma.projectRecord.findMany({ where: projectWhere, select: { id: true, contractDocumentIds: true } }),
    prisma.projectPayment.findMany({ where: { ...childWhere, receiptDocumentId: { not: null } }, select: { id: true, receiptDocumentId: true } }),
    prisma.projectChangeOrder.findMany({ where: childWhere, select: { id: true, supportingDocumentId: true, complianceEvidenceDocumentIds: true, complianceEvidenceVersionIds: true } }),
    prisma.projectProgressLog.findMany({ where: { ...childWhere, photoDocumentIds: { isEmpty: false } }, select: { id: true, photoDocumentIds: true } }),
    prisma.projectIssue.findMany({ where: { ...childWhere, evidenceDocumentIds: { isEmpty: false } }, select: { id: true, evidenceDocumentIds: true, evidenceVersionIds: true } }),
    prisma.projectIssueNote.findMany({ where: { ...childWhere, evidenceDocumentIds: { isEmpty: false } }, select: { id: true, evidenceDocumentIds: true, evidenceVersionIds: true } }),
  ]);
  const out: Expected[] = [];
  const add = (entityType: ProjectLinkEntity, entityId: string, purpose: ProjectLinkPurpose, ids: string[], versions: Record<string, string | null> | null, immutable: boolean) => {
    for (const recordId of ids) out.push({ entityType, entityId, purpose, recordId, boundVersionId: versions && recordId in versions ? versions[recordId] : undefined, immutable });
  };
  for (const row of projects) add('PROJECT', row.id, 'SOURCE', row.contractDocumentIds, null, false);
  for (const row of payments) add('PROJECT_PAYMENT', row.id, 'RECEIPT', row.receiptDocumentId ? [row.receiptDocumentId] : [], null, false);
  for (const row of orders) {
    add('PROJECT_CHANGE_ORDER', row.id, 'ATTACHMENT', row.supportingDocumentId ? [row.supportingDocumentId] : [], null, false);
    add('PROJECT_CHANGE_ORDER', row.id, 'EVIDENCE', row.complianceEvidenceDocumentIds, versionMap(row.complianceEvidenceVersionIds), true);
  }
  for (const row of logs) add('PROJECT_PROGRESS_LOG', row.id, 'ATTACHMENT', row.photoDocumentIds, null, false);
  for (const row of issues) add('PROJECT_ISSUE', row.id, 'EVIDENCE', row.evidenceDocumentIds, versionMap(row.evidenceVersionIds), true);
  for (const row of notes) add('PROJECT_ISSUE_NOTE', row.id, 'EVIDENCE', row.evidenceDocumentIds, versionMap(row.evidenceVersionIds), true);
  return out;
}

/** Read only. Legacy ids are not problems (there is no record to link); only ids that are Home Records are checked. */
export async function findProjectDocumentLinkProblems(filter: { propertyId?: string; projectId?: string } = {}): Promise<LinkProblem[]> {
  const expected = await collectExpected(filter);
  const recordIds = [...new Set(expected.map((item) => item.recordId))];
  const records = recordIds.length
    ? await prisma.propertyRecord.findMany({ where: { id: { in: recordIds } }, select: { id: true, currentVersionId: true } })
    : [];
  const recordById = new Map(records.map((row) => [row.id, row]));
  const entityIds = [...new Set(expected.map((item) => item.entityId))];
  // All project-entity links of the property (or the system), so a link whose stored reference was removed is found as an orphan. With a single project
  // named only its collected entities can be judged.
  const links = await prisma.propertyRecordLink.findMany({
    where: {
      entityType: { in: ENTITY_TYPES },
      ...(filter.propertyId ? { record: { propertyId: filter.propertyId } } : {}),
      ...(filter.projectId ? { entityId: { in: entityIds } } : {}),
    },
    select: { id: true, recordId: true, versionId: true, entityType: true, entityId: true, purpose: true },
  });
  const key = (type: string, id: string, purpose: string, recordId: string) => `${type}:${id}:${purpose}:${recordId}`;
  const linkByKey = new Map(links.map((link) => [key(link.entityType, link.entityId, link.purpose, link.recordId), link]));
  const problems: LinkProblem[] = [];
  const expectedKeys = new Set<string>();
  for (const item of expected) {
    if (!recordById.has(item.recordId)) continue; // a legacy id, or a record that no longer exists: nothing to project
    const k = key(item.entityType, item.entityId, item.purpose, item.recordId);
    expectedKeys.add(k);
    const link = linkByKey.get(k);
    const base = { entityType: item.entityType, entityId: item.entityId, purpose: item.purpose, recordId: item.recordId };
    if (!link) {
      problems.push({ ...base, kind: 'MISSING_LINK', expectedVersionId: item.boundVersionId ?? null, actualVersionId: null, linkId: null });
      continue;
    }
    if (item.immutable && item.boundVersionId === undefined) {
      problems.push({ ...base, kind: 'EVIDENCE_VERSION_UNBOUND', expectedVersionId: link.versionId, actualVersionId: link.versionId, linkId: link.id });
    } else if (item.immutable && item.boundVersionId !== undefined && item.boundVersionId !== link.versionId) {
      problems.push({ ...base, kind: 'VERSION_MISMATCH', expectedVersionId: item.boundVersionId, actualVersionId: link.versionId, linkId: link.id });
    }
  }
  for (const link of links) {
    if (expectedKeys.has(key(link.entityType, link.entityId, link.purpose, link.recordId))) continue;
    problems.push({
      kind: 'ORPHAN_LINK', entityType: link.entityType as ProjectLinkEntity, entityId: link.entityId, purpose: link.purpose as ProjectLinkPurpose,
      recordId: link.recordId, expectedVersionId: null, actualVersionId: link.versionId, linkId: link.id,
    });
  }
  return problems;
}

export interface LinkRepairSummary { created: number; versionsFixed: number; orphansRemoved: number; evidenceVersionsBound: number }

/**
 * Makes the projection match the stored reference. Missing links are created (at the bound version, or the record's current version); a mismatched link
 * is moved to the version the entity bound; an orphan link is removed. Evidence written before versions were stored is bound to the version its link
 * has, or the current one, and that is recorded on the entity (it is the earliest version this system can show it was bound to). Idempotent.
 */
export async function repairProjectDocumentLinks(options: { apply: boolean; propertyId?: string; projectId?: string; actorUserId?: string } = { apply: false }): Promise<{ problems: LinkProblem[]; summary: LinkRepairSummary }> {
  const problems = await findProjectDocumentLinkProblems({ propertyId: options.propertyId, projectId: options.projectId });
  const summary: LinkRepairSummary = { created: 0, versionsFixed: 0, orphansRemoved: 0, evidenceVersionsBound: 0 };
  if (!options.apply) return { problems, summary };
  const actor = options.actorUserId ?? 'project-document-link-repair';
  const records = await prisma.propertyRecord.findMany({ where: { id: { in: [...new Set(problems.map((problem) => problem.recordId))] } }, select: { id: true, currentVersionId: true } });
  const currentVersion = new Map(records.map((row) => [row.id, row.currentVersionId ?? null]));
  for (const problem of problems) {
    if (problem.kind === 'ORPHAN_LINK') {
      await prisma.propertyRecordLink.delete({ where: { id: problem.linkId as string } });
      summary.orphansRemoved += 1;
    } else if (problem.kind === 'MISSING_LINK') {
      await prisma.propertyRecordLink.create({
        data: {
          recordId: problem.recordId, versionId: problem.expectedVersionId ?? currentVersion.get(problem.recordId) ?? null, entityType: problem.entityType,
          entityId: problem.entityId, purpose: problem.purpose, createdByUserId: actor, label: 'Project document (repaired link)',
        },
      });
      summary.created += 1;
    } else if (problem.kind === 'VERSION_MISMATCH') {
      await prisma.propertyRecordLink.update({ where: { id: problem.linkId as string }, data: { versionId: problem.expectedVersionId } });
      summary.versionsFixed += 1;
    } else if (problem.kind === 'EVIDENCE_VERSION_UNBOUND') {
      await bindEvidenceVersion(problem);
      summary.evidenceVersionsBound += 1;
    }
  }
  // A link created for evidence whose version map has no entry gets the entry now, so the stored reference and the projection agree.
  for (const problem of problems.filter((item) => item.kind === 'MISSING_LINK' && item.purpose === 'EVIDENCE')) {
    await bindEvidenceVersion({ ...problem, expectedVersionId: problem.expectedVersionId ?? currentVersion.get(problem.recordId) ?? null });
  }
  return { problems, summary };
}

async function bindEvidenceVersion(problem: LinkProblem): Promise<void> {
  const add = (current: unknown) => ({ ...versionMap(current), [problem.recordId]: problem.expectedVersionId });
  if (problem.entityType === 'PROJECT_ISSUE') {
    const row = await prisma.projectIssue.findUnique({ where: { id: problem.entityId }, select: { evidenceVersionIds: true } });
    if (row) await prisma.projectIssue.update({ where: { id: problem.entityId }, data: { evidenceVersionIds: add(row.evidenceVersionIds) } });
  } else if (problem.entityType === 'PROJECT_ISSUE_NOTE') {
    const row = await prisma.projectIssueNote.findUnique({ where: { id: problem.entityId }, select: { evidenceVersionIds: true } });
    if (row) await prisma.projectIssueNote.update({ where: { id: problem.entityId }, data: { evidenceVersionIds: add(row.evidenceVersionIds) } });
  } else if (problem.entityType === 'PROJECT_CHANGE_ORDER') {
    const row = await prisma.projectChangeOrder.findUnique({ where: { id: problem.entityId }, select: { complianceEvidenceVersionIds: true } });
    if (row) await prisma.projectChangeOrder.update({ where: { id: problem.entityId }, data: { complianceEvidenceVersionIds: add(row.complianceEvidenceVersionIds) } });
  }
}
