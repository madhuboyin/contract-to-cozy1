const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const comparison = require('../../src/services/coverageComparison.service.ts');
const { CoverageIntelligenceService } = require('../../src/services/coverageAnalysis.service.ts');
const { COVERAGE_ROLE_FLOORS, requireCoverageRole } = require('../../src/services/coverageAccess.ts');
const { getPropertyRoleReadOnly } = require('../../src/services/propertyAccess.service.ts');

// p1 belongs to homeowner profile "primary-user" (who has no membership row: a pre-household owner). p2 is another home.
const MEMBERS = [
  { propertyId: 'p1', userId: 'viewer', role: 'VIEWER' },
  { propertyId: 'p1', userId: 'contributor', role: 'CONTRIBUTOR' },
  { propertyId: 'p1', userId: 'owner-member', role: 'OWNER' },
  { propertyId: 'p2', userId: 'other-home-owner', role: 'OWNER' },
];
const PROPERTY_OWNERS = { p1: 'primary-user', p2: 'someone-else' };

function install() {
  const reads = { baseline: 0, comparison: 0, analysis: 0, writes: 0 };
  prisma.householdMember = { findUnique: async ({ where }) => MEMBERS.find((m) => m.propertyId === where.propertyId_userId.propertyId && m.userId === where.propertyId_userId.userId) ?? null };
  prisma.property = {
    findFirst: async ({ where }) => {
      if (where.homeownerProfile) return PROPERTY_OWNERS[where.id] === where.homeownerProfile.userId ? { id: where.id } : null;
      return PROPERTY_OWNERS[where.id] ? { id: where.id, homeownerProfileId: 'hp', name: 'Home', state: 'TX', homeownerProfile: {}, _count: {} } : null;
    },
  };
  prisma.insurancePolicyTerm = { findFirst: async () => { reads.baseline += 1; return null; } };
  prisma.coverageComparison = { findFirst: async () => { reads.comparison += 1; return null; }, create: async () => { reads.writes += 1; throw new Error('write'); }, update: async () => { reads.writes += 1; } };
  prisma.coverageAnalysis = { findFirst: async () => { reads.analysis += 1; return null; } };
  return reads;
}
const code = (error) => error?.code;
const USERS = { primary: 'primary-user', viewer: 'viewer', contributor: 'contributor', ownerMember: 'owner-member' };

test('the role is resolved read-only from household membership, and the primary account is just an OWNER', async () => {
  install();
  assert.equal(await getPropertyRoleReadOnly(prisma, 'viewer', 'p1'), 'VIEWER');
  assert.equal(await getPropertyRoleReadOnly(prisma, 'contributor', 'p1'), 'CONTRIBUTOR');
  assert.equal(await getPropertyRoleReadOnly(prisma, 'owner-member', 'p1'), 'OWNER');
  assert.equal(await getPropertyRoleReadOnly(prisma, 'primary-user', 'p1'), 'OWNER');
  assert.equal(await getPropertyRoleReadOnly(prisma, 'stranger', 'p1'), null);
  assert.equal(await getPropertyRoleReadOnly(prisma, 'viewer', 'p2'), null, 'a member of one home has no role on another');
  assert.deepEqual(COVERAGE_ROLE_FLOORS, { READ: 'VIEWER', START_OR_CHANGE: 'CONTRIBUTOR', FINAL_DECISION: 'OWNER' });
});

test('reads (comparison, comparison workspace, analysis) admit every household role including a non-primary OWNER and the primary account', async () => {
  for (const user of Object.values(USERS)) {
    const reads = install();
    assert.equal((await comparison.findCoverageComparison('p1', user)).state, 'BASELINE_REQUIRED', user);
    await assert.rejects(() => comparison.getCoverageComparison('p1', 'cmp-1', user), (error) => code(error) === 'COVERAGE_COMPARISON_NOT_FOUND', user);
    const svc = new CoverageIntelligenceService();
    // The analysis read passes authorization (whatever it does with the stubbed data afterwards is not an access refusal).
    const outcome = await svc.getLatest('p1', user).then(() => 'ok', (error) => code(error) ?? 'data');
    assert.equal(['PROPERTY_NOT_FOUND', 'PROPERTY_ROLE_REQUIRED'].includes(outcome), false, `${user}: ${outcome}`);
    assert.ok(reads.baseline + reads.comparison >= 2, `${user} reached the comparison data`);
  }
});

test('a non-member and another property get the same not-found on every coverage service, before any coverage data is read', async () => {
  const reads = install();
  const svc = new CoverageIntelligenceService();
  const attempts = [
    () => comparison.findCoverageComparison('p1', 'stranger'), () => comparison.findCoverageComparison('p1', 'other-home-owner'),
    () => comparison.getCoverageComparison('p1', 'c', 'stranger'), () => comparison.getOrCreateCoverageComparison('p1', 'stranger'),
    () => comparison.addCoverageComparisonOption('p1', 'c', 'stranger', {}), () => comparison.recordCoverageDecision('p1', 'c', 'stranger', { decision: 'KEEP' }),
    () => svc.getLatest('p1', 'stranger'), () => svc.run('p1', 'stranger'), () => svc.simulate('p1', 'stranger', {}), () => requireCoverageRole('p1', 'other-home-owner', 'VIEWER'),
  ];
  for (const attempt of attempts) await assert.rejects(attempt, (error) => code(error) === 'PROPERTY_NOT_FOUND' && error.statusCode === 404);
  assert.deepEqual([reads.baseline, reads.comparison, reads.analysis, reads.writes], [0, 0, 0, 0]);
});

test('starting a comparison, adding a quote, and running or simulating an analysis need CONTRIBUTOR: a viewer is refused with 403 before any read or write', async () => {
  const reads = install();
  const svc = new CoverageIntelligenceService();
  let resolved = 0;
  svc.resolveRunInputs = async () => { resolved += 1; throw new Error('resolved'); };
  const refused = (error) => code(error) === 'PROPERTY_ROLE_REQUIRED' && error.statusCode === 403;
  await assert.rejects(() => comparison.getOrCreateCoverageComparison('p1', 'viewer'), refused);
  await assert.rejects(() => comparison.addCoverageComparisonOption('p1', 'c', 'viewer', {}), refused);
  await assert.rejects(() => svc.run('p1', 'viewer'), refused);
  await assert.rejects(() => svc.simulate('p1', 'viewer', {}), refused);
  assert.deepEqual([reads.baseline, reads.comparison, reads.analysis, reads.writes, resolved], [0, 0, 0, 0, 0]);
  for (const user of [USERS.contributor, USERS.ownerMember, USERS.primary]) {
    install();
    assert.equal((await comparison.getOrCreateCoverageComparison('p1', user)).state, 'BASELINE_REQUIRED', user);
    await assert.rejects(() => comparison.addCoverageComparisonOption('p1', 'c', user, {}), (error) => code(error) !== 'PROPERTY_ROLE_REQUIRED' && code(error) !== 'PROPERTY_NOT_FOUND', user);
    resolved = 0;
    await assert.rejects(() => svc.run('p1', user), /resolved/);
    await assert.rejects(() => svc.simulate('p1', user, {}), /resolved/);
    assert.equal(resolved, 2, `${user} passed authorization and reached the analysis`);
  }
});

test('recording a final coverage decision needs OWNER: a viewer and a contributor are refused, an owner who is not the primary account and the primary account are admitted', async () => {
  const refused = (error) => code(error) === 'PROPERTY_ROLE_REQUIRED' && error.statusCode === 403;
  for (const user of [USERS.viewer, USERS.contributor]) {
    const reads = install();
    await assert.rejects(() => comparison.recordCoverageDecision('p1', 'c', user, { decision: 'KEEP' }), refused, user);
    assert.deepEqual([reads.comparison, reads.writes], [0, 0]);
  }
  for (const user of [USERS.ownerMember, USERS.primary]) {
    const reads = install();
    await assert.rejects(() => comparison.recordCoverageDecision('p1', 'c', user, { decision: 'KEEP' }), (error) => code(error) === 'COVERAGE_COMPARISON_NOT_FOUND', user);
    assert.equal(reads.comparison, 1, `${user} reached the comparison`);
  }
});

test('no coverage service looks the property up by the primary homeowner account, and the quote check runs as the caller’s own role', () => {
  for (const file of ['services/coverageComparison.service.ts', 'services/coverageAnalysis.service.ts', 'services/coverageReview.service.ts', 'services/ask/handlers/coverageCommands.handler.ts']) {
    const source = readFileSync(join(__dirname, '../../src', file), 'utf8');
    assert.equal(/homeownerProfile:\s*\{\s*userId/.test(source), false, `${file} authorizes by homeownerProfile.userId`);
    assert.equal(/isPrimaryOwner\(/.test(source), false, `${file} gates on the primary account`);
  }
  const source = readFileSync(join(__dirname, '../../src/services/coverageComparison.service.ts'), 'utf8');
  assert.match(source, /role: callerRole, ids: \[sourceDocumentId\]/);
  assert.equal(/role: 'OWNER', ids: \[sourceDocumentId\]/.test(source), false);
});
