import { resolveHomeAttentionState } from '@/components/home/UnifiedHomeSurface';

describe('resolveHomeAttentionState', () => {
  it('keeps ranked actions ahead of incomplete setup', () => {
    expect(resolveHomeAttentionState(2, {
      missingFactCount: 9,
      conflictedFactCount: 0,
      staleFactCount: 0,
    })).toBe('ACTIONS');
  });

  it('uses setup as the fallback when there are no actions and context is incomplete', () => {
    expect(resolveHomeAttentionState(0, {
      missingFactCount: 1,
      conflictedFactCount: 0,
      staleFactCount: 0,
    })).toBe('SETUP');
  });

  it('reserves all-clear for no actions and complete current context', () => {
    expect(resolveHomeAttentionState(0, {
      missingFactCount: 0,
      conflictedFactCount: 0,
      staleFactCount: 0,
    })).toBe('ALL_CLEAR');
  });
});
