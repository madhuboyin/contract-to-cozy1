// Which Home Records a project may cite (owner ruling D-P3; the service is the authority and refuses the rest): active, visible to the whole household,
// a current version with a clean scan, any record type. The sensitivity label is shown and is never a filter.
const SENSITIVITY: Record<string, string> = {
  STANDARD: 'Standard', PERSONAL: 'Personal', FINANCIAL: 'Financial', INSURANCE: 'Insurance', CLAIM: 'Claim', SECURITY: 'Security', LEGAL: 'Legal',
};

export type ProjectDocumentRecordInput = {
  id: string;
  title: string;
  recordType: string;
  visibility?: string;
  sensitivity?: string;
  lifecycleStatus?: string;
  createdAt?: string;
  currentVersion?: { scanStatus?: string } | null;
};

export function projectDocumentOptions(records: readonly ProjectDocumentRecordInput[]) {
  let excludedPrivate = 0;
  const eligible: ProjectDocumentRecordInput[] = [];
  for (const record of records) {
    if (record.lifecycleStatus !== 'ACTIVE') continue;
    if (record.visibility !== 'HOUSEHOLD') { excludedPrivate += 1; continue; }
    if (record.currentVersion?.scanStatus !== 'CLEAN') continue;
    eligible.push(record);
  }
  eligible.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  return {
    options: eligible.map((record) => ({
      id: record.id,
      label: `${record.title} (${record.recordType.toLowerCase().replace(/_/g, ' ')}, ${SENSITIVITY[record.sensitivity ?? ''] ?? 'Unlabelled'})`,
    })),
    excludedPrivate,
  };
}
