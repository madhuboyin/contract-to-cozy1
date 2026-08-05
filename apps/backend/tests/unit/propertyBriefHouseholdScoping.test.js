const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const backendRoot = path.resolve(__dirname, '../..');
const readBackend = (relativePath) => fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');

// Property Brief was creator-scoped (createdByUserId filter) instead of
// household-shared like every other property-scoped domain (Home Records,
// Sale Case) — a co-owner couldn't see or manage a brief another household
// member created, and it silently broke Sale Case's transition-completion
// revoke step when the share belonged to a different household member.
// Also had zero household-role floor on mutations, so a VIEWER-role member
// could create and externally share sensitive property data. These tests
// lock down the fix: property-shared reads, CONTRIBUTOR+ floor on writes.

test('listPropertyBriefs and findAccessibleBrief no longer filter by createdByUserId', () => {
  const service = readBackend('src/propertyBrief/propertyBrief.service.ts');

  const listFn = service.slice(
    service.indexOf('export async function listPropertyBriefs'),
    service.indexOf('export async function', service.indexOf('export async function listPropertyBriefs') + 1),
  );
  assert.doesNotMatch(listFn, /createdByUserId:\s*userId/);
  assert.match(listFn, /export async function listPropertyBriefs\(propertyId: string\)/);

  const findFn = service.slice(
    service.indexOf('async function findAccessibleBrief'),
    service.indexOf('export async function getPropertyBriefPreview'),
  );
  assert.doesNotMatch(findFn, /createdByUserId/);
  assert.match(findFn, /where: \{ id: briefId, propertyId \}/);

  // No remaining caller passes userId into the accessibility check — a
  // stray leftover would silently reintroduce creator-scoping.
  assert.doesNotMatch(service, /findOwnedBrief\(/);
  const callSites = service.match(/findAccessibleBrief\([^)]*\)/g) || [];
  assert.ok(callSites.length >= 4, 'expected findAccessibleBrief to be used by preview/share/revoke/test');
  for (const call of callSites) {
    assert.doesNotMatch(call, /userId/);
  }
});

test('every Property Brief mutation route requires at least CONTRIBUTOR household role', () => {
  const routes = readBackend('src/propertyBrief/propertyBrief.routes.ts');
  assert.match(routes, /import \{ propertyAuthMiddleware, requireHouseholdRole \} from '\.\.\/middleware\/propertyAuth\.middleware'/);

  const mutationRoutePaths = [
    "router.post(\n  '/properties/:propertyId/property-briefs',",
    "router.post(\n  '/properties/:propertyId/property-briefs/:briefId/share',",
    "router.post(\n  '/properties/:propertyId/property-briefs/:briefId/shares/:shareId/revoke',",
    "router.post(\n  '/properties/:propertyId/property-briefs/:briefId/shares/:shareId/test',",
  ];
  for (const routePath of mutationRoutePaths) {
    const routeIndex = routes.indexOf(routePath);
    assert.ok(routeIndex >= 0, `expected to find route registration for ${routePath}`);
    const block = routes.slice(routeIndex, routes.indexOf(');', routeIndex));
    assert.match(block, /requireHouseholdRole\('CONTRIBUTOR'\)/, `${routePath} must require CONTRIBUTOR+`);
  }
});

test('read-only list and preview routes stay open to any household role (no CONTRIBUTOR floor)', () => {
  const routes = readBackend('src/propertyBrief/propertyBrief.routes.ts');

  const listIndex = routes.indexOf("router.get(\n  '/properties/:propertyId/property-briefs',");
  assert.ok(listIndex >= 0);
  const listBlock = routes.slice(listIndex, routes.indexOf(');', listIndex));
  assert.doesNotMatch(listBlock, /requireHouseholdRole/);

  const previewIndex = routes.indexOf("'/properties/:propertyId/property-briefs/:briefId/preview'");
  assert.ok(previewIndex > 0);
  const previewBlock = routes.slice(previewIndex, routes.indexOf(');', previewIndex));
  assert.doesNotMatch(previewBlock, /requireHouseholdRole/);
});
