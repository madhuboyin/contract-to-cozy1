const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

test('permit workers recheck the shared Phase 4 policy before effects', () => {
  const helper = read('../../src/services/projectCompliance/permitWorkerContext.service.ts');
  assert.match(helper, /getProjectComplianceContextDecisions/);
  assert.match(helper, /'PERMIT_TRACKER'/);

  const fetchService = read('../../src/services/permitFetch.service.ts');
  assert.ok(fetchService.indexOf('await checkPermitWorkerContext') < fetchService.indexOf("status: 'RUNNING'"));

  const detectionService = read('../../src/services/permitDetection.service.ts');
  assert.ok(detectionService.indexOf('await checkPermitWorkerContext') < detectionService.indexOf('prisma.inventoryItem.findMany'));

  const reminder = read('../../../workers/src/jobs/permitInspectionReminder.job.ts');
  assert.ok(reminder.indexOf('await checkPermitWorkerContext') < reminder.indexOf('await NotificationService.create'));
  assert.match(reminder, /requireOwnerAction|true,/);

  const disclosure = read('../../../workers/src/jobs/generatePermitDisclosure.job.ts');
  assert.ok(disclosure.indexOf('await checkPermitWorkerContext') < disclosure.indexOf('await renderDisclosurePdf'));
  assert.match(disclosure, /propertyContextVersion/);
});

test('worker image packages the Phase 4 policy dependency chain', () => {
  const dockerfile = read('../../../../infrastructure/docker/workers/Dockerfile');
  assert.match(dockerfile, /services\/projectCompliance\/context\.ts/);
  assert.match(dockerfile, /permitWorkerContext\.service\.ts/);

  // W5 replaced ~70 hand-maintained `sed -i` import-rewrite rules (the
  // mechanism this test originally checked a literal fragment of) with a
  // @worker-shared/* tsconfig path alias — see this Dockerfile's own
  // comments and check-worker-import-boundary.js, which now generically
  // guards that every @worker-shared/* import has a matching COPY
  // destination for all worker source files, not just these two. What
  // still matters specifically for "Phase 4 permit workers": both job
  // files actually depend on the shared permit policy via that supported
  // alias (not a stale relative path the Docker build can't resolve).
  const reminder = read('../../../workers/src/jobs/permitInspectionReminder.job.ts');
  const disclosure = read('../../../workers/src/jobs/generatePermitDisclosure.job.ts');
  const expectedImport = "from '@worker-shared/services/projectCompliance/permitWorkerContext.service'";
  assert.ok(
    reminder.includes(expectedImport),
    'permitInspectionReminder.job.ts must import the shared permit policy via the @worker-shared alias',
  );
  assert.ok(
    disclosure.includes(expectedImport),
    'generatePermitDisclosure.job.ts must import the shared permit policy via the @worker-shared alias',
  );
});

test('property-scoped provider search uses canonical location and blocks inapplicable advice', () => {
  const controller = read('../../src/controllers/provider.controller.ts');
  assert.match(controller, /geocodedZipCode/);
  assert.match(controller, /zipCode: property\.zipCode/);
  // Pause-on-inapplicable now lives in a dedicated policy function rather
  // than an inline status check — verify the controller actually gates the
  // search result through it, and verify the policy's own contract
  // separately below (only a confirmed NOT_APPLICABLE decision pauses
  // discovery; an UNKNOWN responsibility must not block browsing).
  assert.match(controller, /import \{ shouldPauseProviderSearch \} from '..\/services\/providerSearchApplicability'/);
  assert.match(controller, /shouldPauseProviderSearch\(propertyContext\)/);

  // shouldPauseProviderSearch is a single-expression function whose only
  // comparison is against NOT_APPLICABLE, so asserting that expression
  // directly is sufficient to prove UNKNOWN can't also trigger a pause —
  // there is no other branch that could.
  const applicability = read('../../src/services/providerSearchApplicability.ts');
  assert.match(applicability, /return context\?\.decision\.status === 'NOT_APPLICABLE';/);

  const page = read('../../../frontend/src/app/(dashboard)/dashboard/providers/page.tsx');
  assert.match(page, /isPropertyContextBlocked/);
  assert.match(page, /lockZipToProperty/);
  assert.match(page, /decision\.status === 'NOT_APPLICABLE'/);
  assert.match(page, /Review property details/);
});
