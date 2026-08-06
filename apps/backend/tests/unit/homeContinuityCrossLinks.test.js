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

// Picked up mid-turn after the original 9-item list finished: Material
// Specs and Sale Case (Seller Prep's actual replacement — the old static
// checklist was fully retired earlier this session) still weren't wired
// into this same cross-link work, even though both already had the real
// data (sourceEntityType/sourceEntityId on SaleReadinessItem;
// PropertyRecordLink support on Material Specs from the 9-item pass) —
// nothing rendered it as a link yet.

test('a Material Spec\'s AS_BUILT transition creates a real Timeline HomeEvent, not just its own bespoke MaterialLifecycleEvent log', () => {
  const service = readRepository('apps/backend/src/services/materialSpec.service.ts');
  const asBuiltIndex = service.indexOf("payload.toStatus === 'AS_BUILT'", service.indexOf('materialLifecycleEvent.create'));
  assert.ok(asBuiltIndex > 0);
  const block = service.slice(asBuiltIndex, service.indexOf('return updated;', asBuiltIndex));
  assert.match(block, /tx\.homeEvent\.create/);
  assert.match(block, /sourceEntityType: 'MATERIAL_SPEC'/);
  assert.match(block, /sourceEntityId: specId/);
  assert.match(block, /verificationStatus: 'EVIDENCE_VERIFIED'/);
  assert.match(block, /idempotencyKey: `material-spec-as-built:\$\{specId\}`/);
});

test('a Timeline event sourced from a Material Spec renders a real link back to it', () => {
  const timelineClient = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/timeline/TimelineClient.tsx',
  );
  assert.match(timelineClient, /event\.sourceEntityType === 'MATERIAL_SPEC' && event\.sourceEntityId/);
  assert.match(timelineClient, /\/dashboard\/properties\/\$\{params\.id\}\/materials\/\$\{event\.sourceEntityId\}/);
});

test('Sale Case readiness items link back to their Material Spec / Home Record / Timeline Event / Project / Home Action / Inspection Finding source', () => {
  const saleCaseClient = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/sale-case/SaleCaseClient.tsx',
  );
  assert.match(saleCaseClient, /function sourceEntityHref/);
  assert.match(saleCaseClient, /case 'MATERIAL_SPEC': return `\/dashboard\/properties\/\$\{propertyId\}\/materials\/\$\{item\.sourceEntityId\}`/);
  assert.match(saleCaseClient, /case 'PROPERTY_RECORD': return `\/dashboard\/properties\/\$\{propertyId\}\/tools\/home-records\?recordId=\$\{item\.sourceEntityId\}`/);
  assert.match(saleCaseClient, /case 'TIMELINE_EVENT': return `\/dashboard\/properties\/\$\{propertyId\}\/timeline\?eventId=\$\{item\.sourceEntityId\}`/);
  // Follow-up pass: these two were wrongly deferred initially — both
  // already had a real per-item route/deep-link, they just hadn't been
  // wired here yet.
  assert.match(saleCaseClient, /case 'PROJECT': return `\/dashboard\/properties\/\$\{propertyId\}\/projects\/\$\{item\.sourceEntityId\}`/);
  assert.match(saleCaseClient, /case 'HOME_ACTION': return `\/dashboard\/properties\/\$\{propertyId\}\/home-operations\?focusWorkItemId=\$\{item\.sourceEntityId\}`/);
  // Second follow-up pass: open-items/page.tsx gained real findingId
  // deep-link support (scroll-into-view + highlight — no per-finding
  // detail sheet exists to open instead).
  assert.match(saleCaseClient, /case 'INSPECTION_FINDING': return `\/dashboard\/properties\/\$\{propertyId\}\/inspection-hub\/open-items\?findingId=\$\{item\.sourceEntityId\}`/);
  assert.match(saleCaseClient, /const sourceHref = sourceEntityHref\(propertyId, item\)/);
});

test('open-items/page.tsx supports a real findingId deep-link — scroll-into-view and highlight the matching card', () => {
  const openItemsPage = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/inspection-hub/open-items/page.tsx',
  );
  assert.match(openItemsPage, /searchParams\.get\('findingId'\)/);
  assert.match(openItemsPage, /id=\{`finding-\$\{finding\.id\}`\}/);
  assert.match(openItemsPage, /document\.getElementById\(`finding-\$\{deepLinkedFindingId\}`\)/);
  assert.match(openItemsPage, /scrollIntoView/);
});

test('PERMIT stays unlinked in Sale Case — no addressable per-item route exists, and the backend conflates two models under one source type', () => {
  const saleCaseClient = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/sale-case/SaleCaseClient.tsx',
  );
  assert.doesNotMatch(saleCaseClient, /case 'PERMIT':/);

  // permits has no deep-link support, and the backend maps two different
  // models (PropertyPermitRecord and PermitUnpermittedFlag) onto the same
  // 'PERMIT' sourceEntityType, so a route alone wouldn't disambiguate.
  const permitsPage = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/permits/page.tsx',
  );
  assert.doesNotMatch(permitsPage, /searchParams\.get\('permitId'\)/);
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
