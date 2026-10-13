const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// The caller-scoped authorization class (owner ruling 2026-10-13, FRD v1.329): the only way a command may have a VIEWER floor.

const { ASK_DOMAIN_COMMAND_REGISTRY } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');

test('every command with a viewer floor is declared CALLER_SCOPED, and every caller-scoped command has a viewer floor', () => {
  for (const [id, command] of Object.entries(ASK_DOMAIN_COMMAND_REGISTRY)) {
    if (command.roleFloor === 'VIEWER') assert.equal(command.authorization, 'CALLER_SCOPED', `${id} has a viewer floor without declaring CALLER_SCOPED`);
    if (command.authorization === 'CALLER_SCOPED') assert.equal(command.roleFloor, 'VIEWER', `${id} is caller-scoped but has a household role floor`);
    assert.ok(['PROPERTY_ROLE', 'CALLER_SCOPED'].includes(command.authorization), id);
  }
});

test('the operation definition floor agrees with the command floor for every domain command', () => {
  for (const [id, command] of Object.entries(ASK_DOMAIN_COMMAND_REGISTRY)) {
    const definition = ASK_OPERATION_DEFINITIONS[command.operationId];
    if (!definition) continue;
    assert.equal(definition.propertyRoleFloor, command.roleFloor, `${id}: operation floor ${definition.propertyRoleFloor} vs command floor ${command.roleFloor}`);
  }
});

test('only the declared caller-scoped commands exist; adding one is a deliberate act', () => {
  const callerScoped = Object.entries(ASK_DOMAIN_COMMAND_REGISTRY).filter(([, c]) => c.authorization === 'CALLER_SCOPED').map(([id]) => id).sort();
  // DIY_SKILL_PROFILE_COMMAND added deliberately (FRD v1.344): one DIY skill profile per user, written only under the session user id.
  assert.deepEqual(callerScoped, ['DIY_SKILL_PROFILE_COMMAND', 'HOME_BRIEFING_COMMAND', 'NEIGHBORHOOD_INTERACTION_COMMAND']);
});
