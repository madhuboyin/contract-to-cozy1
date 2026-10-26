const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register/transpile-only');

// Scan a home for benefits and rebates from Ask (parity with the desktop Scan and Re-scan). No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { HiddenAssetService } = require('../../src/services/hiddenAssets.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const command = require('../../src/services/ask/support/savingsBenefitCommand.ts');
const { benefitsScanOutcome } = require('../../src/services/ask/handlers/savingsBenefitsScan.handler.ts');
const { benefitsScanAction } = require('../../src/services/ask/handlers/savingsOwnership.handler.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');

const OP = 'SAVINGS_BENEFIT_COMMAND';
const M = command.SAVINGS_COMMAND_MESSAGES;
const STARTED = new Date('2026-09-01T00:00:00Z');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const version = (latest) => sha(`savings:SCAN:prop-1:${latest?.id ?? 'none'}:${latest?.status ?? ''}`);

function withRole(role) {
  const saved = propertyAccess.resolvePropertyAccess;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  return () => { propertyAccess.resolvePropertyAccess = saved; };
}
function withData({ primary = true, latest = null, running = false, result = { scanRunId: 'run-2', matchesFound: 2, programsEvaluated: 9, matchesExpired: 0, matchesInactivated: 0 }, scanError = null } = {}) {
  const saved = { p: prisma.property, r: prisma.propertyHiddenAssetScanRun, s: HiddenAssetService.prototype.refreshMatchesForProperty, x: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  prisma.property = { findFirst: async () => (primary ? { id: 'prop-1' } : null) };
  prisma.propertyHiddenAssetScanRun = { findFirst: async (args) => (args.where.status === 'RUNNING' ? (running ? { id: 'run-x' } : null) : latest) };
  HiddenAssetService.prototype.refreshMatchesForProperty = async function (...args) { calls.push(args); if (scanError) throw new Error(scanError); return result; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { prisma.property = saved.p; prisma.propertyHiddenAssetScanRun = saved.r; HiddenAssetService.prototype.refreshMatchesForProperty = saved.s; executeOperation.reconcileAskExecutionSideEffects = saved.x; } };
}
const invoke = (role = 'OWNER', over = {}) => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message: M.SCAN, launchContext: { operationId: OP, surface: 'ASK_PAGE', entityId: command.SAVINGS_BENEFITS_SCAN_ENTITY_ID, entityType: command.savingsCommandEntityType('SCAN'), ...over } }, { propertyAccess: { role } });
const ctx = (parameters) => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'OWNER' }, parameters, command: getAskDomainCommandByOperation(OP) });

test('the scan is a declared-action, home-level step and is never routed from typed text', () => {
  assert.equal(command.savingsCommandKindFromMessage(M.SCAN), 'SCAN');
  assert.equal(command.savingsCommandEntityType('SCAN'), command.SAVINGS_BENEFITS_SCAN_ENTITY_TYPE);
  assert.notEqual(command.savingsCommandEntityType('SCAN'), command.savingsCommandEntityType('SAVE'));
  assert.notEqual(resolveAskRoutingCascade(M.SCAN, { localRoutingEnabled: true }).operation?.operationId, OP);
});

test('viewers, non-primary owners, misrouted launches and a scan already running are refused before any confirmation', async () => {
  let w = withData(); let restoreRole = withRole('VIEWER');
  try {
    assert.equal((await invoke('VIEWER')).reasonCode, 'ASK_PERMISSION_REQUIRED');
    restoreRole(); restoreRole = withRole('CONTRIBUTOR'); w.restore(); w = withData({ primary: false });
    assert.equal((await invoke('CONTRIBUTOR')).reasonCode, 'SAVINGS_BENEFIT_PRIMARY_OWNER_ONLY');
    restoreRole(); restoreRole = withRole('OWNER'); w.restore(); w = withData();
    assert.equal((await invoke('OWNER', { surface: 'ASK_REFRESH' })).reasonCode, 'ASK_SAVINGS_BENEFIT_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke('OWNER', { entityType: command.SAVINGS_AVAILABLE_ENTITY_TYPE })).reasonCode, 'ASK_SAVINGS_BENEFIT_COMMAND_NOT_DIRECTLY_ROUTABLE');
    w.restore(); w = withData({ running: true });
    assert.equal((await invoke()).reasonCode, 'SAVINGS_SCAN_IN_PROGRESS');
    assert.equal(w.calls.length, 0);
  } finally { restoreRole(); w.restore(); }
});

test('the review says what the scan checks, what it can change, that nothing is sent, and that finding nothing is not proof; it saves nothing', async () => {
  const restoreRole = withRole('OWNER'); let w = withData();
  try {
    const first = await invoke();
    assert.equal(first.status, 'NEEDS_CONFIRMATION');
    assert.equal(first.contextVersion, version(null));
    assert.equal(first.confirmation.confirmLabel, 'Scan for benefits');
    assert.match(first.confirmation.description, /reviewed programs that cover this home.s area/);
    assert.match(first.confirmation.description, /expired or inactive; a match you dismissed or are pursuing keeps its status/);
    assert.match(first.confirmation.description, /Nothing is applied for and nothing is sent anywhere.*not proof that no benefit exists/);
    w.restore(); w = withData({ latest: { id: 'run-1', status: 'COMPLETED', startedAt: STARTED } });
    const again = await invoke();
    assert.equal(again.confirmation.confirmLabel, 'Scan again');
    assert.equal(again.contextVersion, version({ id: 'run-1', status: 'COMPLETED' }));
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); restoreRole(); }
});

test('confirming runs the canonical scan once as the user; a scan made meanwhile or already running writes nothing', async () => {
  const restoreRole = withRole('OWNER'); let w = withData();
  try {
    const done = await confirmCapabilityInvoke(OP, ctx({ savingsCommand: { kind: 'SCAN', entityId: 'BENEFITS' }, savingsContextVersion: version(null) }));
    assert.deepEqual(w.calls, [['prop-1', 'user-1']]);
    assert.equal(done.result.reasonCode, 'SAVINGS_BENEFIT_SCAN_COMPLETED');
    assert.match(done.result.blocks[0].description, /^Found 2 potential benefits for this home\./);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ savingsCommand: { kind: 'SCAN', entityId: 'BENEFITS' }, savingsContextVersion: 'old' })), (error) => error.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    assert.equal(w.calls.length, 1);
    w.restore(); w = withData({ scanError: 'SCAN_IN_PROGRESS' });
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ savingsCommand: { kind: 'SCAN', entityId: 'BENEFITS' }, savingsContextVersion: version(null) })), (error) => error.code === 'ASK_CONFIRMATION_NOT_ACTIVE' && /already running/.test(error.message));
  } finally { w.restore(); restoreRole(); }
});

test('the outcome never reads an empty scan as "no benefits exist", and names what changed', () => {
  assert.match(benefitsScanOutcome({ matchesFound: 1, programsEvaluated: 5 }).description, /^Found 1 potential benefit for this home\.$/);
  assert.match(benefitsScanOutcome({ matchesFound: 0, programsEvaluated: 0 }).description, /No reviewed programs cover this home.s area yet\. This is a coverage gap, not confirmation that no benefits exist\./);
  const none = benefitsScanOutcome({ matchesFound: 0, programsEvaluated: 12 }).description;
  assert.match(none, /Checked 12 reviewed programs and none matched this home/);
  assert.match(none, /not whether any benefit exists\./);
  assert.match(benefitsScanOutcome({ matchesFound: 2, programsEvaluated: 6, matchesExpired: 1, matchesInactivated: 2 }).description, /1 match expired and 2 matches no longer apply since the last scan\.$/);
});

test('the answer offers Scan the first time and Re-scan after; the action is schema-valid and allowlisted', () => {
  const first = benefitsScanAction(false);
  const again = benefitsScanAction(true);
  assert.deepEqual([first.label, first.style, again.label, again.style], ['Scan for benefits', 'PRIMARY', 'Re-scan for benefits', 'SECONDARY']);
  assert.deepEqual([first.message, first.entityType, first.entityId, first.operationId], [M.SCAN, command.SAVINGS_BENEFITS_SCAN_ENTITY_TYPE, 'BENEFITS', OP]);
  assert.ok(AskPresentationBlockSchema.safeParse({ type: 'SUMMARY', id: 's', title: 't', body: 'b', tone: 'DEFAULT', actions: [first] }).success);
  assert.equal(isAskActionApplicable({ action: { ...first }, operationId: 'SAVINGS_OPPORTUNITIES', propertyId: 'prop-1', householdRole: 'OWNER', authoritativeSourceAvailable: true }), true);
});
