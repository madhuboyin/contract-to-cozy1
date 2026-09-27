const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

// Verification on the canonical record. A Home Record carries the homeowner's own verification status (the concept the legacy vault had), so
// the buyer Verify and Reject actions, the verified counts and the briefing readers work on Home Records instead of leaving a second status
// concept behind. The fake database honors `where`, so an owner-only record is really invisible to a contributor.
const RECORDS = [
  { id: 'rec-h', propertyId: 'p1', visibility: 'HOUSEHOLD', lifecycleStatus: 'ACTIVE' },
  { id: 'rec-o', propertyId: 'p1', visibility: 'OWNER_ONLY', lifecycleStatus: 'ACTIVE' },
  { id: 'rec-t', propertyId: 'p1', visibility: 'HOUSEHOLD', lifecycleStatus: 'TRASHED' },
];
function matches(row, where = {}) {
  return Object.entries(where).every(([key, expected]) => {
    const actual = row[key];
    if (expected && typeof expected === 'object' && 'not' in expected) return actual !== expected.not;
    return actual === expected;
  });
}
const updates = [];
const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: {
  propertyRecord: { updateMany: async ({ where, data }) => { const rows = RECORDS.filter((row) => matches(row, where)); if (rows.length) updates.push(data); return { count: rows.length }; } },
} } };
const { HomeRecordsService } = require('../../src/services/homeRecords.service.ts');
const service = new HomeRecordsService();
test.beforeEach(() => { updates.length = 0; });

const set = (recordId, role, status, notes) => service.setVerification({ propertyId: 'p1', recordId, userId: 'u1', role, status, notes });

test('verifying sets who and when only for VERIFIED, and keeps the note', async () => {
  const verified = await set('rec-h', 'CONTRIBUTOR', 'VERIFIED', '  matches my copy  ');
  assert.equal(verified.verificationStatus, 'VERIFIED');
  assert.ok(verified.verifiedAt instanceof Date);
  assert.deepEqual([updates[0].verificationStatus, updates[0].verifiedByUserId, updates[0].verificationNotes], ['VERIFIED', 'u1', 'matches my copy']);
  await set('rec-h', 'CONTRIBUTOR', 'REJECTED', null);
  assert.deepEqual([updates[1].verificationStatus, updates[1].verifiedAt, updates[1].verifiedByUserId, updates[1].verificationNotes], ['REJECTED', null, null, null]);
  await set('rec-h', 'OWNER', 'UNVERIFIED');
  assert.equal(updates[2].verifiedAt, null);
});

test('a contributor cannot verify an owner-only record, and nothing is written; an owner can', async () => {
  await assert.rejects(() => set('rec-o', 'CONTRIBUTOR', 'VERIFIED'), (error) => error?.code === 'PROPERTY_RECORD_NOT_FOUND');
  assert.deepEqual(updates, []);
  await set('rec-o', 'OWNER', 'VERIFIED');
  assert.equal(updates.length, 1);
});

test('a trashed or missing record cannot be verified', async () => {
  await assert.rejects(() => set('rec-t', 'OWNER', 'VERIFIED'), (error) => error?.code === 'PROPERTY_RECORD_NOT_FOUND');
  await assert.rejects(() => set('nope', 'OWNER', 'VERIFIED'), (error) => error?.code === 'PROPERTY_RECORD_NOT_FOUND');
  assert.deepEqual(updates, []);
});

test('the route requires a contributor and the schema and screens expose the status', () => {
  const backendRoot = path.resolve(__dirname, '../..');
  const routes = fs.readFileSync(path.join(backendRoot, 'src/routes/homeRecords.routes.ts'), 'utf8');
  assert.match(routes, /'\/properties\/:propertyId\/records\/:recordId\/verification',\s*requireHouseholdRole\('CONTRIBUTOR'\)/);
  assert.match(routes, /role: req\.householdRole!/);
  const schema = fs.readFileSync(path.join(backendRoot, 'prisma/schema.prisma'), 'utf8');
  assert.match(schema, /model PropertyRecord \{[\s\S]*?verificationStatus\s+DocumentVerificationStatus @default\(UNVERIFIED\)[\s\S]*?verifiedByUserId\s+String\?/);
});
