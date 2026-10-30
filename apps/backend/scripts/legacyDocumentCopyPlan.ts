// apps/backend/scripts/legacyDocumentCopyPlan.ts
//
// The pure half of copy-legacy-documents-to-home-records.ts: what a legacy `documents` row becomes as a Home Record, with no database, storage or clock.
// Kept apart so the rules can be tested without either.

import { createHash } from 'node:crypto';

/** A stable UUID from a name, so a re-run finds the record it made before and skips it (no marker column or new table is needed). */
export function deterministicUuid(name: string): string {
  const bytes = createHash('sha256').update(`c2c-legacy-document-copy:${name}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5 style
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const recordIdFor = (documentId: string) => deterministicUuid(`record:${documentId}`);
export const versionIdFor = (documentId: string) => deterministicUuid(`version:${documentId}`);

export type LegacyDocumentType = 'INSPECTION_REPORT' | 'ESTIMATE' | 'INVOICE' | 'CONTRACT' | 'PERMIT' | 'PHOTO' | 'VIDEO' | 'INSURANCE_CERTIFICATE' | 'LICENSE' | 'HOME_REPORT_PDF' | 'OTHER';
const RECORD_TYPE: Record<LegacyDocumentType, string> = {
  INSPECTION_REPORT: 'INSPECTION_REPORT', ESTIMATE: 'QUOTE', INVOICE: 'INVOICE', CONTRACT: 'CONTRACT', PERMIT: 'PERMIT', PHOTO: 'PHOTO', VIDEO: 'OTHER',
  INSURANCE_CERTIFICATE: 'INSURANCE_POLICY', LICENSE: 'OTHER', HOME_REPORT_PDF: 'OTHER', OTHER: 'OTHER',
};
const SENSITIVITY: Record<LegacyDocumentType, string> = {
  INSPECTION_REPORT: 'STANDARD', ESTIMATE: 'FINANCIAL', INVOICE: 'FINANCIAL', CONTRACT: 'LEGAL', PERMIT: 'STANDARD', PHOTO: 'STANDARD', VIDEO: 'STANDARD',
  INSURANCE_CERTIFICATE: 'INSURANCE', LICENSE: 'PERSONAL', HOME_REPORT_PDF: 'STANDARD', OTHER: 'STANDARD',
};
export const recordTypeFor = (type: string) => RECORD_TYPE[type as LegacyDocumentType] ?? 'OTHER';
export const sensitivityFor = (type: string) => SENSITIVITY[type as LegacyDocumentType] ?? 'STANDARD';

/** The same file-name cleaning Home Records uploads use, so a copied object sits under the key a normal upload would have. */
export const sanitizedFileName = (fileName: string) => fileName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9.\-_]/g, '_').slice(-180);
export const storageKeyFor = (propertyId: string, recordId: string, versionId: string, fileName: string) =>
  ['property-records', propertyId, recordId, versionId, sanitizedFileName(fileName)].join('/');

export interface LegacyDocumentRow {
  id: string; propertyId: string | null; uploadedBy: string; type: string; name: string; description: string | null; fileUrl: string; fileSize: number; mimeType: string;
  sha256: string | null; verificationStatus: string; verifiedAt: Date | null; verifiedByUserId: string | null; deletedAt: Date | null;
  warrantyId: string | null; policyId: string | null; inventoryItemId: string | null; projectId: string | null;
  homeEventLinks: Array<{ eventId: string; caption: string | null }>;
}
export interface PlannedLink { entityType: string; entityId: string; purpose: string; label: string | null }

/** Why a document is left alone (nothing is copied or changed for it), or null when it can be copied. */
export function skipReason(doc: LegacyDocumentRow, ctx: { ownerUserId: string | null; alreadyCopied: boolean }): string | null {
  if (doc.deletedAt) return 'in the trash';
  if (!doc.propertyId) return 'not attached to a property (a Home Record belongs to one)';
  if (!doc.fileUrl) return 'no stored file';
  if (ctx.alreadyCopied) return 'already copied';
  if (!ctx.ownerUserId) return 'the uploader has no user to own the record';
  return null;
}

/** The links the legacy document already had, as Home Record links. The legacy rows themselves are not removed. */
export function plannedLinks(doc: LegacyDocumentRow): PlannedLink[] {
  const links: PlannedLink[] = [];
  for (const link of doc.homeEventLinks) links.push({ entityType: 'HOME_EVENT', entityId: link.eventId, purpose: 'EVIDENCE', label: link.caption });
  if (doc.warrantyId) links.push({ entityType: 'WARRANTY', entityId: doc.warrantyId, purpose: 'WARRANTY', label: null });
  if (doc.policyId) links.push({ entityType: 'INSURANCE_POLICY', entityId: doc.policyId, purpose: 'EVIDENCE', label: null });
  if (doc.inventoryItemId) links.push({ entityType: 'INVENTORY_ITEM', entityId: doc.inventoryItemId, purpose: 'ATTACHMENT', label: null });
  if (doc.projectId) links.push({ entityType: 'PROJECT', entityId: doc.projectId, purpose: 'EVIDENCE', label: null });
  return links;
}

/** The title keeps the name the household saw, minus its extension. */
export const titleFor = (name: string) => (name.replace(/\.[A-Za-z0-9]{1,5}$/, '').trim() || name).slice(0, 200);

export function planFor(doc: LegacyDocumentRow, ownerUserId: string) {
  const recordId = recordIdFor(doc.id);
  const versionId = versionIdFor(doc.id);
  return {
    documentId: doc.id, propertyId: doc.propertyId as string, recordId, versionId, ownerUserId,
    title: titleFor(doc.name), description: doc.description, recordType: recordTypeFor(doc.type), sensitivity: sensitivityFor(doc.type),
    storageKey: storageKeyFor(doc.propertyId as string, recordId, versionId, doc.name), fileName: doc.name, mimeType: doc.mimeType,
    verificationStatus: doc.verificationStatus, verifiedAt: doc.verifiedAt, verifiedByUserId: doc.verifiedByUserId,
    links: plannedLinks(doc),
  };
}
