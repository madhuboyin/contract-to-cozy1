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
  assert.match(dockerfile, /generatePermitDisclosure\.job\.ts src\/jobs\/permitInspectionReminder\.job\.ts/);
});

test('property-scoped provider search uses canonical location and blocks inapplicable advice', () => {
  const controller = read('../../src/controllers/provider.controller.ts');
  assert.match(controller, /geocodedZipCode/);
  assert.match(controller, /propertyContext\.decision\.status !== 'APPLICABLE'/);
  assert.match(controller, /zipCode: property\.zipCode/);

  const page = read('../../../frontend/src/app/(dashboard)/dashboard/providers/page.tsx');
  assert.match(page, /isPropertyContextBlocked/);
  assert.match(page, /lockZipToProperty/);
  assert.match(page, /Complete property details before choosing a provider/);
});
