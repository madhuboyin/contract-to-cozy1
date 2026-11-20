const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const { parseProjectPermitFilter, projectPermitMonthRange, matchProjectsNeedingPermit } = require('../../src/services/ask/support/projectPermitFilter.ts');

test('"which projects still need permits and are scheduled for next month?" parses to the permit condition plus next month', () => {
  assert.deepEqual(parseProjectPermitFilter('which projects still need permits and are scheduled for next month?'), { month: 'NEXT_MONTH' });
  assert.deepEqual(parseProjectPermitFilter('projects that need a permit this month'), { month: 'THIS_MONTH' });
  assert.deepEqual(parseProjectPermitFilter('which projects still need a permit'), { month: null });
});

test('other questions, and date phrases the filter does not understand, are not taken', () => {
  assert.equal(parseProjectPermitFilter('show my projects'), null);
  assert.equal(parseProjectPermitFilter('show my permits'), null);
  assert.equal(parseProjectPermitFilter('which projects need permits next week'), null);
  assert.equal(parseProjectPermitFilter('which projects need permits in december'), null);
});

test('a project matches on an open milestone or its expected finish in the month, only when a permit is required and it is active', () => {
  const now = new Date('2026-11-19T12:00:00Z');
  const range = projectPermitMonthRange('NEXT_MONTH', now);
  assert.equal(range.label, 'December 2026');
  const d = (iso) => new Date(`${iso}T00:00:00Z`);
  const project = (id, over) => ({ id, name: id, status: 'PLANNING', permitApplicability: 'REQUIRED', expectedEndDate: null, milestones: [], ...over });
  const found = matchProjectsNeedingPermit([
    project('kitchen', { milestones: [{ name: 'Rough-in', scheduledDate: d('2026-12-08'), status: 'UPCOMING' }] }),
    project('deck', { expectedEndDate: d('2026-12-18') }),
    project('done-milestone', { milestones: [{ name: 'Demo', scheduledDate: d('2026-12-02'), status: 'COMPLETED' }] }),
    project('january', { milestones: [{ name: 'Paint', scheduledDate: d('2027-01-05'), status: 'UPCOMING' }] }),
    project('no-permit', { permitApplicability: 'NOT_REQUIRED_CONFIRMED', expectedEndDate: d('2026-12-10') }),
    project('finished', { status: 'COMPLETED', expectedEndDate: d('2026-12-10') }),
  ], range);
  assert.deepEqual(found.map((m) => [m.project.id, m.reasons]), [['kitchen', ['Rough-in scheduled Dec 8']], ['deck', ['Expected finish Dec 18']]]);
  assert.equal(matchProjectsNeedingPermit([project('any')], null).length, 1, 'no month asked: every active permit-required project');
});
