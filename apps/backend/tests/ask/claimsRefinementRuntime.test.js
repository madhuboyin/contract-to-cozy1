const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Claims C-2 (FRD v1.128): the status read's filters are a governed refinement. The real registered `incident-claim.status` handler runs
// against a fake prisma that honours status filters, take limits and counts, and records which queries ran. Reading never writes.
const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { resolveClaimsRefinement, claimsFilterChips, claimsScopeFromWords } = require('../../src/services/ask/handlers/claims.handler.ts');
const { isFilterContinuationMessage, resolveAskFollowUpMessage } = require('../../src/services/ask/askFollowUpContext.ts');

const realPrisma = prismaModule.prisma;
const originalAccess = propertyAccess.resolvePropertyAccess;
const inStatus = (row, where) => !where?.status || (where.status.in ? where.status.in.includes(row.status) : where.status.notIn ? !where.status.notIn.includes(row.status) : true);
const incident = (id, status) => ({ id, title: `Incident ${id}`, summary: null, status, severity: 'HIGH', openedAt: new Date('2026-09-01'), resolvedAt: status === 'RESOLVED' ? new Date('2026-09-10') : null, typeKey: 'WATER_LEAK' });
const claim = (id, status) => ({ id, title: `Claim ${id}`, status, type: 'WATER_DAMAGE', sourceType: 'INSURANCE', providerName: 'Acme', incidentAt: null, openedAt: new Date('2026-09-01'), closedAt: status === 'CLOSED' ? new Date('2026-09-15') : null, updatedAt: new Date('2026-09-20') });
const BASE = { incidents: [incident('i-active', 'ACTIVE'), incident('i-resolved', 'RESOLVED')], claims: [claim('c-open', 'SUBMITTED'), claim('c-draft', 'DRAFT'), claim('c-closed', 'CLOSED')] };

let data; let calls; let priorOperation; let priorViewState;
function install(overrides = {}) {
  data = { ...BASE, ...overrides }; calls = []; priorOperation = 'INCIDENT_CLAIM_STATUS'; priorViewState = null;
  const model = (name) => ({
    findMany: async ({ where, take }) => { calls.push([name, 'findMany', take]); return data[name === 'incident' ? 'incidents' : 'claims'].filter((row) => inStatus(row, where)).slice(0, take); },
    count: async ({ where }) => { calls.push([name, 'count']); return data[name === 'incident' ? 'incidents' : 'claims'].filter((row) => inStatus(row, where)).length; },
  });
  prismaModule.prisma = new Proxy({}, { get(_t, m) {
    if (m === 'then') return undefined;
    if (m === 'incident') return model('incident');
    if (m === 'claim') return model('claim');
    if (m === 'askExecution') return { findFirst: async () => (priorViewState ? { operationId: priorOperation, parametersJson: { viewState: priorViewState } } : null) };
    throw new Error(`Unexpected prisma.${String(m)} access`);
  } });
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'CONTRIBUTOR', userId: 'u1', propertyId: 'p1' });
}
test.afterEach(() => { prismaModule.prisma = realPrisma; propertyAccess.resolvePropertyAccess = originalAccess; });
const run = (message, sourceExecutionId) => capabilityInvoke('INCIDENT_CLAIM_STATUS', { userId: 'u1', propertyId: 'p1', message, launchContext: sourceExecutionId ? { surface: 'ASK_WORKSPACE', sourceExecutionId } : undefined });
const list = (result) => result.blocks.find((block) => block.id === 'incident-claim-list');
const summary = (result) => result.blocks.find((block) => block.id === 'incident-claim-summary');
const ids = (result) => list(result).sections.flatMap((section) => section.items.map((item) => item.id)).sort();
const active = (result) => list(result).filters.filter((filter) => filter.active).map((filter) => filter.id).sort();
const view = (scope, state, revision, resultId = 'result-1') => ({ resultId, domainScopePhrase: scope, dateScopePhrase: null, statusFilter: state, selectedTaskId: null, revision });
const models = () => [...new Set(calls.map(([name]) => name))].sort();

test('a fresh question carries a new view state and the declared chips, and reads every bucket it asks about with an exact count', async () => {
  install();
  const result = await run('Show my incidents and claims');
  assert.equal(result.parameters.viewState.revision, 1);
  assert.equal(result.parameters.viewState.domainScopePhrase, 'BOTH');
  assert.equal(result.parameters.viewState.statusFilter, 'ALL');
  assert.match(result.parameters.viewState.resultId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(list(result).filters.map((filter) => filter.id), ['scope-both', 'scope-claims', 'scope-incidents', 'state-all', 'state-open', 'state-closed']);
  assert.deepEqual(active(result), ['scope-both', 'state-all']);
  assert.equal(summary(result).headline, '1 active incident and 2 open claims.');
  assert.equal(calls.filter(([, kind]) => kind === 'count').length, 4, 'one exact count per bucket');
});

test('words still pick the scope of a fresh question', async () => {
  assert.equal(claimsScopeFromWords('What is the status of my insurance claim?'), 'CLAIMS');
  assert.equal(claimsScopeFromWords('Any open incidents?'), 'INCIDENTS');
  assert.equal(claimsScopeFromWords('Show my incidents and claims'), 'BOTH');
  install();
  const claimsOnly = await run('What is the status of my insurance claim?');
  assert.equal(claimsOnly.parameters.viewState.domainScopePhrase, 'CLAIMS');
  assert.deepEqual(models(), ['claim'], 'incidents are never read for a claims question');
});

test('a scope chip keeps the result identity, bumps the revision, and never reads the other kind', async () => {
  install(); priorViewState = view('BOTH', 'ALL', 1);
  const result = await run('Only show claims', 'exec-1');
  assert.equal(result.parameters.viewState.resultId, 'result-1');
  assert.equal(result.parameters.viewState.revision, 2);
  assert.equal(result.parameters.viewState.domainScopePhrase, 'CLAIMS');
  assert.deepEqual(ids(result), ['c-closed', 'c-draft', 'c-open']);
  assert.deepEqual(models(), ['claim']);
  assert.deepEqual(active(result), ['scope-claims', 'state-all']);
  assert.ok(list(result).filters.some((filter) => filter.id === 'clear-all'));
});

test('a state chip replaces only the state, keeps the scope, and never reads the buckets it excludes', async () => {
  install(); priorViewState = view('CLAIMS', 'ALL', 2);
  const result = await run('Only show open records', 'exec-2');
  assert.equal(result.parameters.viewState.domainScopePhrase, 'CLAIMS');
  assert.equal(result.parameters.viewState.statusFilter, 'OPEN');
  assert.equal(result.parameters.viewState.revision, 3);
  assert.deepEqual(ids(result), ['c-draft', 'c-open']);
  assert.equal(summary(result).headline, '2 open claims.');
  assert.equal(calls.filter(([, kind]) => kind === 'findMany').length, 1, 'only the open-claims bucket is read');
  const closed = await run('Only show closed records', 'exec-3');
  assert.deepEqual(ids(closed), ['c-closed']);
});

test('"open and closed" clears only the state, "incidents and claims" only the scope, and "no filters" clears both', async () => {
  install();
  priorViewState = view('CLAIMS', 'OPEN', 3);
  const allState = await run('Now show open and closed records', 'exec-3');
  assert.equal(allState.parameters.viewState.statusFilter, 'ALL');
  assert.equal(allState.parameters.viewState.domainScopePhrase, 'CLAIMS');
  priorViewState = view('CLAIMS', 'OPEN', 3);
  const allScope = await run('Now show all incidents and claims', 'exec-3');
  assert.equal(allScope.parameters.viewState.domainScopePhrase, 'BOTH');
  assert.equal(allScope.parameters.viewState.statusFilter, 'OPEN');
  priorViewState = view('CLAIMS', 'OPEN', 3);
  const cleared = await run('Now show all records with no filters', 'exec-3');
  assert.equal(cleared.parameters.viewState.statusFilter, 'ALL');
  assert.equal(cleared.parameters.viewState.domainScopePhrase, 'BOTH');
  assert.ok(!list(cleared).filters.some((filter) => filter.id === 'clear-all'));
});

test('a filter that matches nothing still continues the result and keeps every chip so it can be widened', async () => {
  install({ incidents: [], claims: [claim('c-open', 'SUBMITTED')] }); priorViewState = view('BOTH', 'ALL', 1);
  const result = await run('Only show closed records', 'exec-1');
  assert.equal(result.reasonCode, 'INCIDENT_CLAIM_FILTER_NO_MATCH');
  assert.equal(result.parameters.viewState.revision, 2);
  assert.equal(summary(result).headline, 'Nothing matches these filters.');
  assert.ok(list(result).filters.some((filter) => filter.id === 'clear-all'));
  assert.equal(result.blocks.at(-1).id, 'claim-status-boundary');
});

test('counts are exact beyond what is shown, and a longer list says so instead of understating', async () => {
  install({ incidents: [], claims: Array.from({ length: 30 }, (_, index) => claim(`c${index}`, 'SUBMITTED')) });
  const result = await run('Show my claims');
  const section = list(result).sections.find((entry) => entry.id === 'active-claims');
  assert.equal(section.count, 30);
  assert.equal(section.items.length, 12);
  assert.equal(summary(result).headline, '30 open claims.');
  assert.match(summary(result).supportLine, /Showing the most recent records/);
});

test('another domain\'s view state is never continued, and an ordinary question is not a refinement', async () => {
  install(); priorViewState = view('BOTH', 'ALL', 7, 'buyer-result'); priorOperation = 'HOME_ACTIONS';
  const result = await run('Only show claims', 'exec-other');
  assert.notEqual(result.parameters.viewState.resultId, 'buyer-result');
  assert.equal(result.parameters.viewState.revision, 1);
  const prior = view('BOTH', 'ALL', 1);
  assert.equal(resolveClaimsRefinement('What is the status of my claim?', prior), null);
  assert.equal(resolveClaimsRefinement('Only show claims', null), null);
  assert.equal(resolveClaimsRefinement('Show my claims. Only show open records', prior)?.state, 'OPEN', 'a typed follow-up joined to the prior question still refines');
});

test('every declared chip is recognised as a filter continuation, round-trips to its own state, and resolves through the follow-up resolver', async () => {
  install();
  const prior = view('BOTH', 'ALL', 1);
  const expectations = { 'scope-both': { scope: 'BOTH' }, 'scope-claims': { scope: 'CLAIMS' }, 'scope-incidents': { scope: 'INCIDENTS' }, 'state-all': { state: 'ALL' }, 'state-open': { state: 'OPEN' }, 'state-closed': { state: 'CLOSED' } };
  prismaModule.prisma = new Proxy({}, { get(_t, m) {
    if (m === 'then') return undefined;
    if (m !== 'askExecution') throw new Error(`Unexpected prisma.${String(m)} access`);
    return { findFirst: async () => ({ id: 'exec-1', operationId: 'INCIDENT_CLAIM_STATUS', message: 'Show my claims', resultJson: {}, parametersJson: null, launchContextJson: null }) };
  } });
  for (const chip of claimsFilterChips('CLAIMS', 'OPEN')) {
    assert.ok(isFilterContinuationMessage(chip.message), `${chip.label}: "${chip.message}" must start with a filter-continuation phrase`);
    const resolved = resolveClaimsRefinement(chip.message, prior);
    assert.ok(resolved, `${chip.label} must resolve to a refinement`);
    if (chip.id === 'clear-all') assert.deepEqual(resolved, { scope: 'BOTH', state: 'ALL' });
    else {
      if (expectations[chip.id].scope) assert.equal(resolved.scope, expectations[chip.id].scope, chip.label);
      if (expectations[chip.id].state) assert.equal(resolved.state, expectations[chip.id].state, chip.label);
    }
    const resolution = await resolveAskFollowUpMessage({ sessionId: 's1', propertyId: 'p1', message: chip.message, declaredSourceExecutionId: 'exec-1' });
    assert.equal(resolution.forcedOperationId, 'INCIDENT_CLAIM_STATUS', chip.label);
    assert.equal(resolution.isFilterRefinement, true, `${chip.label}: a refinement is what supersedes the earlier result`);
    assert.equal(resolution.effectiveMessage, chip.message, `${chip.label}: the chip wording is a complete specification`);
  }
});
