const test = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync, readFileSync, statSync } = require('node:fs');
const { join, resolve } = require('node:path');

// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md §10: the orchestrator is a facade. New logic belongs in
// handlers/, execution/ or askHandlerSupport.ts, and none of those may import the orchestrator (that would be a cycle).
const ASK_DIR = resolve(__dirname, '../../src/services/ask');
const FACADE = join(ASK_DIR, 'askOrchestrator.service.ts');

function files(dir) {
  return readdirSync(dir).sort().flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return name.endsWith('.ts') ? [path] : [];
  });
}

test('the orchestrator stays a facade: no more than 300 lines, and no function or handler registration of its own', () => {
  const source = readFileSync(FACADE, 'utf8');
  assert.ok(source.split('\n').length <= 300, `askOrchestrator.service.ts has ${source.split('\n').length} lines; put new code in handlers/, execution/ or askHandlerSupport.ts`);
  assert.doesNotMatch(source, /^(?:async\s+)?function\s+\w+/m, 'the facade declares no function');
  assert.doesNotMatch(source, /^register(?:Confirm)?CapabilityHandler\(/m, 'handlers register themselves in their own files');
});

test('no handler, lifecycle or support file imports the orchestrator', () => {
  const offenders = [...files(join(ASK_DIR, 'handlers')), ...files(join(ASK_DIR, 'execution')), join(ASK_DIR, 'askHandlerSupport.ts'), join(ASK_DIR, 'askFormatting.ts')]
    .filter((file) => /from\s+'(?:\.\.?\/)+(?:ask\/)?askOrchestrator\.service'/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(offenders, []);
});

test('every handler file is imported by the orchestrator, so it registers before anything is dispatched', () => {
  const facade = readFileSync(FACADE, 'utf8');
  const missing = [...files(join(ASK_DIR, 'handlers')), ...files(join(ASK_DIR, 'execution'))]
    .map((file) => file.slice(ASK_DIR.length + 1).replace(/\.ts$/, ''))
    .filter((module) => !facade.includes(`'./${module}'`));
  assert.deepEqual(missing, []);
});
