import { answerLabel, canAskConversationally, dateShortcuts, hasAnswer, nextStepIndex, stepQuestion } from '../conversationalCapture';
import type { StructuredCaptureField } from '@/components/property-context/featureContextTypes';
import type { AskCaptureRequest } from '../types';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.12 IW-CONV-004/005 (FRD v1.112).
const task: StructuredCaptureField = { key: 'taskId', label: 'Open task', prompt: 'Which task did you complete?', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Chimney', value: 't1' }, { label: 'Furnace', value: 't2' }] } };
const cost: StructuredCaptureField = { key: 'actualCostUsd', label: 'Actual cost', helpText: 'Optional', required: false, inputSchema: { type: 'DECIMAL', min: 0, unit: 'USD' } };
const request = (overrides: Partial<AskCaptureRequest> = {}) => ({ classification: 'WORKFLOW_INPUT', sensitivity: 'STANDARD', inputSchema: { type: 'GROUP', fields: [task, cost] }, ...overrides }) as Pick<AskCaptureRequest, 'classification' | 'sensitivity' | 'inputSchema' | 'skippable'>;

describe('canAskConversationally', () => {
  it('accepts a plain standard workflow group of scalar fields', () => {
    expect(canAskConversationally(request())).toBe(true);
  });
  it('keeps the form for anything sensitive, relational, dated, non-workflow or not a group', () => {
    expect(canAskConversationally(request({ sensitivity: 'FINANCIAL' }))).toBe(false);
    expect(canAskConversationally(request({ sensitivity: 'SECURITY' }))).toBe(false);
    expect(canAskConversationally(request({ classification: 'REQUIRED_CALCULATION' }))).toBe(false);
    expect(canAskConversationally(request({ inputSchema: { type: 'SINGLE_SELECT', options: [] } }))).toBe(false);
    expect(canAskConversationally(request({ inputSchema: { type: 'GROUP', fields: [{ ...cost, inputSchema: { type: 'LONG_TEXT', maxLength: 500 } }] } }))).toBe(false);
    expect(canAskConversationally(request({ inputSchema: { type: 'GROUP', fields: [{ ...cost, inputSchema: { type: 'DOCUMENT_MULTI_SELECT', options: [{ label: 'A', value: 'a' }] } }] } }))).toBe(false);
    expect(canAskConversationally(request({ inputSchema: { type: 'GROUP', fields: [] } }))).toBe(false);
    // A long group (for example creating a task with six fields) stays one form until grouped/adaptive capture exists (ACUI-007).
    expect(canAskConversationally(request({ inputSchema: { type: 'GROUP', fields: [task, cost, { ...cost, key: 'a' }, { ...cost, key: 'b' }, { ...cost, key: 'c' }, { ...cost, key: 'd' }] } }))).toBe(false);
    // UX-04: up to five fields, and approximate dates and bounded multi-selects, can be asked one at a time.
    expect(canAskConversationally(request({ inputSchema: { type: 'GROUP', fields: [task, cost, { ...cost, key: 'a' }, { ...cost, key: 'b' }, { ...cost, key: 'c' }] } }))).toBe(true);
    expect(canAskConversationally(request({ inputSchema: { type: 'GROUP', fields: [{ ...cost, inputSchema: { type: 'APPROXIMATE_DATE' } }] } }))).toBe(true);
    expect(canAskConversationally(request({ inputSchema: { type: 'GROUP', fields: [{ ...cost, inputSchema: { type: 'MULTI_SELECT', options: [{ label: 'A', value: 'a' }], maxItems: 2 } }] } }))).toBe(true);
    expect(canAskConversationally(request({ inputSchema: { type: 'GROUP', fields: [{ ...cost, inputSchema: { type: 'MULTI_SELECT', options: Array.from({ length: 9 }, (_, i) => ({ label: `o${i}`, value: `o${i}` })) } }] } }))).toBe(false);
    // A capture with a purpose-built layout keeps the original rules.
    expect(canAskConversationally({ ...request({ inputSchema: { type: 'GROUP', fields: [{ ...cost, inputSchema: { type: 'APPROXIMATE_DATE' } }] } }), captureKey: 'CAPTURE_EVENT_ADD' })).toBe(false);
    expect(canAskConversationally({ ...request({ inputSchema: { type: 'GROUP', fields: [task, cost, { ...cost, key: 'a' }, { ...cost, key: 'b' }] } }), captureKey: 'SERVICE_PRICE_CHECK_INPUTS' })).toBe(false);
    expect(canAskConversationally(request({ inputSchema: { type: 'GROUP', fields: [task, cost, { ...cost, key: 'a' }] } }))).toBe(true);
  });
});

describe('steps', () => {
  it('asks the first unanswered, unskipped field, and nothing once all are answered or skipped', () => {
    expect(nextStepIndex([task, cost], {}, new Set(), null)).toBe(0);
    expect(nextStepIndex([task, cost], { taskId: 't1' }, new Set(), null)).toBe(1);
    expect(nextStepIndex([task, cost], { taskId: 't1' }, new Set(['actualCostUsd']), null)).toBeNull();
    expect(nextStepIndex([task, cost], { taskId: 't1', actualCostUsd: 0 }, new Set(), null)).toBeNull();
  });
  it('goes back to a field the homeowner chose to change', () => {
    expect(nextStepIndex([task, cost], { taskId: 't1', actualCostUsd: 5 }, new Set(), 'taskId')).toBe(0);
  });
  it('treats zero as an answer but not blank, null or undefined', () => {
    expect([0, false, 'x'].every(hasAnswer)).toBe(true);
    expect([undefined, null, ''].some(hasAnswer)).toBe(false);
  });
});

describe('wording', () => {
  it('uses the field prompt, else the request question for the first step, else the label', () => {
    expect(stepQuestion(task, 0, 'Which task was completed?')).toBe('Which task did you complete?');
    expect(stepQuestion(cost, 0, 'Which task was completed?')).toBe('Which task was completed?');
    expect(stepQuestion(cost, 1, 'Which task was completed?')).toBe('Actual cost');
  });
  it('reads answers back plainly', () => {
    expect(answerLabel(task, 't2')).toBe('Furnace');
    expect(answerLabel(cost, 120)).toBe('$120');
    expect(answerLabel(cost, 12.5)).toBe('$12.5');
    expect(answerLabel({ ...cost, inputSchema: { type: 'INTEGER', unit: 'years' } }, 3)).toBe('3 years');
    expect(answerLabel({ ...task, inputSchema: { type: 'BOOLEAN', trueLabel: 'Yes', falseLabel: 'No' } }, false)).toBe('No');
    expect(answerLabel(cost, undefined)).toBeNull();
  });
});

describe('UX-04 approximate dates and multi-selects', () => {
  const when: StructuredCaptureField = { key: 'when', label: 'When', required: true, inputSchema: { type: 'APPROXIMATE_DATE' } };
  const which: StructuredCaptureField = { key: 'which', label: 'Which', required: true, inputSchema: { type: 'MULTI_SELECT', options: [{ label: 'Roof', value: 'roof' }, { label: 'Gutters', value: 'gutters' }], maxItems: 2 } };
  it('treats an approximate date as answered only when it carries a value for its precision, or is explicitly unknown', () => {
    expect(hasAnswer({ precision: 'EXACT_DATE' })).toBe(false);
    expect(hasAnswer({ precision: 'YEAR', value: '2023' })).toBe(true);
    expect(hasAnswer({ precision: 'RANGE', value: '2020-01-01' })).toBe(false);
    expect(hasAnswer({ precision: 'RANGE', value: '2020-01-01', rangeEnd: '2022-12-31' })).toBe(true);
    expect(hasAnswer({ precision: 'UNKNOWN' })).toBe(true);
    expect(hasAnswer([])).toBe(false);
    expect(hasAnswer(['roof'])).toBe(true);
  });
  it('reads answers back without claiming more precision than was given', () => {
    expect(answerLabel(when, { precision: 'YEAR', value: '2023' })).toBe('2023');
    expect(answerLabel(when, { precision: 'UNKNOWN' })).toBe('Not sure');
    expect(answerLabel(when, { precision: 'RANGE', value: '2020-01-01', rangeEnd: '2022-12-31' })).toBe('2020-01-01 to 2022-12-31');
    expect(answerLabel(which, ['roof', 'gutters'])).toBe('Roof, Gutters');
  });
  it('offers only shortcuts the field schema permits, and never a future or exact invented date', () => {
    const now = new Date('2026-11-03T12:00:00');
    expect(dateShortcuts({}, true, now).map((item) => item.label)).toEqual(['This year', '3–5 years ago', 'Not sure']);
    expect(dateShortcuts({}, false, now).map((item) => item.label)).toEqual(['This year', '3–5 years ago']);
    expect(dateShortcuts({ allowedPrecisions: ['EXACT_DATE', 'MONTH'] }, true, now)).toEqual([]);
    const range = dateShortcuts({}, true, now).find((item) => item.id === 'years-3-5')!.value;
    expect(range).toEqual({ precision: 'RANGE', value: '2021-01-01', rangeEnd: '2023-12-31' });
    expect(dateShortcuts({ allowedPrecisions: ['YEAR'] }, true, now).map((item) => item.value.precision)).toEqual(['YEAR']);
  });
});
