// Property tax records that depend on a Home Record register a PropertyRecordLink so the record's deletion impact discloses them before a purge
// (owner ruling D-T5; design §3.3). Writers take the transaction client so a link commits or rolls back with the record it describes.
export type PropertyTaxLinkEntity = 'PROPERTY_TAX_INTAKE' | 'PROPERTY_TAX_ASSESSMENT' | 'PROPERTY_TAX_BILL' | 'PROPERTY_TAX_APPEAL_EVIDENCE';

export interface PropertyTaxRecordLinkInput {
  recordId: string;
  versionId: string | null;
  entityType: PropertyTaxLinkEntity;
  entityId: string;
  purpose: 'SOURCE' | 'EVIDENCE';
  label: string;
  userId: string;
}

export async function linkPropertyTaxEntity(db: any, input: PropertyTaxRecordLinkInput): Promise<void> {
  await db.propertyRecordLink.upsert({
    where: { recordId_entityType_entityId_purpose: { recordId: input.recordId, entityType: input.entityType, entityId: input.entityId, purpose: input.purpose } },
    create: { recordId: input.recordId, versionId: input.versionId, entityType: input.entityType, entityId: input.entityId, purpose: input.purpose, label: input.label, createdByUserId: input.userId },
    update: { versionId: input.versionId, label: input.label },
  });
}

/** Removes the links of an entity that no longer depends on a record (a replaced evidence source), keeping the one for `exceptRecordId`. */
export async function unlinkPropertyTaxEntity(db: any, entityType: PropertyTaxLinkEntity, entityId: string, exceptRecordId?: string | null): Promise<void> {
  await db.propertyRecordLink.deleteMany({
    where: { entityType, entityId, ...(exceptRecordId ? { recordId: { not: exceptRecordId } } : {}) },
  });
}
