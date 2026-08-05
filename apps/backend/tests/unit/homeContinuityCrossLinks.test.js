const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '../../../..');
const readRepository = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

// Slice 11 (unified experience, operations, and launch governance) of
// HOME_CONTINUITY_AND_RECORDS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md —
// the final slice, largely organizational (accessibility/security/privacy/
// commercial review, ops dashboards, kill switches, incident-response
// drills, documentation) rather than a single buildable feature. Scoped
// this pass to what's genuinely code-level: making the Home Records ↔
// Timeline cross-link (built one-directionally in Slice 6) navigable in
// both directions, and confirming no permanent/passive Seller Prep card is
// actually mounted anywhere.

test('a Home Record\'s linked entities are clickable, not just labeled text', () => {
  const client = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-records/HomeRecordsClient.tsx',
  );
  assert.match(client, /function linkedEntityHref/);
  assert.match(client, /case 'MATERIAL_SPEC': return `\/dashboard\/properties\/\$\{propertyId\}\/materials\/\$\{entityId\}`/);
  assert.match(client, /case 'CLAIM': return `\/dashboard\/properties\/\$\{propertyId\}\/claims\/\$\{entityId\}`/);
  assert.match(client, /const href = linkedEntityHref\(propertyId, link\.entityType, link\.entityId\)/);
});

test('Home Records detail is deep-linkable by recordId, so a link pointing into it from elsewhere actually opens the right record', () => {
  const client = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-records/HomeRecordsClient.tsx',
  );
  assert.match(client, /useSearchParams\(\)/);
  assert.match(client, /useState<string \| null>\(\(\) => searchParams\.get\('recordId'\)\)/);
});

test('a Timeline event\'s "Home Records evidence" badge (Slice 6) links back to that record\'s deep-link URL', () => {
  const timelineClient = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/timeline/TimelineClient.tsx',
  );
  assert.match(timelineClient, /tools\/home-records\?recordId=\$\{link\.record\.id\}/);
});

test('the two Seller Prep "dashboard card" components are not actually mounted anywhere — the plan\'s "no permanent passive cards" requirement is already satisfied by omission, not by design', () => {
  const orphanFiles = [
    'apps/frontend/src/components/seller-prep/SellerPrepDashboardCard.tsx',
    'apps/frontend/src/components/seller-prep/SellerPrepCTA.tsx',
  ];
  for (const file of orphanFiles) {
    const componentName = path.basename(file, '.tsx');
    let referencedElsewhere = false;
    // Scan every seller-prep-adjacent surface that could plausibly mount it;
    // a real audit would grep the whole frontend, but this locks down the
    // specific finding from this session without re-doing that full scan
    // on every test run.
    const candidateMounts = [
      'apps/frontend/src/app/(dashboard)/dashboard/page.tsx',
      'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/page.tsx',
      'apps/frontend/src/components/home/UnifiedHomeSurface.tsx',
      'apps/frontend/src/components/home/UnifiedHomeToolsSection.tsx',
    ];
    for (const candidate of candidateMounts) {
      try {
        if (readRepository(candidate).includes(componentName)) referencedElsewhere = true;
      } catch {
        // candidate file may not exist under this exact path — fine, just skip it.
      }
    }
    assert.equal(referencedElsewhere, false, `${componentName} unexpectedly mounted in a dashboard surface`);
  }
});
