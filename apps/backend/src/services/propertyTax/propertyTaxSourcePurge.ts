// What happens to property tax records when their source Home Record is permanently deleted (owner ruling D-T5; design §3.3).
//
// Deleting a source does not undo the homeowner's confirmation: confirmed or corrected canonical values stay. They are marked "source removed" so they are
// no longer presented as document-backed high confidence. What the document itself held goes with it: the intake and its staged, unconfirmed values
// cascade with the record, as do the document links; the field-evidence, assessment, bill and appeal-evidence document references become null. Nothing is
// deleted here. Dependency-free on purpose: the purge worker calls it with its own client, inside the transaction that deletes the record, BEFORE the
// delete, because the references are nulled by it.
export interface PropertyTaxSourceRemovalSummary { fieldEvidence: number; assessments: number; bills: number; appealEvidence: number }

export async function removePropertyTaxSourceContent(db: any, recordId: string, now = new Date()): Promise<PropertyTaxSourceRemovalSummary> {
  const assessmentLinks = await db.propertyTaxAssessmentDocument.findMany({ where: { documentId: recordId }, select: { assessmentRecordId: true } }) as Array<{ assessmentRecordId: string }>;
  const billLinks = await db.propertyTaxBillDocument.findMany({ where: { documentId: recordId }, select: { billRecordId: true } }) as Array<{ billRecordId: string }>;
  const fieldEvidence = await db.propertyTaxFieldEvidence.updateMany({ where: { sourceDocumentId: recordId, sourceRemovedAt: null }, data: { sourceRemovedAt: now } });
  const assessments = await db.propertyTaxAssessmentRecord.updateMany({
    where: { id: { in: assessmentLinks.map((link) => link.assessmentRecordId) }, sourceRemovedAt: null }, data: { sourceRemovedAt: now },
  });
  const bills = await db.propertyTaxBillRecord.updateMany({
    where: { id: { in: billLinks.map((link) => link.billRecordId) }, sourceRemovedAt: null }, data: { sourceRemovedAt: now },
  });
  // Appeal evidence keeps what the homeowner stated. With no link either, readiness reports it as unsourced, which is the correct visible outcome.
  const appealEvidence = await db.propertyTaxAppealEvidence.updateMany({ where: { supportingDocumentId: recordId, sourceRemovedAt: null }, data: { sourceRemovedAt: now } });
  return { fieldEvidence: fieldEvidence.count, assessments: assessments.count, bills: bills.count, appealEvidence: appealEvidence.count };
}
