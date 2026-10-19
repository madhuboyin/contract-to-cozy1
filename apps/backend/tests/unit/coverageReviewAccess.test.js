const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { findCurrentCoverageReview, getOrCreateCoverageReview } = require('../../src/services/coverageReview.service.ts');

// Property p1 belongs to homeowner profile "primary". Household rows grant roles; p2 is another home no caller belongs to.
const PROPERTIES = { p1: { id: 'p1', updatedAt: new Date('2026-10-01T00:00:00Z'), ownerUserId: 'primary' }, p2: { id: 'p2', updatedAt: new Date('2026-10-01T00:00:00Z'), ownerUserId: 'someone-else' } };
const MEMBERS = [
  { propertyId: 'p1', userId: 'viewer', role: 'VIEWER' },
  { propertyId: 'p1', userId: 'contributor', role: 'CONTRIBUTOR' },
  { propertyId: 'p1', userId: 'owner-member', role: 'OWNER' },
];

function install() {
  const calls = { writes: 0, propertyWheres: [], termWheres: [], reviewWheres: [] };
  prisma.householdMember = { findUnique: async ({ where }) => MEMBERS.find((member) => member.propertyId === where.propertyId_userId.propertyId && member.userId === where.propertyId_userId.userId) ?? null };
  prisma.property = {
    findFirst: async ({ where }) => {
      calls.propertyWheres.push(where);
      const property = PROPERTIES[where.id];
      if (!property) return null;
      if (where.homeownerProfile) return where.homeownerProfile.userId === property.ownerUserId ? { id: property.id } : null;
      return { id: property.id, updatedAt: property.updatedAt };
    },
  };
  prisma.insurancePolicyTerm = { findFirst: async ({ where }) => { calls.termWheres.push(where); return null; } };
  prisma.coverageReview = {
    findFirst: async ({ where }) => { calls.reviewWheres.push(where); return null; },
    updateMany: async () => { calls.writes += 1; return { count: 0 }; },
    create: async () => { calls.writes += 1; throw new Error('generation reached the write'); },
  };
  prisma.$transaction = async () => { calls.writes += 1; throw new Error('generation reached the write'); };
  return calls;
}

const reads = (userId, propertyId = 'p1') => findCurrentCoverageReview(propertyId, userId);
const generates = (userId, propertyId = 'p1') => getOrCreateCoverageReview(propertyId, userId, { triggerType: 'TEST' });
const code = (error) => error?.code;

test('every household role reads a review: primary homeowner, VIEWER, CONTRIBUTOR, and an OWNER-role member who is not the primary account', async () => {
  install();
  for (const userId of ['primary', 'viewer', 'contributor', 'owner-member']) {
    const result = await reads(userId);
    assert.deepEqual({ review: result.review, isCurrent: result.isCurrent }, { review: null, isCurrent: false }, userId);
  }
});

test('a non-member and another property are the same not-found, and nothing about the other home is read', async () => {
  const calls = install();
  await assert.rejects(() => reads('stranger'), (error) => code(error) === 'PROPERTY_NOT_FOUND' && error.statusCode === 404);
  await assert.rejects(() => reads('viewer', 'p2'), (error) => code(error) === 'PROPERTY_NOT_FOUND');
  await assert.rejects(() => reads('primary', 'does-not-exist'), (error) => code(error) === 'PROPERTY_NOT_FOUND');
  await assert.rejects(() => generates('stranger'), (error) => code(error) === 'PROPERTY_NOT_FOUND');
  assert.deepEqual(calls.termWheres, [], 'no policy term is read before access is established');
  assert.deepEqual(calls.reviewWheres, []);
});

test('generation needs CONTRIBUTOR in the service itself: a VIEWER is refused with 403 before any read or write', async () => {
  const calls = install();
  await assert.rejects(() => generates('viewer'), (error) => code(error) === 'PROPERTY_ROLE_REQUIRED' && error.statusCode === 403);
  assert.deepEqual(calls.termWheres, []);
  assert.equal(calls.writes, 0);
});

test('CONTRIBUTOR, OWNER-role member, and the primary homeowner pass the generation check (it proceeds to its own work)', async () => {
  for (const userId of ['contributor', 'owner-member', 'primary']) {
    const calls = install();
    // Past authorization the service reads its inputs and then writes; the stubbed write fails, which proves the gate was passed.
    await assert.rejects(() => generates(userId), (error) => code(error) !== 'PROPERTY_ROLE_REQUIRED' && code(error) !== 'PROPERTY_NOT_FOUND', userId);
    assert.equal(calls.termWheres.length, 1, `${userId} reached the policy-term read`);
    assert.equal(calls.termWheres[0].propertyId, 'p1');
  }
});

test('the read path never writes, authorizes without the homeowner-profile lookup the old rule used, and scopes every query to the property', async () => {
  const calls = install();
  await reads('viewer');
  await reads('owner-member');
  assert.equal(calls.writes, 0);
  assert.deepEqual(calls.propertyWheres.filter((where) => where.id === 'p1' && !where.homeownerProfile).length, 2, 'the property row is loaded by id, not by the caller as homeowner');
  assert.deepEqual(calls.termWheres.map((where) => where.propertyId), ['p1', 'p1']);
  assert.deepEqual(calls.reviewWheres.map((where) => where.propertyId), ['p1', 'p1', 'p1', 'p1']);
});
