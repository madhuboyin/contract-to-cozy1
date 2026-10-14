import { projectDocumentOptions } from '../projectDocumentOptions';

const base = { recordType: 'OTHER', visibility: 'HOUSEHOLD', sensitivity: 'LEGAL', lifecycleStatus: 'ACTIVE', currentVersion: { scanStatus: 'CLEAN' } };

describe('projectDocumentOptions', () => {
  it('offers active, household-visible, clean records of any type and shows the sensitivity', () => {
    const result = projectDocumentOptions([{ ...base, id: 'a', title: 'Contract', createdAt: '2026-01-01' }, { ...base, id: 'b', title: 'Photo', recordType: 'PHOTO', sensitivity: 'PERSONAL', createdAt: '2026-05-01' }]);
    expect(result.options.map((o) => o.id)).toEqual(['b', 'a']);
    expect(result.options[0].label).toContain('Personal');
    expect(result.options[1].label).toContain('Legal');
  });
  it('counts owner-only records instead of offering them', () => {
    const result = projectDocumentOptions([{ ...base, id: 'p', title: 'Private', visibility: 'OWNER_ONLY' }]);
    expect(result.options).toEqual([]);
    expect(result.excludedPrivate).toBe(1);
  });
  it('leaves out archived, trashed and unscanned records', () => {
    const result = projectDocumentOptions([
      { ...base, id: 'x', title: 'Archived', lifecycleStatus: 'ARCHIVED' },
      { ...base, id: 'y', title: 'Trashed', lifecycleStatus: 'TRASHED' },
      { ...base, id: 'z', title: 'Pending', currentVersion: { scanStatus: 'PENDING' } },
    ]);
    expect(result.options).toEqual([]);
  });
});
