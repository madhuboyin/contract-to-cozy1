// Which Home Records the Property Tax page offers as appeal evidence. Mirrors the service rule (owner ruling D-T2; the service is the authority and refuses
// the rest): active, visible to the whole household, a current version with a clean scan, and a record type that can support an appeal. The sensitivity
// label is shown, not filtered on.
const SUPPORTED_TYPES = new Set([
  'TAX_DOCUMENT', 'DEED', 'SURVEY', 'INSPECTION_REPORT', 'PHOTO', 'PERMIT', 'DISCLOSURE', 'CLOSING_DOCUMENT', 'CONTRACT', 'INVOICE', 'RECEIPT', 'UTILITY', 'OTHER',
]);
const SENSITIVITY: Record<string, string> = {
  STANDARD: 'Standard', PERSONAL: 'Personal', FINANCIAL: 'Financial', INSURANCE: 'Insurance', CLAIM: 'Claim', SECURITY: 'Security', LEGAL: 'Legal',
};

export type AppealEvidenceRecordInput = {
  id: string;
  title: string;
  recordType: string;
  visibility?: string;
  sensitivity?: string;
  lifecycleStatus?: string;
  createdAt?: string;
  currentVersion?: { scanStatus?: string } | null;
};

export function appealEvidenceRecordOptions(records: readonly AppealEvidenceRecordInput[]) {
  let excludedPrivate = 0;
  const eligible: AppealEvidenceRecordInput[] = [];
  for (const record of records) {
    if (record.lifecycleStatus !== 'ACTIVE' || !SUPPORTED_TYPES.has(record.recordType)) continue;
    if (record.visibility !== 'HOUSEHOLD') { excludedPrivate += 1; continue; }
    if (record.currentVersion?.scanStatus !== 'CLEAN') continue;
    eligible.push(record);
  }
  eligible.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  return {
    options: eligible.map((record) => ({
      id: record.id,
      label: `${record.title} (${record.recordType === 'OTHER' ? 'Other supporting evidence' : record.recordType.toLowerCase().replace(/_/g, ' ')}, ${SENSITIVITY[record.sensitivity ?? ''] ?? 'Unlabelled'})`,
    })),
    excludedPrivate,
  };
}
