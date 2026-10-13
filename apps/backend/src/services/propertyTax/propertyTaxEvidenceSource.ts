// Which Home Records may back property tax appeal evidence (design docs/architecture/PROPERTY_TAX_EVIDENCE_AND_INTAKE_IN_ASK_DESIGN.md, owner ruling D-T2).
// Enforced by the service so the desktop and Ask cannot differ. The rule is about the record, not its sensitivity label: a legitimate tax notice, legal
// decision, appraisal, survey, photograph or inspection report may carry LEGAL, PERSONAL or another label, so the label is shown rather than filtered on.
//   - the same property, active (not archived, not trashed),
//   - visible to the whole household (the appeal workspace is shared, so owner-only and recipient-selected records are never offered),
//   - a current version with a clean scan,
//   - a record type that can support an appeal, or OTHER, which is offered under an explicit "Other supporting evidence" label.
import { prisma } from '../../lib/prisma';
import type { PropertyRecordType } from '@prisma/client';

export const EVIDENCE_RECORD_TYPES: readonly PropertyRecordType[] = [
  'TAX_DOCUMENT', 'DEED', 'SURVEY', 'INSPECTION_REPORT', 'PHOTO', 'PERMIT', 'DISCLOSURE', 'CLOSING_DOCUMENT', 'CONTRACT', 'INVOICE', 'RECEIPT', 'UTILITY', 'OTHER',
];
const MAX_OPTIONS = 50;

export interface EvidenceRecordOption { id: string; title: string; recordType: string; sensitivity: string; createdAt: Date; isOther: boolean }

const eligibleWhere = (propertyId: string) => ({
  propertyId, lifecycleStatus: 'ACTIVE' as const, visibility: 'HOUSEHOLD' as const,
  recordType: { in: [...EVIDENCE_RECORD_TYPES] }, currentVersion: { is: { scanStatus: 'CLEAN' as const } },
});

/** The records a person may pick as evidence, newest first, and how many active supported records were left out because they are not household-visible. */
export async function listEligibleEvidenceRecords(propertyId: string): Promise<{ options: EvidenceRecordOption[]; excludedPrivate: number }> {
  const [rows, excludedPrivate] = await Promise.all([
    prisma.propertyRecord.findMany({
      where: eligibleWhere(propertyId), orderBy: { createdAt: 'desc' }, take: MAX_OPTIONS,
      select: { id: true, title: true, recordType: true, sensitivity: true, createdAt: true },
    }),
    prisma.propertyRecord.count({
      where: { propertyId, lifecycleStatus: 'ACTIVE', visibility: { not: 'HOUSEHOLD' }, recordType: { in: [...EVIDENCE_RECORD_TYPES] } },
    }),
  ]);
  return { options: rows.map((row) => ({ ...row, isOther: row.recordType === 'OTHER' })), excludedPrivate };
}

/** Throws the caller's message unless the record is one that may back evidence for this property; returns the exact current version it was checked against. */
export async function assertEvidenceRecordEligible(propertyId: string, recordId: string, message = 'Supporting document is not eligible as appeal evidence'): Promise<string | null> {
  const found = await prisma.propertyRecord.findFirst({ where: { ...eligibleWhere(propertyId), id: recordId }, select: { id: true, currentVersionId: true } });
  if (!found) throw new Error(message);
  return found.currentVersionId ?? null;
}
