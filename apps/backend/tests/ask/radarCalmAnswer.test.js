const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { radarCalmCopy } = require('../../src/services/ask/handlers/homeEventRadar.handler.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');

// Radar R-1 (FRD v1.132): the calm copy is counted from the feed's own totals and never states more than the page holds.
const none = { lifecycle: null, sourceFamily: null, includeDismissed: false };
const life = (now, upcoming, recently_ended) => ({ now, upcoming, recently_ended });
const base = { filters: none, total: 3, shown: 3, topTitle: 'Heat advisory', staleCount: 0, lifecycle: life(2, 1, 0), highPriority: 1, saved: 0 };

test('leads with what is happening now and names the top-ranked event', () => {
  const copy = radarCalmCopy(base);
  assert.equal(copy.headline, '2 events are happening now.');
  assert.equal(copy.supportLine, 'Most important: Heat advisory.');
  assert.deepEqual(copy.chips.map((chip) => chip.label), ['1 high priority', '2 happening now', '1 upcoming']);
  assert.equal(radarCalmCopy({ ...base, total: 1, shown: 1, lifecycle: life(1, 0, 0), highPriority: 0 }).headline, '1 event is happening now.');
});

test('says plainly when nothing is happening now', () => {
  assert.equal(radarCalmCopy({ ...base, total: 2, shown: 2, lifecycle: life(0, 1, 1), highPriority: 0 }).headline, 'Nothing is happening now; 1 upcoming and 1 recently ended.');
});

test('a filtered feed is counted by its filters and does not repeat the lifecycle chips', () => {
  const copy = radarCalmCopy({ ...base, filters: { ...none, lifecycle: 'upcoming', sourceFamily: 'weather' }, total: 2, shown: 2, lifecycle: life(0, 2, 0), highPriority: 0 });
  assert.equal(copy.headline, '2 upcoming weather events.');
  assert.deepEqual(copy.chips, []);
});

test('a truncated page states the shown count and never presents a partial breakdown as the whole', () => {
  const copy = radarCalmCopy({ ...base, total: 45, shown: 20, lifecycle: life(5, 10, 5) });
  assert.equal(copy.headline, '45 monitored events.');
  assert.match(copy.supportLine, /Showing the 20 most important of 45/);
  assert.deepEqual(copy.chips, []);
});

test('an empty filtered result says so and reports stale sources by count', () => {
  assert.equal(radarCalmCopy({ ...base, total: 0, shown: 0, topTitle: null, lifecycle: life(0, 0, 0), highPriority: 0 }).headline, 'No monitored events match these filters.');
  assert.match(radarCalmCopy({ ...base, staleCount: 2 }).supportLine, /2 sources are out of date\./);
});

test('the recorded-information boundary is declared for the feed and survives the trust validator', () => {
  const result = attachAskAuthoritativeSourceEvidence({
    status: 'ANSWERED', suggestions: [],
    blocks: [
      { type: 'SUMMARY', id: 'home-event-radar-summary', title: 'Monitored home events', body: '3 monitored events from Home Event Radar.', tone: 'DEFAULT', actions: [] },
      { type: 'GROUPED_LIST', id: 'home-event-radar-feed', title: 'Home Event Radar feed', filters: [], sections: [], actions: [] },
      { type: 'BOUNDARY', id: 'radar-feed-boundary', title: 'Recorded information only', body: 'Not an emergency alert service.', severity: 'INFO', suggestions: [] },
    ],
  }, [completedAskAuthoritativeSourceEvidence('HOME_EVENT_RADAR_FEED')]);
  const validated = validateAskAnswerTrust({ question: 'Show my home event radar feed', operationId: 'HOME_EVENT_RADAR_FEED', propertyId: 'property-1', result });
  assert.ok(validated.result.blocks.some((block) => block.id === 'radar-feed-boundary'));
});
