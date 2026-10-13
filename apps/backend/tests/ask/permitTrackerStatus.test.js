const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Register P0 "Permits", slice PM-A: the Permit Tracker read (FRD v1.313). No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { permitTrackerService } = require('../../src/services/permitTracker.service.ts');
const { permitTrackerFromView } = require('../../src/services/ask/handlers/permitTracker.handler.ts');
const read = require('../../src/services/ask/support/permitTrackerRead.ts');

const OP = 'PERMIT_TRACKER_STATUS';
const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId;
const PERMIT = (over = {}) => ({
  id: 'p-1', permitNumber: 'B-2024-1182', category: 'ROOFING', workTypes: ['ROOF_REPLACEMENT'], description: 'Re-roof', status: 'ISSUED', reportedStatus: 'ISSUED_REPORTED',
  source: 'MANUAL', issueDate: '2024-05-02T00:00:00.000Z', finaledDate: undefined, expirationDate: '2025-05-02T00:00:00.000Z', contractorName: 'Acme Roofing',
  isVerified: true, hasOpenInspections: true, ...over,
});
const SUMMARY = { totalPermits: 2, activePermits: 1, finaledPermits: 1, openFlags: 1, statusCounts: { ISSUED: 1, FINALED: 1 } };
const FLAG = { id: 'f-1', workType: 'WATER_HEATER', flagReason: 'Water heater replaced in 2022 with no permit on file', status: 'FLAGGED', disclosureRisk: 'HIGH' };

test('typed requests to list the recorded permits reach the read; readiness and neighbours keep their routes', () => {
  for (const message of ['Show my permits', 'what permits do I have on this home', 'list my permit records', 'Do I have an open permit for the roof?', 'any unpermitted work flags?', 'permit inspections']) {
    assert.equal(route(message), OP, message);
  }
  for (const message of ['Do I need a permit for this?', 'Is my renovation ready to start?', 'what permits are required for a deck project', 'can I start my remodel']) {
    assert.notEqual(route(message), OP, message);
  }
  assert.equal(route('Show my price finalizations'), 'PRICE_FINALIZATIONS_LIST');
});

test('permits are grouped active and closed with the official status; a reported status is only shown where the official one is unconfirmed', () => {
  const result = permitTrackerFromView([
    PERMIT(),
    PERMIT({ id: 'p-2', status: 'FINALED', finaledDate: '2023-01-10T00:00:00.000Z', hasOpenInspections: false, reportedStatus: 'COMPLETED_REPORTED' }),
    PERMIT({ id: 'p-3', status: 'UNKNOWN', reportedStatus: 'ISSUED_REPORTED', permitNumber: null, isVerified: false, hasOpenInspections: false }),
  ], SUMMARY, [FLAG]);
  assert.equal(result.status, 'ANSWERED');
  assert.match(result.blocks[0].title, /2 permits recorded, 1 flag to look into/);
  const list = result.blocks.find((b) => b.id === 'permit-tracker-permits');
  assert.deepEqual(list.sections.map((s) => [s.title, s.items.map((i) => i.id)]), [['Active', ['p-1', 'p-3']], ['Closed out or no longer valid', ['p-2']]]);
  const byId = Object.fromEntries(list.sections.flatMap((s) => s.items).map((i) => [i.id, i]));
  assert.ok(byId['p-1'].meta.includes('Official: Issued'));
  assert.ok(byId['p-1'].meta.includes('Has open inspections'));
  assert.equal(byId['p-1'].meta.some((m) => m.startsWith('Reported by the household')), false, 'a confirmed official status needs no reported line');
  assert.ok(byId['p-3'].meta.includes('Official: Official status not confirmed'));
  assert.ok(byId['p-3'].meta.includes('Reported by the household: Issued'), 'a reported issue is never presented as an official one');
  assert.equal(byId['p-3'].title, 'Roofing permit');
});

test('flags are listed with their risk and status; the boundary and a limit disclosure are present', () => {
  const result = permitTrackerFromView([PERMIT()], SUMMARY, [FLAG], true);
  const flags = result.blocks.find((b) => b.id === 'permit-tracker-flags');
  assert.deepEqual(flags.sections[0].items[0].meta, ['High disclosure risk']);
  assert.equal(flags.sections[0].items[0].status, 'Flagged');
  assert.equal(flags.sections[0].items[0].title, 'water heater');
  assert.ok(result.blocks.some((b) => b.id === 'permit-tracker-limit'));
  assert.equal(result.blocks.at(-1).id, 'permit-tracker-boundary');
  assert.equal(JSON.stringify(result).includes('/dashboard/'), false);
});

test('an empty tracker is not an all-clear and says adding a permit is not available yet', () => {
  const result = permitTrackerFromView([], { totalPermits: 0, activePermits: 0, finaledPermits: 0, openFlags: 0, statusCounts: {} }, []);
  assert.equal(result.reasonCode, 'PERMIT_TRACKER_EMPTY');
  assert.match(result.blocks[0].body, /not the same as nothing having been permitted/);
  assert.deepEqual(result.blocks[0].actions, []);
});

test('the capability reads the three canonical calls and every block survives the answer-trust validator', async () => {
  const saved = { list: permitTrackerService.listPermits, summary: permitTrackerService.getPermitSummary, flags: permitTrackerService.listFlags };
  const calls = [];
  permitTrackerService.listPermits = async (propertyId, params) => { calls.push(['list', propertyId, params]); return { items: [PERMIT()], nextCursor: undefined }; };
  permitTrackerService.getPermitSummary = async (propertyId) => { calls.push(['summary', propertyId]); return SUMMARY; };
  permitTrackerService.listFlags = async (propertyId, params) => { calls.push(['flags', propertyId, params]); return { items: [FLAG], nextCursor: undefined }; };
  try {
    const raw = await capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message: 'Show my permits', launchContext: null }, { propertyAccess: { role: 'VIEWER' } });
    assert.deepEqual(calls, [['list', 'prop-1', { limit: 30 }], ['summary', 'prop-1'], ['flags', 'prop-1', { status: ['UNKNOWN', 'FLAGGED', 'INVESTIGATING'], limit: 10 }]]);
    const result = { ...raw, parameters: { audiencePresentation: { householdRole: 'VIEWER' }, answerTrustEvidence: { schemaVersion: '1.0', sources: [{
      sourceId: 'permits.status', operationId: OP, status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-10-12T00:00:00.000Z' }] } } };
    const { result: validated } = validateAskAnswerTrust({ question: 'Show my permits', operationId: OP, result, propertyId: 'prop-1' });
    assert.deepEqual(validated.blocks.map((b) => b.id), result.blocks.map((b) => b.id));
  } finally { Object.assign(permitTrackerService, { listPermits: saved.list, getPermitSummary: saved.summary, listFlags: saved.flags }); }
});

test('the pattern helper is narrow: renovation readiness phrasing is not claimed', () => {
  for (const message of ['do I need a permit', 'permit required for a new fence', 'is my project ready, permits included']) assert.equal(read.isPermitTrackerReadRequest(message), false, message);
});
