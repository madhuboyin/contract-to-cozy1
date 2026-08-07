const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Bug fix: weatherPreparation.service.ts's startWeatherPreparation creates a
// durable WEATHER_PREPARATION Incident from a forecast-anchored, date-scoped
// EnvironmentInsight, but nothing ever revisits it once the weather window
// passes — it sits in ACTIONED/MITIGATED under the Incidents page's "Active"
// filter forever. expireStaleWeatherPreparations auto-resolves it once
// details.effectiveTo is a few days in the past, using the same RESOLVED +
// autoResolved-tagged-event convention as the existing manual/dedupe
// auto-resolve path in incident.service.ts's upsertIncident — a real
// resolution ("the weather is no longer happening"), not a silent removal.

const incidents = new Map();
const events = [];

function reset() {
  incidents.clear();
  events.length = 0;
}

function seedIncident(overrides = {}) {
  const id = overrides.id ?? crypto.randomUUID();
  const row = {
    id,
    propertyId: 'property-1',
    userId: 'user-1',
    typeKey: 'WEATHER_PREPARATION',
    status: 'ACTIONED',
    resolvedAt: null,
    details: { effectiveTo: '2026-07-28' },
    ...overrides,
    id,
  };
  incidents.set(id, row);
  return row;
}

const prismaMock = {
  incident: {
    findMany: async ({ where }) => [...incidents.values()].filter((incident) => {
      if (where.typeKey && incident.typeKey !== where.typeKey) return false;
      if (where.status?.in && !where.status.in.includes(incident.status)) return false;
      if (where.propertyId && incident.propertyId !== where.propertyId) return false;
      return true;
    }),
    update: async ({ where, data }) => {
      const row = { ...incidents.get(where.id), ...data };
      incidents.set(where.id, row);
      return row;
    },
  },
  incidentEvent: {
    create: async ({ data }) => {
      const row = { id: crypto.randomUUID(), ...data };
      events.push(row);
      return row;
    },
  },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

const { expireStaleWeatherPreparations } = require('../../src/services/incidents/expireWeatherPreparationIncidents.usecase.ts');

test('auto-resolves a mitigated preparation whose weather window is well past the grace period', async () => {
  reset();
  const incident = seedIncident({ status: 'MITIGATED', details: { effectiveTo: '2026-01-01' } });

  const result = await expireStaleWeatherPreparations();

  assert.equal(result.examined, 1);
  assert.equal(result.resolved, 1);
  const updated = incidents.get(incident.id);
  assert.equal(updated.status, 'RESOLVED');
  assert.ok(updated.resolvedAt instanceof Date);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'RESOLVED');
  assert.equal(events[0].payload.autoResolved, true);
});

test('auto-resolves an untouched (never-mitigated) preparation too — the homeowner never acting does not keep it alive', async () => {
  reset();
  const incident = seedIncident({ status: 'ACTIONED', details: { effectiveTo: '2026-01-01' } });

  const result = await expireStaleWeatherPreparations();

  assert.equal(result.resolved, 1);
  assert.equal(incidents.get(incident.id).status, 'RESOLVED');
});

test('leaves a preparation alone whose weather window is still within the grace period', async () => {
  reset();
  const recentDate = new Date(Date.now() - 60 * 60 * 1000).toISOString().slice(0, 10); // 1 hour ago
  const incident = seedIncident({ details: { effectiveTo: recentDate } });

  const result = await expireStaleWeatherPreparations();

  assert.equal(result.examined, 0);
  assert.equal(incidents.get(incident.id).status, 'ACTIONED');
});

test('never touches an incident already RESOLVED, EXPIRED, or SUPPRESSED', async () => {
  reset();
  const resolved = seedIncident({ status: 'RESOLVED', details: { effectiveTo: '2026-01-01' } });

  const result = await expireStaleWeatherPreparations();

  assert.equal(result.examined, 0);
  assert.equal(incidents.get(resolved.id).status, 'RESOLVED');
});

test('never touches an incident of a different typeKey even if stale', async () => {
  reset();
  const incident = seedIncident({ typeKey: 'FREEZE_RISK', details: { effectiveTo: '2026-01-01' } });

  const result = await expireStaleWeatherPreparations();

  assert.equal(result.examined, 0);
  assert.equal(incidents.get(incident.id).status, 'ACTIONED');
});

test('dry run reports what would resolve without mutating anything', async () => {
  reset();
  const incident = seedIncident({ details: { effectiveTo: '2026-01-01' } });

  const result = await expireStaleWeatherPreparations({ dryRun: true });

  assert.equal(result.examined, 1);
  assert.equal(result.resolved, 0);
  assert.equal(incidents.get(incident.id).status, 'ACTIONED');
  assert.equal(events.length, 0);
});

test('scopes to a single property when propertyId is given', async () => {
  reset();
  const a = seedIncident({ propertyId: 'property-1', details: { effectiveTo: '2026-01-01' } });
  const b = seedIncident({ propertyId: 'property-2', details: { effectiveTo: '2026-01-01' } });

  const result = await expireStaleWeatherPreparations({ propertyId: 'property-1' });

  assert.equal(result.examined, 1);
  assert.equal(incidents.get(a.id).status, 'RESOLVED');
  assert.equal(incidents.get(b.id).status, 'ACTIONED');
});
