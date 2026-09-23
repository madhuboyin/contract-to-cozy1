const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.45: mortgage-refinance-radar capability-card slice. Same fake-prisma harness as the
// other capability-card slice tests; the fake prisma throws on any model it was not given. The analysis runs its
// no-mortgage branch (stubbed profile), which needs no rate or scenario math.

const prismaModule = require('../../src/lib/prisma.ts');
const { refinanceMonitorBlock } = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { capabilityCardLaunch } = require('../../src/services/ask/askCapabilityCardLaunch.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const financing = require('../../src/services/financing.service.ts');
const financialContext = require('../../src/services/financialContext/context.ts');
const { MortgageRateService } = require('../../src/refinanceRadar/engine/mortgageRate.service.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

const originals = { prisma: prismaModule.prisma, getProfile: financing.getProfile, decisions: financialContext.getFinancialContextDecisions, snapshot: MortgageRateService.prototype.getLatestSnapshot, resolveAccess: propertyAccess.resolvePropertyAccess };
let monitors;
let monitorQueries;
let monitorReadFails;

const monitorRow = (overrides) => ({
  id: 'monitor-30', userId: 'u1', propertyId: 'p1', product: 'FIXED_30_YEAR', thresholdBps: 550, channel: 'EMAIL', cadence: 'IMMEDIATE',
  quietStart: '21:00', quietEnd: '07:00', timezone: 'America/New_York', status: 'ACTIVE', consentedAt: new Date('2026-09-01'),
  lastTriggeredAt: null, updatedAt: new Date('2026-09-02'), ...overrides,
});

function install() {
  monitors = [monitorRow()];
  monitorQueries = [];
  monitorReadFails = false;
  const models = {
    askExecution: { findMany: async () => [] },
    refinanceRateMonitor: {
      findMany: async (query) => {
        monitorQueries.push(query);
        if (monitorReadFails) throw new Error('db down');
        return monitors.filter((monitor) => monitor.userId === query.where.userId && monitor.propertyId === query.where.propertyId && query.where.status.in.includes(monitor.status));
      },
    },
  };
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      if (!models[model]) throw new Error(`Unexpected prisma.${String(model)} access`);
      return models[model];
    },
  });
  financing.getProfile = async () => ({ mortgageStatus: 'NO_MORTGAGE' });
  financialContext.getFinancialContextDecisions = async () => ({ contextVersion: 'ctx-1', decisions: [] });
  MortgageRateService.prototype.getLatestSnapshot = async () => null;
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'OWNER', userId: 'u1', propertyId: 'p1' });
}

function restore() {
  prismaModule.prisma = originals.prisma;
  financing.getProfile = originals.getProfile;
  financialContext.getFinancialContextDecisions = originals.decisions;
  MortgageRateService.prototype.getLatestSnapshot = originals.snapshot;
  propertyAccess.resolvePropertyAccess = originals.resolveAccess;
}

test.beforeEach(install);
test.afterEach(restore);

const analyze = () => capabilityInvoke('REFINANCE_ANALYSIS', { userId: 'u1', propertyId: 'p1', message: 'Is refinancing worth reviewing now?' });

test('the analysis shows the homeowner\'s own active or paused monitors for this home, read only for that user and property', async () => {
  monitors.push(monitorRow({ id: 'monitor-15', product: 'FIXED_15_YEAR', status: 'PAUSED' }), monitorRow({ id: 'monitor-stopped', product: 'FIXED_15_YEAR', status: 'STOPPED' }), monitorRow({ id: 'other-user', userId: 'u2' }));
  const result = await analyze();
  assert.equal(result.status, 'NOT_APPLICABLE');
  const monitorBlocks = result.blocks.filter((block) => block.type === 'MONITOR');
  assert.deepEqual(monitorBlocks.map((block) => [block.monitorId, block.status, block.title]), [
    ['monitor-30', 'ACTIVE', 'Your mortgage-rate monitor'],
    ['monitor-15', 'PAUSED', 'Your mortgage-rate monitor'],
  ]);
  assert.equal(monitorBlocks[0].threshold, '5.500% or lower');
  assert.deepEqual(monitorQueries[0].where, { userId: 'u1', propertyId: 'p1', status: { in: ['ACTIVE', 'PAUSED'] } });
});

test('without a monitor, or when the monitor read fails, the analysis is returned unchanged', async () => {
  monitors = [];
  assert.equal((await analyze()).blocks.some((block) => block.type === 'MONITOR'), false);
  monitorReadFails = true;
  const result = await analyze();
  assert.equal(result.status, 'NOT_APPLICABLE');
  assert.equal(result.blocks.some((block) => block.type === 'MONITOR'), false);
});

test('the monitor block survives the answer-trust validator and whitelist for REFINANCE_ANALYSIS', async () => {
  const result = await analyze();
  const { result: validated } = validateAskAnswerTrust({ question: 'Is refinancing worth reviewing now?', operationId: 'REFINANCE_ANALYSIS', result, propertyId: 'p1' });
  assert.ok(validated.blocks.some((candidate) => candidate.type === 'MONITOR'), 'MONITOR must be an allowed block type for REFINANCE_ANALYSIS');
  // Action applicability needs the source evidence the pipeline attaches later, so the whitelist is checked directly.
  const block = result.blocks.find((candidate) => candidate.type === 'MONITOR');
  for (const operationId of ['REFINANCE_ANALYSIS', 'REFINANCE_RATE_MONITOR']) {
    assert.equal(isAskActionApplicable({ action: block.actions[0], operationId, propertyId: 'p1', householdRole: 'OWNER', authoritativeSourceAvailable: true }), true, operationId);
  }
});

test('the monitor block links only to the radar page\'s settings section; the dead ?monitorAction= and ?section= links are gone', () => {
  const block = refinanceMonitorBlock({ id: 'm1', propertyId: 'p1', product: 'FIXED_30_YEAR', thresholdPct: 5.5, cadence: 'IMMEDIATE', quietStart: null, quietEnd: null, timezone: 'UTC', status: 'ACTIVE' }, 'Mortgage-rate monitor is active');
  assert.deepEqual(block.actions.map((action) => [action.id, action.href]), [['edit-monitor', '/dashboard/properties/p1/tools/mortgage-refinance-radar#refinance-evidence-settings']]);
  assert.ok(!JSON.stringify(block).includes('monitorAction') && !JSON.stringify(block).includes('section='));
});

test('the mortgage-refinance-radar card launches inline into the analysis, and its message routes there', () => {
  const launch = capabilityCardLaunch('mortgage-refinance-radar').inlineLaunch;
  assert.equal(launch.operationId, 'REFINANCE_ANALYSIS');
  assert.equal(resolveAskRoutingCascade(launch.message, { localRoutingEnabled: true }).operation.operationId, 'REFINANCE_ANALYSIS');
});
