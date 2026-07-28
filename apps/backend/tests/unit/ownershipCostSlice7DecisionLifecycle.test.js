const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  OwnershipCostDecisionService,
  resolveOwnershipCostCategoryAction,
  resolveOwnershipCostPlanningAction,
} = require(
  '../../src/services/ownershipCosts/ownershipCostDecision.service.ts',
);

const categories = [
  'PROPERTY_TAX',
  'INSURANCE',
  'HOA',
  'UTILITIES',
  'MORTGAGE_PRINCIPAL',
  'MORTGAGE_INTEREST',
  'PMI',
  'RECURRING_HOME_SERVICE',
  'ROUTINE_MAINTENANCE',
  'KNOWN_REPAIR',
  'CAPITAL_PROJECT',
  'RESERVE_CONTRIBUTION',
];

test('Slice 7 resolves every ownership-cost category to its canonical owner', () => {
  const resolved = Object.fromEntries(
    categories.map((category) => [
      category,
      resolveOwnershipCostCategoryAction('property-1', category),
    ]),
  );

  assert.match(resolved.PROPERTY_TAX.href, /tools\/property-tax$/);
  assert.match(resolved.INSURANCE.href, /tools\/coverage-intelligence$/);
  assert.match(resolved.MORTGAGE_INTEREST.href, /tools\/financing$/);
  assert.match(resolved.UTILITIES.href, /savings-benefits.*category=energy/);
  assert.match(resolved.HOA.href, /dashboard\/hoa\?propertyId=/);
  assert.match(resolved.ROUTINE_MAINTENANCE.href, /dashboard\/maintenance\?propertyId=/);
  assert.match(resolved.CAPITAL_PROJECT.href, /tools\/capital-timeline$/);
  assert.match(resolved.RESERVE_CONTRIBUTION.href, /tools\/reserve-fund$/);
  assert.equal(resolved.RECURRING_HOME_SERVICE.owner, 'SAVINGS');
  assert.equal(resolveOwnershipCostPlanningAction('property-1', 'BUDGET').owner, 'BUDGET');
  assert.equal(resolveOwnershipCostPlanningAction('property-1', 'RESERVE_FUND').owner, 'RESERVE_FUND');
  for (const category of categories) {
    assert.ok(resolved[category].href, `${category} must be executable`);
    assert.ok(resolved[category].guidanceToolKey, `${category} must name its Guidance owner`);
  }
});

function lifecycleHarness() {
  const rows = [];
  const writes = [];
  let sequence = 0;
  const service = new OwnershipCostDecisionService({
    authorize: async () => true,
    loadLatestSnapshot: async () => ({ id: 'snapshot-latest' }),
    loadChange: async (_propertyId, changeId) => changeId === 'change-1'
      ? {
        id: changeId,
        category: 'PROPERTY_TAX',
        toSnapshotId: 'snapshot-change',
        evidenceJson: {
          explanation: 'The verified tax bill increased by $420.',
        },
      }
      : null,
    loadScenario: async (_propertyId, scenarioId) => scenarioId === 'scenario-1'
      ? { id: scenarioId, baseSnapshotId: 'snapshot-scenario' }
      : null,
    listCurrent: async () => rows.filter((row) => row.status !== 'SUPERSEDED'),
    persistTransition: async (input) => {
      const previous = rows.find(
        (row) => row.sourceActionId === input.sourceActionId
          && row.status !== 'SUPERSEDED',
      );
      const row = {
        id: `decision-${++sequence}`,
        propertyId: input.propertyId,
        snapshotId: input.snapshotId,
        scenarioId: input.scenarioId,
        recordedByUserId: input.userId,
        decisionType: input.decisionType,
        status: previous ? 'REVISED' : 'RECORDED',
        payloadJson: input.payload,
        sourceActionId: input.sourceActionId,
        recordedAt: new Date(`2026-07-${String(sequence).padStart(2, '0')}T12:00:00.000Z`),
        supersededById: null,
      };
      if (previous) {
        previous.status = 'SUPERSEDED';
        previous.supersededById = row.id;
      }
      rows.push(row);
      writes.push(input);
      return row;
    },
    now: () => new Date('2026-07-01T12:00:00.000Z'),
  });
  return { service, rows, writes };
}

test('accept, save, snooze, dismiss, no-action, resolve, and reopen are revisions of one action', async () => {
  const { service, rows, writes } = lifecycleHarness();
  const sourceActionId = 'ownership-cost-change:change-1';
  const transitions = [
    { action: 'ACCEPT' },
    { action: 'SAVE' },
    { action: 'SNOOZE', revisitAt: '2026-08-01T12:00:00.000Z' },
    { action: 'DISMISS', reason: 'Tax record is being corrected.' },
    { action: 'NO_ACTION', reason: 'The household budget already covers it.' },
    { action: 'RESOLVE', reason: 'Reviewed the verified bill and updated the plan.' },
    { action: 'REOPEN' },
  ];

  const recorded = [];
  for (const transition of transitions) {
    recorded.push(await service.record('property-1', 'user-1', {
      ...transition,
      sourceChangeId: 'change-1',
      sourceActionId,
    }));
  }

  assert.deepEqual(
    recorded.map((decision) => decision.lifecycleState),
    ['ACCEPTED', 'SAVED', 'SNOOZED', 'DISMISSED', 'NO_ACTION', 'RESOLVED', 'OPEN'],
  );
  assert.equal(rows.filter((row) => row.status !== 'SUPERSEDED').length, 1);
  assert.equal(rows.at(-1).status, 'REVISED');
  assert.equal(writes.at(-1).sourceActionId, sourceActionId);
  assert.equal(recorded[0].snapshotId, 'snapshot-change');
  assert.equal(
    recorded[0].source.explanation,
    'The verified tax bill increased by $420.',
  );
  assert.equal(recorded[0].destination.owner, 'PROPERTY_TAX');
});

test('completion and dismissal require homeowner reasons and snooze creates a bounded revisit event', async () => {
  const { service } = lifecycleHarness();

  await assert.rejects(
    service.record('property-1', 'user-1', {
      action: 'RESOLVE',
      category: 'INSURANCE',
    }),
    /requires a homeowner reason/i,
  );
  await assert.rejects(
    service.record('property-1', 'user-1', {
      action: 'SNOOZE',
      category: 'INSURANCE',
      revisitAt: '2028-01-01T00:00:00.000Z',
    }),
    /within 365 days/i,
  );

  await service.record('property-1', 'user-1', {
    action: 'SNOOZE',
    category: 'INSURANCE',
    reason: 'Review before renewal.',
    revisitAt: '2026-09-01T12:00:00.000Z',
  });
  const readModel = await service.list('property-1', 'user-1');
  assert.equal(readModel.revisitEvents.length, 1);
  assert.equal(readModel.revisitEvents[0].revisitAt, '2026-09-01T12:00:00.000Z');
  assert.match(readModel.lifecycleRule, /explicit homeowner decision or resolution/i);
});

test('notification controls are durable, merged, and tied to a source snapshot', async () => {
  const { service, writes } = lifecycleHarness();

  const first = await service.updateNotificationPreferences(
    'property-1',
    'user-1',
    { MATERIAL_CHANGE: false },
  );
  const second = await service.updateNotificationPreferences(
    'property-1',
    'user-1',
    { MISSING_HIGH_IMPACT_FACT: true },
  );

  assert.equal(first.preferences.MATERIAL_CHANGE, false);
  assert.equal(second.preferences.MATERIAL_CHANGE, false);
  assert.equal(second.preferences.MISSING_HIGH_IMPACT_FACT, true);
  assert.equal(second.snapshotId, 'snapshot-latest');
  assert.equal(writes.at(-1).decisionType, 'NOTIFICATION_PREFERENCE');
  assert.equal(writes.at(-1).sourceActionId, 'ownership-cost-notifications');
});

test('routes and Home Actions share the Slice 7 lifecycle contract', () => {
  const routes = fs.readFileSync(
    path.join(__dirname, '../../src/routes/ownershipCosts.routes.ts'),
    'utf8',
  );
  const homeActions = fs.readFileSync(
    path.join(__dirname, '../../src/services/homeActions.service.ts'),
    'utf8',
  );
  const promotion = fs.readFileSync(
    path.join(__dirname, '../../src/services/homeActionSourcePromotion.service.ts'),
    'utf8',
  );

  assert.match(routes, /ownership-costs\/decisions/);
  assert.match(routes, /ownership-costs\/notification-preferences/);
  assert.match(homeActions, /ownershipCostDecisionService\.record/);
  assert.match(promotion, /resolveOwnershipCostCategoryAction/);
  assert.doesNotMatch(promotion, /recommendedAction: 'Find generic savings'/);
});
