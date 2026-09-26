import { renderHook } from '@testing-library/react';
import { CALM_ANSWERS_STORAGE_KEY, calmHeadline, isCalmAdopter, resolveCalmPreference, useCalmAnswers } from '../calmAnswers';
import type { AskExecutionResponse } from '../types';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.11 (IW-CALM-001/012, FRD v1.111).
const memory = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};

describe('resolveCalmPreference', () => {
  it('uses the build default until the homeowner chooses', () => {
    expect(resolveCalmPreference('', memory(), false)).toBe(false);
    expect(resolveCalmPreference('', memory(), true)).toBe(true);
  });

  it('takes ?calm=1 and ?calm=0 from the address and remembers them', () => {
    const storage = memory();
    expect(resolveCalmPreference('?calm=1', storage, false)).toBe(true);
    expect(storage.getItem(CALM_ANSWERS_STORAGE_KEY)).toBe('1');
    expect(resolveCalmPreference('', storage, false)).toBe(true);
    expect(resolveCalmPreference('?propertyId=p&calm=0', storage, true)).toBe(false);
    expect(resolveCalmPreference('', storage, true)).toBe(false);
  });

  it('ignores any other value and survives unavailable storage', () => {
    expect(resolveCalmPreference('?calm=yes', memory(), false)).toBe(false);
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(resolveCalmPreference('?calm=1', broken, false)).toBe(true);
    expect(resolveCalmPreference('', broken, true)).toBe(true);
    expect(resolveCalmPreference('', null, false)).toBe(false);
  });
});

const summary = (extra = {}) => ({ type: 'SUMMARY', id: 'maintenance-summary', title: '9 maintenance records match this request', body: 'Body.', tone: 'CAUTION', actions: [], ...extra });
const execution = (blocks: unknown[]) => ({ blocks, question: 'What is due?' } as unknown as AskExecutionResponse);

describe('isCalmAdopter', () => {
  it('is true only for a result carrying the maintenance list, so other domains keep their rendering', () => {
    expect(isCalmAdopter(execution([summary(), { type: 'GROUPED_LIST', id: 'maintenance-groups' }]))).toBe(true);
    expect(isCalmAdopter(execution([summary(), { type: 'GROUPED_LIST', id: 'inventory-results' }]))).toBe(false);
    expect(isCalmAdopter(execution([summary()]))).toBe(false);
  });
});

describe('calmHeadline', () => {
  it('prefers the producer sentence and falls back to the title', () => {
    expect(calmHeadline(execution([summary({ headline: ' 8 tasks are overdue. ', supportLine: '8 completed tasks are hidden.' })]))).toEqual({ headline: '8 tasks are overdue.', supportLine: '8 completed tasks are hidden.' });
    expect(calmHeadline(execution([summary()]))).toEqual({ headline: '9 maintenance records match this request', supportLine: null });
    expect(calmHeadline(execution([]))).toBeNull();
  });
});

describe('useCalmAnswers default', () => {
  const original = process.env.NEXT_PUBLIC_ASK_CALM_ANSWERS;
  afterEach(() => { if (original === undefined) delete process.env.NEXT_PUBLIC_ASK_CALM_ANSWERS; else process.env.NEXT_PUBLIC_ASK_CALM_ANSWERS = original; window.localStorage.clear(); });

  it('is on for everyone unless the release kill switch is set', () => {
    delete process.env.NEXT_PUBLIC_ASK_CALM_ANSWERS;
    expect(renderHook(() => useCalmAnswers()).result.current).toBe(true);
    process.env.NEXT_PUBLIC_ASK_CALM_ANSWERS = 'true';
    expect(renderHook(() => useCalmAnswers()).result.current).toBe(true);
    process.env.NEXT_PUBLIC_ASK_CALM_ANSWERS = 'false';
    expect(renderHook(() => useCalmAnswers()).result.current).toBe(false);
  });

  it('respects a homeowner who chose the previous presentation, even with the default on', () => {
    delete process.env.NEXT_PUBLIC_ASK_CALM_ANSWERS;
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '0');
    expect(renderHook(() => useCalmAnswers()).result.current).toBe(false);
  });
});
