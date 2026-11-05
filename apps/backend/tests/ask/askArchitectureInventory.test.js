const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// Findings Implementation Plan, Phase 0: the read-only inventory must agree with the authoritative registries it reads, and must report
// UNCLASSIFIED instead of guessing. Loading the Ask facade registers every handler, exactly as the startup validation test does.
const {
  buildAskArchitectureInventory,
  countRendererKeysFromSource,
} = require('../../src/scripts/askArchitectureInventory.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { SKILL_DEFINITIONS, getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
const { ASK_DOMAIN_COMMAND_REGISTRY } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { KNOWN_UNGOVERNED_OPERATIONS } = require('../../src/services/intelligence/skillOperationGovernance.contract.ts');

const inventory = buildAskArchitectureInventory();

test('inventory counts equal the registries they are read from', () => {
  assert.equal(inventory.counts.operations, Object.keys(ASK_OPERATION_DEFINITIONS).length);
  assert.equal(inventory.counts.skills, Object.keys(SKILL_DEFINITIONS).length);
  assert.equal(inventory.counts.domainCommands, Object.keys(ASK_DOMAIN_COMMAND_REGISTRY).length);
  assert.equal(inventory.counts.knownUngovernedOperations, KNOWN_UNGOVERNED_OPERATIONS.length);
  assert.equal(inventory.counts.blockRenderers, inventory.counts.presentationBlocks, 'every presentation block has exactly one renderer');
});

test('the skill-less operation list is exactly the operations no Skill owns', () => {
  const expected = Object.keys(ASK_OPERATION_DEFINITIONS).filter((id) => !getSkillForOperation(id)).sort();
  assert.deepEqual(inventory.skilllessOperations.map((row) => row.operationId), expected);
  assert.equal(inventory.counts.skilllessOperations, expected.length);
  const total = Object.values(inventory.skilllessByClassification).reduce((sum, value) => sum + value, 0);
  assert.equal(total, expected.length, 'every skill-less operation has exactly one metadata classification');
});

test('the current registries report no validator issues and no governance drift', () => {
  for (const [name, issues] of Object.entries(inventory.validatorIssues)) assert.deepEqual(issues, [], name);
  assert.deepEqual(inventory.governanceDrift, { skilllessUnlisted: [], listedButSkillOwned: [], listedButUnknown: [] });
});

test('classification never infers beyond registry metadata', () => {
  for (const row of inventory.skilllessOperations) {
    if (row.metadataClassification === 'UNCLASSIFIED') {
      assert.equal(row.messageRoutable, true, `${row.operationId}: only message-routable, command-less operations stay unclassified`);
      assert.equal(row.domainCommandId, null, row.operationId);
      assert.notEqual(row.propertyRoleFloor, null, row.operationId);
    }
    if (row.metadataClassification === 'INTERNAL_COMMAND' || row.metadataClassification === 'INTERNAL_NOT_MESSAGE_ROUTABLE') {
      assert.equal(row.messageRoutable, false, row.operationId);
    }
  }
});

test('the renderer counter reads the object literal and ignores spreads', () => {
  const source = "const x = 1;\nexport const ASK_BLOCK_RENDERERS: R = {\n  A: a,\n  B: (p) => p,\n  ...extra,\n};\n";
  assert.equal(countRendererKeysFromSource(source), 2);
  assert.throws(() => countRendererKeysFromSource('export const OTHER = { A: 1 };'), /ASK_BLOCK_RENDERERS/);
});
