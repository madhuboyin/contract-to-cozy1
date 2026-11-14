// FR-GATE-2 tier (1): real-path execution evidence. A real-path test runs an operation's REAL handler (through capabilityInvoke, with only the infrastructure boundary stubbed) for each declared variant, and hands the results to
// `conformRealPath`. That checks every emitted block against the Ask block schema and the operation's allowed block types, and compares the exact set of `TYPE:id` blocks the variants produced with the committed evidence
// (src/services/ask/answerContract/realPathEvidence.json). The evidence is what the runtime variant contract accepts, so it can only list ids a real execution produced: it is never copied from a source scan.
// Regenerate an entry after a deliberate handler change with ASK_REAL_PATH_UPDATE=1 node --test <the test file>.
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const { ASK_OPERATION_DEFINITIONS } = require('../../../src/services/ask/askOperationRegistry.ts');
const { AskPresentationBlockSchema } = require('../../../src/productFramework/ask/ask.contract.ts');
const EVIDENCE_FILE = path.join(__dirname, '../../../src/services/ask/answerContract/realPathEvidence.json');
const readEvidence = () => (fs.existsSync(EVIDENCE_FILE) ? JSON.parse(fs.readFileSync(EVIDENCE_FILE, 'utf8')) : { version: 1, operations: {} });

/** `variants` is { variantName: AskOperationResult }, each the result of really running the handler for that variant. `testFile` is the caller's __filename. */
function conformRealPath(operationId, variants, testFile) {
  const definition = ASK_OPERATION_DEFINITIONS[operationId]; assert.ok(definition, operationId);
  const allowed = new Set([...definition.allowedBlockTypes, 'BOUNDARY', 'ERROR_STATE']);
  const observed = new Set();
  for (const [name, result] of Object.entries(variants)) {
    assert.ok(Array.isArray(result.blocks) && result.blocks.length > 0, `${operationId} variant "${name}" produced no blocks`);
    for (const block of result.blocks) {
      AskPresentationBlockSchema.parse(block);
      assert.ok(allowed.has(block.type), `${operationId} variant "${name}" emitted a ${block.type} block, which the registry does not allow`);
      observed.add(`${block.type}:${block.id}`);
    }
  }
  const entry = { test: path.relative(path.join(__dirname, '../../..'), testFile), variants: Object.keys(variants).sort(), observedBlocks: [...observed].sort() };
  if (process.env.ASK_REAL_PATH_UPDATE === '1') {
    const evidence = readEvidence(); evidence.operations[operationId] = entry; evidence.operations = Object.fromEntries(Object.entries(evidence.operations).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(EVIDENCE_FILE, `${JSON.stringify(evidence, null, 1)}\n`); return entry;
  }
  const recorded = readEvidence().operations[operationId];
  assert.ok(recorded, `${operationId} has no committed real-path evidence: run ASK_REAL_PATH_UPDATE=1 node --test ${entry.test}`);
  assert.deepEqual(recorded.observedBlocks, entry.observedBlocks, `${operationId}: the blocks the variants really produce changed; review, then ASK_REAL_PATH_UPDATE=1 node --test ${entry.test}`);
  assert.deepEqual(recorded.variants, entry.variants);
  return entry;
}
module.exports = { conformRealPath, readEvidence, EVIDENCE_FILE };
