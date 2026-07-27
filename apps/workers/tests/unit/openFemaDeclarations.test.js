const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');
require('tsconfig-paths/register');

const {
  OPEN_FEMA_ADAPTER_VERSION,
  openFemaDeclarationsJob,
  openFemaSourceRegistration,
  parseOpenFemaPayload,
} = require('../../src/jobs/openFemaDeclarations.job');
const {
  OPEN_FEMA_RELEVANCE_DAYS,
  openFemaDeclarationRadarAdapter,
} = require('../../src/radar/openFemaDeclarationRadarAdapter');

const NOW = new Date('2026-07-27T02:00:00.000Z');

function record(overrides = {}) {
  return {
    femaDeclarationString: 'DR-4925-NJ',
    disasterNumber: 4925,
    state: 'NJ',
    declarationType: 'DR',
    declarationDate: '2026-07-20T00:00:00.000Z',
    incidentType: 'Flood',
    declarationTitle: 'SEVERE STORMS AND FLOODING',
    ihProgramDeclared: true,
    iaProgramDeclared: false,
    paProgramDeclared: true,
    hmProgramDeclared: true,
    incidentBeginDate: '2026-07-15T00:00:00.000Z',
    incidentEndDate: '2026-07-17T00:00:00.000Z',
    disasterCloseoutDate: null,
    fipsStateCode: '34',
    fipsCountyCode: '021',
    designatedArea: 'Mercer (County)',
    lastRefresh: '2026-07-25T12:00:00.000Z',
    hash: 'abc123',
    id: 'record-1',
    ...overrides,
  };
}

function payload(records) {
  return {
    metadata: {
      rundate: '2026-07-27T01:58:00.000Z',
      entityname: 'DisasterDeclarationsSummaries',
      version: 'v2',
    },
    DisasterDeclarationsSummaries: records,
  };
}

test('OpenFEMA parser accepts v2 records and separates malformed and unsupported tribal areas', () => {
  const parsed = parseOpenFemaPayload(payload([
    record(),
    record({
      id: 'tribal',
      fipsCountyCode: '000',
      designatedArea: 'Example Indian Reservation',
    }),
    { disasterNumber: 1 },
  ]));

  assert.equal(parsed.valid, true);
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.ignored, 1);
  assert.equal(parsed.rejected, 1);
  assert.equal(parsed.runDate, '2026-07-27T01:58:00.000Z');
  assert.equal(parsed.records[0].householdAssistance, true);
  assert.equal(parseOpenFemaPayload({ records: [] }).valid, false);
});

test('OpenFEMA adapter emits exact county/state geography and recovery—not hazard—copy', async () => {
  const countyRecord = parseOpenFemaPayload(payload([record()])).records[0];
  const county = await openFemaDeclarationRadarAdapter.normalize(countyRecord, {
    sourceDefinitionId: 'source-1',
    observedAt: NOW.toISOString(),
  });

  assert.equal(county.sourceFamily, 'disaster');
  assert.equal(county.eventType, 'disaster_declaration');
  assert.equal(county.eventSubType, 'dr_flood');
  assert.equal(county.providerEventId, 'openfema:4925:34021');
  assert.equal(county.severity, 'moderate');
  assert.equal(county.lifecycleStatus, 'active');
  assert.deepEqual(county.geography, {
    type: 'administrative_area',
    countryCode: 'US',
    level: 'county',
    name: 'Mercer (County)',
    code: '34021',
  });
  assert.match(county.summary, /recovery and assistance context, not an immediate hazard warning/i);
  assert.match(county.summary, /eligibility is not guaranteed/i);

  const statewideRecord = parseOpenFemaPayload(payload([
    record({
      id: 'statewide',
      fipsCountyCode: '000',
      designatedArea: 'Statewide',
      ihProgramDeclared: false,
      paProgramDeclared: true,
    }),
  ])).records[0];
  const statewide = await openFemaDeclarationRadarAdapter.normalize(statewideRecord, {
    sourceDefinitionId: 'source-1',
    observedAt: NOW.toISOString(),
  });
  assert.deepEqual(statewide.geography, {
    type: 'administrative_area',
    countryCode: 'US',
    level: 'state',
    name: 'NJ',
    code: 'NJ',
  });
  assert.match(statewide.summary, /does not by itself confirm homeowner assistance/i);
});

test('OpenFEMA adapter uses hash revisions, closeout resolution, and bounded relevance expiry', async () => {
  const activeRecord = parseOpenFemaPayload(payload([record()])).records[0];
  const active = await openFemaDeclarationRadarAdapter.normalize(activeRecord, {
    sourceDefinitionId: 'source-1',
    observedAt: NOW.toISOString(),
  });
  assert.equal(active.providerRevision, '2026-07-25T12:00:00.000Z:abc123');
  assert.equal(
    active.expiresAt,
    new Date(
      new Date(activeRecord.declarationDate).getTime()
        + OPEN_FEMA_RELEVANCE_DAYS * 86_400_000,
    ).toISOString(),
  );

  const closedRecord = parseOpenFemaPayload(payload([
    record({ disasterCloseoutDate: '2026-07-26T00:00:00.000Z' }),
  ])).records[0];
  const closed = await openFemaDeclarationRadarAdapter.normalize(closedRecord, {
    sourceDefinitionId: 'source-1',
    observedAt: NOW.toISOString(),
  });
  assert.equal(closed.lifecycleStatus, 'resolved');
  assert.equal(closed.expiresAt, '2026-07-26T00:00:00.000Z');
});

function fakeDeps(byState) {
  const calls = { register: [], begin: [], complete: [], enqueue: [], states: [] };
  const deps = {
    registry: {
      async register(input) {
        calls.register.push(input);
        return { id: 'source-1', key: 'openfema-declarations' };
      },
    },
    runs: {
      async begin(input) {
        calls.begin.push(input);
        return { runnable: true, reason: 'source is runnable', run: { id: 'run-1' } };
      },
      async complete(runId, input) {
        calls.complete.push({ runId, input });
      },
    },
    ingestQueue: {
      async enqueue(input) {
        calls.enqueue.push(input);
      },
    },
    async *iterateAllProperties() {
      yield { id: 'property-1', state: 'NJ', countyFips: '34021' };
      yield { id: 'property-2', state: 'NJ', countyFips: '34023' };
      yield { id: 'property-3', state: 'PA', countyFips: '42017' };
    },
    async fetchState(state) {
      calls.states.push(state);
      return byState[state];
    },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    now: () => NOW,
    correlationId: () => 'correlation-1',
    sleep: async () => {},
    env: { NODE_ENV: 'test', WORKER_JOB_OPENFEMA_DECLARATIONS_ENABLED: 'true' },
  };
  return { calls, deps };
}

test('OpenFEMA job fetches once per property state and queues exact county/state matches once', async () => {
  const nj = parseOpenFemaPayload(payload([
    record(),
    record({
      id: 'republished-record',
      hash: 'newer-hash',
      lastRefresh: '2026-07-26T12:00:00.000Z',
    }),
    record({ id: 'other-county', fipsCountyCode: '005', designatedArea: 'Burlington (County)' }),
    record({ id: 'statewide', fipsCountyCode: '000', designatedArea: 'Statewide' }),
  ]));
  const { calls, deps } = fakeDeps({
    NJ: { status: 'ok', ...nj, pages: 1 },
    PA: {
      status: 'ok',
      records: [],
      rejected: 0,
      ignored: 0,
      pages: 1,
      runDate: nj.runDate,
    },
  });

  const result = await openFemaDeclarationsJob(undefined, deps);

  assert.equal(result.sourceRunStatus, 'success');
  assert.equal(result.statesQueried, 2);
  assert.deepEqual(calls.states.sort(), ['NJ', 'PA']);
  assert.equal(result.matchedDeclarations, 2);
  assert.equal(result.queued, 2);
  assert.equal(calls.enqueue.length, 2);
  assert.equal(
    calls.enqueue.find((call) => call.observation.providerEventId === 'openfema:4925:34021')
      .observation.providerRevision,
    '2026-07-26T12:00:00.000Z:newer-hash',
  );
  assert.equal(calls.register[0].adapterVersion, OPEN_FEMA_ADAPTER_VERSION);
  assert.equal(calls.register[0].sourceType, 'disaster_provider');
  assert.equal(calls.complete[0].input.propertiesEvaluated, 3);
  assert.equal(
    calls.complete[0].input.dataFreshThrough.toISOString(),
    '2026-07-27T01:58:00.000Z',
  );
});

test('OpenFEMA dry run is non-durable and all-state failure does not mark data fresh', async () => {
  const parsed = parseOpenFemaPayload(payload([record()]));
  const dry = fakeDeps({
    NJ: { status: 'ok', ...parsed, pages: 1 },
    PA: { status: 'ok', records: [], rejected: 0, ignored: 0, pages: 1 },
  });
  const dryResult = await openFemaDeclarationsJob({ dryRun: true }, dry.deps);
  assert.equal(dryResult.sourceRunStatus, 'dry_run');
  assert.equal(dryResult.queued, 0);
  assert.equal(dry.calls.register.length, 0);
  assert.equal(dry.calls.complete.length, 0);
  assert.equal(dry.calls.enqueue.length, 0);

  const failure = {
    status: 'failed',
    records: [],
    rejected: 0,
    ignored: 0,
    pages: 0,
    error: 'OpenFEMA HTTP 503',
  };
  const failed = fakeDeps({ NJ: failure, PA: failure });
  const failedResult = await openFemaDeclarationsJob(undefined, failed.deps);
  assert.equal(failedResult.sourceRunStatus, 'failed');
  assert.equal(failed.calls.complete[0].input.errorCode, 'OPEN_FEMA_FETCH_FAILED');
  assert.equal(failed.calls.complete[0].input.dataFreshThrough, undefined);
});

test('OpenFEMA registration is slow-frequency, launch-closed, and US-scoped', () => {
  const registration = openFemaSourceRegistration({ NODE_ENV: 'production' });
  assert.equal(registration.scheduleCron, '17 */6 * * *');
  assert.equal(registration.sourceType, 'disaster_provider');
  assert.deepEqual(registration.coverage, [{ coverageType: 'country', countryCode: 'US' }]);
  assert.equal(registration.configJson.datasetVersion, 'v2');
  assert.equal(registration.configJson.relevanceDays, 548);
});
