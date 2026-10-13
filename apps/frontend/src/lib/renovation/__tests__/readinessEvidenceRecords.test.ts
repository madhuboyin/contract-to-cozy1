import { readinessEvidenceOptions } from '../readinessEvidenceRecords';

const base = { recordType: 'QUOTE', visibility: 'HOUSEHOLD', sensitivity: 'STANDARD', lifecycleStatus: 'ACTIVE' };

describe('readinessEvidenceOptions', () => {
  it('offers active household-visible records, newest first', () => {
    const result = readinessEvidenceOptions([
      { ...base, id: 'a', title: 'Old', createdAt: '2026-01-01T00:00:00Z' },
      { ...base, id: 'b', title: 'New', createdAt: '2026-05-01T00:00:00Z' },
    ]);
    expect(result.options.map((o) => o.id)).toEqual(['b', 'a']);
  });

  it('never offers an owner-only record, and counts it', () => {
    const result = readinessEvidenceOptions([{ ...base, id: 'p', title: 'Private', visibility: 'OWNER_ONLY' }]);
    expect(result.options).toEqual([]);
    expect(result.excludedPrivate).toBe(1);
  });

  it('leaves out sensitive kinds, archived and trashed records', () => {
    const result = readinessEvidenceOptions([
      { ...base, id: 's', title: 'Legal', sensitivity: 'LEGAL' },
      { ...base, id: 'x', title: 'Archived', lifecycleStatus: 'ARCHIVED' },
      { ...base, id: 't', title: 'Trashed', lifecycleStatus: 'TRASHED' },
    ]);
    expect(result.options).toEqual([]);
    expect(result.excludedSensitive).toBe(1);
    expect(result.excludedPrivate).toBe(0);
  });

  it('does not offer a record whose visibility is unknown', () => {
    const result = readinessEvidenceOptions([{ id: 'u', title: 'Unknown', recordType: 'OTHER' }]);
    expect(result.options).toEqual([]);
  });
});
