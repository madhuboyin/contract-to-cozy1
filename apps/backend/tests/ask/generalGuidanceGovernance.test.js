const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const { ASK_GENERAL_GUIDANCE_CATALOG, selectAskGeneralGuidance } = require('../../src/services/ask/askGeneralGuidanceCatalog.ts');
const { lintGuidanceCatalog, guidanceCatalogueReport, EXCLUDED_GUIDANCE_TOPICS, GUIDANCE_ROLES } = require('../../src/services/ask/askGeneralGuidanceGovernance.ts');

// BICC-ANS-013/014, GATE-007: authored guidance is governed by deterministic lint and human review, with the human gaps recorded, never claimed away.
const NOW = new Date('2026-11-23T00:00:00Z');
const base = () => ASK_GENERAL_GUIDANCE_CATALOG[0];
const entry = (patch = {}, governance = {}) => ({ ...base(), ...patch, governance: { ...base().governance, ...governance } });

test('the shipped catalogue passes the lint with zero errors (GATE-007 static-entry check)', () => {
  const { errors } = lintGuidanceCatalog(ASK_GENERAL_GUIDANCE_CATALOG, { now: NOW });
  assert.deepEqual(errors, []);
});

test('every entry carries owner, evidence basis, scope, exclusions, boundary, review state and dates', () => {
  for (const e of ASK_GENERAL_GUIDANCE_CATALOG) {
    const g = e.governance;
    assert.ok(g, e.id);
    assert.equal(g.owner, GUIDANCE_ROLES.owner);
    assert.ok(g.topicFamily && g.scope && g.boundary && g.exclusions.length, e.id);
    assert.match(g.lastAuthored, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(g.nextReview, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('the human gaps are recorded as pending, not claimed: no entry is marked reviewed and evidence is UNRECORDED', () => {
  const { warnings } = lintGuidanceCatalog(ASK_GENERAL_GUIDANCE_CATALOG, { now: NOW });
  assert.equal(warnings.filter((w) => /safety\/professional-boundary review is pending/.test(w)).length, ASK_GENERAL_GUIDANCE_CATALOG.length);
  assert.equal(warnings.filter((w) => /editorial review/.test(w)).length, ASK_GENERAL_GUIDANCE_CATALOG.length);
  assert.equal(warnings.filter((w) => /evidence basis is UNRECORDED/.test(w)).length, ASK_GENERAL_GUIDANCE_CATALOG.length);
  const report = guidanceCatalogueReport(ASK_GENERAL_GUIDANCE_CATALOG);
  assert.equal(report.approvedForPublication, 0);
  assert.equal(report.pendingHumanReview, ASK_GENERAL_GUIDANCE_CATALOG.length);
});

test('the report groups entries by topic family and names the excluded topics so coverage can never claim them', () => {
  const report = guidanceCatalogueReport(ASK_GENERAL_GUIDANCE_CATALOG);
  assert.equal(report.entryCount, ASK_GENERAL_GUIDANCE_CATALOG.length);
  assert.ok(report.topicFamilies.length >= 4);
  assert.equal(report.topicFamilies.flatMap((f) => f.entries).length, ASK_GENERAL_GUIDANCE_CATALOG.length);
  const covered = new Set(report.topicFamilies.map((f) => f.topicFamily));
  for (const excluded of EXCLUDED_GUIDANCE_TOPICS) assert.ok(!covered.has(excluded.topic), `${excluded.topic} must not be covered`);
  assert.ok(EXCLUDED_GUIDANCE_TOPICS.length >= 6);
});

test('the lint rejects what it must: duplicates, claims about the person\'s home, diagnoses, guarantees, missing metadata, overdue review, conflicts', () => {
  const lint = (catalog) => lintGuidanceCatalog(catalog, { now: NOW }).errors.join('\n');
  assert.match(lint([base(), base()]), /duplicate id/);
  assert.match(lint([entry({ guidance: 'Your furnace is probably failing; replace it.' })]), /own home/);
  assert.match(lint([entry({ guidance: 'This is definitely a gas leak and you probably have a problem.' })]), /diagnosis/);
  assert.match(lint([entry({ guidance: 'Doing this will guarantee a safe home.' })]), /guarantee/);
  assert.match(lint([entry({ guidance: 'Your policy covers this.' })]), /coverage determination|own home/);
  assert.match(lint([{ ...base(), governance: undefined }]), /governance metadata is required/);
  assert.match(lint([entry({}, { nextReview: '2026-01-01' })]), /overdue/);
  assert.match(lint([entry({}, { nextReview: '2026-11-22', lastAuthored: '2026-11-22' })]), /nextReview must be after lastAuthored/);
  assert.match(lint([entry({}, { exclusions: [] })]), /exclusions/);
  assert.match(lint([entry({}, { safetyReview: { status: 'APPROVED', reviewer: 'x', reviewedOn: null } })]), /needs a review date/);
  assert.match(lint([entry({}, { editorialReview: { status: 'PENDING', reviewer: 'x', reviewedOn: '2026-11-22' } })]), /PENDING review cannot carry/);
  assert.match(lint([base(), { ...ASK_GENERAL_GUIDANCE_CATALOG[1], id: 'twin-entry', keywords: base().keywords }]), /keyword overlap is too high/);
});

test('selection is unchanged: the same question still reaches the same entry', () => {
  assert.equal(selectAskGeneralGuidance('how often should I clean my gutters')?.id, 'gutter-inspection-frequency');
  assert.equal(selectAskGeneralGuidance('tell me a joke'), null);
});
