const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const {
  RadarTaskIntegrationService,
} = require('../../src/modules/homeEventRadar/services/radarTaskIntegration.service');
const {
  radarTaskIntegrationBodySchema,
  radarTaskActionRequestSchema,
} = require('../../src/validators/homeEventRadar.validators');

const NOW = new Date('2026-07-26T12:00:00.000Z');

function matchFixture(overrides = {}) {
  return {
    id: 'match-1',
    propertyId: 'property-1',
    impactLevel: 'moderate',
    confidence: 'medium',
    isVisible: true,
    recommendedActionsJson: {
      actions: [{
        code: 'SECURE_OUTDOOR_ITEMS',
        label: 'Secure outdoor items',
        priority: 'high',
        responsibilityScope: 'BUILDING_EXTERIOR',
        responsibleParty: 'OWNER',
        applicability: 'owner_action',
      }],
    },
    taskLinks: [],
    radarEvent: {
      id: 'event-1',
      eventType: 'wind',
      title: 'Wind advisory',
      canonicalUrl: 'https://weather.gov/example',
      startAt: new Date('2026-07-27T18:00:00.000Z'),
      endAt: new Date('2026-07-28T18:00:00.000Z'),
      sourceDefinition: { family: 'weather' },
      revisions: [{
        effectiveAt: new Date('2026-07-27T18:00:00.000Z'),
        expiresAt: new Date('2026-07-28T18:00:00.000Z'),
      }],
    },
    ...overrides,
  };
}

function fixture({ match = matchFixture(), householdMember = true } = {}) {
  const createdTasks = [];
  const createdLinks = [];
  const actions = [];
  let taskSequence = 0;
  const transaction = {
    propertyMaintenanceTask: {
      upsert: async ({ create }) => {
        const task = {
          id: `task-${++taskSequence}`,
          ...create,
          createdAt: NOW,
          updatedAt: NOW,
        };
        createdTasks.push(task);
        return task;
      },
      findFirst: async ({ where }) => where.id === 'existing-task'
        ? {
            id: 'existing-task',
            propertyId: 'property-1',
            title: 'Existing roof task',
            status: 'PENDING',
            priority: 'MEDIUM',
            nextDueDate: null,
            assignedToUserId: null,
          }
        : null,
      update: async ({ data }) => ({
        id: 'existing-task',
        propertyId: 'property-1',
        title: 'Existing roof task',
        status: 'PENDING',
        priority: 'MEDIUM',
        nextDueDate: null,
        ...data,
      }),
    },
    propertyRadarTaskLink: {
      upsert: async ({ create }) => {
        const task = createdTasks.find((candidate) => candidate.id === create.maintenanceTaskId)
          ?? await transaction.propertyMaintenanceTask.findFirst({
            where: { id: create.maintenanceTaskId },
          });
        const link = {
          id: `link-${createdLinks.length + 1}`,
          ...create,
          maintenanceTask: task,
          createdAt: NOW,
          updatedAt: NOW,
        };
        createdLinks.push(link);
        return link;
      },
    },
    propertyRadarAction: {
      create: async ({ data }) => actions.push(data),
    },
  };
  const db = {
    propertyRadarMatch: {
      findFirst: async () => match,
    },
    householdMember: {
      findUnique: async () => householdMember ? { id: 'member-1' } : null,
    },
    propertyMaintenanceTask: {
      findMany: async () => [],
    },
    $transaction: async (work) => work(transaction),
  };
  return {
    actions,
    createdLinks,
    createdTasks,
    service: new RadarTaskIntegrationService({ db, now: () => NOW }),
  };
}

test('creates a canonical maintenance task with derived timing and Radar lineage', async () => {
  const { actions, createdTasks, service } = fixture();
  const result = await service.createOrLink(
    'property-1',
    'match-1',
    'SECURE_OUTDOOR_ITEMS',
    'user-1',
    { operation: 'create_task', assigneeUserId: 'user-2' },
  );

  assert.equal(result.deduped, false);
  assert.equal(result.link.operation, 'create_task');
  assert.equal(result.link.dueDateSource, 'event_effective');
  assert.equal(createdTasks[0].nextDueDate.toISOString(), '2026-07-26T18:00:00.000Z');
  assert.equal(createdTasks[0].assignedToUserId, 'user-2');
  assert.deepEqual(createdTasks[0].completionMetadata, {
    source: 'HOME_EVENT_RADAR',
    propertyRadarMatchId: 'match-1',
    radarEventId: 'event-1',
    actionCode: 'SECURE_OUTDOOR_ITEMS',
    operation: 'create_task',
  });
  assert.equal(actions[0].actionType, 'create_maintenance_task');
  assert.equal(actions[0].actionMetaJson.maintenanceTaskId, 'task-1');
});
test('creates a reminder through the canonical maintenance due-date workflow', async () => {
  const { createdTasks, service } = fixture();
  const result = await service.createOrLink(
    'property-1',
    'match-1',
    'SECURE_OUTDOOR_ITEMS',
    'user-1',
    {
      operation: 'create_reminder',
      dueAt: '2026-07-30T12:00:00.000Z',
    },
  );

  assert.equal(result.link.operation, 'create_reminder');
  assert.equal(result.link.dueDateSource, 'user_provided');
  assert.equal(createdTasks[0].title, 'Reminder: Secure or bring in loose outdoor items');
  assert.equal(createdTasks[0].nextDueDate.toISOString(), '2026-07-30T12:00:00.000Z');
});

test('links an existing property task and preserves the Radar match lineage', async () => {
  const { createdLinks, service } = fixture();
  const result = await service.createOrLink(
    'property-1',
    'match-1',
    'SECURE_OUTDOOR_ITEMS',
    'user-1',
    { operation: 'link_existing_task', maintenanceTaskId: 'existing-task' },
  );

  assert.equal(result.link.task.id, 'existing-task');
  assert.equal(result.link.operation, 'link_existing_task');
  assert.equal(createdLinks[0].propertyRadarMatchId, 'match-1');
  assert.match(result.link.task.href, /radarMatchId=match-1/);
});

test('deduplicates an action already linked to a task', async () => {
  const existingLink = {
    id: 'link-existing',
    propertyRadarMatchId: 'match-1',
    actionCode: 'SECURE_OUTDOOR_ITEMS',
    linkType: 'create_task',
    dueDateSource: null,
    dueAt: null,
    maintenanceTask: {
      id: 'task-existing',
      propertyId: 'property-1',
      title: 'Secure outdoor items',
      status: 'PENDING',
      nextDueDate: null,
      assignedToUserId: null,
    },
    createdAt: NOW,
    updatedAt: NOW,
  };
  const { createdTasks, service } = fixture({
    match: matchFixture({ taskLinks: [existingLink] }),
  });

  const result = await service.createOrLink(
    'property-1',
    'match-1',
    'SECURE_OUTDOOR_ITEMS',
    'user-1',
    { operation: 'create_task' },
  );

  assert.equal(result.deduped, true);
  assert.equal(result.link.task.id, 'task-existing');
  assert.equal(createdTasks.length, 0);
});

test('rejects an assignee outside the property household', async () => {
  const { service } = fixture({ householdMember: false });
  await assert.rejects(
    service.createOrLink(
      'property-1',
      'match-1',
      'SECURE_OUTDOOR_ITEMS',
      'user-1',
      { operation: 'create_task', assigneeUserId: 'outsider' },
    ),
    (error) => error.code === 'RADAR_ASSIGNEE_NOT_IN_HOUSEHOLD',
  );
});

test('task request validators bind route params and enforce operation-specific input', () => {
  assert.equal(radarTaskActionRequestSchema.safeParse({
    params: {
      propertyId: 'property-1',
      matchId: 'match-1',
      actionCode: 'SECURE_OUTDOOR_ITEMS',
    },
    query: {},
  }).success, true);
  assert.equal(radarTaskIntegrationBodySchema.safeParse({
    operation: 'link_existing_task',
  }).success, false);
  assert.equal(radarTaskIntegrationBodySchema.safeParse({
    operation: 'create_task',
    maintenanceTaskId: 'task-1',
  }).success, false);
});
