import { searchExplorerGroups, normalizeSearchText } from '../explorerSearch';
import { bucketResultCount, createOnceGate } from '../exploreTelemetry';
import type { AskCapabilityGroup, AskCapabilityPrompt } from '../types';

const prompt = (id: string, categoryId: AskCapabilityPrompt['categoryId'], extra: Partial<AskCapabilityPrompt>): AskCapabilityPrompt => ({
  id, categoryId, categoryLabel: categoryId, question: `Question for ${id}?`, ...extra,
});
const groups: AskCapabilityGroup[] = [
  { id: 'PROTECT', label: 'Protect your home', description: 'Find coverage gaps, risks, and important changes.', capabilityIds: [], prompts: [
    prompt('protect-coverage', 'PROTECT', { label: 'Which items are missing coverage?', question: 'Which items are missing coverage?', operationId: 'COVERAGE_GAPS', aliases: ['insurance', 'warranty gaps'] }),
    prompt('protect-changes', 'PROTECT', { label: 'What changed recently for this home?', question: 'What changed recently for this home?', operationId: 'HOME_CHANGE_SUMMARY', aliases: ['recent changes', 'updates'] }),
  ] },
  { id: 'SAVE', label: 'Reduce costs', description: 'Understand spending and uncover relevant savings.', capabilityIds: [], prompts: [
    prompt('save-opportunities', 'SAVE', { label: 'Where could I save money?', question: 'Where could I save money on this home?', operationId: 'SAVINGS_OPPORTUNITIES', aliases: ['rebates', 'cheaper'] }),
    prompt('save-costs', 'SAVE', { label: 'What are my biggest ownership costs?', question: 'What are my biggest ownership costs?', operationId: 'OWNERSHIP_COSTS', aliases: ['spending', 'expenses'] }),
  ] },
];
const ids = (query: string) => searchExplorerGroups(groups, query).map((result) => result.prompt.id);

describe('capability explorer search', () => {
  it('finds a prompt by its label, question, an approved alias, or its group wording', () => {
    expect(ids('missing coverage')).toEqual(['protect-coverage']);
    expect(ids('insurance')).toEqual(['protect-coverage']);
    expect(ids('rebates')).toEqual(['save-opportunities']);
    expect(ids('reduce costs')).toEqual(expect.arrayContaining(['save-opportunities', 'save-costs']));
  });

  it('ranks exact before prefix before token matches, then keeps server order', () => {
    expect(ids('updates')).toEqual(['protect-changes']);
    const ranked = searchExplorerGroups(groups, 'what');
    expect(ranked.map((result) => result.prompt.id)).toEqual(['protect-changes', 'save-costs']);
    expect(ids('recent changes')).toEqual(['protect-changes']);
    // Prompts that say "home" themselves rank before the one that matches only through its group wording ("Protect your home").
    expect(ids('home')).toEqual(['protect-changes', 'save-opportunities', 'protect-coverage']);
  });

  it('puts an exact alias ahead of a prefix match on another prompt', () => {
    const tied: AskCapabilityGroup[] = [{ ...groups[0], prompts: [
      prompt('a', 'PROTECT', { label: 'Insurance review', question: 'Insurance review?', aliases: ['cover'] }),
      prompt('b', 'PROTECT', { label: 'Something else', question: 'Something else?', aliases: ['insurance'] }),
    ] }];
    expect(searchExplorerGroups(tied, 'insurance').map((result) => result.prompt.id)).toEqual(['b', 'a']);
  });

  it('never searches operation ids and never infers from unrelated text', () => {
    // An operation id has no homeowner wording in the corpus, so it finds nothing; the same words as plain text still match the alias.
    expect(ids('HOME_CHANGE_SUMMARY')).toEqual([]);
    expect(ids('SAVINGS_OPPORTUNITIES')).toEqual([]);
    expect(ids('warranty gaps')).toEqual(['protect-coverage']);
    expect(ids('xyzzy')).toEqual([]);
  });

  it('needs a real query: blank, one character and punctuation return nothing', () => {
    expect(ids('')).toEqual([]);
    expect(ids('a')).toEqual([]);
    expect(ids('   ')).toEqual([]);
    expect(ids('?!')).toEqual([]);
  });

  it('is deterministic and case, spacing and punctuation insensitive', () => {
    expect(ids('  MISSING   Coverage?? ')).toEqual(ids('missing coverage'));
    expect(ids('rebates')).toEqual(ids('rebates'));
    expect(normalizeSearchText("What's NEW?")).toBe('what s new');
  });

  it('returns the group each result belongs to, for labelling by homeowner outcome', () => {
    expect(searchExplorerGroups(groups, 'spending')[0].group).toEqual({ id: 'SAVE', label: 'Reduce costs' });
  });
});

describe('explore telemetry helpers', () => {
  it('buckets counts instead of reporting them', () => {
    expect([0, 1, 2, 5, 6, 40].map(bucketResultCount)).toEqual(['0', '1', '2-5', '2-5', '6+', '6+']);
    expect(bucketResultCount(-3)).toBe('0');
    expect(bucketResultCount(NaN)).toBe('0');
  });

  it('lets a visibility key through once', () => {
    const once = createOnceGate();
    expect([once('p1:topic:HOME_CARE'), once('p1:topic:HOME_CARE'), once('p2:topic:HOME_CARE')]).toEqual([true, false, true]);
  });
});
