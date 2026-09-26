import { resolveHistoryRailExpanded } from '../historyRail';

// ACUI-006 (FRD v1.116).
describe('resolveHistoryRailExpanded', () => {
  const base = { calm: true, landingVisible: true, preference: null, searching: false } as const;
  it('is collapsed on a fresh calm landing and open once a conversation is active', () => {
    expect(resolveHistoryRailExpanded(base)).toBe(false);
    expect(resolveHistoryRailExpanded({ ...base, landingVisible: false })).toBe(true);
  });
  it('an explicit choice wins over the default, in both directions', () => {
    expect(resolveHistoryRailExpanded({ ...base, preference: 'expanded' })).toBe(true);
    expect(resolveHistoryRailExpanded({ ...base, landingVisible: false, preference: 'collapsed' })).toBe(false);
  });
  it('a search in progress keeps it open even when collapsed', () => {
    expect(resolveHistoryRailExpanded({ ...base, preference: 'collapsed', searching: true })).toBe(true);
  });
  it('is always open outside the calm shell', () => {
    expect(resolveHistoryRailExpanded({ ...base, calm: false, preference: 'collapsed' })).toBe(true);
  });
});
