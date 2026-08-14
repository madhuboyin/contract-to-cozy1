const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  buildSkillExecutionTelemetry,
  createSkillExecutionTimingTrace,
  skillConfidenceBand,
  skillLatencyBand,
} = require('../../src/services/skills/skillExecutionTelemetry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { resolveHierarchicalSkillRouting } = require('../../src/services/skills/skillRouter.ts');

test('bounded telemetry records the complete Skill execution dimension set', () => {
  const routing = resolveHierarchicalSkillRouting(
    'What maintenance is overdue?',
    resolveAskRoutingCascade('What maintenance is overdue?'),
  );
  const trace = createSkillExecutionTimingTrace(12);
  trace.contextCompositionLatencyMs = 40;
  trace.adapterResolutionLatencyMs = 2;
  trace.canonicalOperationLatencyMs = 140;
  trace.presentationLatencyMs = 3;
  trace.context = {
    status: 'READY',
    entries: [{
      key: 'maintenance.tasks@1.0.0', required: true, status: 'AVAILABLE', data: { omitted: true },
      provenance: { providerId: 'maintenance.tasks', providerVersion: '1.0.0', canonicalOwner: 'Maintenance', sensitivity: 'STANDARD', observedAt: null, sourceVersion: null },
      latencyMs: 35, serializedBytes: 16, entityCount: 1, factCount: 1,
    }],
    values: {}, totalSerializedBytes: 16, totalEntities: 1, totalFacts: 1,
  };

  const telemetry = buildSkillExecutionTelemetry({
    routing,
    binding: null,
    operationId: 'MAINTENANCE_STATUS',
    operationVersion: '1.0',
    executionMode: 'DETERMINISTIC',
    effectiveRiskPolicy: { effects: ['READ'], materiality: 'LOW', riskDomains: [], reversibility: 'REVERSIBLE' },
    resultStatus: 'ANSWERED',
    errorCode: null,
    totalLatencyMs: 240,
    trace,
  });

  assert.equal(telemetry.skillConfidenceBand, 'HIGH');
  assert.equal(telemetry.operationConfidenceBand, 'HIGH');
  assert.equal(telemetry.contextCompositionLatencyBand, 'LT_100_MS');
  assert.equal(telemetry.canonicalOperationLatencyBand, 'LT_500_MS');
  assert.equal(telemetry.dependencyStatus, 'NOT_APPLICABLE');
  assert.equal(telemetry.executionMode, 'DETERMINISTIC');
  assert.equal(telemetry.modelCostBand, 'NONE');
  assert.deepEqual(telemetry.contextProviders, [{ id: 'maintenance.tasks', version: '1.0.0', status: 'AVAILABLE', latencyBand: 'LT_100_MS' }]);
  assert.deepEqual(telemetry.routingReasonCodes, ['OPERATION_OWNER']);
});

test('telemetry bands remain bounded at edge values', () => {
  assert.equal(skillConfidenceBand(null), 'NOT_AVAILABLE');
  assert.equal(skillConfidenceBand(0.49), 'LOW');
  assert.equal(skillConfidenceBand(0.79), 'MEDIUM');
  assert.equal(skillConfidenceBand(0.8), 'HIGH');
  assert.equal(skillLatencyBand(null), 'NOT_MEASURED');
  assert.equal(skillLatencyBand(24.9), 'LT_25_MS');
  assert.equal(skillLatencyBand(5_000), 'GTE_5_S');
});
