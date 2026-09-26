import { answerLabel, canAskConversationally, hasAnswer, nextStepIndex, stepQuestion } from '../conversationalCapture';
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
    expect(canAskConversationally(request({ inputSchema: { type: 'GROUP', fields: [{ ...cost, inputSchema: { type: 'APPROXIMATE_DATE' } }] } }))).toBe(false);
    expect(canAskConversationally(request({ inputSchema: { type: 'GROUP', fields: [] } }))).toBe(false);
    // Creating a task (seven questions, some optional) is a conversation; a group longer than that stays one form.
    expect(canAskConversationally(request({ inputSchema: { type: 'GROUP', fields: [task, cost, ...['a', 'b', 'c', 'd', 'e', 'f'].map((key) => ({ ...cost, key }))] } }))).toBe(false);
    expect(canAskConversationally(request({ inputSchema: { type: 'GROUP', fields: [task, cost, ...['a', 'b', 'c', 'd', 'e'].map((key) => ({ ...cost, key }))] } }))).toBe(true);
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
