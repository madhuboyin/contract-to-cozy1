import { answerModeLabel } from '../answerModeLabel';

// BICC-ANS-001/005/006/007: the label words the server's mode; it never invents one.
describe('answerModeLabel', () => {
  it('words every declared mode that is a kind of answer', () => {
    expect(answerModeLabel('HOME_RECORD')?.text).toBe('From your home record');
    expect(answerModeLabel('USER_DOCUMENT')?.text).toBe('From your documents');
    expect(answerModeLabel('CALCULATION')?.text).toBe('Calculated');
    expect(answerModeLabel('ESTIMATE')?.text).toBe('Estimate');
    expect(answerModeLabel('RECOMMENDATION')?.text).toBe('Recommendation');
  });

  it('says plainly that general guidance is not from the home record (ANS-007)', () => {
    const label = answerModeLabel('GENERAL_GUIDANCE');
    expect(label?.text).toMatch(/not from your home record/i);
    expect(label?.description).toMatch(/not an inspection or a diagnosis/i);
  });

  it('shows nothing for an unavailable answer (it states its own reason), a missing mode, or an unknown one', () => {
    expect(answerModeLabel('UNAVAILABLE')).toBeNull();
    expect(answerModeLabel(null)).toBeNull();
    expect(answerModeLabel(undefined)).toBeNull();
    expect(answerModeLabel('SOMETHING_NEW' as never)).toBeNull();
  });

  it('an estimate is never worded as a quote or a certainty', () => {
    const label = answerModeLabel('ESTIMATE')!;
    expect(`${label.text} ${label.description}`).toMatch(/assumed|predicted|approximate/);
    expect(`${label.text} ${label.description}`).not.toMatch(/guarantee|exact|quote:/i);
  });
});
