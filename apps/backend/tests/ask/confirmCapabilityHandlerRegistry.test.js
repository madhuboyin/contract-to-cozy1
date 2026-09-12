const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const { ASK_DOMAIN_COMMAND_REGISTRY } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { validateConfirmCapabilityHandlerRegistry } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
// Side-effect import: askOrchestrator.service.ts registers its 25 confirm
// handlers against the confirm capability registry at module load, exactly
// as index.ts's own production bootstrap does before running
// validateConfirmCapabilityHandlerRegistry.
require('../../src/services/ask/askOrchestrator.service.ts');

test('every one of the 25 confirmation-required Ask commands resolves to a registered confirm capability handler', () => {
  const commandIds = Object.keys(ASK_DOMAIN_COMMAND_REGISTRY);
  assert.equal(commandIds.length, 25);
  assert.deepEqual(validateConfirmCapabilityHandlerRegistry(), []);
});

test('confirmAskExecution no longer branches on operationId for its write dispatch (Test G, implementation plan §4.9)', () => {
  const orchestrator = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');
  const confirmStart = orchestrator.indexOf('export async function confirmAskExecution(');
  assert.ok(confirmStart >= 0);
  const confirmEnd = orchestrator.indexOf('\nexport async function cancelAskExecution(', confirmStart);
  assert.ok(confirmEnd > confirmStart);
  const confirmBody = orchestrator.slice(confirmStart, confirmEnd);
  assert.equal(/execution\.operationId === '[A-Z_]+'/.test(confirmBody), false);
  assert.match(confirmBody, /await confirmCapabilityInvoke\(execution\.operationId as AskOperationId, \{/);
});

test('each of the 25 extracted confirm handler functions is registered exactly once, by its command\'s own declared adapterKey', () => {
  const orchestrator = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');
  for (const definition of Object.values(ASK_DOMAIN_COMMAND_REGISTRY)) {
    const escapedKey = definition.adapterKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`registerConfirmCapabilityHandler\\('${escapedKey}', \\w+\\);`);
    assert.match(orchestrator, pattern, `expected exactly one confirm handler registration for adapter "${definition.adapterKey}" (${definition.id})`);
  }
});
