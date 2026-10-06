const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

// Slice 1a of docs/architecture/ASK_COZY_DIY_TEMPLATE_REVISIONS_PLAN.md: the revision service. Pure and database-free: an in-memory fake enforces the
// (templateId, revision) unique key, evaluates the conditional writes the service relies on, and records every write so immutability is asserted
// on behavior, not only by reading the source.

const service = require('../../src/services/diyTemplateRevision.service.ts');
const {
  buildRevisionContent, canonicalStringify, computeContentHash, checkRevisionIntegrity, createCandidateRevision, approveRevision, returnRevision,
  publishRevision, retireHead, DiyTemplateRevisionError,
} = service;

const NOW = new Date('2026-10-06T12:00:00.000Z');
const { makeDiyDb } = require('../helpers/diyTemplateFake.js');
const makeDb = (templates, hooks) => makeDiyDb(templates, hooks);

const template = (overrides = {}) => ({
  id: 't1', slug: 'replace-furnace-filter', title: 'Replace a furnace filter', shortDescription: 'Swap the filter.', longDescription: 'Longer text.',
  category: 'HVAC', difficultyLevel: 'EASY', requiredSkillLevel: 'BEGINNER', safetyLevel: 'LOW', permitRequirement: 'NOT_REQUIRED', estimatedMinutes: 15,
  estimatedMaterialCostMinCents: 1500, estimatedMaterialCostMaxCents: 4000, professionalCostMinCents: undefined, professionalCostMaxCents: undefined,
  tags: ['hvac', 'filter'], publishedRevisionId: null,
  steps: [
    { stepNumber: 2, title: 'Slide in the new filter', description: 'Match the arrow to the airflow.', estimatedMinutes: 2, isOptional: false },
    { stepNumber: 1, title: 'Turn off the furnace', description: 'Use the thermostat.', safetyNote: 'Wait for the blower to stop.', isOptional: false },
  ],
  materials: [{ name: 'Filter', unit: 'each', quantityFormula: '1', unitPriceCents: 2500, isOptional: false, sortOrder: 0 }],
  tools: [{ name: 'Flashlight', isRequired: false, defaultToolAction: 'ALREADY_OWNED', sortOrder: 0 }],
  ...overrides,
});

const submit = (db, actorId = 'author-1') => createCandidateRevision(db, { templateId: 't1', actorId, now: NOW });
const fresh = (overrides, hooks) => makeDb([template(overrides)], hooks);
const rejectsWith = (promise, code) => assert.rejects(promise, (error) => error instanceof DiyTemplateRevisionError && error.code === code, code);

// ---- content, canonical form and hash ------------------------------------------------------------------------------------------------------------

test('canonical form: key order, undefined versus null and row order do not change the hash; any content change does', () => {
  const base = buildRevisionContent(template());
  const reordered = buildRevisionContent(template({
    steps: [...template().steps].reverse(), tags: ['hvac', 'filter'],
    professionalCostMinCents: null, professionalCostMaxCents: null,
  }));
  assert.equal(computeContentHash(reordered), computeContentHash(base));
  assert.equal(canonicalStringify({ b: 1, a: undefined }), canonicalStringify({ a: null, b: 1 }));
  assert.deepEqual(base.contentJson.steps.map((step) => step.stepNumber), [1, 2], 'steps are in authored order, not row order');

  const changed = (overrides) => computeContentHash(buildRevisionContent(template(overrides)));
  assert.notEqual(changed({ title: 'Replace the furnace filter' }), computeContentHash(base));
  assert.notEqual(changed({ safetyLevel: 'MODERATE' }), computeContentHash(base));
  assert.notEqual(changed({ permitRequirement: 'REQUIRED' }), computeContentHash(base));
  assert.notEqual(changed({ steps: [{ ...template().steps[0], description: 'Different.' }, template().steps[1]] }), computeContentHash(base));
  assert.notEqual(changed({ tags: ['filter', 'hvac'] }), computeContentHash(base), 'tag order is part of the content');
  assert.match(computeContentHash(base), /^[0-9a-f]{64}$/);
});

test('integrity: a governed revision verifies; a tampered one, or one without a hash, is a mismatch; a legacy revision with no hash is unverified, not trusted', async () => {
  const db = fresh();
  const revision = await submit(db);
  assert.equal(checkRevisionIntegrity(revision), 'VERIFIED');
  assert.equal(checkRevisionIntegrity({ ...revision, title: 'Edited after the fact' }), 'MISMATCH');
  const tampered = structuredClone(revision);
  tampered.contentJson.steps[0].description = 'Silently changed.';
  assert.equal(checkRevisionIntegrity(tampered), 'MISMATCH');
  assert.equal(checkRevisionIntegrity({ ...revision, contentHash: null }), 'MISMATCH');
  assert.equal(checkRevisionIntegrity({ ...revision, provenance: 'LEGACY_BACKFILL', contentHash: null }), 'LEGACY_UNVERIFIED');
});

// ---- candidate creation and numbering ------------------------------------------------------------------------------------------------------------

test('submitting snapshots the working copy as revision 1 with a hash, then numbers the next revision after the first is returned', async () => {
  const db = fresh();
  const first = await submit(db);
  assert.equal(first.revision, 1);
  assert.equal(first.provenance, 'GOVERNED');
  assert.equal(first.submittedBy, 'author-1');
  assert.equal(first.contentHash, computeContentHash(buildRevisionContent(template())));
  assert.equal(first.title, 'Replace a furnace filter');
  assert.deepEqual(first.contentJson.steps.map((step) => step.title), ['Turn off the furnace', 'Slide in the new filter']);
  await returnRevision(db, { revisionId: first.id, now: NOW });
  assert.equal((await submit(db)).revision, 2);
});

test('only one candidate is open per template', async () => {
  const db = fresh();
  await submit(db);
  await rejectsWith(submit(db), 'REVISION_STATE_CONFLICT');
  assert.equal(db.state.revisions.length, 1);
});

test('two simultaneous submissions yield one revision and one clean REVISION_CONFLICT, never a duplicate number', async () => {
  let arrivals = 0; let release; const gate = new Promise((resolve) => { release = resolve; });
  const db = fresh({}, { barrier: async () => { arrivals += 1; if (arrivals === 2) release(); await gate; } });
  // Both pass the "open candidate" and "latest number" reads before either insert lands (the barrier holds both at the insert).
  const results = await Promise.allSettled([submit(db, 'a'), submit(db, 'b')]);
  assert.deepEqual(results.map((result) => result.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'REVISION_CONFLICT');
  assert.deepEqual(db.state.revisions.map((row) => row.revision), [1]);
});

test('an unknown template is reported, not created', async () => {
  await rejectsWith(createCandidateRevision(fresh(), { templateId: 'missing', actorId: 'a' }), 'TEMPLATE_NOT_FOUND');
});

// ---- approval binding ----------------------------------------------------------------------------------------------------------------------------

test('approval is recorded on the revision once; a returned, approved or unknown revision cannot be approved again', async () => {
  const db = fresh();
  const revision = await submit(db);
  await approveRevision(db, { revisionId: revision.id, actorId: 'reviewer-1', now: NOW });
  const stored = db.state.revisions[0];
  assert.deepEqual([stored.approvedBy, stored.approvedAt], ['reviewer-1', NOW]);
  await rejectsWith(approveRevision(db, { revisionId: revision.id, actorId: 'reviewer-2' }), 'REVISION_STATE_CONFLICT');
  assert.equal(db.state.revisions[0].approvedBy, 'reviewer-1', 'a second approval did not overwrite the first');
  const other = fresh(); const second = await submit(other);
  await returnRevision(other, { revisionId: second.id });
  await rejectsWith(approveRevision(other, { revisionId: second.id, actorId: 'r' }), 'REVISION_STATE_CONFLICT');
  await rejectsWith(approveRevision(other, { revisionId: 'nope', actorId: 'r' }), 'REVISION_STATE_CONFLICT');
});

// ---- publish -------------------------------------------------------------------------------------------------------------------------------------

async function approved(db, actor = 'reviewer-1') {
  const revision = await submit(db);
  await approveRevision(db, { revisionId: revision.id, actorId: actor, now: NOW });
  return revision;
}
const publish = (db, revision, actorId = 'publisher-1') => publishRevision(db, { templateId: 't1', revisionId: revision.id, actorId, now: NOW });

test('publishing an approved, intact revision sets the head and records the publisher; an unapproved one is refused', async () => {
  const db = fresh();
  const revision = await submit(db);
  await rejectsWith(publish(db, revision), 'REVISION_NOT_APPROVED');
  await approveRevision(db, { revisionId: revision.id, actorId: 'reviewer-1', now: NOW });
  const result = await publish(db, revision);
  assert.deepEqual(result, { publishedRevisionId: revision.id, retiredRevisionId: null });
  assert.equal(db.state.templates.get('t1').publishedRevisionId, revision.id);
  assert.deepEqual([db.state.revisions[0].publishedBy, db.state.revisions[0].publishedAt], ['publisher-1', NOW]);
  await rejectsWith(publish(db, revision), 'REVISION_NOT_APPROVED');
});

test('publishing a newer revision retires the previous head as SUPERSEDED and moves the head', async () => {
  const db = fresh();
  const first = await approved(db); await publish(db, first);
  db.state.templates.get('t1').title = 'Replace a furnace filter (updated)';
  const second = await approved(db);
  assert.equal(second.revision, 2);
  const result = await publish(db, second);
  assert.equal(result.retiredRevisionId, first.id);
  const [one, two] = db.state.revisions;
  assert.deepEqual([one.retiredReason, one.retiredAt], ['SUPERSEDED', NOW]);
  assert.equal(two.retiredAt, null);
  assert.equal(db.state.templates.get('t1').publishedRevisionId, second.id);
});

test('publish refuses when the working copy was edited after approval, and changes nothing', async () => {
  const db = fresh();
  const revision = await approved(db);
  db.state.templates.get('t1').steps[0].description = 'Edited after approval.';
  await rejectsWith(publish(db, revision), 'WORKING_COPY_CHANGED');
  assert.equal(db.state.templates.get('t1').publishedRevisionId, null);
  assert.equal(db.state.revisions[0].publishedAt, null);
});

test('publish refuses a revision whose stored content no longer matches its hash', async () => {
  const db = fresh();
  const revision = await approved(db);
  db.state.revisions[0].contentJson.steps[0].title = 'Tampered in the database';
  await rejectsWith(publish(db, revision), 'INTEGRITY_FAILED');
  assert.equal(db.state.templates.get('t1').publishedRevisionId, null);
});

test('a legacy-backfill revision can never be published through governance', async () => {
  const db = fresh();
  const revision = await approved(db);
  db.state.revisions[0].provenance = 'LEGACY_BACKFILL';
  await rejectsWith(publish(db, revision), 'REVISION_NOT_APPROVED');
});

test('HIGH-safety separation uses the revision\'s approver: the approver cannot publish, a different administrator can', async () => {
  const db = fresh({ safetyLevel: 'HIGH' });
  const revision = await approved(db, 'admin-1');
  await rejectsWith(publish(db, revision, 'admin-1'), 'HIGH_SAFETY_SEPARATION_REQUIRED');
  assert.equal(db.state.templates.get('t1').publishedRevisionId, null);
  await publish(db, revision, 'admin-2');
  assert.equal(db.state.templates.get('t1').publishedRevisionId, revision.id);
  const lowDb = fresh();
  const low = await approved(lowDb, 'admin-1');
  await publish(lowDb, low, 'admin-1');
});

test('a head that changes while publishing fails the whole publish instead of overwriting it', async () => {
  const db = fresh({}, { beforeTemplateUpdate: async (state) => { state.templates.get('t1').publishedRevisionId = 'someone-elses'; } });
  const first = await approved(db);
  await rejectsWith(publish(db, first), 'REVISION_STATE_CONFLICT');
  assert.equal(db.state.templates.get('t1').publishedRevisionId, 'someone-elses');
});

// ---- withdrawal ----------------------------------------------------------------------------------------------------------------------------------

test('withdrawing retires the head with its reason and clears the pointer; nothing live is a no-op', async () => {
  const db = fresh();
  assert.equal(await retireHead(db, { templateId: 't1', reason: 'UNPUBLISHED', now: NOW }), null);
  const revision = await approved(db); await publish(db, revision);
  assert.deepEqual(await retireHead(db, { templateId: 't1', reason: 'ARCHIVED', now: NOW }), { retiredRevisionId: revision.id });
  assert.deepEqual([db.state.revisions[0].retiredReason, db.state.revisions[0].retiredAt], ['ARCHIVED', NOW]);
  assert.equal(db.state.templates.get('t1').publishedRevisionId, null);
  assert.equal(await retireHead(db, { templateId: 't1', reason: 'UNPUBLISHED' }), null, 'a second withdrawal finds nothing live');
  await rejectsWith(retireHead(db, { templateId: 'missing', reason: 'UNPUBLISHED' }), 'TEMPLATE_NOT_FOUND');
});

// ---- finders, republish and closing a candidate (slice 1b) ----------------------------------------------------------------------------------------

test('findOpenCandidate returns only the open candidate; findPublishableRevision prefers an approved candidate and falls back to an unpublished approved revision', async () => {
  const db = fresh();
  assert.equal(await service.findOpenCandidate(db, 't1'), null);
  assert.equal(await service.findPublishableRevision(db, 't1'), null);
  const candidate = await submit(db);
  assert.equal((await service.findOpenCandidate(db, 't1')).id, candidate.id);
  assert.equal(await service.findPublishableRevision(db, 't1'), null, 'an unapproved candidate is not publishable');
  await approveRevision(db, { revisionId: candidate.id, actorId: 'r' });
  assert.equal((await service.findPublishableRevision(db, 't1')).id, candidate.id);
  await publish(db, candidate);
  assert.equal(await service.findOpenCandidate(db, 't1'), null, 'a published revision is no longer a candidate');
  assert.equal(await service.findPublishableRevision(db, 't1'), null, 'the live head is not something to publish again');
  await retireHead(db, { templateId: 't1', reason: 'UNPUBLISHED', now: NOW });
  assert.equal((await service.findPublishableRevision(db, 't1')).id, candidate.id, 'an unpublished approved revision can be republished');
});

test('a newer unapproved candidate hides an older unpublished revision, and superseded, archived or returned revisions are never publishable', async () => {
  const db = fresh();
  const first = await approved(db); await publish(db, first);
  await retireHead(db, { templateId: 't1', reason: 'UNPUBLISHED' });
  db.state.templates.get('t1').title = 'v2';
  const second = await submit(db);
  assert.equal(await service.findPublishableRevision(db, 't1'), null, 'the open unapproved candidate wins, so nothing is publishable yet');
  await returnRevision(db, { revisionId: second.id });
  assert.equal((await service.findPublishableRevision(db, 't1')).id, first.id);
  db.state.revisions[0].retiredReason = 'ARCHIVED';
  assert.equal(await service.findPublishableRevision(db, 't1'), null, 'archived is closed for good');
  db.state.revisions[0].retiredReason = 'SUPERSEDED';
  assert.equal(await service.findPublishableRevision(db, 't1'), null, 'superseded is closed for good');
});

test('republishing an unpublished revision clears its retirement, records the new publisher, and still requires the working copy to be unchanged', async () => {
  const db = fresh();
  const revision = await approved(db); await publish(db, revision);
  await retireHead(db, { templateId: 't1', reason: 'UNPUBLISHED', now: NOW });
  const later = new Date('2026-10-07T12:00:00.000Z');
  await publishRevision(db, { templateId: 't1', revisionId: revision.id, actorId: 'publisher-2', now: later });
  const stored = db.state.revisions[0];
  assert.deepEqual([stored.retiredAt, stored.retiredReason, stored.publishedBy, stored.publishedAt], [null, null, 'publisher-2', later]);
  assert.equal(db.state.templates.get('t1').publishedRevisionId, revision.id);

  await retireHead(db, { templateId: 't1', reason: 'UNPUBLISHED' });
  db.state.templates.get('t1').title = 'edited while unpublished';
  await rejectsWith(publishRevision(db, { templateId: 't1', revisionId: revision.id, actorId: 'p' }), 'WORKING_COPY_CHANGED');
  db.state.revisions[0].retiredReason = 'ARCHIVED';
  db.state.templates.get('t1').title = 'Replace a furnace filter';
  await rejectsWith(publishRevision(db, { templateId: 't1', revisionId: revision.id, actorId: 'p' }), 'REVISION_NOT_APPROVED');
});

test('retireOpenCandidate closes an open candidate with its reason and reports nothing when none is open', async () => {
  const db = fresh();
  assert.equal(await service.retireOpenCandidate(db, { templateId: 't1', reason: 'ARCHIVED' }), null);
  const candidate = await submit(db);
  assert.deepEqual(await service.retireOpenCandidate(db, { templateId: 't1', reason: 'ARCHIVED', now: NOW }), { retiredRevisionId: candidate.id });
  assert.deepEqual([db.state.revisions[0].retiredReason, db.state.revisions[0].retiredAt], ['ARCHIVED', NOW]);
  assert.equal(await service.findOpenCandidate(db, 't1'), null);
  assert.equal((await submit(db)).revision, 2, 'a closed candidate no longer blocks a new submission');
});

// ---- immutability --------------------------------------------------------------------------------------------------------------------------------

test('behavior: across submit, approve, publish, supersede and withdraw, a revision\'s content never changes and every update touches only lifecycle metadata', async () => {
  const db = fresh();
  const first = await approved(db);
  const snapshot = structuredClone(db.state.revisions[0]);
  const contentOf = (row) => JSON.stringify({ ...revisionColumns(row), contentJson: row.contentJson, contentHash: row.contentHash });
  const revisionColumns = (row) => Object.fromEntries(service.REVISION_COLUMN_KEYS.map((key) => [key, row[key]]));

  await publish(db, first);
  db.state.templates.get('t1').title = 'Next working copy';
  const second = await approved(db); await publish(db, second);
  await retireHead(db, { templateId: 't1', reason: 'UNPUBLISHED', now: NOW });

  assert.equal(contentOf(db.state.revisions[0]), contentOf(snapshot), 'revision 1 content is byte-identical after its whole lifecycle');
  const METADATA = new Set(['approvedBy', 'approvedAt', 'returnedAt', 'publishedBy', 'publishedAt', 'retiredAt', 'retiredReason']);
  for (const write of db.state.writes.filter((entry) => entry.model === 'revision' && entry.op === 'updateMany')) {
    assert.ok(write.dataKeys.every((key) => METADATA.has(key)), `update touched ${write.dataKeys.join(', ')}`);
  }
  assert.equal(db.state.writes.filter((entry) => entry.model === 'revision' && entry.op === 'create').length, 2);
});

test('structure: the service exports no function that edits revision content', () => {
  const names = Object.keys(service);
  assert.deepEqual(names.filter((name) => /update|edit|patch|setContent|overwrite/i.test(name)), []);
});

test('guard: no other source file writes diyTemplateRevision, so the revision service is its only writer', () => {
  const roots = [path.resolve(__dirname, '../../src'), path.resolve(__dirname, '../../../workers/src')];
  const offenders = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(full); continue; }
      if (!/\.(ts|js|tsx)$/.test(entry.name) || full.endsWith(path.join('services', 'diyTemplateRevision.service.ts'))) continue;
      const text = fs.readFileSync(full, 'utf8');
      if (/diyTemplateRevision\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/.test(text) || /diy_template_revisions/.test(text)) offenders.push(full);
    }
  };
  roots.filter((root) => fs.existsSync(root)).forEach(walk);
  assert.deepEqual(offenders, []);
});
