const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function createHarness(overrides = {}) {
  const state = {
    payments: [
      {
        id: 'pay-1',
        bookingId: 'b-1',
        amount: 200,
        currency: 'USD',
        status: 'CAPTURED',
        isDeposit: false,
        stripePaymentIntentId: 'pi_123',
        stripeChargeId: null,
        description: null,
        failureReason: null,
        refundedAmount: 50,
        refundedAt: new Date('2026-07-01'),
        createdAt: new Date('2026-06-01'),
        updatedAt: new Date('2026-07-01'),
        booking: {
          id: 'b-1',
          bookingNumber: 'B-2026-000001',
          status: 'COMPLETED',
          homeowner: { id: 'user-1', firstName: 'Sarah', lastName: 'Homeowner' },
          providerProfile: { id: 'pp-1', businessName: 'Mike Inspects' },
        },
      },
      {
        id: 'pay-2',
        bookingId: 'b-2',
        amount: 100,
        currency: 'USD',
        status: 'PENDING',
        refundedAmount: null,
        refundedAt: null,
        createdAt: new Date('2026-07-01'),
        booking: {
          id: 'b-2',
          bookingNumber: 'B-2026-000002',
          status: 'PENDING',
          homeowner: { id: 'user-2', firstName: 'Sam', lastName: 'Owner' },
          providerProfile: { id: 'pp-2', businessName: 'Fix It Pro' },
        },
      },
    ],
    refundRequests: [],
    auditLogs: [],
    ...overrides,
  };

  function matchesPayment(p, where) {
    if (!where) return true;
    if (where.status && p.status !== where.status) return false;
    if (where.OR) {
      return where.OR.some((clause) => {
        if (clause.booking) {
          return p.booking.bookingNumber
            .toLowerCase()
            .includes(clause.booking.bookingNumber.contains.toLowerCase());
        }
        if (clause.stripePaymentIntentId) {
          return (p.stripePaymentIntentId ?? '')
            .toLowerCase()
            .includes(clause.stripePaymentIntentId.contains.toLowerCase());
        }
        return false;
      });
    }
    return true;
  }

  function selectPayment(p, select) {
    const out = {};
    for (const key of Object.keys(select)) {
      if (key === 'booking') out.booking = p.booking;
      else if (key === 'refundRequests') {
        out.refundRequests = state.refundRequests.filter((r) => r.paymentId === p.id);
      } else out[key] = p[key];
    }
    return out;
  }

  const prisma = {
    payment: {
      findMany: async ({ where, select, skip = 0, take }) => {
        let results = state.payments.filter((p) => matchesPayment(p, where));
        results = [...results].sort((a, b) => b.createdAt - a.createdAt).slice(skip, take ? skip + take : undefined);
        return results.map((p) => selectPayment(p, select));
      },
      findUnique: async ({ where, select }) => {
        const p = state.payments.find((x) => x.id === where.id);
        if (!p) return null;
        return select ? selectPayment(p, select) : { ...p };
      },
      count: async ({ where }) => state.payments.filter((p) => matchesPayment(p, where)).length,
      groupBy: async () => {
        const grouped = {};
        for (const p of state.payments) {
          grouped[p.status] = grouped[p.status] || { count: 0, sum: 0 };
          grouped[p.status].count += 1;
          grouped[p.status].sum += Number(p.amount);
        }
        return Object.entries(grouped).map(([status, v]) => ({
          status,
          _count: { _all: v.count },
          _sum: { amount: v.sum },
        }));
      },
    },
    refundRequest: {
      create: async ({ data }) => {
        const record = {
          id: `rr-${state.refundRequests.length + 1}`,
          status: 'PENDING_APPROVAL',
          decidedById: null,
          decidedAt: null,
          decisionReason: null,
          policyBasis: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        state.refundRequests.push(record);
        return { ...record };
      },
      count: async ({ where }) =>
        state.refundRequests.filter(
          (r) => (!where.paymentId || r.paymentId === where.paymentId) && (!where.status || r.status === where.status)
        ).length,
      findMany: async ({ where, select, skip = 0, take }) => {
        let results = state.refundRequests.filter((r) => !where.status || r.status === where.status);
        results = results.slice(skip, take ? skip + take : undefined);
        return results.map((r) => {
          const out = {};
          for (const key of Object.keys(select)) {
            if (key === 'payment') {
              const p = state.payments.find((x) => x.id === r.paymentId);
              out.payment = { id: p.id, amount: p.amount, currency: p.currency, status: p.status, booking: { id: p.booking.id, bookingNumber: p.booking.bookingNumber } };
            } else out[key] = r[key];
          }
          return out;
        });
      },
      findUnique: async ({ where, select }) => {
        const r = state.refundRequests.find((x) => x.id === where.id);
        if (!r) return null;
        if (!select) return { ...r };
        const out = {};
        for (const key of Object.keys(select)) out[key] = r[key];
        return out;
      },
      update: async ({ where, data }) => {
        const index = state.refundRequests.findIndex((r) => r.id === where.id);
        if (index < 0) throw new Error('not found');
        state.refundRequests[index] = { ...state.refundRequests[index], ...data };
        return { ...state.refundRequests[index] };
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
    exports: { logger: { info: () => {}, warn: () => {}, error: () => {} }, auditLog: () => {}, redactEmail: (e) => e },
  };

  for (const relativePath of [
    '../../src/services/adminAudit.service.ts',
    '../../src/services/adminPaymentOps.service.ts',
  ]) {
    delete require.cache[require.resolve(relativePath)];
  }

  const paymentOpsService = require('../../src/services/adminPaymentOps.service.ts');

  return { state, paymentOpsService };
}

test('listPayments searches by booking number / intent id and returns a ledger summary', async () => {
  const { paymentOpsService } = createHarness();

  const byNumber = await paymentOpsService.listPayments({ q: '000001' });
  assert.equal(byNumber.total, 1);
  assert.equal(byNumber.payments[0].id, 'pay-1');

  const byIntent = await paymentOpsService.listPayments({ q: 'pi_123' });
  assert.equal(byIntent.total, 1);

  const all = await paymentOpsService.listPayments();
  const captured = all.ledgerSummary.find((r) => r.status === 'CAPTURED');
  assert.equal(captured.count, 1);
  assert.equal(captured.totalAmount, 200);
});

test('createRefundRequest validates refundability, remainder, and single-pending rule', async () => {
  const { paymentOpsService, state } = createHarness();

  await assert.rejects(
    () => paymentOpsService.createRefundRequest({ paymentId: 'pay-2', actorId: 'admin-1', amount: 10, reason: 'x' }),
    (err) => err.code === 'PAYMENT_NOT_REFUNDABLE'
  );

  await assert.rejects(
    () => paymentOpsService.createRefundRequest({ paymentId: 'pay-1', actorId: 'admin-1', amount: 151, reason: 'x' }),
    (err) => err.code === 'AMOUNT_EXCEEDS_REFUNDABLE',
    '200 total minus 50 already refunded leaves 150'
  );

  const created = await paymentOpsService.createRefundRequest({
    paymentId: 'pay-1',
    actorId: 'admin-1',
    amount: 100,
    reason: 'service not completed',
    policyBasis: 'refund-policy §2',
  });
  assert.equal(created.status, 'PENDING_APPROVAL');
  assert.equal(state.auditLogs.at(-1).action, 'ADMIN_CREATE_REFUND_REQUEST');

  await assert.rejects(
    () => paymentOpsService.createRefundRequest({ paymentId: 'pay-1', actorId: 'admin-2', amount: 10, reason: 'y' }),
    (err) => err.code === 'REQUEST_ALREADY_PENDING'
  );
});

test('decideRefundRequest enforces the two-person rule and pending-only decisions, and never mutates the payment', async () => {
  const { paymentOpsService, state } = createHarness();
  const created = await paymentOpsService.createRefundRequest({
    paymentId: 'pay-1',
    actorId: 'admin-1',
    amount: 100,
    reason: 'service not completed',
  });

  await assert.rejects(
    () => paymentOpsService.decideRefundRequest({ requestId: created.id, actorId: 'admin-1', decision: 'APPROVE', reason: 'x' }),
    (err) => err.code === 'SELF_APPROVAL_FORBIDDEN'
  );

  const decided = await paymentOpsService.decideRefundRequest({
    requestId: created.id,
    actorId: 'admin-2',
    decision: 'APPROVE',
    reason: 'valid claim',
  });
  assert.equal(decided.status, 'APPROVED');
  assert.equal(state.refundRequests[0].decidedById, 'admin-2');
  assert.equal(state.payments[0].refundedAmount, 50, 'approval must not move money or mutate the payment');

  const audit = state.auditLogs.at(-1);
  assert.equal(audit.action, 'ADMIN_DECIDE_REFUND_REQUEST');
  assert.equal(audit.metadata.disposition, 'APPROVE');

  await assert.rejects(
    () => paymentOpsService.decideRefundRequest({ requestId: created.id, actorId: 'admin-2', decision: 'REJECT', reason: 'x' }),
    (err) => err.code === 'REQUEST_NOT_PENDING'
  );
});

test('withdrawRefundRequest is requester-only, pending-only, and frees the pending slot', async () => {
  const { paymentOpsService, state } = createHarness();
  const created = await paymentOpsService.createRefundRequest({
    paymentId: 'pay-1',
    actorId: 'admin-1',
    amount: 100,
    reason: 'opened in error',
  });

  await assert.rejects(
    () => paymentOpsService.withdrawRefundRequest({ requestId: created.id, actorId: 'admin-2', reason: 'x' }),
    (err) => err.code === 'NOT_REQUESTER'
  );

  const withdrawn = await paymentOpsService.withdrawRefundRequest({
    requestId: created.id,
    actorId: 'admin-1',
    reason: 'wrong amount entered',
  });
  assert.equal(withdrawn.status, 'CANCELLED');

  const audit = state.auditLogs.at(-1);
  assert.equal(audit.action, 'ADMIN_WITHDRAW_REFUND_REQUEST');
  assert.equal(audit.metadata.capability, 'REFUND_REQUEST');

  await assert.rejects(
    () => paymentOpsService.withdrawRefundRequest({ requestId: created.id, actorId: 'admin-1', reason: 'again' }),
    (err) => err.code === 'REQUEST_NOT_PENDING'
  );

  // The pending slot is freed — a new request on the same payment succeeds.
  const second = await paymentOpsService.createRefundRequest({
    paymentId: 'pay-1',
    actorId: 'admin-1',
    amount: 50,
    reason: 'corrected amount',
  });
  assert.equal(second.status, 'PENDING_APPROVAL');
});

test('listRefundRequests defaults to pending approval with payment context', async () => {
  const { paymentOpsService } = createHarness();
  await paymentOpsService.createRefundRequest({ paymentId: 'pay-1', actorId: 'admin-1', amount: 25, reason: 'partial' });

  const queue = await paymentOpsService.listRefundRequests();
  assert.equal(queue.total, 1);
  assert.equal(queue.requests[0].payment.booking.bookingNumber, 'B-2026-000001');
});
