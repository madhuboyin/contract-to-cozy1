import { appealEvidenceRecordOptions } from '../appealEvidenceRecords';

const base = { recordType: 'TAX_DOCUMENT', visibility: 'HOUSEHOLD', sensitivity: 'LEGAL', lifecycleStatus: 'ACTIVE', currentVersion: { scanStatus: 'CLEAN' } };

describe('appealEvidenceRecordOptions', () => {
  it('offers active, household-visible, clean records and shows the sensitivity instead of filtering on it', () => {
    const result = appealEvidenceRecordOptions([{ ...base, id: 'a', title: 'Notice', createdAt: '2026-01-01' }, { ...base, id: 'b', title: 'Survey', recordType: 'OTHER', createdAt: '2026-05-01' }]);
    expect(result.options.map((o) => o.id)).toEqual(['b', 'a']);
    expect(result.options[0].label).toContain('Other supporting evidence');
    expect(result.options[1].label).toContain('Legal');
  });
  it('never offers an owner-only record and counts it', () => {
    const result = appealEvidenceRecordOptions([{ ...base, id: 'p', title: 'Private', visibility: 'OWNER_ONLY' }]);
    expect(result.options).toEqual([]);
    expect(result.excludedPrivate).toBe(1);
  });
  it('leaves out archived, unscanned and unsupported records', () => {
    const result = appealEvidenceRecordOptions([
      { ...base, id: 'x', title: 'Archived', lifecycleStatus: 'ARCHIVED' },
      { ...base, id: 'y', title: 'Pending scan', currentVersion: { scanStatus: 'PENDING' } },
      { ...base, id: 'z', title: 'Warranty', recordType: 'WARRANTY' },
    ]);
    expect(result.options).toEqual([]);
    expect(result.excludedPrivate).toBe(0);
  });
});
