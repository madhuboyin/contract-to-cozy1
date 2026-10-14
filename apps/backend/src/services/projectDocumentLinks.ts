// The deletion-impact projection of a project's document references (owner ruling D-P1; docs/architecture/PROJECT_TRACKER_DOCUMENT_STORE_DESIGN.md §7).
//
// The workflow's durable reference is the Home Record id (and, for evidence, the version it was bound to) stored on the project's own row. A
// PropertyRecordLink is the projection that lets a record's deletion impact list the project, payment, change order, log, issue or note that cites it.
// Both are written in one database transaction by the caller; this helper only maintains the links, on the caller's client, and returns the version each
// document is bound to so the caller can store it with the id.
//
// Two rules decided per use (the link's uniqueness has no versionId, so a newer version for the same entity and purpose cannot coexist):
//   REPLACE              the current document: a contract, a receipt, an attachment. Choosing another record removes the old link; the same record's link is
//                        moved to the version it was chosen at.
//   KEEP_BOUND_VERSION   historical evidence (issue and note evidence, change-order compliance evidence). A record already cited keeps the version it was
//                        bound to; only new records are added; records no longer listed are removed. Each note or issue is its own entity, so the same record
//                        cited by a later note is bound to its own version there.
export type ProjectLinkEntity = 'PROJECT' | 'PROJECT_PAYMENT' | 'PROJECT_CHANGE_ORDER' | 'PROJECT_PROGRESS_LOG' | 'PROJECT_ISSUE' | 'PROJECT_ISSUE_NOTE';
export type ProjectLinkPurpose = 'SOURCE' | 'RECEIPT' | 'ATTACHMENT' | 'EVIDENCE';
export type ProjectLinkMode = 'REPLACE' | 'KEEP_BOUND_VERSION';

export async function syncProjectDocumentLinks(
  tx: any,
  input: {
    entityType: ProjectLinkEntity;
    entityId: string;
    purpose: ProjectLinkPurpose;
    userId: string;
    mode: ProjectLinkMode;
    label?: string;
    /** The Home Records now cited. A legacy document has no record to link and is not passed. */
    documents: Array<{ id: string; versionId: string | null }>;
    /** Versions already bound on the entity (evidence), so a re-listed record keeps its binding even if its link was lost. */
    boundVersions?: Record<string, string | null> | null;
  },
): Promise<Record<string, string | null>> {
  const existing = await tx.propertyRecordLink.findMany({
    where: { entityType: input.entityType, entityId: input.entityId, purpose: input.purpose },
    select: { id: true, recordId: true, versionId: true },
  }) as Array<{ id: string; recordId: string; versionId: string | null }>;
  const wanted = new Set(input.documents.map((document) => document.id));
  const stale = existing.filter((link) => !wanted.has(link.recordId)).map((link) => link.id);
  if (stale.length) await tx.propertyRecordLink.deleteMany({ where: { id: { in: stale } } });

  const bound: Record<string, string | null> = {};
  for (const document of input.documents) {
    const current = existing.find((link) => link.recordId === document.id);
    // Evidence keeps the version it was bound to: from the entity's own stored binding first, then from an existing link; only a record cited for the
    // first time is bound to the version it was chosen at. A replaceable reference always takes the version it was chosen at.
    const alreadyBound = input.boundVersions && document.id in input.boundVersions ? input.boundVersions[document.id] : current ? current.versionId : undefined;
    const versionId = input.mode === 'KEEP_BOUND_VERSION' && alreadyBound !== undefined ? alreadyBound : document.versionId;
    bound[document.id] = versionId;
    if (!current) {
      await tx.propertyRecordLink.create({
        data: {
          recordId: document.id, versionId, entityType: input.entityType, entityId: input.entityId, purpose: input.purpose,
          label: input.label ?? null, createdByUserId: input.userId,
        },
      });
    } else if (input.mode === 'REPLACE' && current.versionId !== versionId) {
      await tx.propertyRecordLink.update({ where: { id: current.id }, data: { versionId } });
    }
  }
  return bound;
}
