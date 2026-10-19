const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

require('ts-node/register');

const {
  composeAskRecordExportReview, ASK_RECORD_EXPORT_CREATE_FLOOR, ASK_RECORD_EXPORT_RECORD_EXPIRY_DAYS, ASK_RECORD_EXPORT_SHARE_DEFAULT_DAYS,
} = require('../../src/services/ask/askRecordExportReview.service.ts');
const { ASK_RECORD_SECTION_REGISTRY, validateAskRecordSectionRegistry } = require('../../src/services/ask/governance/askRecordSectionRegistry.ts');
const { buildRedactedReportSnapshot, REDACTED_FORBIDDEN_FIELD_NAMES } = require('../../src/services/planningContext/redaction.ts');

const src = (path) => readFileSync(join(__dirname, '../../src', path), 'utf8');
const property = { name: 'Maple House', address: '1 Main St', city: 'Austin', state: 'TX' };
const review = (accessRole, operatingMode = 'OWNING') => composeAskRecordExportReview({ propertyId: 'p1', accessRole, operatingMode, property, generatedAt: '2026-10-19T12:00:00.000Z' });
const IN_PACK = ASK_RECORD_SECTION_REGISTRY.filter((entry) => entry.exportEligibility.state === 'IN_PACK');

test('every registered section is evaluated exactly once and the registry stays valid', () => {
  assert.deepEqual(validateAskRecordSectionRegistry(), []);
  const result = review('OWNER');
  assert.deepEqual(result.sections.map((section) => section.id), ASK_RECORD_SECTION_REGISTRY.map((entry) => entry.id));
  assert.deepEqual([...result.included, ...result.excluded].sort(), ASK_RECORD_SECTION_REGISTRY.map((entry) => entry.id).sort());
  assert.deepEqual(result.included, ['property-facts', 'rooms', 'inventory', 'warranties', 'maintenance-history', 'coverage']);
  for (const section of result.sections.filter((entry) => entry.state === 'EXCLUDED')) {
    assert.ok(section.reason && section.reason.length > 10, section.id);
    assert.deepEqual([section.packPath, section.ownerFields.length, section.sharedFields.length], [null, 0, 0], section.id);
  }
});

test('only a CONTRIBUTOR or OWNER can create an export, as the existing route requires; a viewer still sees exactly what the pack holds', () => {
  assert.equal(ASK_RECORD_EXPORT_CREATE_FLOOR, 'CONTRIBUTOR');
  assert.deepEqual([review('VIEWER').create.allowed, review('VIEWER').create.reason], [false, 'Creating an export needs the CONTRIBUTOR role for this home.']);
  for (const role of ['CONTRIBUTOR', 'OWNER']) assert.deepEqual([review(role).create.allowed, review(role).create.reason], [true, null], role);
  assert.deepEqual(review('VIEWER').included, review('OWNER').included);
  assert.deepEqual([review('OWNER').pack.sectionsSelectable, review('OWNER').pack.downloadableBy, review('OWNER').sharing.copy], [false, 'CREATOR', 'REDACTED']);
});

test('lifecycle-inapplicable sections report it and are not silently dropped', () => {
  const owning = review('OWNER', 'OWNING').sections.find((section) => section.id === 'buyer-records');
  assert.deepEqual([owning.state, owning.applicability], ['EXCLUDED', 'NOT_APPLICABLE']);
  assert.equal(review('OWNER', 'BUYING').sections.find((section) => section.id === 'buyer-records').applicability, 'APPLICABLE');
  assert.equal(review('OWNER', 'UNKNOWN').sections.find((section) => section.id === 'inspections').applicability, 'CONTEXT_REQUIRED');
});

test('the review states the pack rules from their sources: route floor, record expiry, share default, and who downloads', () => {
  const routes = src('routes/homeReportExport.routes.ts');
  const create = routes.slice(routes.indexOf("'/properties/:propertyId/reports/exports',\n  authenticate"), routes.indexOf(');', routes.indexOf("'/properties/:propertyId/reports/exports',\n  authenticate")));
  assert.match(create, /requireHouseholdRole\('CONTRIBUTOR'\)/);
  const controller = src('controllers/homeReportExport.controller.ts');
  assert.match(controller, new RegExp(`expiresAt: new Date\\(Date\\.now\\(\\) \\+ ${ASK_RECORD_EXPORT_RECORD_EXPIRY_DAYS} \\* 24 \\* 60 \\* 60 \\* 1000\\)`));
  assert.match(controller, new RegExp(`expiresInDays = ${ASK_RECORD_EXPORT_SHARE_DEFAULT_DAYS}\\b`));
  const download = controller.slice(controller.indexOf('export async function downloadHomeReportExport'), controller.indexOf('export async function', controller.indexOf('export async function downloadHomeReportExport') + 10));
  assert.match(download, /exp\.userId !== userId/);
  const result = review('OWNER');
  assert.deepEqual([result.pack.recordExpiresInDays, result.sharing.defaultExpiryDays, result.sharing.requiredRole], [30, 14, 'CONTRIBUTOR']);
});

test('the pack ignores a section choice: the builder never reads `sections`, so the review says sections are not selectable', () => {
  const builder = src('services/planningContext/reportSnapshot.ts');
  const body = builder.slice(builder.indexOf('export async function buildAuthoritativeReportSnapshot'));
  assert.equal(/\bsections\b/.test(body.replace(/sections\?: unknown;/, '')), false, 'the builder body does not use sections');
  assert.equal(review('OWNER').pack.sectionsSelectable, false);
});

// A probe snapshot carrying every owner field for a pack path, so the real redaction can be asked what survives.
function probe(entry) {
  const exported = entry.exportEligibility;
  const row = Object.fromEntries(exported.ownerFields.map((field) => [field, field === 'room' ? { id: 'r', name: 'Kitchen' } : field === 'documents' ? [{ id: 'd', fileUrl: 'https://x' }] : `value-${field}`]));
  const snapshot = { meta: {}, property: {}, inventory: { rooms: [], items: [] }, maintenance: { tasks: [] }, coverage: { insurancePolicies: [], warranties: [] } };
  const [block, leaf] = exported.packPath.split('.');
  if (leaf) snapshot[block][leaf] = [row]; else snapshot[block] = row;
  return snapshot;
}
const redactedAt = (redacted, packPath) => { const [block, leaf] = packPath.split('.'); const value = leaf ? redacted[block][leaf][0] : redacted[block]; return value; };

test('each section’s shared-copy fields are exactly what the real redaction keeps, and nothing it withholds survives', () => {
  for (const entry of IN_PACK) {
    const exported = entry.exportEligibility;
    const redacted = buildRedactedReportSnapshot(probe(entry));
    const kept = Object.keys(redactedAt(redacted, exported.packPath)).sort();
    assert.deepEqual(kept, [...exported.sharedFields].sort(), `${entry.id} shared fields`);
    const json = JSON.stringify(redacted);
    for (const field of exported.withheldFromShared) assert.equal(json.includes(`value-${field}`), false, `${entry.id} leaks ${field}`);
    for (const field of exported.sharedFields) assert.equal(exported.withheldFromShared.includes(field), false, `${entry.id} ${field}`);
    assert.equal(exported.sharedFields.some((field) => REDACTED_FORBIDDEN_FIELD_NAMES.includes(field)), false, `${entry.id} shares a forbidden field`);
  }
});

test('the owner-copy fields listed for each section are fields the pack builder actually emits', () => {
  const builder = src('services/planningContext/reportSnapshot.ts');
  for (const entry of IN_PACK) {
    for (const field of entry.exportEligibility.ownerFields) assert.match(builder, new RegExp(`\\b${field}\\b`), `${entry.id}: ${field}`);
  }
});

test('the review never carries the pack’s own sensitive values, only field names', () => {
  const json = JSON.stringify(review('OWNER'));
  assert.equal(/policyNumber":"|serialNumber":"|value-/.test(json), false);
  assert.equal(review('OWNER').sections.find((section) => section.id === 'coverage').withheldFromShared.includes('policyNumber'), true);
  assert.equal(review('OWNER').sections.find((section) => section.id === 'inventory').withheldFromShared.includes('serialNumber'), true);
});
