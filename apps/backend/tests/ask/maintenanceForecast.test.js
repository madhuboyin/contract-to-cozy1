const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

// Ask Cozy Stage 3, Phase 7 (implementation plan §13; FRD §31 "additional
// maintenance intelligence" candidate). Reads
// maintenancePrediction.service.ts's rule-based forecast (MaintenancePrediction
// rows) -- distinct from MAINTENANCE_STATUS (homeowner-created/scheduled
// PropertyMaintenanceTask rows only) and from HOME_ACTIONS (the single
// governed intelligence/action surface; maintenancePrediction.service.ts is
// confirmed unconnected to it or the Personalization pipeline).

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { resolveHierarchicalSkillRouting } = require('../../src/services/skills/skillRouter.ts');

function routeOf(message) {
  return resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation.operationId;
}

test('forecast/predict/upcoming maintenance phrasing routes to MAINTENANCE_FORECAST', () => {
  for (const message of [
    'What maintenance is coming up for my home?',
    'Forecast my upcoming maintenance',
    'When will my HVAC need service?',
    "Predict what maintenance I'll need next",
    'What maintenance should I expect soon?',
  ]) {
    assert.equal(routeOf(message), 'MAINTENANCE_FORECAST', message);
  }
});

// maintenancePattern is very broad (bare "maintenance"/"task" alone) and is
// checked well after maintenanceForecastPattern in the cascade -- ordinary
// maintenance-status phrasing with no forecast/predict/upcoming word must
// still resolve to MAINTENANCE_STATUS, not get swallowed by the new pattern.
test('ordinary maintenance-status phrasing (no forecast/predict/upcoming word) still routes to MAINTENANCE_STATUS', () => {
  assert.equal(routeOf('What maintenance is overdue?'), 'MAINTENANCE_STATUS');
  assert.equal(routeOf('List pending maintenance tasks'), 'MAINTENANCE_STATUS');
});

test('the new operation is registered with a real definition (VIEWER floor, real adapter key)', () => {
  const definition = ASK_OPERATION_DEFINITIONS.MAINTENANCE_FORECAST;
  assert.ok(definition);
  assert.equal(definition.propertyRoleFloor, 'VIEWER');
  assert.equal(definition.adapterKey, 'maintenance.forecast');
  assert.equal(definition.requiresProperty, true);
  assert.ok(definition.allowedBlockTypes.includes('GROUPED_LIST'));
  assert.ok(definition.allowedBlockTypes.includes('EMPTY_STATE'));
});

test('the full hierarchical skill router resolves MAINTENANCE_FORECAST to the existing maintenance skill (not UNAVAILABLE -- every registration point is wired)', () => {
  const message = 'Forecast my upcoming maintenance';
  const operationDecision = resolveAskRoutingCascade(message, { localRoutingEnabled: true });
  const decision = resolveHierarchicalSkillRouting(message, operationDecision);
  assert.equal(decision.outcome, 'RESOLVED');
  assert.equal(decision.selectedSkill.id, 'maintenance');
  assert.equal(decision.selectedOperationId, 'MAINTENANCE_FORECAST');
});

// Source-governance tests for maintenanceForecastResult, which touches the
// database directly (maintenancePrediction.service.ts's listForecast/
// generateForecast) and has no runtime-mocked test harness in this codebase
// for this class of function (same established gap as
// coverageComparisonStatusResult -- see that file's header for the
// convention this mirrors).
const orchestratorSource = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');

function handlerBody() {
  const start = orchestratorSource.indexOf('async function maintenanceForecastResult(');
  assert.ok(start > 0, 'maintenanceForecastResult not found');
  const end = orchestratorSource.indexOf('\n}\n', start);
  return orchestratorSource.slice(start, end + 2);
}

test('maintenanceForecastResult calls listForecast, and generates once (only) when the forecast has never been materialized', () => {
  const body = handlerBody();
  assert.match(body, /await ensurePropertyAccess\(userId, propertyId\);/);
  assert.match(body, /let predictions = await listForecast\(propertyId\);/);
  assert.match(body, /if \(predictions\.length === 0\) \{\s*\n\s*await generateForecast\(propertyId\);\s*\n\s*predictions = await listForecast\(propertyId\);\s*\n\s*\}/);
});

test('maintenanceForecastResult returns NOT_APPLICABLE only when the forecast is still empty after generation, and never calls updateForecastStatus', () => {
  const body = handlerBody();
  assert.match(body, /status: 'NOT_APPLICABLE'/);
  assert.match(body, /reasonCode: 'MAINTENANCE_FORECAST_NO_VERIFIED_SYSTEMS'/);
  assert.doesNotMatch(body, /updateForecastStatus\(/);
});

test('maintenanceForecastResult renders a GROUPED_LIST with priority/date meta and a professional-inspection boundary', () => {
  const body = handlerBody();
  assert.match(body, /type: 'GROUPED_LIST'/);
  assert.match(body, /type: 'BOUNDARY'/);
  assert.match(body, /MAINTENANCE_FORECAST_PRIORITY_LABELS\[prediction\.priority\]/);
});

test('the capability handler and captureFallbackHref registrations both exist for MAINTENANCE_FORECAST', () => {
  assert.match(
    orchestratorSource,
    /registerCapabilityHandler\('maintenance\.forecast', async \(envelope\) => maintenanceForecastResult\(envelope\.userId, envelope\.propertyId!\)\);/,
  );
  assert.match(orchestratorSource, /case 'MAINTENANCE_FORECAST': return `\$\{base\}\/maintenance`;/);
});

test('the maintenance skill manifest declares MAINTENANCE_FORECAST and its adapter', () => {
  const { MAINTENANCE_SKILL } = require('../../src/services/skills/maintenance/skill.manifest.ts');
  const operationIds = new Set(MAINTENANCE_SKILL.operations.map((o) => o.operationId));
  assert.ok(operationIds.has('MAINTENANCE_FORECAST'));
  assert.ok(MAINTENANCE_SKILL.allowedAdapters.some((a) => a.id === 'maintenance.forecast'));
});
