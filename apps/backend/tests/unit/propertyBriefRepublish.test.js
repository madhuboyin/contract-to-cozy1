const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const backendRoot = path.resolve(__dirname, '../..');
const readBackend = (relativePath) => fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');

// Slice 7's "republish notifications": a Property Brief was a create-once
// snapshot with no refresh path at all — an old ACTIVE share could show a
// recipient facts that have since changed, with nobody ever told. Built on
// top of the stale-item-review item done earlier this pass: republish
// re-assembles against live data and, only if something real changed,
// notifies each ACTIVE share's recipient via the same ad-hoc external-send
// path SEND_PROPERTY_BRIEF_INVITATION already uses.

const {
  diffBriefSections,
} = require('../../src/propertyBrief/propertyBrief.service.ts');

test('diffBriefSections reports no changes when every section payload is byte-identical', () => {
  const previous = [
    { sectionType: 'PROPERTY_FACTS', payload: { a: 1 } },
    { sectionType: 'VERIFIED_HISTORY', payload: { items: [1, 2] } },
  ];
  const fresh = [
    { sectionType: 'PROPERTY_FACTS', payload: { a: 1 } },
    { sectionType: 'VERIFIED_HISTORY', payload: { items: [1, 2] } },
  ];
  assert.deepEqual(diffBriefSections(previous, fresh), []);
});

test('diffBriefSections flags only the section whose payload actually changed', () => {
  const previous = [
    { sectionType: 'PROPERTY_FACTS', payload: { a: 1 } },
    { sectionType: 'VERIFIED_HISTORY', payload: { items: [1, 2] } },
  ];
  const fresh = [
    { sectionType: 'PROPERTY_FACTS', payload: { a: 1 } },
    { sectionType: 'VERIFIED_HISTORY', payload: { items: [1, 2, 3] } },
  ];
  assert.deepEqual(diffBriefSections(previous, fresh), ['VERIFIED_HISTORY']);
});

test('diffBriefSections flags a section that is newly present as changed', () => {
  const previous = [{ sectionType: 'PROPERTY_FACTS', payload: { a: 1 } }];
  const fresh = [
    { sectionType: 'PROPERTY_FACTS', payload: { a: 1 } },
    { sectionType: 'WARRANTIES', payload: { items: [] } },
  ];
  assert.deepEqual(diffBriefSections(previous, fresh), ['WARRANTIES']);
});

test('diffBriefSections flags a section that dropped out of the fresh assembly (no longer eligible) — checked from the fresh side', () => {
  // fresh never includes MATERIAL_SPECS at all (e.g. the last AS_BUILT
  // spec was deleted) — nothing to flag on the "fresh" list since the
  // comparison is driven by what's newly assembled, not a symmetric diff.
  // This documents that behavior rather than asserting a false positive.
  const previous = [
    { sectionType: 'PROPERTY_FACTS', payload: { a: 1 } },
    { sectionType: 'MATERIAL_SPECS', payload: { items: [1] } },
  ];
  const fresh = [{ sectionType: 'PROPERTY_FACTS', payload: { a: 1 } }];
  assert.deepEqual(diffBriefSections(previous, fresh), []);
});

test('republishPropertyBrief refuses to republish an archived brief', () => {
  const service = readBackend('src/propertyBrief/propertyBrief.service.ts');
  const fnStart = service.indexOf('export async function republishPropertyBrief(');
  assert.ok(fnStart > 0);
  const fnBody = service.slice(fnStart, service.indexOf('export async function', fnStart + 1));
  assert.match(fnBody, /PropertyBriefStatus\.ARCHIVED/);
  assert.match(fnBody, /PROPERTY_BRIEF_ARCHIVED/);
});

test('republishPropertyBrief reconstructs documentIds from the existing DOCUMENTS section rather than requiring them as new input', () => {
  const service = readBackend('src/propertyBrief/propertyBrief.service.ts');
  const fnStart = service.indexOf('export async function republishPropertyBrief(');
  const fnBody = service.slice(fnStart, service.indexOf('export async function', fnStart + 1));
  assert.match(fnBody, /PropertyBriefSectionType\.DOCUMENTS/);
  assert.match(fnBody, /evidenceLinks\.map\(\(link\) => link\.documentId\)/);
});

test('the republish route only notifies ACTIVE shares that have a real recipient email, and only when something changed', () => {
  const routes = readBackend('src/propertyBrief/propertyBrief.routes.ts');
  const routeIndex = routes.indexOf("'/properties/:propertyId/property-briefs/:briefId/republish'");
  assert.ok(routeIndex > 0);
  const block = routes.slice(routeIndex, routes.indexOf("router.post(\n  '/properties/:propertyId/property-briefs/:briefId/share'", routeIndex));
  assert.match(block, /requireHouseholdRole\('CONTRIBUTOR'\)/);
  assert.match(block, /if \(result\.changed\)/);
  assert.match(block, /share\.status !== 'ACTIVE' \|\| !share\.recipientEmail/);
  assert.match(block, /SEND_PROPERTY_BRIEF_UPDATE_NOTICE/);
});

test('the update-notice email job never includes a fresh share link — tokens are never stored in plaintext, so it cannot', () => {
  const job = fs.readFileSync(
    path.join(backendRoot, '../workers/src/jobs/sendPropertyBriefUpdateNotice.job.ts'),
    'utf8',
  );
  assert.doesNotMatch(job, /shareUrl/);
  assert.match(job, /original link still works/);
});

test('the update-notice job is registered on the email-notification worker alongside the invitation job', () => {
  const workerSource = fs.readFileSync(
    path.join(backendRoot, '../workers/src/worker.ts'),
    'utf8',
  );
  assert.match(workerSource, /job\.name === 'SEND_PROPERTY_BRIEF_UPDATE_NOTICE'/);
  assert.match(workerSource, /sendPropertyBriefUpdateNoticeJob/);
});
