const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function createHarness(overrides = {}) {
  const state = {
    bookings: [
      {
        id: 'b-1',
        bookingNumber: 'B-2026-000001',
        category: 'INSPECTION',
        status: 'COMPLETED',
        description: 'Pre-purchase inspection',
        specialRequests: null,
        requestedDate: null,
        scheduledDate: new Date('2026-06-25T09:00:00Z'),
        startTime: null,
        endTime: null,
        actualStartTime: new Date('2026-06-25T09:05:00Z'),
        actualEndTime: new Date('2026-06-25T11:00:00Z'),
        cancelledAt: null,
        cancelledBy: null,
        cancellationReason: null,
        completedAt: new Date('2026-06-26T10:00:00Z'),
        createdAt: new Date('2026-06-20T12:00:00Z'),
        homeowner: { id: 'user-1', firstName: 'Sarah', lastName: 'Homeowner' },
        provider: { id: 'provider-1', firstName: 'Mike', lastName: 'Provider' },
        providerProfile: { id: 'pp-1', businessName: 'Mike Inspects', status: 'ACTIVE' },
        property: { id: 'p-1', city: 'Austin', state: 'TX' },
        service: { id: 'svc-1', name: 'Home Inspection', category: 'INSPECTION' },
        review: { id: 'rev-1', rating: 5, status: 'APPROVED', createdAt: new Date('2026-06-27T08:00:00Z') },
        timeline: [
          { status: 'CONFIRMED', note: null, createdBy: 'provider-1', createdAt: new Date('2026-06-21T10:00:00Z') },
          { status: 'COMPLETED', note: 'All done', createdBy: 'provider-1', createdAt: new Date('2026-06-26T10:00:00Z') },
        ],
      },
      {
        id: 'b-2',
        bookingNumber: 'B-2026-000002',
        category: 'PLUMBING',
        status: 'DISPUTED',
        scheduledDate: null,
        completedAt: null,
        cancelledAt: null,
        createdAt: new Date('2026-07-01T12:00:00Z'),
        homeowner: { id: 'user-2', firstName: 'Sam', lastName: 'Owner' },
        providerProfile: { id: 'pp-2', businessName: 'Fix It Pro', status: 'ACTIVE' },
        service: { name: 'Leak repair' },
        timeline: [],
      },
    ],
    ...overrides,
  };

  function matches(b, where) {
    if (!where) return true;
    if (where.status && b.status !== where.status) return false;
    if (where.bookingNumber && !b.bookingNumber.toLowerCase().includes(where.bookingNumber.contains.toLowerCase())) return false;
    return true;
  }

  function applySelect(b, select) {
    const out = {};
    for (const key of Object.keys(select)) {
      if (key === 'timeline') {
        out.timeline = [...b.timeline].sort((a, c) => a.createdAt - c.createdAt);
      } else {
        out[key] = b[key];
      }
    }
    return out;
  }

  const prisma = {
    booking: {
      findMany: async ({ where, select, skip = 0, take }) => {
        let results = state.bookings.filter((b) => matches(b, where));
        results = [...results].sort((a, b) => b.createdAt - a.createdAt).slice(skip, take ? skip + take : undefined);
        return results.map((b) => applySelect(b, select));
      },
      findUnique: async ({ where, select }) => {
        const b = state.bookings.find((x) => x.id === where.id);
        if (!b) return null;
        return applySelect(b, select);
      },
      count: async ({ where }) => state.bookings.filter((b) => matches(b, where)).length,
    },
  };

  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma } };

  const loggerPath = require.resolve('../../src/lib/logger.ts');
  require.cache[loggerPath] = {
    id: loggerPath,
    filename: loggerPath,
    loaded: true,
    exports: { logger: { info: () => {}, warn: () => {}, error: () => {} }, auditLog: () => {}, redactEmail: (e) => e },
  };

  delete require.cache[require.resolve('../../src/services/adminBookingOps.service.ts')];
  const bookingOpsService = require('../../src/services/adminBookingOps.service.ts');

  return { state, bookingOpsService };
}

test('listBookings filters by status and booking-number substring, newest first', async () => {
  const { bookingOpsService } = createHarness();

  const all = await bookingOpsService.listBookings();
  assert.equal(all.total, 2);
  assert.equal(all.bookings[0].id, 'b-2', 'newest first');

  const disputed = await bookingOpsService.listBookings({ status: 'DISPUTED' });
  assert.equal(disputed.total, 1);
  assert.equal(disputed.bookings[0].id, 'b-2');

  const byNumber = await bookingOpsService.listBookings({ q: '000001' });
  assert.equal(byNumber.total, 1);
  assert.equal(byNumber.bookings[0].id, 'b-1');
});

test('getBookingDetail merges recorded timeline and derived milestones, sorted oldest first', async () => {
  const { bookingOpsService } = createHarness();
  const detail = await bookingOpsService.getBookingDetail('b-1');

  const kinds = detail.events.map((e) => e.kind);
  assert.deepEqual(kinds, [
    'CREATED',
    'STATUS_CHANGE', // CONFIRMED 06-21
    'SCHEDULED', // 06-25 09:00
    'WORK_STARTED', // 06-25 09:05
    'WORK_FINISHED', // 06-25 11:00
    'STATUS_CHANGE', // COMPLETED 06-26
    'COMPLETED', // 06-26 (same instant, stable order after status change)
    'REVIEW_SUBMITTED', // 06-27
  ]);

  for (let i = 1; i < detail.events.length; i++) {
    assert.ok(
      detail.events[i].at.getTime() >= detail.events[i - 1].at.getTime(),
      'events must be in chronological order'
    );
  }

  assert.equal(detail.property.city, 'Austin');
  assert.equal(detail.events.find((e) => e.kind === 'STATUS_CHANGE' && e.note === 'All done').actorId, 'provider-1');

  await assert.rejects(
    () => bookingOpsService.getBookingDetail('nope'),
    (err) => err.code === 'BOOKING_NOT_FOUND'
  );
});
