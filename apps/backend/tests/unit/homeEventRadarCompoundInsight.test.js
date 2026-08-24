const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const {
  compoundMaintenanceFacts,
  reconcileRadarCompoundInsightsForProperty,
} = require('../../src/modules/homeEventRadar/services/radarCompoundInsight.service');

const NOW = new Date('2026-07-27T12:00:00.000Z');

test('maintenance fact assembly distinguishes due/current filters and open roof issues', () => {
  const due = compoundMaintenanceFacts([
    {
      title: 'Replace HVAC filter',
      category: 'HVAC',
      status: 'PENDING',
      nextDueDate: '2026-07-26T12:00:00.000Z',
    },
    {
      title: 'Repair roof flashing',
      category: 'ROOFING',
      status: 'IN_PROGRESS',
    },
  ], NOW);
  assert.deepEqual(due, {
    hvacFilterState: 'due',
    unresolvedRoofIssue: true,
    unresolvedGutterOrDrainageIssue: false,
  });

  const current = compoundMaintenanceFacts([
    {
      title: 'Replace furnace filter',
      category: 'HVAC',
      status: 'COMPLETED',
      lastCompletedDate: '2026-07-01T12:00:00.000Z',
    },
    {
      title: 'Repair roof',
      category: 'ROOFING',
      status: 'COMPLETED',
    },
  ], NOW);
  assert.deepEqual(current, {
    hvacFilterState: 'current',
    unresolvedRoofIssue: false,
    unresolvedGutterOrDrainageIssue: false,
  });
});

// Home Intelligence FRD Phase 5 work item 2, rule 2 of 7 (HI-CMP-002).
test('maintenance fact assembly detects an open gutter/downspout/drainage task and ignores a completed one', () => {
  const open = compoundMaintenanceFacts([
    { title: 'Clean gutters and downspouts', category: 'EXTERIOR', status: 'PENDING' },
  ], NOW);
  assert.equal(open.unresolvedGutterOrDrainageIssue, true);

  const completed = compoundMaintenanceFacts([
    { title: 'Clean gutters and downspouts', category: 'EXTERIOR', status: 'COMPLETED' },
  ], NOW);
  assert.equal(completed.unresolvedGutterOrDrainageIssue, false);

  const regrade = compoundMaintenanceFacts([
    { title: 'Regrade soil away from foundation for drainage', category: 'EXTERIOR', status: 'NEEDS_REVIEW' },
  ], NOW);
  assert.equal(regrade.unresolvedGutterOrDrainageIssue, true);

  const unrelated = compoundMaintenanceFacts([
    { title: 'Replace furnace filter', category: 'HVAC', status: 'PENDING' },
  ], NOW);
  assert.equal(unrelated.unresolvedGutterOrDrainageIssue, false);
});

test('reconciliation upserts active insights and resolves absent prior correlations', async () => {
  const upserts = [];
  const updateManyCalls = [];
  const db = {
    property: {
      findUnique: async () => ({
        id: 'property-1',
        hasSumpPump: true,
        hasSumpPumpBackup: false,
        primaryHeatingFuel: 'electric',
      }),
    },
    propertyRadarMatch: {
      findMany: async () => ([
        {
          id: 'match-rain',
          lifecycleStatus: 'now',
          sourceFreshnessStatus: 'fresh',
          radarEvent: {
            id: 'event-rain',
            eventType: 'heavy_rain',
            eventSubType: null,
            severity: 'high',
            startAt: new Date('2026-07-27T10:00:00.000Z'),
            endAt: new Date('2026-07-28T10:00:00.000Z'),
            sourceDefinitionId: 'source-rain',
            sourceDefinition: { name: 'NWS', provider: 'NWS' },
            canonicalUrl: 'https://weather.gov/rain',
          },
        },
        {
          id: 'match-outage',
          lifecycleStatus: 'now',
          sourceFreshnessStatus: 'fresh',
          radarEvent: {
            id: 'event-outage',
            eventType: 'utility_outage',
            eventSubType: null,
            severity: 'medium',
            startAt: new Date('2026-07-27T11:00:00.000Z'),
            endAt: new Date('2026-07-27T18:00:00.000Z'),
            sourceDefinitionId: 'source-outage',
            sourceDefinition: { name: 'Utility feed', provider: 'Utility' },
            canonicalUrl: 'https://utility.example/outage',
          },
        },
      ]),
    },
    propertyMaintenanceTask: {
      findMany: async () => [],
    },
    propertyRadarCompoundInsight: {
      upsert: async (input) => {
        upserts.push(input);
        return input.create;
      },
      updateMany: async (input) => {
        updateManyCalls.push(input);
        return { count: 2 };
      },
    },
  };

  const result = await reconcileRadarCompoundInsightsForProperty(
    'property-1',
    db,
    NOW,
  );
  assert.equal(result.active, 1);
  assert.equal(result.resolved, 2);
  assert.deepEqual(
    upserts.map((call) => call.create.ruleCode).sort(),
    ['HEAVY_RAIN_OUTAGE_SUMP_BACKUP'],
  );
  assert.equal(upserts.length, 1);
  assert.deepEqual(
    upserts[0].create.sourceEventIdsJson.sort(),
    ['event-outage', 'event-rain'],
  );
  assert.equal(updateManyCalls.length, 1);
  assert.deepEqual(
    updateManyCalls[0].where.correlationKey.notIn,
    result.correlationKeys,
  );
});
