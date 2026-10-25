const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Sole Homeowner Interface FRD v1.1 §1.2: Work and Saved are conversations. The pure answer builders and the refinement grammar are tested
// directly; the schema and the answer-trust validator are run over what they produce; routing is checked through the real cascade.

require('../../src/services/ask/askOrchestrator.service.ts');
const {
  WORK_OVERVIEW_PAGE_SIZE, buildWorkViewState, resolveWorkState, workOverviewChips, workOverviewFromPage, workStateFromViewState,
} = require('../../src/services/ask/handlers/workOverview.handler.ts');
const {
  SAVED_RESULTS_PAGE_SIZE, buildSavedViewState, resolveSavedState, savedResultsChips, savedResultsFromPage, savedStateFromViewState,
} = require('../../src/services/ask/handlers/savedResults.handler.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { validateAskAnswerTrust, validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { matchesSavedResultsAnswerContract, matchesWorkOverviewAnswerContract } = require('../../src/services/ask/askWorkSavedIntent.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { containsFilterContinuation } = require('../../src/services/ask/askFollowUpContext.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');

const launch = (overrides = {}) => ({ operationId: null, entityType: null, entityId: null, actionId: null, decisionThreadId: null, workItemId: null, journeyId: null, contextVersion: null, ...overrides });
const workRow = (overrides = {}) => ({
  workKey: 'project:pr1', sourceAliases: [], providerId: 'PROJECTS', workType: 'PROJECT', propertyId: 'p1', entity: { type: 'PROJECT_RECORD', id: 'pr1' }, title: 'New roof', summary: 'Roof replacement',
  status: { canonical: 'IN_PROGRESS', label: 'In progress' }, lifecycleView: 'NEEDS_YOU', nextAction: { label: 'Check on progress', operationId: 'PROJECT_TRACKER_PROJECTS', allowed: true }, sortAt: '2026-10-18T12:00:00.000Z',
  dueAt: null, freshness: { version: 'v1', asOf: '2026-10-18T12:00:00.000Z' }, sourceOwner: 'projects',
  resume: { kind: 'WORKSPACE', executionId: null, sessionId: null, launch: launch({ operationId: 'PROJECT_TRACKER_PROJECTS', entityType: 'PROJECT_RECORD', entityId: 'pr1' }) }, ...overrides,
});
const pendingRow = () => workRow({
  workKey: 'execution:e1', providerId: 'PENDING_EXECUTIONS', workType: 'PENDING_EXECUTION', title: 'Approve the plan', status: { canonical: 'NEEDS_CONFIRMATION', label: 'Waiting for your confirmation' },
  resume: { kind: 'CONFIRMATION', executionId: 'e1', sessionId: 's1', launch: launch({ entityType: 'AskExecution', entityId: 'e1' }) },
});
const workPage = (rows, overrides = {}) => ({
  contractVersion: 'ask-work-v1', propertyId: 'p1', generatedAt: '2026-10-19T12:00:00.000Z', view: 'NEEDS_YOU', total: rows.length, totalScope: 'COMPLETE', partial: false, delivered: rows.length,
  nextCursor: null, truncated: false, viewCounts: { NEEDS_YOU: rows.length, ACTIVE: 2, WAITING: 0, SCHEDULED: null, COMPLETED: 5, ARCHIVED: 1 }, sort: { key: 'sortAt', label: 'Most recently updated first' },
  query: { workType: null, status: null },
  providers: [{ providerId: 'PROJECTS', label: 'Projects', workType: 'PROJECT', state: 'AVAILABLE', reason: null, total: rows.length, delivered: rows.length, required: true }],
  filterOptions: { workTypes: [{ value: 'PROJECT', label: 'Projects' }, { value: 'CLAIM', label: 'Claims' }], statusesByWorkType: {} }, unscopedPending: [], rows, ...overrides,
});
const state = (overrides = {}) => ({ view: 'NEEDS_YOU', kind: null, limit: WORK_OVERVIEW_PAGE_SIZE, ...overrides });
const answer = (page, s = state()) => workOverviewFromPage({ page, state: s, viewState: buildWorkViewState(null, s) });
const evidence = (operationId, sourceId) => ({ answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId, operationId, status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-10-20T00:00:00.000Z' }] } });
const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId;

test('Work states the count, what is shown and its order before listing anything', () => {
  const result = answer(workPage([workRow()]));
  const summary = result.blocks.find((block) => block.id === 'work-overview-summary');
  assert.equal(summary.headline, '1 thing needs you.');
  assert.match(summary.supportLine, /Showing needs you · all kinds of work · most recently updated first\./);
  assert.deepEqual(summary.chips.map((chip) => chip.label), ['2 active', '5 completed', '1 archived']);
  assert.equal(result.blocks.find((block) => block.id === 'work-overview-results').sections[0].items.length, 1);
  assert.equal(result.status, 'ANSWERED');
});

test('a row continues its own operation in this conversation; work with no registered operation shows why, never a dead control', () => {
  const result = answer(workPage([workRow(), pendingRow()]));
  const [project, pending] = result.blocks.find((block) => block.id === 'work-overview-results').sections[0].items;
  assert.deepEqual([project.id, project.entityType, project.actions[0].operationId, project.actions[0].interactionType], ['pr1', 'PROJECT_RECORD', 'PROJECT_TRACKER_PROJECTS', 'CONVERSATION_CONTINUE']);
  // A pending request is dismissed from its row (it confirms first); it has no operation to continue.
  assert.deepEqual(pending.actions.map((action) => action.id), ['work-request-dismiss']);
  assert.ok(pending.meta.some((line) => /unfinished list/.test(line)));
});

test('an empty complete view says so; a partial page is never called complete or empty', () => {
  const empty = answer(workPage([]));
  assert.equal(empty.blocks[0].headline, 'Nothing needs you right now.');
  const partial = answer(workPage([], {
    partial: true, total: null, totalScope: 'PARTIAL',
    providers: [{ providerId: 'REPAIRS', label: 'Repairs', workType: 'REPAIR', state: 'UNAVAILABLE', reason: 'No canonical reader.', total: null, delivered: 0, required: true }],
  }));
  assert.match(partial.blocks[0].headline, /not a confirmed empty list/);
  assert.equal(partial.status, 'READY_WITH_LIMITATIONS');
  assert.ok(partial.blocks.some((block) => block.id === 'work-overview-partial' && /Repairs: No canonical reader\./.test(block.body)));
});

test('constraints are remembered: a chip changes only the dimension it names, Show more keeps the same ordering, Clear returns to the start', () => {
  const page = workPage([workRow()], { nextCursor: 'c1' });
  const first = resolveWorkState('Show my work', null).state;
  assert.deepEqual(first, state());
  let prior = buildWorkViewState(null, first);
  const kind = resolveWorkState('Only show claim work', prior);
  assert.deepEqual([kind.refinement, kind.state.view, kind.state.kind], [true, 'NEEDS_YOU', 'CLAIM']);
  prior = buildWorkViewState(prior, kind.state);
  const view = resolveWorkState('Only show active work', prior);
  assert.deepEqual([view.state.view, view.state.kind], ['ACTIVE', 'CLAIM']);
  prior = buildWorkViewState(prior, view.state);
  const more = resolveWorkState('Now show more work', prior);
  assert.deepEqual([more.state.view, more.state.kind, more.state.limit], ['ACTIVE', 'CLAIM', WORK_OVERVIEW_PAGE_SIZE * 2]);
  assert.deepEqual(resolveWorkState('Now show all work with no filters', prior).state, state());
  assert.equal(prior.revision, 3);
  assert.equal(prior.resultId, buildWorkViewState(prior, view.state).resultId);
  assert.deepEqual(workStateFromViewState(prior), { view: 'ACTIVE', kind: 'CLAIM', limit: WORK_OVERVIEW_PAGE_SIZE });
  // An ordinary question is read on its own words: nothing is remembered.
  assert.deepEqual(resolveWorkState('What work is scheduled?', prior), { state: state({ view: 'SCHEDULED' }), refinement: false });
  assert.ok(workOverviewChips(page, state()).some((chip) => chip.id === 'show-more'));
  assert.ok(!workOverviewChips(workPage([workRow()]), state()).some((chip) => chip.id === 'show-more'));
});

test('every Work chip is a sentence the follow-up resolver recognizes as a refinement, and parses back to the constraint it names', () => {
  const chips = workOverviewChips(workPage([workRow()], { nextCursor: 'c1' }), state({ kind: 'PROJECT' }));
  const prior = buildWorkViewState(null, state({ view: 'ACTIVE' }));
  for (const chip of chips) {
    assert.ok(containsFilterContinuation(chip.message), chip.message);
    assert.equal(resolveWorkState(chip.message, prior).refinement, true, chip.message);
  }
  assert.ok(chips.length <= 16);
});

test('Work blocks pass the response schema and the answer-trust validator unchanged', () => {
  const result = answer(workPage([workRow(), pendingRow()], { partial: true, total: null, totalScope: 'PARTIAL', providers: [{ providerId: 'REPAIRS', label: 'Repairs', workType: 'REPAIR', state: 'FAILED', reason: 'Could not be read.', total: null, delivered: 0, required: true }] }));
  for (const block of result.blocks) AskPresentationBlockSchema.parse(block);
  const { result: validated } = validateAskAnswerTrust({ question: 'Show my work', operationId: 'WORK_OVERVIEW', result: { ...result, parameters: { ...result.parameters, ...evidence('WORK_OVERVIEW', 'work.overview') } }, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
  assert.equal(JSON.stringify(result).includes('/dashboard/'), false);
});

test('the exact What needs me prompt keeps canonical Work collection states through semantic validation', () => {
  const partial = answer(workPage([workRow()], {
    partial: true, total: null, totalScope: 'PARTIAL',
    providers: [{ providerId: 'REPAIRS', label: 'Repairs', workType: 'REPAIR', state: 'FAILED', reason: 'Could not be read.', total: null, delivered: 0, required: true }],
  }));
  const restricted = {
    status: 'READY_WITH_LIMITATIONS', reasonCode: 'WORK_RESTRICTED',
    blocks: [
      { type: 'EMPTY_STATE', id: 'work-overview-restricted', title: 'Work is not available for your household role', body: 'Nothing was read, so this is not an empty list.', actions: [] },
      { type: 'BOUNDARY', id: 'work-overview-boundary', title: 'Each item stays with its own record', body: 'Nothing is copied or changed here.', severity: 'INFO', suggestions: [] },
    ], suggestions: [],
  };
  const results = [answer(workPage([workRow()])), answer(workPage([])), partial, answer(workPage([workRow()], state({ view: 'ACTIVE' }))), restricted];
  for (const result of results) {
    assert.equal(matchesWorkOverviewAnswerContract(result), true);
    const validated = validateAskAnswerTrustPipeline({
      question: 'What needs me?', operationId: 'WORK_OVERVIEW', semanticEnabled: true, propertyId: 'p1',
      result: { ...result, parameters: { ...result.parameters, ...evidence('WORK_OVERVIEW', 'work.overview') } },
    });
    assert.equal(validated.result.status, result.status);
    assert.equal(validated.semantic.outcome, 'PASS');
    assert.ok(validated.semantic.reasonCodes.includes('CANONICAL_TYPED_ANSWER_CONTRACT_MATCH'));
    assert.deepEqual(validated.result.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
  }
  assert.equal(matchesWorkOverviewAnswerContract({ ...results[0], blocks: [...results[0].blocks, { type: 'SUMMARY', id: 'foreign-summary', title: 'Wrong', body: 'Wrong', actions: [] }] }), false);
});

const artifact = (overrides = {}) => ({
  artifactKey: 'comparison:q1', artifactType: 'QUOTE_COMPARISON', category: 'COMPARISON', owner: 'quote-comparison', entity: { type: 'QUOTE_COMPARISON_WORKSPACE', id: 'q1' }, propertyId: 'p1', sourceExecutionId: null,
  title: 'Roofing quotes', summary: 'Selected Acme', createdAt: '2026-10-01T12:00:00.000Z', updatedAt: '2026-10-07T12:00:00.000Z', sourceAsOf: '2026-10-07T12:00:00.000Z',
  version: { behavior: 'UPDATES_IN_PLACE_WITH_HISTORY', superseded: false, supersededBy: null, supersedes: null, label: 'Decided, updated 2026-10-07' },
  freshness: { state: 'CURRENT', reason: null }, visibility: { scope: 'HOUSEHOLD', sensitivity: 'STANDARD' }, archived: { byOwner: false, byYou: false },
  reopen: { operationId: 'QUOTE_COMPARISON_REVIEW', entityType: 'QUOTE_COMPARISON_WORKSPACE', entityId: 'q1', decisionThreadId: null, contextVersion: 'v1' }, reopenUnavailableReason: null,
  capabilities: { export: false, share: false }, sortAt: '2026-10-07T12:00:00.000Z', ...overrides,
});
const savedPage = (rows, overrides = {}) => ({
  contractVersion: 'ask-saved-v1', propertyId: 'p1', generatedAt: '2026-10-20T12:00:00.000Z', archived: false, total: rows.length, totalScope: 'COMPLETE', partial: false, delivered: rows.length,
  nextCursor: null, truncated: false, counts: { active: rows.length, archived: 2 }, sort: { key: 'sortAt', label: 'Most recent first' }, query: { search: null, artifactType: null, freshness: null },
  filterOptions: { types: [{ value: 'QUOTE_COMPARISON', label: 'Quote comparisons' }, { value: 'PROPERTY_BRIEF', label: 'Property briefs' }], freshness: [{ value: 'CURRENT', label: 'Current' }, { value: 'STALE', label: 'Out of date' }] },
  types: [{ artifactType: 'QUOTE_COMPARISON', label: 'Quote comparisons', state: 'AVAILABLE', reason: null, total: rows.length, delivered: rows.length }], rows, ...overrides,
});
const savedState = (overrides = {}) => ({ archived: false, type: null, freshness: null, limit: SAVED_RESULTS_PAGE_SIZE, search: null, ...overrides });
const savedAnswer = (page, s = savedState()) => savedResultsFromPage({ page, state: s, viewState: buildSavedViewState(null, s) });

test('Saved states how many results there are and how many are no longer current', () => {
  const result = savedAnswer(savedPage([artifact(), artifact({ artifactKey: 'comparison:q2', freshness: { state: 'STALE', reason: 'Facts changed.' } })]));
  const summary = result.blocks.find((block) => block.id === 'saved-results-summary');
  assert.equal(summary.headline, '2 saved results, 1 no longer current.');
  assert.equal(summary.tone, 'CAUTION');
  const [open, review] = result.blocks.find((block) => block.id === 'saved-results-list').sections[0].items;
  assert.deepEqual([open.id, open.entityType, open.actions[0].operationId, open.actions[0].label], ['q1', 'QUOTE_COMPARISON_WORKSPACE', 'QUOTE_COMPARISON_REVIEW', 'Open']);
  assert.equal(review.actions[0].label, 'Open and review');
  assert.equal(savedAnswer(savedPage([])).blocks[0].headline, 'Nothing is saved for this home yet.');
});

test('a saved result Ask cannot reopen shows its state and why, with no control', () => {
  const result = savedAnswer(savedPage([artifact({ reopen: null, reopenUnavailableReason: 'The owner keeps this.' })]));
  const [item] = result.blocks.find((block) => block.id === 'saved-results-list').sections[0].items;
  // No Open (nothing to reopen); Archive stays, because it only touches this person's own list.
  assert.deepEqual(item.actions.map((action) => action.id), ['saved-archive']);
  assert.ok(item.meta.includes('The owner keeps this.'));
});

test('Saved constraints are remembered across turns and every chip parses back to what it names', () => {
  let prior = buildSavedViewState(null, resolveSavedState('Show my saved results', null).state);
  const type = resolveSavedState('Only show quote comparisons', prior);
  assert.deepEqual([type.refinement, type.state.type], [true, 'QUOTE_COMPARISON']);
  prior = buildSavedViewState(prior, type.state);
  const fresh = resolveSavedState('Only show out of date saved results', prior);
  assert.deepEqual([fresh.state.type, fresh.state.freshness, fresh.state.archived], ['QUOTE_COMPARISON', 'STALE', false]);
  prior = buildSavedViewState(prior, fresh.state);
  assert.deepEqual(savedStateFromViewState(prior), { archived: false, type: 'QUOTE_COMPARISON', freshness: 'STALE', limit: SAVED_RESULTS_PAGE_SIZE, search: null });
  assert.equal(resolveSavedState('Only show archived saved results', prior).state.archived, true);
  assert.equal(resolveSavedState('Only show saved results that are not archived', buildSavedViewState(null, savedState({ archived: true }))).state.archived, false);
  assert.equal(resolveSavedState('Now show more saved results', prior).state.limit, SAVED_RESULTS_PAGE_SIZE * 2);
  assert.deepEqual(resolveSavedState('Now show all saved results with no filters', prior).state, savedState());
  for (const chip of savedResultsChips(savedPage([artifact()], { nextCursor: 'c1' }), savedState({ type: 'QUOTE_COMPARISON' }))) {
    assert.ok(containsFilterContinuation(chip.message), chip.message);
    assert.equal(resolveSavedState(chip.message, prior).refinement, true, chip.message);
  }
});

test('Saved blocks pass the response schema and the answer-trust validator unchanged', () => {
  const result = savedAnswer(savedPage([artifact()], { nextCursor: 'c1', partial: true, total: null, totalScope: 'PARTIAL', types: [{ artifactType: 'HOME_REPORT_EXPORT', label: 'Reports', state: 'FAILED', reason: 'Could not be read.', total: null, delivered: 0 }] }));
  for (const block of result.blocks) AskPresentationBlockSchema.parse(block);
  const { result: validated } = validateAskAnswerTrust({ question: 'Show my saved results', operationId: 'SAVED_RESULTS', result: { ...result, parameters: { ...result.parameters, ...evidence('SAVED_RESULTS', 'saved.results') } }, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
  assert.equal(JSON.stringify(result).includes('/dashboard/'), false);
});

test('the exact Show my saved results prompt keeps canonical Saved collection states through semantic validation', () => {
  const partial = savedAnswer(savedPage([artifact()], {
    partial: true, total: null, totalScope: 'PARTIAL',
    types: [{ artifactType: 'HOME_REPORT_EXPORT', label: 'Reports', state: 'FAILED', reason: 'Could not be read.', total: null, delivered: 0 }],
  }));
  const restricted = {
    status: 'READY_WITH_LIMITATIONS', reasonCode: 'SAVED_RESTRICTED',
    blocks: [
      { type: 'EMPTY_STATE', id: 'saved-results-restricted', title: 'Saved results are not available for your household role', body: 'Nothing was read, so this is not an empty list.', actions: [] },
      { type: 'BOUNDARY', id: 'saved-results-boundary', title: 'Saved only finds and reopens', body: 'Nothing is changed here.', severity: 'INFO', suggestions: [] },
    ], suggestions: [],
  };
  const results = [savedAnswer(savedPage([artifact()])), savedAnswer(savedPage([])), partial, savedAnswer(savedPage([artifact()], savedState({ freshness: 'STALE' }))), restricted];
  for (const result of results) {
    assert.equal(matchesSavedResultsAnswerContract(result), true);
    const validated = validateAskAnswerTrustPipeline({
      question: 'Show my saved results', operationId: 'SAVED_RESULTS', semanticEnabled: true, propertyId: 'p1',
      result: { ...result, parameters: { ...result.parameters, ...evidence('SAVED_RESULTS', 'saved.results') } },
    });
    assert.equal(validated.result.status, result.status);
    assert.equal(validated.semantic.outcome, 'PASS');
    assert.ok(validated.semantic.reasonCodes.includes('CANONICAL_TYPED_ANSWER_CONTRACT_MATCH'));
    assert.deepEqual(validated.result.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
  }
  assert.equal(matchesSavedResultsAnswerContract({ ...results[0], blocks: [...results[0].blocks, { type: 'SUMMARY', id: 'foreign-summary', title: 'Wrong', body: 'Wrong', actions: [] }] }), false);
});

test('the questions these operations own route here, and the ones other operations own keep them', () => {
  for (const message of ['What needs me?', 'What is waiting on me?', 'Show my work', 'Show my open work']) assert.equal(route(message), 'WORK_OVERVIEW', message);
  for (const message of ['Show my saved results', 'What have I saved?', 'Show my saved reports', 'List my saved comparisons']) assert.equal(route(message), 'SAVED_RESULTS', message);
  assert.equal(route('What needs my attention at home?'), 'HOME_ACTIONS');
  // "need me" inside another operation's own question must not be taken for the bare Work question.
  assert.notEqual(route('What extracted home facts need me?'), 'WORK_OVERVIEW');
  assert.equal(route('What work is waiting on me right now?'), 'WORK_OVERVIEW');
  assert.equal(route('Show my home work items'), 'HOME_WORK_ITEMS');
  assert.equal(route('Show my warranties'), 'WARRANTY_LOOKUP');
  for (const id of ['WORK_OVERVIEW', 'SAVED_RESULTS']) {
    const definition = ASK_OPERATION_DEFINITIONS[id];
    assert.deepEqual([definition.family, definition.executionMode, definition.propertyRoleFloor, definition.requiresProperty], ['RECORD_QUERY', 'DETERMINISTIC', 'VIEWER', true]);
  }
});

test('saved search: a word in the question is held as a constraint, stated in the answer, and cleared in words', () => {
  const { savedSearchFromWords } = require('../../src/services/ask/handlers/savedResults.handler.ts');
  assert.equal(savedSearchFromWords('Find my saved roofing quotes'), 'roofing');
  assert.equal(savedSearchFromWords('Where did I save the furnace decision?'), 'furnace');
  assert.equal(savedSearchFromWords('Search saved results for water heater'), 'heater');
  assert.equal(savedSearchFromWords('Show my saved results'), null);
  assert.equal(savedSearchFromWords('What have I saved?'), null);
  // Chips and kind words never become a search.
  for (const message of ['Only show out of date saved results', 'Only show seasonal checklists', 'Only show home reports', 'Now show more saved results', 'Only show archived saved results']) assert.equal(savedSearchFromWords(message), null, message);

  const first = resolveSavedState('Find my saved roofing quotes', null);
  assert.deepEqual([first.refinement, first.state.search, first.state.archived], [false, 'roofing', false]);
  let prior = buildSavedViewState(null, first.state);
  assert.equal(prior.roomScopePhrase, 'roofing');
  // A chip keeps the search; a new word replaces it; Clear search drops only the search.
  const stale = resolveSavedState('Only show out of date saved results', prior);
  assert.deepEqual([stale.state.search, stale.state.freshness], ['roofing', 'STALE']);
  prior = buildSavedViewState(prior, stale.state);
  assert.equal(resolveSavedState('Only show saved results about furnace', prior).state.search, 'furnace');
  const cleared = resolveSavedState('Now show saved results with no search', prior);
  assert.deepEqual([cleared.refinement, cleared.state.search, cleared.state.freshness], [true, null, 'STALE']);
  assert.equal(resolveSavedState('Now show all saved results with no filters', prior).state.search, null);
  assert.equal(savedStateFromViewState(prior).search, 'roofing');

  const searching = savedState({ search: 'roofing' });
  const chips = savedResultsChips(savedPage([artifact()]), searching);
  assert.ok(chips.some((chip) => chip.id === 'clear-search' && /roofing/.test(chip.label)));
  for (const chip of chips) { assert.ok(containsFilterContinuation(chip.message), chip.message); assert.equal(resolveSavedState(chip.message, prior).refinement, true, chip.message); }

  const hit = savedAnswer(savedPage([artifact()]), searching);
  assert.match(hit.blocks[0].supportLine, /matching “roofing”/);
  const miss = savedAnswer(savedPage([]), searching);
  assert.equal(miss.blocks[0].headline, 'No saved results match “roofing”.');
  for (const block of miss.blocks) AskPresentationBlockSchema.parse(block);
  assert.equal(route('Find my saved roofing quotes'), 'SAVED_RESULTS');
  assert.equal(route('Where did I save the furnace decision?'), 'SAVED_RESULTS');
  assert.equal(route('Search my saved results for water heater'), 'SAVED_RESULTS');
  // "saved for the house" is another operation's question, not a search of Saved.
  assert.notEqual(route('What upgrade options have I saved for the house?'), 'SAVED_RESULTS');
  assert.notEqual(route('Find my inspection report'), 'SAVED_RESULTS');
  assert.equal(route('Show my warranties'), 'WARRANTY_LOOKUP');
});
