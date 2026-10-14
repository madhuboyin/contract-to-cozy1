'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Project documents, slice 3 (owner rulings D-P5, D-P6): a request can reference a document only by Home Record id; a raw storage key is no longer
// accepted by any project route, so no new reference can point at an object by key. No database is used.
const v = require('../../src/validators/projectTracker.validators.ts');
const handoff = require('../../src/validators/renovationReadiness.validators.ts');

const stripped = (schema, body, key) => !(key in schema.parse(body));

test('storage-key fields are no longer accepted; the id fields are', () => {
  const project = { name: 'Fence', projectType: 'CUSTOM', startDate: '2026-11-01', contractorName: 'Example', contractAmountCents: 100 };
  assert.equal(stripped(v.CreateProjectSchema, { ...project, contractDocumentKey: 'documents/x/y.pdf' }, 'contractDocumentKey'), true);
  assert.deepEqual(v.CreateProjectSchema.parse({ ...project, contractDocumentIds: ['rec-1'] }).contractDocumentIds, ['rec-1']);
  assert.equal(v.CreateProjectSchema.safeParse({ ...project, contractDocumentIds: ['a', 'b'] }).success, false, 'one contract document');
  assert.equal(stripped(v.MarkPaymentPaidSchema ?? v.UpdatePaymentSchema, { receiptDocumentKey: 'k' }, 'receiptDocumentKey'), true);
  assert.equal(stripped(v.CreateIssueSchema, { title: 't', description: 'd', severity: 'MINOR', category: 'OTHER', attachmentKeys: ['k'] }, 'attachmentKeys'), true);
  assert.deepEqual(v.CreateIssueSchema.parse({ title: 't', description: 'd', severity: 'MINOR', category: 'OTHER', evidenceDocumentIds: ['r'] }).evidenceDocumentIds, ['r']);
  assert.equal(stripped(v.CreateLogEntrySchema ?? v.CreateProgressLogSchema, { entryDate: '2026-10-01', entryType: 'DAILY_NOTE', notes: 'n', photoKeys: ['k'] }, 'photoKeys'), true);
  assert.equal(stripped(handoff.HandoffRenovationProjectSchema, { projectType: 'CUSTOM', contractorName: 'E', startDate: '2026-11-01', idempotencyKey: 'k', contractDocumentKey: 'k' }, 'contractDocumentKey'), true);
});

test('a project route cannot be used to reference an object by key (source check of the service inputs)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../../src/validators/projectTracker.validators.ts'), 'utf8').replace(/\/\/.*$/gm, '');
  for (const name of ['contractDocumentKey', 'receiptDocumentKey', 'supportingDocumentKey', 'photoKeys', 'attachmentKeys']) {
    assert.equal(new RegExp(`${name}:`).test(source), false, `${name} is not accepted`);
  }
});
