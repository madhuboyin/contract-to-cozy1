const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function createHarness(overrides = {}) {
  const state = {
    reviews: [
      {
        id: 'rev-1',
        bookingId: 'b-1',
        authorId: 'user-1',
        providerId: 'provider-1',
        rating: 2,
        title: 'Sloppy work',
        content: 'Left the site a mess.',
        qualityRating: 2,
        communicationRating: 3,
        valueRating: 2,
        professionalismRating: 2,
        status: 'PENDING',
        moderatedAt: null,
        moderatedBy: null,
        response: null,
        respondedAt: null,
        createdAt: new Date('2026-07-01'),
      },
      {
        id: 'rev-2',
        bookingId: 'b-2',
        authorId: 'user-1',
        providerId: 'provider-1',
        rating: 5,
        title: 'Great job',
        content: 'Very professional.',
        status: 'APPROVED',
        moderatedAt: new Date('2026-07-02'),
        moderatedBy: 'admin-1',
        createdAt: new Date('2026-07-02'),
      },
      {
        id: 'rev-3',
        bookingId: 'b-3',
        authorId: 'user-2',
        providerId: 'provider-1',
        rating: 1,
        title: null,
        content: 'Spam spam spam',
        status: 'FLAGGED',
        moderatedAt: new Date('2026-07-03'),
        moderatedBy: 'admin-1',
        createdAt: new Date('2026-06-20'),
      },
    ],
    users: {
      'user-1': { id: 'user-1', firstName: 'Sarah', lastName: 'Homeowner' },
      'user-2': { id: 'user-2', firstName: 'Sam', lastName: 'Spammer' },
      'provider-1': {
        id: 'provider-1',
        firstName: 'Mike',
        lastName: 'Provider',
        providerProfile: { businessName: 'Mike Inspects' },
      },
    },
    bookings: {
      'b-1': {
        id: 'b-1',
        bookingNumber: 'B-2026-000001',
        category: 'INSPECTION',
        status: 'COMPLETED',
        scheduledDate: new Date('2026-06-25'),
        completedAt: new Date('2026-06-26'),
        service: { name: 'Home Inspection', category: 'INSPECTION' },
      },
    },
    auditLogs: [],
    ...overrides,
  };

  function resolveSelect(review, select) {
    const out = {};
    for (const key of Object.keys(select)) {
      if (key === 'author') out.author = { ...state.users[review.authorId] };
      else if (key === 'provider') out.provider = { ...state.users[review.providerId] };
      else if (key === 'booking') out.booking = state.bookings[review.bookingId] ?? null;
      else out[key] = review[key];
    }
    return out;
  }

  function matches(review, where) {
    if (!where) return true;
    if (where.id && review.id !== where.id) return false;
    if (where.authorId && review.authorId !== where.authorId) return false;
    if (where.providerId && review.providerId !== where.providerId) return false;
    if (where.status) {
      if (typeof where.status === 'string' && review.status !== where.status) return false;
      if (where.status.in && !where.status.in.includes(review.status)) return false;
    }
    return true;
  }

  const prisma = {
    review: {
      findMany: async ({ where, select, skip = 0, take, orderBy }) => {
        let results = state.reviews.filter((r) => matches(r, where));
        if (orderBy?.createdAt === 'asc') results = [...results].sort((a, b) => a.createdAt - b.createdAt);
        results = results.slice(skip, take ? skip + take : undefined);
        return results.map((r) => (select ? resolveSelect(r, select) : { ...r }));
      },
      findUnique: async ({ where, select }) => {
        const review = state.reviews.find((r) => r.id === where.id);
        if (!review) return null;
        return select ? resolveSelect(review, select) : { ...review };
      },
      count: async ({ where }) => state.reviews.filter((r) => matches(r, where)).length,
      groupBy: async ({ where }) => {
        const grouped = {};
        for (const r of state.reviews.filter((x) => matches(x, where))) {
          grouped[r.status] = (grouped[r.status] || 0) + 1;
        }
        return Object.entries(grouped).map(([status, count]) => ({ status, _count: { _all: count } }));
      },
      aggregate: async ({ where }) => {
        const rows = state.reviews.filter((r) => matches(r, where));
        const avg = rows.length ? rows.reduce((sum, r) => sum + r.rating, 0) / rows.length : null;
        return { _avg: { rating: avg } };
      },
      update: async ({ where, data }) => {
        const index = state.reviews.findIndex((r) => r.id === where.id);
        if (index < 0) throw new Error('Review not found');
        state.reviews[index] = { ...state.reviews[index], ...data };
        return { ...state.reviews[index] };
      },
    },
    auditLog: {
      create: async ({ data }) => {
        const record = { id: `audit-${state.auditLogs.length + 1}`, createdAt: new Date(), ...data };
        state.auditLogs.push(record);
        return record;
      },
    },
  };

  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma } };

  const loggerPath = require.resolve('../../src/lib/logger.ts');
  require.cache[loggerPath] = {
    id: loggerPath,
    filename: loggerPath,
    loaded: true,
    exports: {
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      auditLog: () => {},
      redactEmail: (email) => email,
    },
  };

  for (const relativePath of [
    '../../src/services/adminAudit.service.ts',
    '../../src/services/adminReviewModeration.service.ts',
  ]) {
    delete require.cache[require.resolve(relativePath)];
  }

  const moderationService = require('../../src/services/adminReviewModeration.service.ts');

  return { state, moderationService };
}

test('listReviews defaults to the PENDING+FLAGGED queue, oldest first', async () => {
  const { moderationService } = createHarness();
  const result = await moderationService.listReviews();
  assert.equal(result.total, 2);
  assert.deepEqual(
    result.reviews.map((r) => r.id),
    ['rev-3', 'rev-1'],
    'flagged rev-3 is older so it comes first'
  );
  assert.equal(result.reviews[1].author.firstName, 'Sarah');
  assert.equal(result.reviews[0].provider.providerProfile.businessName, 'Mike Inspects');
});

test('listReviews filters by explicit status', async () => {
  const { moderationService } = createHarness();
  const result = await moderationService.listReviews({ status: 'APPROVED' });
  assert.equal(result.total, 1);
  assert.equal(result.reviews[0].id, 'rev-2');
});

test('getReviewDetail returns booking context and history counts, throws for missing review', async () => {
  const { moderationService } = createHarness();
  const detail = await moderationService.getReviewDetail('rev-1');
  assert.equal(detail.booking.bookingNumber, 'B-2026-000001');
  assert.equal(detail.booking.service.name, 'Home Inspection');
  assert.equal(detail.authorHistory.reviewCounts.PENDING, 1);
  assert.equal(detail.authorHistory.reviewCounts.APPROVED, 1);
  assert.equal(detail.providerHistory.reviewCounts.FLAGGED, 1);
  assert.equal(detail.providerHistory.approvedAverageRating, 5);

  await assert.rejects(
    () => moderationService.getReviewDetail('does-not-exist'),
    (err) => err.code === 'REVIEW_NOT_FOUND'
  );
});

test('moderateReview APPROVE publishes a pending review, sets attribution, and audits', async () => {
  const { moderationService, state } = createHarness();
  const result = await moderationService.moderateReview({
    reviewId: 'rev-1',
    actorId: 'admin-1',
    action: 'APPROVE',
    reason: 'meets guidelines',
    policyVersion: 'review-policy-v3',
  });
  assert.equal(result.previousStatus, 'PENDING');
  assert.equal(result.status, 'APPROVED');

  const review = state.reviews.find((r) => r.id === 'rev-1');
  assert.equal(review.status, 'APPROVED');
  assert.equal(review.moderatedBy, 'admin-1');
  assert.ok(review.moderatedAt instanceof Date);

  const audit = state.auditLogs.at(-1);
  assert.equal(audit.action, 'ADMIN_MODERATE_REVIEW');
  assert.equal(audit.userId, 'admin-1');
  assert.deepEqual(audit.oldValues, { status: 'PENDING' });
  assert.deepEqual(audit.newValues, { status: 'APPROVED' });
  assert.equal(audit.metadata.disposition, 'APPROVE');
  assert.equal(audit.metadata.relatedRefs.policyVersion, 'review-policy-v3');
});

test('moderateReview enforces governed transitions', async () => {
  const { moderationService, state } = createHarness();

  // RESTORE only applies to REJECTED/FLAGGED — not a PENDING review.
  await assert.rejects(
    () => moderationService.moderateReview({ reviewId: 'rev-1', actorId: 'admin-1', action: 'RESTORE', reason: 'x' }),
    (err) => err.code === 'INVALID_TRANSITION'
  );

  // APPROVED can only be flagged, not re-approved.
  await assert.rejects(
    () => moderationService.moderateReview({ reviewId: 'rev-2', actorId: 'admin-1', action: 'APPROVE', reason: 'x' }),
    (err) => err.code === 'INVALID_TRANSITION'
  );

  // FLAG an approved review pulls it from public view…
  const flagged = await moderationService.moderateReview({
    reviewId: 'rev-2',
    actorId: 'admin-1',
    action: 'FLAG',
    reason: 'reported by provider',
  });
  assert.equal(flagged.status, 'FLAGGED');

  // …and RESTORE returns a flagged review to the pending queue, not to APPROVED.
  const restored = await moderationService.moderateReview({
    reviewId: 'rev-2',
    actorId: 'admin-1',
    action: 'RESTORE',
    reason: 'report withdrawn, re-review',
  });
  assert.equal(restored.status, 'PENDING');
  assert.equal(state.reviews.find((r) => r.id === 'rev-2').status, 'PENDING');
});

test('moderateReview blocks an admin who is a party to the review', async () => {
  const { moderationService } = createHarness();

  await assert.rejects(
    () => moderationService.moderateReview({ reviewId: 'rev-1', actorId: 'user-1', action: 'APPROVE', reason: 'x' }),
    (err) => err.code === 'SELF_MODERATION_FORBIDDEN'
  );

  await assert.rejects(
    () => moderationService.moderateReview({ reviewId: 'rev-1', actorId: 'provider-1', action: 'REJECT', reason: 'x' }),
    (err) => err.code === 'SELF_MODERATION_FORBIDDEN'
  );
});

test('moderateReview throws for a missing review', async () => {
  const { moderationService } = createHarness();
  await assert.rejects(
    () => moderationService.moderateReview({ reviewId: 'nope', actorId: 'admin-1', action: 'APPROVE', reason: 'x' }),
    (err) => err.code === 'REVIEW_NOT_FOUND'
  );
});
