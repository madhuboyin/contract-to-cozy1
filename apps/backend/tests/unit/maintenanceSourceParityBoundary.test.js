const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

function read(relativePath) {
  return readFileSync(resolve(__dirname, relativePath), 'utf8');
}

test('HI-ATT-008 reconciles canonical maintenance work before Home feed projection', () => {
  const homeActions = read('../../src/services/homeActions.service.ts');
  const reconcileAt = homeActions.indexOf('reconcileActiveMaintenanceTaskWork(propertyId)');
  const projectAt = homeActions.indexOf('appendAcceptedOperationalWork(propertyId');

  assert.ok(reconcileAt >= 0, 'Home feed must reconcile active PropertyMaintenanceTask rows');
  assert.ok(projectAt > reconcileAt, 'reconciliation must happen before accepted work is projected');
});

test('the shared parity boundary delegates to strict PropertyMaintenanceTask reconciliation', () => {
  const boundary = read('../../src/services/maintenanceTaskCanonicalReconciliation.service.ts');
  assert.match(boundary, /PropertyMaintenanceTaskService\.reconcileActiveTaskWorkItems\(propertyId\)/);
  assert.match(boundary, /PropertyMaintenanceTaskService\.retryWorkItemReconciliation\(taskId\)/);
});

test('maintenance and material deadline notifications cannot outrun work reconciliation', () => {
  for (const [relativePath, notificationCall] of [
    ['../../src/services/maintenanceReminder.service.ts', 'NotificationService.create('],
    ['../../src/services/newHomeWarrantyDeadline.service.ts', 'NotificationService.create('],
  ]) {
    const source = read(relativePath);
    const reconcileAt = source.indexOf('reconcileMaintenanceTaskWork(');
    const notifyAt = source.indexOf(notificationCall, reconcileAt);
    assert.ok(reconcileAt >= 0, `${relativePath} must reconcile canonical work`);
    assert.ok(notifyAt > reconcileAt, `${relativePath} must reconcile before notifying`);
  }
});

test('risk assessment preserves its real PropertyMaintenanceTask provenance', () => {
  const source = read('../../src/services/riskAssessmentIntegration.service.ts');
  assert.match(source, /source:\s*'RISK_ASSESSMENT'/);
});
