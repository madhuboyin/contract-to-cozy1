import { answerAnatomyIssues, enforceAnswerAnatomy } from '../answerFamilyAnatomy';
import type { AskPresentationBlock } from '../types';

type ListBlock = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
const summary = { type: 'SUMMARY', id: 's', title: 'T', body: 'B', tone: 'DEFAULT', actions: [] } as AskPresentationBlock;
const list = (id: string, over: Partial<ListBlock> = {}): ListBlock => ({
  type: 'GROUPED_LIST', id, title: '', filters: [], actions: [], sections: [{ id: 's', title: '', count: 1, items: [{ id: 'a', title: 'A', meta: [] }] }], ...over,
});

describe('answer anatomy (client copy of the backend rules)', () => {
  it('an analysis shows no collection, whatever the producer sent', () => {
    const blocks: AskPresentationBlock[] = [summary, list('l', { recordKind: 'PROJECT' })];
    const reported: string[][] = [];
    expect(enforceAnswerAnatomy('ANALYSIS', blocks, (issues) => reported.push(issues))).toEqual([summary]);
    expect(reported).toHaveLength(1);
  });

  it('a direct answer shows a list only when it says why', () => {
    const unjustified: AskPresentationBlock[] = [summary, list('l')];
    expect(enforceAnswerAnatomy('DIRECT_ANSWER', unjustified)).toEqual([summary]);
    const justified: AskPresentationBlock[] = [summary, list('l', { justifiedCollection: 'The records counted.' })];
    expect(enforceAnswerAnatomy('DIRECT_ANSWER', justified)).toEqual(justified);
  });

  it('an entity list that breaks its rules is reported but still shown, so the answer is never hidden', () => {
    const blocks: AskPresentationBlock[] = [summary, list('a'), list('b', { recordKind: 'CLAIM' }), list('c', { recordKind: 'CLAIM' }), list('d-needs-confirmation')];
    expect(answerAnatomyIssues('ENTITY_LIST', blocks)).toHaveLength(2);
    expect(enforceAnswerAnatomy('ENTITY_LIST', blocks)).toEqual(blocks);
  });

  it('an answer with no declared family is not judged', () => {
    const blocks: AskPresentationBlock[] = [summary, list('l')];
    expect(answerAnatomyIssues(null, blocks)).toEqual([]);
    expect(enforceAnswerAnatomy(undefined, blocks)).toBe(blocks);
  });
});
