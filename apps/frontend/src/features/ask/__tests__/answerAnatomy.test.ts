import { answerVariant, evaluateAnswerAnatomy } from '../answerAnatomy';

const summary = (overrides: Record<string, unknown> = {}) => ({ type: 'SUMMARY', id: 's', title: 'Your water heater', body: 'Fine.', tone: 'DEFAULT', actions: [], ...overrides });
const list = (id: string) => ({ type: 'GROUPED_LIST', id, title: id, sections: [], actions: [], filters: [] });
const run = (blocks: unknown[], extra: Record<string, unknown> = {}) => evaluateAnswerAnatomy({ blocks, ...extra } as never);

describe('answer anatomy contract', () => {
  it('passes a normal answer with a headline, one artifact and one primary action', () => {
    expect(run([summary({ actions: [{ id: 'a', label: 'Do', style: 'PRIMARY' }] }), list('inventory-results')])).toEqual({ variant: 'NORMAL', violations: [] });
  });
  it('reports a missing headline, two dominant artifacts, and two primary actions', () => {
    expect(run([list('a'), list('b')]).violations).toEqual(['NO_HEADLINE', 'MULTIPLE_DOMINANT_ARTIFACTS:a,b']);
    expect(run([summary({ actions: [{ id: 'a', label: 'A', style: 'PRIMARY' }, { id: 'b', label: 'B', style: 'PRIMARY' }] })]).violations).toEqual(['MULTIPLE_PRIMARY_ACTIONS:2']);
  });
  it('holds the named variants to their own layouts, not the normal-answer limits', () => {
    expect(run([summary({ tone: 'CRITICAL' }), list('a'), list('b')])).toEqual({ variant: 'EMERGENCY', violations: [] });
    expect(run([list('a'), list('b')], { clarification: { question: 'q' } }).variant).toBe('CLARIFICATION');
    expect(run([list('a')], { captureRequests: [{ requirementId: 'r' }] }).variant).toBe('CAPTURE');
    expect(run([list('a')], { confirmation: { title: 't' } }).variant).toBe('CONFIRMATION');
    expect(answerVariant({ blocks: [{ type: 'COMPARISON', id: 'c' }] } as never)).toBe('COMPARISON');
  });
});
