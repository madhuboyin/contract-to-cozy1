// Which Home Records a renovation readiness item may be marked satisfied with. Mirrors the Ask picker
// (FRD v1.358): a readiness case is shared, so only an active record the whole household can see, of an
// allowed sensitivity, is offered. The backend resolver is still the authority and refuses the rest.

const ALLOWED_SENSITIVITIES = new Set(['STANDARD', 'FINANCIAL', 'INSURANCE', 'CLAIM']);

export type EvidenceRecordInput = {
  id: string;
  title: string;
  recordType: string;
  visibility?: string;
  sensitivity?: string;
  lifecycleStatus?: string;
  createdAt?: string;
};

export type EvidenceRecordOptions = {
  options: Array<{ id: string; title: string; recordType: string }>;
  excludedPrivate: number;
  excludedSensitive: number;
};

export function readinessEvidenceOptions(records: readonly EvidenceRecordInput[]): EvidenceRecordOptions {
  let excludedPrivate = 0;
  let excludedSensitive = 0;
  const eligible: EvidenceRecordInput[] = [];
  for (const record of records) {
    if (record.lifecycleStatus && record.lifecycleStatus !== 'ACTIVE') continue;
    if (record.visibility !== 'HOUSEHOLD') { excludedPrivate += 1; continue; }
    if (!record.sensitivity || !ALLOWED_SENSITIVITIES.has(record.sensitivity)) { excludedSensitive += 1; continue; }
    eligible.push(record);
  }
  eligible.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  return {
    options: eligible.map(({ id, title, recordType }) => ({ id, title, recordType })),
    excludedPrivate,
    excludedSensitive,
  };
}
