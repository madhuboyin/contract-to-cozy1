const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '../../../..');
const readRepository = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

// Fixes for the gaps found by a post-Slice-11 audit against
// HOME_CONTINUITY_AND_RECORDS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md:
// (1) Home Digital Will still claimed trusted contacts "can access" home
//     knowledge, while its only contact-scoped endpoint is owner-authenticated
//     preview only — a live P0 violation the plan explicitly flagged.
// (2) The legacy Document Vault naming collided with the new Home Records
//     tool (both titled "Home Records"), and its delete route was an
//     unguarded hard delete that could cascade-destroy evidence other
//     domains depend on (claims, insurance, tax, etc.).

test('Home Digital Will no longer claims trusted contacts can access home knowledge, and points to the real sharing feature', () => {
  const client = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-digital-will/HomeDigitalWillClient.tsx',
  );
  assert.doesNotMatch(client, /Trusted contacts can access critical home knowledge/);
  assert.doesNotMatch(client, /People who can access critical home knowledge/);
  assert.doesNotMatch(client, /Governed handoff published/);
  assert.match(client, /property-brief\?purpose=HOUSEHOLD_TRUSTED_CONTACT/);
  assert.match(client, /private planning space/);
});

test('Property Brief reads a ?purpose= deep link so the real Home Continuity Plan sharing flow is reachable from elsewhere', () => {
  const client = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/property-brief/PropertyBriefClient.tsx',
  );
  assert.match(client, /useSearchParams\(\)/);
  assert.match(client, /searchParams\.get\('purpose'\)/);
});

test('the legacy Document Vault tool no longer collides with the new Home Records tool name', () => {
  const catalog = readRepository('apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts');

  const legacyBlock = catalog.slice(
    catalog.indexOf("key: 'documents',"),
    catalog.indexOf("key: 'documents',") + 400,
  );
  assert.doesNotMatch(legacyBlock, /title: 'Home Records'/);

  const newToolBlock = catalog.slice(
    catalog.indexOf("key: 'home-records',"),
    catalog.indexOf("key: 'home-records',") + 400,
  );
  assert.match(newToolBlock, /name: 'Home Records'/);
});

test('the legacy Document Vault delete route soft-deletes (trash) instead of physically removing the row', () => {
  const routes = readRepository('apps/backend/src/routes/document.routes.ts');
  const deleteBlock = routes.slice(
    routes.indexOf("router.delete('/:id',"),
    routes.indexOf("router.post('/:id/restore'"),
  );
  assert.doesNotMatch(deleteBlock, /prisma\.document\.delete\(/);
  assert.doesNotMatch(deleteBlock, /deleteDocumentObject/);
  assert.match(deleteBlock, /deletedAt: new Date\(\)/);
  assert.match(routes, /router\.post\('\/:id\/restore'/);
});

test('document mutation access extends to household CONTRIBUTOR+, not just the original uploader', () => {
  const middleware = readRepository('apps/backend/src/middleware/documentAuth.middleware.ts');
  assert.match(middleware, /resolvePropertyAccess/);
  assert.match(middleware, /ROLE_RANK\[access\.role\] < ROLE_RANK\.CONTRIBUTOR/);
});
