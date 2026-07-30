const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  summarizeRenovationOperationalHealth,
} = require('../../src/services/adminAnalytics/renovationOperationalHealthService.ts');

const now = new Date('2026-07-29T12:00:00.000Z');

test('renovation operations separates verified closeout from completion with open items', () => {
  const result = summarizeRenovationOperationalHealth({
    cases: [
      { id: 'verified', lifecycle: 'VERIFIED_COMPLETE', currentScopeVersionId: 'scope-1', readinessSummary: { state: 'READY' } },
      { id: 'open', lifecycle: 'COMPLETED_WITH_OPEN_ITEMS', currentScopeVersionId: 'scope-2', readinessSummary: { state: 'READY_WITH_ACKNOWLEDGED_OPEN_ITEMS' } },
      { id: 'active', lifecycle: 'PREPARING_TO_START', currentScopeVersionId: 'scope-3', readinessSummary: { state: 'NOT_READY' } },
    ],
    requirements: [],
    conditions: [],
    projects: [],
    projectionErrors: [],
  }, now);

  assert.equal(result.funnel.verifiedComplete, 1);
  assert.equal(result.funnel.completedWithOpenItems, 1);
  assert.equal(result.funnel.verifiedCloseoutRate, 0.5);
  assert.equal(result.trust.readinessBlocked, 1);
  assert.equal(result.guardrails.completionWithOpenItemsCount, 1);
});

test('renovation operations turns trust defects into deduplicated actionable alerts', () => {
  const result = summarizeRenovationOperationalHealth({
    cases: [
      { id: 'case-1', lifecycle: 'IN_EXECUTION', currentScopeVersionId: null, readinessSummary: null },
    ],
    requirements: [
      {
        renovationCaseId: 'case-1',
        family: 'PERMIT',
        recordStatus: 'CURRENT',
        applicability: 'UNKNOWN',
        determination: 'UNDETERMINED',
        sourceFreshUntil: new Date('2026-07-28T12:00:00.000Z'),
        expiresAt: null,
      },
    ],
    conditions: [
      {
        renovationCaseId: 'case-1',
        status: 'OPEN',
        isBlocking: true,
        dueAt: new Date('2026-07-27T12:00:00.000Z'),
        expiresAt: null,
      },
    ],
    projects: [
      {
        id: 'project-1',
        renovationCaseId: 'case-1',
        status: 'IN_PROGRESS',
        permitApplicability: 'UNKNOWN',
        hoaApplicability: 'NOT_APPLICABLE',
      },
    ],
    projectionErrors: [
      { projectId: 'project-1', reconciliationStatus: 'ERROR' },
      { projectId: 'project-1', reconciliationStatus: 'ERROR' },
    ],
  }, now);

  assert.equal(result.trust.readinessNotEvaluated, 1);
  assert.equal(result.trust.unresolvedRequirements, 1);
  assert.equal(result.trust.staleRequirements, 1);
  assert.equal(result.trust.overdueBlockingConditions, 1);
  assert.equal(result.trust.activeProjectsWithUnknownApplicability, 1);
  assert.equal(result.operations.projectionErrorProjects, 1);
  assert.equal(result.operations.alertCount, 5);
  assert.ok(result.operations.alerts.every(alert => alert.exactNextAction.length > 0));
});

test('renovation operations endpoint inherits the admin analytics MFA, role, and capability gate', () => {
  const routeSource = fs.readFileSync(
    path.resolve(__dirname, '../../src/routes/adminAnalytics.routes.ts'),
    'utf8',
  );
  assert.match(
    routeSource,
    /router\.use\('\/admin\/analytics', authenticate, requireMfa, requireRole\(UserRole\.ADMIN\), requireCapability\('ANALYTICS_VIEW'\)\)/,
  );
  assert.match(routeSource, /'\/admin\/analytics\/renovation-operations'/);
  assert.match(routeSource, /getRenovationOperationalHealthHandler/);
});
