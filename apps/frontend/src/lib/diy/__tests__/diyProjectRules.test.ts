import { canSkipStep, diyErrorCode, openStepsForCompletion } from '../diyProjectRules';

describe('openStepsForCompletion (mirrors the server rule)', () => {
  const step = (isOptional: boolean, status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED') => ({ isOptional, status });

  it('has nothing open when required steps are completed and optional steps are completed or skipped, and for no steps', () => {
    expect(openStepsForCompletion([])).toEqual([]);
    expect(openStepsForCompletion([step(false, 'COMPLETED'), step(true, 'SKIPPED'), step(true, 'COMPLETED')])).toEqual([]);
  });

  it('keeps required steps open until completed (skipped does not count) and optional steps open until completed or skipped', () => {
    expect(openStepsForCompletion([step(false, 'SKIPPED')])).toHaveLength(1);
    expect(openStepsForCompletion([step(false, 'COMPLETED'), step(true, 'PENDING'), step(true, 'IN_PROGRESS')])).toHaveLength(2);
  });
});

describe('canSkipStep', () => {
  it('allows only an optional step without a (non-blank) safety note', () => {
    expect(canSkipStep({ isOptional: true, safetyNote: undefined })).toBe(true);
    expect(canSkipStep({ isOptional: true, safetyNote: '  ' })).toBe(true);
    expect(canSkipStep({ isOptional: true, safetyNote: 'Wear gloves.' })).toBe(false);
    expect(canSkipStep({ isOptional: false, safetyNote: undefined })).toBe(false);
  });
});

describe('diyErrorCode', () => {
  it('reads the server code from the API error payload, and is null for anything else', () => {
    expect(diyErrorCode({ payload: { error: { code: 'DIY_STALE' } } })).toBe('DIY_STALE');
    expect(diyErrorCode(new Error('x'))).toBeNull();
    expect(diyErrorCode(null)).toBeNull();
    expect(diyErrorCode({ payload: { error: { code: 7 } } })).toBeNull();
  });
});
