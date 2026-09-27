const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { ConciergeHomeContinuitySchema } = require('../../src/productFramework/conciergeHome.contract.ts');

test('Concierge Home continuity represents dashboard decisions and an active major moment', () => {
  const result = ConciergeHomeContinuitySchema.parse({
    state: 'AVAILABLE',
    decisions: [{ id: 'decision-1', title: 'Choose repair or replacement', summary: 'Compare long-term cost.', href: '/dashboard/work' }],
    activeMajorMoment: {
      kind: 'PROJECT', id: 'project-1', title: 'Roof repair', stage: 'IN_PROGRESS', context: null,
      blocker: 'Waiting for provider selection', nextMilestone: 'Select a contractor', href: '/dashboard/projects/project-1',
    },
  });

  assert.equal(result.decisions[0].title, 'Choose repair or replacement');
  assert.equal(result.activeMajorMoment.nextMilestone, 'Select a contractor');
});

test('Concierge Home continuity reports source failure instead of an all-clear state', () => {
  assert.deepEqual(ConciergeHomeContinuitySchema.parse({
    state: 'UNAVAILABLE', decisions: [], activeMajorMoment: null,
  }), { state: 'UNAVAILABLE', decisions: [], activeMajorMoment: null });
});

test('Unified Home and Ask Concierge consume the same continuity projection', () => {
  const homeService = fs.readFileSync(path.resolve(__dirname, '../../src/services/homeActions.service.ts'), 'utf8');
  const concierge = fs.readFileSync(path.resolve(__dirname, '../../src/services/ask/execution/askConcierge.ts'), 'utf8');

  assert.match(homeService, /export async function getHomeContinuityProjection/);
  assert.match(homeService, /const continuityRead = getHomeContinuityProjection\(propertyId, feedRead\)/);
  assert.match(concierge, /getHomeContinuityProjection\(propertyId, feedPromise\)/);
});
