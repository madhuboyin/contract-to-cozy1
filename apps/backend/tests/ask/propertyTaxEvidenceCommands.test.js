const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Register P2 "Property Tax": appeal evidence from a link (FRD v1.367) and the http(s)-only source link. No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { propertyTaxAppealReadinessService: Readiness, PropertyTaxAppealReadinessService } = require('../../src/services/propertyTax/propertyTaxAppealReadiness.service.ts');
const { isHttpUrl } = require('../../src/services/propertyTax/propertyTaxUrl.ts');
const command = require('../../src/services/ask/support/propertyTaxEvidenceCommand.ts');
const { evidenceCommandResult } = require('../../src/services/ask/handlers/propertyTaxEvidenceCommands.handler.ts');
const source = require('../../src/services/propertyTax/propertyTaxEvidenceSource.ts');

const OP = 'PROPERTY_TAX_COMPARABLE_COMMAND';
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const M = command.EVIDENCE_MESSAGES;
const T = new Date('2026-09-01T00:00:00Z');
const RULE = { id: 'rule-1', title: 'Reviewed rule', version: 3 };
const readiness = (over = {}) => ({ status: 'NOT_READY', ruleProfile: RULE, reviewedGrounds: [{ code: 'ASSESSED_VALUE' }, { code: 'TAX_CLASS' }, { code: 'EXEMPTION' }], ground: { requirements: { acceptedDecisionTypes: ['DENIED', 'REVOKED'] } }, ...over });
const classAnswer = (over = {}) => ({ claimedClassification: 'Class 1', officialRecordMismatch: 'YES', sourceUrl: 'https://example.gov/record/1', ...over });

const RECORD = { id: 'rec-1', title: 'Notice of value.pdf', recordType: 'TAX_DOCUMENT', sensitivity: 'LEGAL', createdAt: new Date('2026-05-01T00:00:00Z') };

function install(role, { primary = true, existing = null, evaluate = readiness(), records = [], privateCount = 0, eligibleFound = true } = {}) {
  const saved = { pr: prisma.propertyRecord, a: propertyAccess.resolvePropertyAccess, p: prisma.property, ev: prisma.propertyTaxAppealEvidence, ex: Readiness.evaluate, up: Readiness.upsertEvidence, r: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  prisma.property = { findFirst: async () => (primary ? { id: 'prop-1' } : null) };
  prisma.propertyTaxAppealEvidence = { findUnique: async () => existing };
  prisma.propertyRecord = { findMany: async () => records, count: async () => privateCount, findFirst: async () => (eligibleFound ? { id: 'rec-1' } : null) };
  Readiness.evaluate = async () => evaluate;
  Readiness.upsertEvidence = async (input) => { calls.push(input); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() {
    prisma.propertyRecord = saved.pr; propertyAccess.resolvePropertyAccess = saved.a; prisma.property = saved.p; prisma.propertyTaxAppealEvidence = saved.ev;
    Readiness.evaluate = saved.ex; Readiness.upsertEvidence = saved.up; executeOperation.reconcileAskExecutionSideEffects = saved.r;
  } };
}
const launch = (kind) => ({ operationId: OP, surface: 'ASK_PAGE' });
const invoke = (message) => capabilityInvoke(OP, { userId: 'u1', propertyId: 'prop-1', message, launchContext: launch() });
const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters });
const lc = (kind) => ({ kind, sourceExecutionId: null });
const version = (key, existing) => sha(`tax-evidence:prop-1:${key}:rule-1:${existing ? `${existing.id}:${existing.updatedAt.toISOString()}` : 'none'}`);

test('the source link is an http or https address, parsed rather than pattern-matched', () => {
  for (const ok of ['https://example.gov/a', 'http://example.gov/a?b=1']) assert.equal(isHttpUrl(ok), true, ok);
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'ftp://example.gov/a', 'https://user:pw@example.gov/', 'not a url', '', 'https://' + 'a'.repeat(2100)]) assert.equal(isHttpUrl(bad), false, bad.slice(0, 40));
});

test('the canonical service refuses a non-web link before any write, for evidence and for a comparable', async () => {
  let writes = 0;
  const db = { propertyTaxAppealEvidence: { upsert: async () => { writes += 1; return {}; } }, propertyTaxAppealComparable: { upsert: async () => { writes += 1; return {}; } } };
  const rules = { getForProperty: async () => ({ coverage: 'REVIEWED', profile: { id: 'rule-1', appealGrounds: { grounds: [{ code: 'TAX_CLASS' }] } } }) };
  const service = new PropertyTaxAppealReadinessService(db, rules, {});
  await assert.rejects(() => service.upsertEvidence({ propertyId: 'p', userId: 'u', role: 'OWNER', evidenceKey: 'k', ground: 'TAX_CLASS', type: 'FACTUAL_ERROR', title: 'Title', facts: {}, sourceUrl: 'javascript:alert(1)' }), /http or https/);
  await assert.rejects(() => service.upsertComparable({ propertyId: 'p', userId: 'u', role: 'OWNER', comparableKey: 'k', address: '12 Oak Street', saleDate: '2026-01-01', salePrice: 1, propertyClass: 'x', sourceUrl: 'data:text/html,x' }), /http or https/);
  assert.equal(writes, 0);
  await service.upsertEvidence({ propertyId: 'p', userId: 'u', role: 'OWNER', evidenceKey: 'k', ground: 'TAX_CLASS', type: 'FACTUAL_ERROR', title: 'Title', facts: {}, sourceUrl: 'https://example.gov/x' });
  assert.equal(writes, 1);
});

test('each kind maps to the ground and row readiness reads; the mismatch must be stated; a condition never claims to satisfy the assessed-value ground', () => {
  const p = command.parseEvidenceAnswer;
  const cls = p('CLASS', classAnswer());
  assert.deepEqual([cls.data.ground, cls.data.type, cls.data.evidenceKey, cls.data.facts], ['TAX_CLASS', 'FACTUAL_ERROR', 'tax_class-primary', { claimedClassification: 'Class 1', officialRecordMismatch: true }]);
  assert.equal(p('CLASS', classAnswer({ officialRecordMismatch: 'NO' })).reason, 'NO_MISMATCH');
  assert.equal(p('CLASS', classAnswer({ sourceUrl: 'javascript:alert(1)' })).reason, 'URL');
  assert.equal(p('CLASS', classAnswer({ extra: 1 })).reason, 'INVALID');
  const ex = p('EXEMPTION', { programName: 'Primary residence', decisionType: 'DENIED', noticeDate: '2026-02-01', sourceUrl: 'https://example.gov/n' }, ['DENIED']);
  assert.deepEqual([ex.data.ground, ex.data.type, ex.data.evidenceKey, ex.data.facts], ['EXEMPTION', 'EXEMPTION_DECISION', 'exemption-primary', { programName: 'Primary residence', decisionType: 'DENIED', noticeDate: '2026-02-01' }]);
  assert.equal(p('EXEMPTION', { programName: 'x', decisionType: 'OMITTED', noticeDate: '2026-02-01', sourceUrl: 'https://example.gov/n' }, ['DENIED']).reason, 'DECISION');
  assert.equal(p('EXEMPTION', { programName: 'x', decisionType: 'DENIED', noticeDate: '2999-01-01', sourceUrl: 'https://example.gov/n' }, ['DENIED']).reason, 'FUTURE');
  const cond = p('CONDITION_VALUE', { description: 'Water damage to the basement', sourceUrl: 'https://example.gov/p' });
  assert.deepEqual([cond.data.ground, cond.data.type, cond.data.evidenceKey, cond.data.facts], ['ASSESSED_VALUE', 'CONDITION', 'assessed_value-primary', { conditionAsOfValuationDate: 'Water damage to the basement' }]);
  assert.equal(command.EVIDENCE_KIND_SPEC.CONDITION_CLASS.evidenceKey, 'tax_class-condition', 'a condition on another ground does not overwrite that ground\'s required row');
  assert.equal(command.conditionKindForGround('EXEMPTION'), 'CONDITION_EXEMPTION');
});

test('declared-action only; viewers and non-owners are told before a form; an uncovered rule or ground is explained; a form is offered', async () => {
  for (const message of Object.values(M)) assert.notEqual(resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId, OP, message);
  let w = install('VIEWER');
  try { assert.equal((await invoke(M.CLASS)).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR', { primary: false });
  try { assert.equal((await invoke(M.CLASS)).reasonCode, 'PROPERTY_TAX_EVIDENCE_OWNER_ONLY'); } finally { w.restore(); }
  w = install('CONTRIBUTOR', { evaluate: { status: 'NOT_COVERED' } });
  try { assert.equal((await invoke(M.CLASS)).reasonCode, 'PROPERTY_TAX_RULE_COVERAGE_UNAVAILABLE'); } finally { w.restore(); }
  w = install('CONTRIBUTOR', { evaluate: readiness({ reviewedGrounds: [{ code: 'ASSESSED_VALUE' }] }) });
  try { assert.equal((await invoke(M.CLASS)).reasonCode, 'PROPERTY_TAX_GROUND_NOT_COVERED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR');
  try {
    const form = await invoke(M.EXEMPTION);
    assert.equal(form.status, 'NEEDS_CONTEXT');
    const fields = form.captureRequests[0].inputSchema.fields;
    assert.equal(form.captureRequests[0].captureKey, command.EVIDENCE_CAPTURE_KEY);
    assert.deepEqual(fields.find((f) => f.key === 'decisionType').inputSchema.options.map((o) => o.value), ['DENIED', 'REVOKED'], 'only the reviewed rule\'s decisions');
    const classForm = await invoke(M.CLASS);
    assert.ok(classForm.captureRequests[0].inputSchema.fields.some((f) => f.key === 'officialRecordMismatch' && f.required === true));
  } finally { w.restore(); }
});

test('the review lists every value, the source and what it replaces; a "no" on the mismatch and a bad link write nothing', async () => {
  const existing = { id: 'ev-1', updatedAt: T, title: 'Tax class factual record', factsJson: { claimedClassification: 'Class 2' }, sourceUrl: 'https://example.gov/old' };
  const w = install('CONTRIBUTOR', { existing });
  try {
    const review = await evidenceCommandResult('u1', 'prop-1', lc('CLASS'), classAnswer());
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual(review.confirmation.fields.map((f) => f.label), ['Class you say is correct', 'The official record shows a different class', 'Source', 'Replaces']);
    assert.match(review.confirmation.description, /Cozy did not read the link and nothing is filed/);
    assert.match(review.confirmation.description, /replaces the evidence you saved earlier/);
    const condition = await evidenceCommandResult('u1', 'prop-1', lc('CONDITION_VALUE'), { description: 'Cracked foundation', sourceUrl: 'https://example.gov/p' });
    assert.match(condition.confirmation.description, /does not by itself satisfy the assessed-value ground, which needs qualified comparables/);
    assert.equal((await evidenceCommandResult('u1', 'prop-1', lc('CLASS'), classAnswer({ officialRecordMismatch: 'NO' }))).reasonCode, 'PROPERTY_TAX_EVIDENCE_NO_MISMATCH');
    assert.equal((await evidenceCommandResult('u1', 'prop-1', lc('CLASS'), classAnswer({ sourceUrl: 'javascript:alert(1)' }))).reasonCode, 'PROPERTY_TAX_EVIDENCE_URL');
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
});

test('confirming calls upsertEvidence with the desktop\'s key and facts; a changed row, a changed rule or a tampered form writes nothing', async () => {
  const existing = { id: 'ev-1', updatedAt: T, title: 't', factsJson: {}, sourceUrl: null };
  const w = install('CONTRIBUTOR', { existing });
  try {
    const parameters = { evidenceKind: 'CLASS', evidenceForm: classAnswer(), evidenceContextVersion: version('tax_class-primary', existing) };
    const done = await confirmCapabilityInvoke(OP, ctx(parameters));
    assert.equal(done.result.reasonCode, 'PROPERTY_TAX_EVIDENCE_SAVED');
    assert.equal(w.calls.length, 1);
    assert.deepEqual(w.calls[0], { propertyId: 'prop-1', userId: 'u1', role: 'CONTRIBUTOR', evidenceKey: 'tax_class-primary', ground: 'TAX_CLASS', type: 'FACTUAL_ERROR', title: 'Tax class factual record',
      facts: { claimedClassification: 'Class 1', officialRecordMismatch: true }, sourceUrl: 'https://example.gov/record/1' });
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ ...parameters, evidenceContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ ...parameters, evidenceForm: classAnswer({ officialRecordMismatch: 'NO' }) })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ ...parameters, evidenceKind: 'ERASE' })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w.calls.length, 1);
  } finally { w.restore(); }
  const other = install('CONTRIBUTOR', { primary: false });
  try {
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ evidenceKind: 'CLASS', evidenceForm: classAnswer(), evidenceContextVersion: 'x' })), (e) => e.code === 'ASK_PERMISSION_REQUIRED');
    assert.equal(other.calls.length, 0);
  } finally { other.restore(); }
});

test('the evidence actions are allowlisted on the appeal answer and offered by ground', () => {
  const source = require('node:fs').readFileSync(require.resolve('../../src/services/ask/handlers/capitalPlanning.handler.ts'), 'utf8');
  assert.match(source, /ground === 'TAX_CLASS' \? \[\{\s*id: EVIDENCE_ACTION_IDS\.CLASS/);
  assert.match(source, /ground === 'EXEMPTION' \? \[\{\s*id: EVIDENCE_ACTION_IDS\.EXEMPTION/);
  for (const id of Object.values(command.EVIDENCE_ACTION_IDS)) {
    assert.equal(isAskActionApplicable({
      action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId: 'PROPERTY_TAX_APPEAL_READINESS', style: 'QUIET' },
      operationId: 'PROPERTY_TAX_APPEAL_READINESS', propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
    }), true, id);
  }
});

test('exactly one source: a link or a Home Record, never both and never neither', () => {
  const p = command.parseEvidenceAnswer;
  assert.equal(p('CLASS', classAnswer({ sourceUrl: undefined })).reason, 'SOURCE');
  assert.equal(p('CLASS', classAnswer({ sourceRecordId: 'rec-1' })).reason, 'SOURCE');
  const record = p('CLASS', classAnswer({ sourceUrl: '', sourceRecordId: 'rec-1' }));
  assert.deepEqual([record.success, record.data.sourceUrl, record.data.sourceRecordId], [true, null, 'rec-1']);
});

test('owner ruling D-T2: the service enforces household visibility, active, clean scan and a supporting type, and does not filter on sensitivity', async () => {
  const saved = prisma.propertyRecord;
  let where = null;
  prisma.propertyRecord = { findFirst: async (args) => { where = args.where; return null; }, findMany: async (args) => { where = args.where; return [RECORD]; }, count: async () => 2 };
  try {
    await assert.rejects(() => source.assertEvidenceRecordEligible('prop-1', 'rec-1'), /not eligible/);
    assert.equal(where.propertyId, 'prop-1');
    assert.equal(where.id, 'rec-1');
    assert.equal(where.lifecycleStatus, 'ACTIVE');
    assert.equal(where.visibility, 'HOUSEHOLD');
    assert.deepEqual(where.currentVersion, { is: { scanStatus: 'CLEAN' } });
    assert.ok(where.recordType.in.includes('TAX_DOCUMENT') && where.recordType.in.includes('OTHER') && !where.recordType.in.includes('QUOTE'));
    assert.equal('sensitivity' in where, false, 'a LEGAL, PERSONAL or other label does not make a record ineligible');
    const listed = await source.listEligibleEvidenceRecords('prop-1');
    assert.deepEqual([listed.options.length, listed.excludedPrivate, listed.options[0].isOther], [1, 2, false]);
  } finally { prisma.propertyRecord = saved; }
});

test('the canonical service uses the same eligibility for a supporting document, so the desktop and Ask cannot differ', async () => {
  const saved = prisma.propertyRecord;
  let writes = 0;
  const rules = { getForProperty: async () => ({ coverage: 'REVIEWED', profile: { id: 'rule-1', appealGrounds: { grounds: [{ code: 'TAX_CLASS' }] } } }) };
  const db = { propertyTaxAppealEvidence: { upsert: async (args) => { writes += 1; return args; } } };
  const service = new PropertyTaxAppealReadinessService(db, rules, {});
  const input = { propertyId: 'p', userId: 'u', role: 'OWNER', evidenceKey: 'k', ground: 'TAX_CLASS', type: 'FACTUAL_ERROR', title: 'Title', facts: {}, supportingDocumentId: 'rec-1' };
  try {
    prisma.propertyRecord = { findFirst: async () => null };
    await assert.rejects(() => service.upsertEvidence(input), /whole household/);
    assert.equal(writes, 0);
    prisma.propertyRecord = { findFirst: async () => ({ id: 'rec-1' }) };
    await service.upsertEvidence(input);
    assert.equal(writes, 1);
  } finally { prisma.propertyRecord = saved; }
});

test('Ask offers eligible records with the sensitivity shown, says how many owner-only were left out, and saves the record as the supporting document', async () => {
  const w = install('CONTRIBUTOR', { records: [RECORD], privateCount: 2 });
  try {
    const form = await invoke(M.CLASS);
    const field = form.captureRequests[0].inputSchema.fields.find((f) => f.key === 'sourceRecordId');
    assert.deepEqual(field.inputSchema.options.map((o) => o.value), ['rec-1']);
    assert.match(field.inputSchema.options[0].label, /Legal/);
    const review = await evidenceCommandResult('u1', 'prop-1', lc('CLASS'), classAnswer({ sourceUrl: '', sourceRecordId: 'rec-1' }));
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.equal(review.confirmation.fields.find((f) => f.label === 'Source document').value.includes('Notice of value.pdf'), true);
    const notOffered = await evidenceCommandResult('u1', 'prop-1', lc('CLASS'), classAnswer({ sourceUrl: '', sourceRecordId: 'rec-9' }));
    assert.equal(notOffered.reasonCode, 'PROPERTY_TAX_EVIDENCE_RECORD_NOT_OFFERED');
    assert.match(notOffered.blocks[0].body, /2 owner-only records are not offered/);
    const parameters = { evidenceKind: 'CLASS', evidenceForm: classAnswer({ sourceUrl: '', sourceRecordId: 'rec-1' }), evidenceContextVersion: version('tax_class-primary', null) };
    await confirmCapabilityInvoke(OP, ctx(parameters));
    assert.equal(w.calls[0].supportingDocumentId, 'rec-1');
    assert.equal('sourceUrl' in w.calls[0], false);
  } finally { w.restore(); }
});
