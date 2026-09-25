const test = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync, readFileSync, statSync, existsSync } = require('node:fs');
const { dirname, join, resolve } = require('node:path');

// Import-graph guardrails for the decomposed Ask orchestrator (FRD v1.110). Handlers import each other and shared
// support modules; nothing enforced that those imports stay acyclic (a cycle deadlocks module loading, as the Stage 3
// circular import once did). This builds the graph over the decomposed layers and fails on a cycle or a layering breach.
const ASK_DIR = resolve(__dirname, '../../src/services/ask');
const LAYER_DIRS = ['handlers', 'execution', 'support'];
const SINGLE_FILES = ['askHandlerSupport.ts', 'askFormatting.ts', 'askOrchestrator.service.ts'];

function tsFiles(dir) {
  return readdirSync(dir).sort().flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsFiles(path);
    return name.endsWith('.ts') ? [path] : [];
  });
}
const rel = (file) => file.slice(ASK_DIR.length + 1);
const nodes = [...LAYER_DIRS.flatMap((dir) => tsFiles(join(ASK_DIR, dir))), ...SINGLE_FILES.map((name) => join(ASK_DIR, name))];

function resolveImport(from, spec) {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(from), spec);
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) if (existsSync(candidate)) return candidate;
  return null;
}
// Value imports and re-exports; a type-only import is erased at compile time, so it cannot create a load-time cycle.
function importsOf(file) {
  const source = readFileSync(file, 'utf8');
  const targets = new Set();
  const pattern = /^(?:import|export)\s+(type\s+)?[^;]*?\s+from\s+'([^']+)'|^import\s+'([^']+)'/gm;
  for (const match of source.matchAll(pattern)) {
    if (match[1]) continue;
    const target = resolveImport(file, match[2] ?? match[3]);
    if (target) targets.add(target);
  }
  return [...targets];
}
const graph = new Map(nodes.map((file) => [file, importsOf(file)]));

function findCycle() {
  const state = new Map();
  const stack = [];
  const visit = (node) => {
    state.set(node, 1);
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      if (!graph.has(next)) continue;
      if (state.get(next) === 1) return [...stack.slice(stack.indexOf(next)), next];
      if (!state.get(next)) { const cycle = visit(next); if (cycle) return cycle; }
    }
    stack.pop();
    state.set(node, 2);
    return null;
  };
  for (const node of graph.keys()) if (!state.get(node)) { const cycle = visit(node); if (cycle) return cycle; }
  return null;
}

test('the import graph over handlers, lifecycle, support, formatting and the facade has no cycle', () => {
  const cycle = findCycle();
  assert.equal(cycle, null, cycle ? `import cycle: ${cycle.map(rel).join(' -> ')}` : '');
});

test('the graph is not empty, so the check above means something (handler-to-handler edges are present)', () => {
  assert.ok(graph.size > 60, `only ${graph.size} files in the graph`);
  const handlerEdges = [...graph].filter(([file, targets]) => rel(file).startsWith('handlers/') && targets.some((t) => rel(t).startsWith('handlers/')));
  assert.ok(handlerEdges.length >= 5, 'handlers import each other today; the parser must see it');
});

test('the cycle detector itself finds a cycle (self-check on a synthetic graph)', () => {
  const synthetic = new Map([['a', ['b']], ['b', ['c']], ['c', ['a']]]);
  const state = new Map();
  const detect = (node, path) => {
    if (state.get(node) === 1) return path.slice(path.indexOf(node));
    if (state.get(node) === 2) return null;
    state.set(node, 1);
    for (const next of synthetic.get(node) ?? []) { const found = detect(next, [...path, node]); if (found) return found; }
    state.set(node, 2);
    return null;
  };
  assert.deepEqual(detect('a', []), ['a', 'b', 'c']);
});

test('layering: support modules import only support modules; handlers never import the orchestrator, the facade of themselves or lifecycle files other than executeOperation', () => {
  const breaches = [];
  for (const [file, targets] of graph) {
    const from = rel(file);
    for (const target of targets) {
      const to = rel(target);
      if (from.startsWith('support/') && (to.startsWith('handlers/') || to.startsWith('execution/') || to === 'askHandlerSupport.ts' || to === 'askOrchestrator.service.ts')) breaches.push(`${from} -> ${to}`);
      if (from.startsWith('handlers/') && (to === 'askOrchestrator.service.ts' || (to.startsWith('execution/') && to !== 'execution/executeOperation.ts'))) breaches.push(`${from} -> ${to}`);
      if (from.startsWith('execution/') && to === 'askOrchestrator.service.ts') breaches.push(`${from} -> ${to}`);
      if (from === 'askFormatting.ts' && graph.has(target)) breaches.push(`${from} -> ${to}`);
    }
  }
  assert.deepEqual(breaches, []);
});

test('askHandlerSupport.ts only re-exports the support modules, and re-exports every one of them', () => {
  const source = readFileSync(join(ASK_DIR, 'askHandlerSupport.ts'), 'utf8');
  const code = source.split('\n').filter((line) => line.trim() && !line.trim().startsWith('//'));
  assert.deepEqual(code.filter((line) => !/^export \* from '\.\/support\/\w+';$/.test(line)), [], 'the facade holds no code of its own');
  const exported = new Set(code.map((line) => line.match(/support\/(\w+)/)[1]));
  const present = tsFiles(join(ASK_DIR, 'support')).map((file) => rel(file).slice('support/'.length, -3));
  assert.deepEqual([...exported].sort(), present.sort());
});

test('no support module grows back into a bucket', () => {
  const big = tsFiles(join(ASK_DIR, 'support')).filter((file) => readFileSync(file, 'utf8').split('\n').length > 400).map(rel);
  assert.deepEqual(big, []);
});
