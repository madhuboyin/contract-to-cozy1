const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  INFERRED_FROM_MESSAGE_NOTE, applyEventPrefill, eventDateEditorValue, eventPrefillFromCandidate, reconcilableEventCandidate, routedEventAddCapture,
} = require('../../src/services/ask/conversationalUnderstanding/captureReconciliation.ts');
const { eventAddCaptureRequest } = require('../../src/services/ask/conversationalUnderstanding/conversationalCapture.ts');

const NOW = new Date('2026-11-03T15:00:00.000Z');
const event = (overrides = {}) => ({
  category: 'EVENT', eventType: 'REPAIR', title: 'Plumber fixed the leak', datePrecision: 'EXACT_DATE', occurredAt: '2026-11-02T17:00:00.000Z',
  amount: 350, providerName: 'Acme Plumbing', summary: null, ...overrides,
});

test('the extracted event fills only what the form does not already hold, and is labelled as read from the message', () => {
  const prefill = eventPrefillFromCandidate(event(), {}, 'America/New_York', NOW);
  assert.deepEqual(prefill.values, { title: 'Plumber fixed the leak', type: 'REPAIR', occurredAt: 'EXACT_DATE|2026-11-02', amount: '350.00', providerName: 'Acme Plumbing' });
  assert.deepEqual(prefill.conflictKeys, []);
  const request = applyEventPrefill(eventAddCaptureRequest('v1'), prefill);
  assert.equal(request.currentAnswer.title, 'Plumber fixed the leak');
  assert.equal(request.currentAnswer.occurredAt, 'EXACT_DATE|2026-11-02');
  assert.equal(request.currentAnswer.importance, 'NORMAL');
  const title = request.editor.fields.find((field) => field.key === 'title');
  assert.match(title.helpText, new RegExp(INFERRED_FROM_MESSAGE_NOTE));
  const room = request.editor.fields.find((field) => field.key === 'roomId');
  assert.doesNotMatch(room.helpText ?? '', new RegExp(INFERRED_FROM_MESSAGE_NOTE));
});

test('a value the homeowner already entered wins and the difference is reported, not applied', () => {
  const prefill = eventPrefillFromCandidate(event(), { title: 'Kitchen leak repair', amount: '' }, 'UTC', NOW);
  assert.equal(prefill.values.title, undefined);
  assert.deepEqual(prefill.conflictKeys, ['title']);
  assert.ok(prefill.inferredKeys.includes('amount'));
});

test('the date keeps exactly the precision the message gave and is read in the property timezone', () => {
  // 23:30 on 2 Nov in New York is already 3 Nov in UTC; the homeowner's own day is the 2nd.
  assert.equal(eventDateEditorValue(event({ occurredAt: '2026-11-03T04:30:00.000Z' }), 'America/New_York', NOW), 'EXACT_DATE|2026-11-02');
  assert.equal(eventDateEditorValue(event({ occurredAt: '2026-11-03T04:30:00.000Z' }), 'UTC', NOW), 'EXACT_DATE|2026-11-03');
  assert.equal(eventDateEditorValue(event({ datePrecision: 'MONTH', occurredAt: '2026-08-15T12:00:00.000Z' }), 'UTC', NOW), 'MONTH|2026-08');
  assert.equal(eventDateEditorValue(event({ datePrecision: 'YEAR', occurredAt: '2024-06-01T12:00:00.000Z' }), 'UTC', NOW), 'YEAR|2024');
  assert.equal(eventDateEditorValue(event({ datePrecision: 'RANGE', occurredAt: null, dateRangeStart: '2025-06-01T12:00:00.000Z', dateRangeEnd: '2025-08-30T12:00:00.000Z' }), 'UTC', NOW), 'RANGE|2025-06-01|2025-08-30');
});

test('an unknown, unparseable or future date is left for the homeowner instead of being invented', () => {
  assert.equal(eventDateEditorValue(event({ datePrecision: 'UNKNOWN', occurredAt: null }), 'UTC', NOW), null);
  assert.equal(eventDateEditorValue(event({ occurredAt: 'not a date' }), 'UTC', NOW), null);
  assert.equal(eventDateEditorValue(event({ occurredAt: '2026-12-25T12:00:00.000Z' }), 'UTC', NOW), null);
  assert.equal(eventDateEditorValue(event({ datePrecision: 'RANGE', occurredAt: null, dateRangeStart: '2025-06-01T12:00:00.000Z', dateRangeEnd: '2025-05-01T12:00:00.000Z' }), 'UTC', NOW), null);
});

test('only a single, uncorrected, unlinked event is reconcilable; anything else keeps its own proposals', () => {
  const warranty = { category: 'WARRANTY', linkedEventCandidateIndex: 0 };
  const fact = { category: 'FACT' };
  const single = reconcilableEventCandidate([event(), fact]);
  assert.equal(single.candidate.title, 'Plumber fixed the leak');
  assert.deepEqual(single.remaining, [fact]);
  assert.equal(reconcilableEventCandidate([event(), event({ title: 'Second' })]), null);
  assert.equal(reconcilableEventCandidate([event({ correctingEventId: 'e1' })]), null);
  assert.equal(reconcilableEventCandidate([event(), warranty]), null);
  assert.equal(reconcilableEventCandidate([fact]), null);
});

test('the routed capture is found only when exactly one event-add form is waiting', () => {
  const form = eventAddCaptureRequest('v1');
  assert.equal(routedEventAddCapture([form]), form);
  assert.equal(routedEventAddCapture([form, form]), null);
  assert.equal(routedEventAddCapture([{ captureKey: 'OTHER' }]), null);
  assert.equal(routedEventAddCapture(undefined), null);
});

test('a replay sees every value already held, so the event is recognised as reconciled rather than re-proposed', () => {
  const first = eventPrefillFromCandidate(event(), {}, 'UTC', NOW);
  const replay = eventPrefillFromCandidate(event(), first.values, 'UTC', NOW);
  assert.deepEqual(replay.inferredKeys, []);
  assert.deepEqual(replay.conflictKeys, []);
  assert.ok(replay.heldKeys.length > 0);
});
