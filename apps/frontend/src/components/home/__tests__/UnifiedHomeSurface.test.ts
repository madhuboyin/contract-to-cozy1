import {
  isEnvironmentAction,
  resolveHomeAttentionState,
} from '@/components/home/UnifiedHomeSurface';
import type { RankedHomeActionDTO } from '@/types';

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

  it('shows a grounded first-value outlook before incomplete setup', () => {
    expect(resolveHomeAttentionState(0, {
      missingFactCount: 4,
      conflictedFactCount: 0,
      staleFactCount: 0,
    }, true)).toBe('OUTLOOK');
  });

  it('shows the outlook ahead of PLAN or CONSIDER actions', () => {
    expect(resolveHomeAttentionState(2, {
      missingFactCount: 0,
      conflictedFactCount: 0,
      staleFactCount: 0,
    }, true, 0)).toBe('OUTLOOK');
  });

  it('keeps a real NOW or SOON action ahead of the outlook', () => {
    expect(resolveHomeAttentionState(2, {
      missingFactCount: 0,
      conflictedFactCount: 0,
      staleFactCount: 0,
    }, true, 1)).toBe('ACTIONS');
  });

  it('reserves all-clear for no actions and complete current context', () => {
    expect(resolveHomeAttentionState(0, {
      missingFactCount: 0,
      conflictedFactCount: 0,
      staleFactCount: 0,
    })).toBe('ALL_CLEAR');
  });
});

describe('environment attention classification', () => {
  it('routes promoted environment actions to the dedicated prominent card', () => {
    expect(isEnvironmentAction({
      id: 'environment:heat-2026-07-27',
      source: { kind: 'MAINTENANCE' },
    } as RankedHomeActionDTO)).toBe(true);
  });
});
