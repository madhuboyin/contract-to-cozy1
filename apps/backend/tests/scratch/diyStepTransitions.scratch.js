// SCRATCH-DATABASE RUN for the DIY step and project transitions (docs/architecture/ASK_COZY_DIY_STEP_TRANSITIONS_PLAN.md slice 2c).
//
// The unit tests for slice 2a use a database-free fake that serializes transactions. This file runs the REAL service and the REAL Prisma client against a
// REAL, EMPTY, throwaway Postgres, to check what a fake cannot: that the conditional claim of the project row really blocks and re-evaluates under row
// locks (READ COMMITTED), that the version token survives a round trip through `timestamp(3)` and JSON, how the bounded retry loop behaves under real
// contention, and that the completion rule and the ledger hold when completion races a reopen, an abandon or itself. It is NOT part of `npm test` (the
// name does not end in .test.js) and it TRUNCATES the DIY project tables and the user, property and profile tables it seeds, so it refuses to run
// against anything that is not an obviously-scratch local database.
//
// Run (the scratch cluster and the safety rules are in docs/operations/DIY_TEMPLATE_REVISIONS_ROLLOUT.md and docs/operations/DIY_STEP_TRANSITIONS_ROLLOUT.md):
//   SCRATCH_DATABASE_URL=postgresql://scratch@127.0.0.1:54391/scratch_c2c_2c node --test tests/scratch/diyStepTransitions.scratch.js
const test = require('node:test');
const assert = require('node:assert/strict');

const URL_ = process.env.SCRATCH_DATABASE_URL;
if (!URL_) { console.log('SCRATCH_DATABASE_URL is not set: skipping the scratch-database run.'); process.exit(0); }
const match = /^postgres(?:ql)?:\/\/([^:@/]+)(?::[^@]*)?@(127\.0\.0\.1|localhost):(\d+)\/([A-Za-z0-9_]+)$/.exec(URL_);
if (!match || !/scratch/i.test(match[4]) || match[3] === '5433' || /contracttocozy/i.test(URL_)) {
  console.error(`REFUSING to run: SCRATCH_DATABASE_URL must be a local postgres URL whose database name contains "scratch" (and is not the dev database). Got: ${URL_.replace(/:[^:@/]*@/, ':***@')}`);
  process.exit(1);
}
const [, , , DB_PORT, DB_NAME] = match;
process.env.DATABASE_URL = URL_; // set before anything loads the Prisma client; dotenv never overrides an existing value
process.env.NODE_ENV = 'test';

require('ts-node/register');
const stub = (relative, exports) => { const resolved = require.resolve(relative); require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports }; };
stub('../../src/services/adminAudit.service.ts', { recordAdminAction: async () => undefined });
stub('../../src/modules/propertyContext/index.ts', { getPropertyContext: async () => ({}) });
stub('../../src/services/diy/applicabilityPolicy.ts', { evaluateDiyApplicability: () => ({ status: 'APPLICABLE' }) });

const { prisma } = require('../../src/lib/prisma.ts');
const { diyService } = require('../../src/services/diy.service.ts');

const CLEAN_CODES = ['DIY_STALE', 'DIY_PROJECT_CLOSED', 'DIY_PROJECT_STEPS_INCOMPLETE', 'DIY_STEP_TRANSITION_NOT_ALLOWED'];
const settle = (promise) => promise.then((value) => ({ ok: true, value }), (error) => ({ ok: false, code: error.code, error }));
const assertClean = (result, label = '') => { if (!result.ok) assert.ok(CLEAN_CODES.includes(result.code), `${label} a loser gets a clean domain error, not a raw database one: ${result.code ?? result.error?.message}`); };
const iso = (date) => date.toISOString();
const later = (maxMs, fn) => new Promise((resolve) => setTimeout(resolve, Math.random() * maxMs)).then(fn); // jitter so both orders of a race are exercised

let counter = 0;
/** A project with the given steps: `[ 'COMPLETED', { status: 'PENDING', isOptional: true } ]`. */
async function makeProject(steps, status = 'IN_PROGRESS') {
  counter += 1;
  const id = `p${counter}`;
  await prisma.diyProject.create({
    data: {
      id, propertyId: 'prop1', userId: 'u1', title: `Project ${counter}`, category: 'GENERAL', status,
      steps: { create: steps.map((s, i) => { const o = typeof s === 'string' ? { status: s } : s; return { id: `${id}s${i + 1}`, stepNumber: i + 1, title: `Step ${i + 1}`, description: 'x', ...o }; }) },
    },
  });
  return id;
}
const project = (id) => prisma.diyProject.findUnique({ where: { id } });
const step = (id, n) => prisma.diyProjectStep.findUnique({ where: { id: `${id}s${n}` } });
const events = (id) => prisma.diyProjectEvent.findMany({ where: { projectId: id }, orderBy: { at: 'asc' } });
const update = (id, n, status, token, actor = 'u1', notes) => diyService.updateStep(id, 'prop1', `${id}s${n}`, { status, ...(notes !== undefined ? { notes } : {}) }, { actorUserId: actor, expectedUpdatedAt: token });
const complete = (id, token, actor = 'u1') => diyService.completeProject(id, 'prop1', {}, { actorUserId: actor, expectedUpdatedAt: token });
const abandon = (id, token, actor = 'u1') => diyService.abandonProject(id, 'prop1', false, { actorUserId: actor, expectedUpdatedAt: token });

test.before(async () => {
  const [{ db, port }] = await prisma.$queryRawUnsafe('select current_database() as db, inet_server_port() as port');
  assert.equal(db, DB_NAME, 'connected to the scratch database'); assert.equal(Number(port), Number(DB_PORT), 'on the scratch port');
  await prisma.$executeRawUnsafe('TRUNCATE household_members, domain_events, diy_project_events, diy_project_steps, diy_projects, properties, homeowner_profiles, users RESTART IDENTITY CASCADE');
  await prisma.$executeRawUnsafe(`INSERT INTO users ("id","email","firstName","lastName","passwordHash","updatedAt") VALUES ('u1','scratch@example.test','S','C','x', now()), ('u2','scratch2@example.test','T','D','x', now())`);
  await prisma.$executeRawUnsafe(`INSERT INTO homeowner_profiles ("id","userId","updatedAt") VALUES ('hp1','u1', now())`);
  await prisma.$executeRawUnsafe(`INSERT INTO properties ("id","homeownerProfileId","address","city","state","zipCode","updatedAt") VALUES ('prop1','hp1','1 Test St','Testville','NJ','08536', now())`);
  // u1 owns the property through the homeowner profile (the pre-household path: no membership row); u2 is a household contributor. Completion checks access inside its transaction.
  await prisma.$executeRawUnsafe(`INSERT INTO household_members ("id","propertyId","userId","role","updatedAt") VALUES ('hm2','prop1','u2','CONTRIBUTOR', now())`);
});
test.after(async () => { await prisma.$disconnect(); });

// ---- the version token on real timestamps ----------------------------------------------------------------------------------------------------------

test('a step token survives the round trip through timestamp(3) and JSON, and the new version is strictly greater and stored exactly', async () => {
  const id = await makeProject(['PENDING', 'PENDING']);
  const seen = await step(id, 1);
  const token = JSON.parse(JSON.stringify({ t: seen.updatedAt })).t; // what the browser sends back
  const result = await update(id, 1, 'IN_PROGRESS', token);
  assert.equal(result.alreadyApplied, false);
  const stored = await step(id, 1);
  assert.ok(stored.updatedAt.getTime() > seen.updatedAt.getTime(), 'the version moved forward');
  assert.equal(result.step.updatedAt.getTime(), stored.updatedAt.getTime(), 'what the caller is told is what is stored (millisecond precision survives the column)');
  assert.equal((await project(id)).status, 'IN_PROGRESS');
});

test('the project version moves strictly forward on every write, even several within one millisecond', async () => {
  const id = await makeProject(['PENDING', 'PENDING', 'PENDING', 'PENDING']);
  const versions = [(await project(id)).updatedAt.getTime()];
  for (let n = 1; n <= 4; n += 1) {
    await update(id, n, 'IN_PROGRESS', iso((await step(id, n)).updatedAt));
    versions.push((await project(id)).updatedAt.getTime());
  }
  for (let i = 1; i < versions.length; i += 1) assert.ok(versions[i] > versions[i - 1], `version ${i} is greater than ${i - 1}`);
});

test('a stale step token is refused and writes nothing; a missing one is a 400', async () => {
  const id = await makeProject(['PENDING']);
  const old = iso((await step(id, 1)).updatedAt);
  await update(id, 1, 'IN_PROGRESS', old);
  const before = await events(id);
  const refused = await settle(update(id, 1, 'COMPLETED', old));
  assert.equal(refused.code, 'DIY_STALE');
  assert.equal((await step(id, 1)).status, 'IN_PROGRESS');
  assert.equal((await events(id)).length, before.length, 'no ledger row for a refused write');
  assert.equal((await settle(update(id, 1, 'COMPLETED', undefined))).code, 'DIY_TOKEN_REQUIRED');
});

// ---- real row locking -----------------------------------------------------------------------------------------------------------------------------

test('two people marking the SAME step done at once: one applies it, the other is a no-op or stale, one ledger row, one completion attribution', async () => {
  const id = await makeProject(['IN_PROGRESS']);
  const token = iso((await step(id, 1)).updatedAt);
  const results = await Promise.all([settle(update(id, 1, 'COMPLETED', token, 'u1')), settle(update(id, 1, 'COMPLETED', token, 'u2'))]);
  results.forEach((r) => assertClean(r));
  assert.equal(results.filter((r) => r.ok && !r.value.alreadyApplied).length, 1, 'exactly one actually applied it');
  const completed = (await events(id)).filter((e) => e.type === 'STEP_COMPLETED');
  assert.equal(completed.length, 1);
  assert.equal((await step(id, 1)).completedByUserId, completed[0].actorUserId, 'the attributed person is the one the ledger names');
});

test('two people changing DIFFERENT steps at once, each with a valid token: both succeed (the claim serializes them, the step tokens are independent)', async () => {
  const id = await makeProject(['IN_PROGRESS', 'IN_PROGRESS']);
  const [t1, t2] = [iso((await step(id, 1)).updatedAt), iso((await step(id, 2)).updatedAt)];
  const results = await Promise.all([settle(update(id, 1, 'COMPLETED', t1, 'u1')), settle(update(id, 2, 'COMPLETED', t2, 'u2'))]);
  results.forEach((r) => assertClean(r));
  assert.deepEqual(results.map((r) => r.ok), [true, true], JSON.stringify(results.map((r) => r.code)));
  assert.equal((await events(id)).filter((e) => e.type === 'STEP_COMPLETED').length, 2);
});

test('retry loop under contention: 4 writers on different steps all succeed; 10 writers each succeed or get a clean error, and the ledger matches exactly the successes', async () => {
  const run = async (writers) => {
    const id = await makeProject(Array.from({ length: writers }, () => 'IN_PROGRESS'));
    const tokens = await Promise.all(Array.from({ length: writers }, async (_, i) => iso((await step(id, i + 1)).updatedAt)));
    const results = await Promise.all(tokens.map((token, i) => settle(update(id, i + 1, 'COMPLETED', token, i % 2 ? 'u2' : 'u1'))));
    results.forEach((r) => assertClean(r, `writer`));
    const ok = results.filter((r) => r.ok).length;
    assert.equal((await events(id)).filter((e) => e.type === 'STEP_COMPLETED').length, ok, 'one ledger row per success, none for a loser');
    assert.equal((await prisma.diyProjectStep.count({ where: { projectId: id, status: 'COMPLETED' } })), ok, 'steps completed equals successes');
    return { ok, codes: results.filter((r) => !r.ok).map((r) => r.code) };
  };
  const four = await run(4);
  assert.equal(four.ok, 4, `4 concurrent writers should all succeed: ${JSON.stringify(four)}`);
  const ten = await run(10);
  console.log(`# retry loop, 10 concurrent writers on one project: ${ten.ok} succeeded, ${10 - ten.ok} refused cleanly (${[...new Set(ten.codes)].join(', ') || 'none'})`);
});

// ---- the completion rule under race ---------------------------------------------------------------------------------------------------------------

test('completing twice at once: one wins, the other is closed or stale, one ledger row, one outbox row', async () => {
  const id = await makeProject(['COMPLETED', { status: 'SKIPPED', isOptional: true }]);
  const token = iso((await project(id)).updatedAt);
  const results = await Promise.all([settle(complete(id, token, 'u1')), settle(complete(id, token, 'u2'))]);
  results.forEach((r) => assertClean(r));
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.ok(['DIY_STALE', 'DIY_PROJECT_CLOSED'].includes(results.find((r) => !r.ok).code));
  assert.equal((await events(id)).filter((e) => e.type === 'PROJECT_COMPLETED').length, 1);
  // The effects are now an outbox row written in the completion transaction (slice 3a): exactly one, attributed to the person recorded as completing it.
  const outbox = await prisma.domainEvent.findMany({ where: { idempotencyKey: `diy-project-completed:${id}` } });
  assert.equal(outbox.length, 1, 'one outbox row');
  assert.equal(outbox[0].userId, (await project(id)).completedByUserId, 'attributed to the person recorded as completing it');
});

test('completion racing a reopen of the last required step (40 jittered rounds): never a COMPLETED project with an open required step', async () => {
  const outcomes = { completedFirst: 0, reopenedFirst: 0 };
  for (let round = 0; round < 40; round += 1) {
    const id = await makeProject(['COMPLETED', 'COMPLETED']);
    const [pt, st] = [iso((await project(id)).updatedAt), iso((await step(id, 2)).updatedAt)];
    const [c, r] = await Promise.all([settle(later(8, () => complete(id, pt))), settle(later(8, () => update(id, 2, 'IN_PROGRESS', st, 'u2')))]);
    assertClean(c, 'complete'); assertClean(r, 'reopen');
    const final = await project(id);
    const steps = await prisma.diyProjectStep.findMany({ where: { projectId: id } });
    if (final.status === 'COMPLETED') {
      assert.ok(steps.every((s) => s.status === 'COMPLETED'), `round ${round}: a completed project has no open step`);
      assert.equal(c.ok, true); assert.equal(r.ok, false, 'the reopen was refused once the project closed');
      outcomes.completedFirst += 1;
    } else {
      assert.equal(final.status, 'IN_PROGRESS');
      assert.equal(c.ok, false, 'the completion was refused (stale or incomplete)');
      assert.equal(steps.find((s) => s.stepNumber === 2).status, 'IN_PROGRESS');
      outcomes.reopenedFirst += 1;
    }
  }
  console.log(`# completion vs reopen, 40 rounds: completion won ${outcomes.completedFirst}, reopen won ${outcomes.reopenedFirst}`);
});

test('completion racing an abandon (10 rounds): exactly one terminal state, one terminal ledger row', async () => {
  for (let round = 0; round < 10; round += 1) {
    const id = await makeProject(['COMPLETED']);
    const token = iso((await project(id)).updatedAt);
    const [c, a] = await Promise.all([settle(later(6, () => complete(id, token))), settle(later(6, () => abandon(id, token, 'u2')))]);
    assertClean(c); assertClean(a);
    assert.equal([c, a].filter((r) => r.ok).length, 1, `round ${round}: exactly one of them wins`);
    const terminal = (await events(id)).filter((e) => ['PROJECT_COMPLETED', 'PROJECT_ABANDONED'].includes(e.type));
    assert.equal(terminal.length, 1);
    assert.equal((await project(id)).status, c.ok ? 'COMPLETED' : 'ABANDONED');
  }
});

test('completion with an open required step is refused on real Postgres and leaves the project open and unchanged except for no write at all', async () => {
  const id = await makeProject(['COMPLETED', 'PENDING']);
  const before = await project(id);
  const refused = await settle(complete(id, iso(before.updatedAt)));
  assert.equal(refused.code, 'DIY_PROJECT_STEPS_INCOMPLETE');
  const after = await project(id);
  assert.equal(after.status, 'IN_PROGRESS');
  assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime(), 'the refused attempt rolled back its claim, so the caller\'s token is still valid');
  assert.equal((await events(id)).length, 0);
});

// ---- the ledger and attribution ------------------------------------------------------------------------------------------------------------------

test('a full life: start, complete, reopen, complete again, finish: attribution and ledger are what happened, in order', async () => {
  const id = await makeProject(['PENDING', { status: 'PENDING', isOptional: true }]);
  const tok = async (n) => iso((await step(id, n)).updatedAt);
  await update(id, 1, 'IN_PROGRESS', await tok(1), 'u1');
  await update(id, 1, 'COMPLETED', await tok(1), 'u1');
  assert.equal((await step(id, 1)).completedByUserId, 'u1');
  await update(id, 1, 'IN_PROGRESS', await tok(1), 'u2'); // reopen
  const reopened = await step(id, 1);
  assert.equal(reopened.completedAt, null); assert.equal(reopened.completedByUserId, null, 'reopen clears completion');
  await update(id, 1, 'COMPLETED', await tok(1), 'u2');
  assert.equal((await step(id, 1)).completedByUserId, 'u2');
  assert.equal((await settle(complete(id, iso((await project(id)).updatedAt), 'u2'))).code, 'DIY_PROJECT_STEPS_INCOMPLETE', 'optional step still unresolved');
  await update(id, 2, 'SKIPPED', await tok(2), 'u1');
  const done = await complete(id, iso((await project(id)).updatedAt), 'u2');
  assert.equal(done.status, 'COMPLETED'); assert.equal(done.completedByUserId, 'u2');
  assert.deepEqual((await events(id)).map((e) => `${e.type}:${e.actorUserId}`), [
    'STEP_STARTED:u1', 'STEP_COMPLETED:u1', 'STEP_REOPENED:u2', 'STEP_COMPLETED:u2', 'STEP_SKIPPED:u1', 'PROJECT_COMPLETED:u2',
  ]);
  const closed = await settle(update(id, 1, 'IN_PROGRESS', await tok(1)));
  assert.equal(closed.code, 'DIY_PROJECT_CLOSED', 'a finished project accepts no more changes');
});

test('first activity on a pending step starts the project (completing it directly too)', async () => {
  const id = await makeProject(['PENDING'], 'PLANNING');
  await update(id, 1, 'COMPLETED', iso((await step(id, 1)).updatedAt));
  const p = await project(id);
  assert.equal(p.status, 'IN_PROGRESS'); assert.ok(p.startedAt);
});

test('any step change invalidates a project token taken earlier: completing from a stale page is refused even though every step looks done to it', async () => {
  const id = await makeProject(['COMPLETED', 'COMPLETED']);
  const stalePage = iso((await project(id)).updatedAt); // the person opens "Complete project" now
  await update(id, 2, 'IN_PROGRESS', iso((await step(id, 2)).updatedAt), 'u2'); // someone else reopens a step
  assert.equal((await settle(complete(id, stalePage))).code, 'DIY_STALE');
  assert.equal((await settle(abandon(id, stalePage))).code, 'DIY_STALE');
  assert.equal((await project(id)).status, 'IN_PROGRESS');
});

// ---- slice 3a: the outbox row and the in-transaction access check, on real Postgres ----------------------------------------------------------------

test('completion writes one outbox row atomically with a snapshot; a viewer and a non-member are refused with nothing written', async () => {
  await prisma.$executeRawUnsafe(`INSERT INTO users ("id","email","firstName","lastName","passwordHash","updatedAt") VALUES ('u3','scratch3@example.test','V','W','x', now()), ('u4','scratch4@example.test','X','Y','x', now()) ON CONFLICT DO NOTHING`);
  await prisma.$executeRawUnsafe(`INSERT INTO household_members ("id","propertyId","userId","role","updatedAt") VALUES ('hm3','prop1','u3','VIEWER', now()) ON CONFLICT DO NOTHING`);
  const id = await makeProject(['COMPLETED']);
  await prisma.diyProject.update({ where: { id }, data: { maintenanceTaskId: 'task-77', title: 'Seal the deck', category: 'EXTERIOR' } });
  const token = iso((await project(id)).updatedAt);
  for (const actor of ['u3', 'u4']) {
    const refused = await settle(complete(id, token, actor));
    assert.equal(refused.code, 'DIY_ACCESS_REVOKED', actor);
  }
  assert.equal((await project(id)).status, 'IN_PROGRESS');
  assert.equal(await prisma.domainEvent.count({ where: { idempotencyKey: `diy-project-completed:${id}` } }), 0);
  assert.equal((await project(id)).updatedAt.getTime(), new Date(token).getTime(), 'the refusal wrote nothing, not even the claim');

  await complete(id, token, 'u2');
  const [row] = await prisma.domainEvent.findMany({ where: { idempotencyKey: `diy-project-completed:${id}` } });
  assert.deepEqual([row.type, row.status, row.attempts, row.propertyId, row.userId], ['DIY_PROJECT_COMPLETED', 'PENDING', 0, 'prop1', 'u2']);
  assert.deepEqual({ ...row.payload, completedAt: typeof row.payload.completedAt }, { projectId: id, propertyId: 'prop1', actorUserId: 'u2', completedAt: 'string', title: 'Seal the deck', category: 'EXTERIOR', actualMinutes: null, actualMaterialCostCents: null, maintenanceTaskId: 'task-77' });
});

test('the outbox key is the idempotency boundary: a row already holding the key is reused, never duplicated (one row per project)', async () => {
  const id = await makeProject(['COMPLETED']);
  await prisma.$executeRawUnsafe(`INSERT INTO domain_events ("id","type","status","idempotencyKey","payload","updatedAt") VALUES ('squatter-${id}','DIY_PROJECT_COMPLETED','PENDING','diy-project-completed:${id}','{}', now())`);
  // DomainEventsService.emit returns the existing row for a known key, so the completion succeeds without a second row. A project completes once, so this
  // can only happen through corruption; the handler would then dead-letter the empty payload as SNAPSHOT_INVALID rather than act on it.
  const result = await settle(complete(id, iso((await project(id)).updatedAt), 'u1'));
  assert.equal(result.ok, true);
  assert.equal(await prisma.domainEvent.count({ where: { idempotencyKey: `diy-project-completed:${id}` } }), 1);
});

test('a real database failure after the outbox insert rolls back the project completion, the ledger row and the outbox row together', async () => {
  const id = await makeProject(['COMPLETED']);
  const before = await project(id);
  // Make the LAST write of the transaction (the ledger row's actor is a plain string, so use a violation we control): a trigger that raises on a
  // PROJECT_COMPLETED ledger insert for this project.
  await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION scratch_fail_ledger() RETURNS trigger AS $$ BEGIN IF NEW."projectId" = '${id}' AND NEW."type" = 'PROJECT_COMPLETED' THEN RAISE EXCEPTION 'scratch: ledger insert refused'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER scratch_fail_ledger_trg BEFORE INSERT ON diy_project_events FOR EACH ROW EXECUTE FUNCTION scratch_fail_ledger()`);
  try {
    await assert.rejects(complete(id, iso(before.updatedAt), 'u1'), /ledger insert refused/);
  } finally {
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS scratch_fail_ledger_trg ON diy_project_events');
  }
  const after = await project(id);
  assert.deepEqual([after.status, after.completedByUserId, after.updatedAt.getTime()], ['IN_PROGRESS', null, before.updatedAt.getTime()]);
  assert.equal(await prisma.domainEvent.count({ where: { idempotencyKey: `diy-project-completed:${id}` } }), 0, 'no outbox row survives a rolled-back completion');
});
