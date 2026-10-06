const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

// index.ts refuses to boot when a registry validator reports an issue, so a mistake here is a production crash loop (RECALL_REVIEW,
// 2026-09-29; HOME_HABIT_UPDATE and the habit skill's undeclared TASK_GUIDE block, both caught 2026-10-05 before deploy). No other test
// boots the app, so this runs EVERY validator index.ts runs at startup. The list is read from index.ts itself, so a validator added there
// is covered automatically.
require('../../src/services/ask/askOrchestrator.service.ts');

const root = path.resolve(__dirname, '../..');
const indexSource = fs.readFileSync(path.join(root, 'src/index.ts'), 'utf8');

function startupValidators() {
  const modules = new Map();
  for (const match of indexSource.matchAll(/import\s*\{([^}]*)\}\s*from\s*'(\.\/[^']+)'/g)) {
    for (const name of match[1].split(',')) modules.set(name.trim().split(' as ')[0].trim(), match[2]);
  }
  const start = indexSource.indexOf('const askRegistryIssues');
  const names = [...new Set([...indexSource.slice(start, start + 9000).matchAll(/\.\.\.((?:validate|detect)\w+)\(\)/g)].map((match) => match[1]))];
  return names.map((name) => {
    const modulePath = modules.get(name);
    assert.ok(modulePath, `${name} is called at startup but its import was not found in index.ts`);
    const base = path.join(root, 'src', modulePath.slice(2));
    const loaded = fs.existsSync(`${base}.ts`) ? require(`${base}.ts`) : require(path.join(base, 'index.ts'));
    assert.equal(typeof loaded[name], 'function', name);
    return [name, loaded[name]];
  });
}

test('every registry validator index.ts runs at startup reports no issues', () => {
  const validators = startupValidators();
  assert.ok(validators.length >= 20, `expected the startup validator list, found ${validators.length}`);
  const problems = validators.flatMap(([name, validate]) => validate().map((issue) => `${name}: ${issue}`));
  assert.deepEqual(problems, []);
});
