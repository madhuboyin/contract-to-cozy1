// FR-GATE-1/2 conformance: block ids a validator contract accepts must still be emitted by the handler that produces the answer.
const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path');
require('ts-node/register/transpile-only');
const { INVENTORY_READ_ANSWER_BLOCK_IDS } = require('../../src/services/ask/askInventoryIntent.ts');
const { CAPITAL_PLAN_BLOCK_IDS } = require('../../src/services/ask/askCapitalPlanIntent.ts');
const read = (rel) => fs.readFileSync(path.join(__dirname, '../../src/services/ask', rel), 'utf8');

test('every declared INVENTORY_LOOKUP answer block id is emitted by the inventory handler', () => {
  const handler = read('handlers/inventory.handler.ts');
  for (const id of Object.values(INVENTORY_READ_ANSWER_BLOCK_IDS)) assert.ok(handler.includes(`'${id}'`), `inventory handler no longer emits ${id}`);
});
test('every declared capital-plan block id is emitted somewhere under the ask services', () => {
  const ids = [...(CAPITAL_PLAN_BLOCK_IDS instanceof Set ? CAPITAL_PLAN_BLOCK_IDS : Object.values(CAPITAL_PLAN_BLOCK_IDS))];
  const haystack = ['handlers', 'support', '.'].flatMap((d) => { const dir = path.join(__dirname, '../../src/services/ask', d); return fs.readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')); }).join('\n');
  const stranded = ids.filter((id) => !haystack.includes(`'${id}'`) && !haystack.includes(`\`${id}`));
  assert.deepEqual(stranded, []);
});
