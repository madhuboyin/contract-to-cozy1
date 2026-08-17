const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  buyerPlanLaunchQuery,
  buyerPlanReturnHref,
  buyerPlanReturnQuery,
} = require('../../../frontend/src/lib/navigation/buyerReturnContext.ts');

test('Slice 4A buyer return context is property-scoped and allowlisted', () => {
  const launch = buyerPlanLaunchQuery({
    taskId: 'task_123',
    section: 'INSPECTION_DUE_DILIGENCE',
  });
  assert.equal(
    launch,
    'returnTo=buyer-plan&returnTaskId=task_123&returnSection=INSPECTION_DUE_DILIGENCE',
  );

  const inbound = new URLSearchParams('returnTo=buyer-plan&returnTaskId=../escape&returnSection=INSPECTION_DUE_DILIGENCE&next=https://evil.example');
  assert.equal(
    buyerPlanReturnQuery(inbound),
    'returnTo=buyer-plan&returnSection=INSPECTION_DUE_DILIGENCE',
  );
  assert.equal(
    buyerPlanReturnHref('property-1', inbound),
    '/dashboard/properties/property-1/buyer-plan?section=INSPECTION_DUE_DILIGENCE',
  );
  assert.equal(buyerPlanReturnHref('property-1', new URLSearchParams('returnTo=https://evil.example')), null);
});

test('documents and every Inspection Hub hop preserve the canonical Buyer Plan return path', () => {
  const buyerPlan = fs.readFileSync(path.resolve(__dirname, '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/buyer-plan/page.tsx'), 'utf8');
  const documents = fs.readFileSync(path.resolve(__dirname, '../../../frontend/src/app/(dashboard)/dashboard/documents/DocumentsPageClient.tsx'), 'utf8');
  const hub = fs.readFileSync(path.resolve(__dirname, '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/inspection-hub/page.tsx'), 'utf8');
  const report = fs.readFileSync(path.resolve(__dirname, '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/inspection-hub/[reportId]/page.tsx'), 'utf8');
  const openItems = fs.readFileSync(path.resolve(__dirname, '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/inspection-hub/open-items/page.tsx'), 'utf8');

  assert.doesNotMatch(buyerPlan, /dashboard\/vault\?propertyId/);
  assert.match(buyerPlan, /documents\?action=upload/);
  assert.match(buyerPlan, /buyer-task-\$\{task\.id\}/);
  assert.match(documents, /buyerPlanReturnHref/);
  assert.match(documents, /Back to Closing Plan/);
  assert.match(hub, /open-items\$\{launchSuffix\}/);
  assert.match(hub, /report\.id\}\$\{launchSuffix\}/);
  assert.match(report, /inspection-hub\$\{launchSuffix\}/);
  assert.match(openItems, /finding\.reportId\}\$\{launchSuffix\}/);
});

test('finding reclassification synchronizes canonical lineage inside one transaction', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/services/buyerAcquisition.service.ts'), 'utf8');
  const method = source.slice(source.indexOf('static async dispositionFinding'), source.indexOf('static async ensureRecurringHandoff'));
  const transaction = method.slice(method.indexOf('prisma.$transaction'));

  assert.match(transaction, /tx\.homeBuyerTask\.(findUnique|update|create)/);
  assert.match(transaction, /tx\.guidanceJourney\.updateMany/);
  assert.match(transaction, /tx\.guidanceSignal\.updateMany/);
  assert.match(transaction, /tx\.inspectionFinding\.update/);
  assert.match(transaction, /tx\.inspectionReport\.update/);
  assert.doesNotMatch(method.slice(0, method.indexOf('prisma.$transaction')), /prisma\.homeBuyerTask\.(update|updateMany|create)/);
  assert.match(transaction, /\['NOT_NEEDED', 'CANCELLED'\]\.includes\(existing\.status\)/);
  assert.match(source, /status: \{ notIn: \['COMPLETED', 'NOT_NEEDED', 'CANCELLED'\] \},\s+userEditedAt: null/);
  assert.match(transaction, /input\.dueAt !== undefined/);
});
