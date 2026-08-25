const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require('ts-node/register');

const {
  HOME_ACTION_PRODUCER_OWNERSHIP,
  validateHomeActionProducerOwnership,
  validateHomeActionProducerKindConsistency,
  HOME_ACTION_ADAPTER_OWNERSHIP,
} = require('../../src/services/intelligence/index.ts');

test('validateHomeActionProducerOwnership passes cleanly on the real registry', () => {
  assert.deepEqual(validateHomeActionProducerOwnership(HOME_ACTION_PRODUCER_OWNERSHIP), []);
});

test('validateHomeActionProducerKindConsistency passes cleanly on the real registry', () => {
  assert.deepEqual(
    validateHomeActionProducerKindConsistency(HOME_ACTION_PRODUCER_OWNERSHIP, HOME_ACTION_ADAPTER_OWNERSHIP),
    [],
  );
});

test('validateHomeActionProducerOwnership fails fast on a duplicate producerId', () => {
  const dup = [...HOME_ACTION_PRODUCER_OWNERSHIP, HOME_ACTION_PRODUCER_OWNERSHIP[0]];
  const issues = validateHomeActionProducerOwnership(dup);
  assert.ok(issues.some((issue) => issue.includes('Duplicate homeActionProducerOwnership entry')));
});

test('validateHomeActionProducerKindConsistency fails fast when a producer silently disagrees with its kind default', () => {
  const bad = HOME_ACTION_PRODUCER_OWNERSHIP.map((entry) =>
    entry.producerId === 'loadIncidentActions'
      ? { ...entry, hasCompletionAdapter: true, completionAdapterOwner: 'made up for this test' }
      : entry);
  const issues = validateHomeActionProducerKindConsistency(bad, HOME_ACTION_ADAPTER_OWNERSHIP);
  assert.ok(issues.some((issue) => issue.includes('loadIncidentActions') && issue.includes('disagrees')));
});

test('validateHomeActionProducerOwnership fails fast on an empty supportedCommands', () => {
  const bad = HOME_ACTION_PRODUCER_OWNERSHIP.map((entry) =>
    entry.producerId === 'loadProjectActions' ? { ...entry, supportedCommands: [] } : entry);
  const issues = validateHomeActionProducerOwnership(bad);
  assert.ok(issues.some((issue) => issue.includes('loadProjectActions') && issue.includes('no supportedCommands')));
});

test('validateHomeActionProducerOwnership fails fast on a missing commandOwner', () => {
  const bad = HOME_ACTION_PRODUCER_OWNERSHIP.map((entry) =>
    entry.producerId === 'loadProjectActions' ? { ...entry, commandOwner: '' } : entry);
  const issues = validateHomeActionProducerOwnership(bad);
  assert.ok(issues.some((issue) => issue.includes('loadProjectActions') && issue.includes('no commandOwner')));
});

test('validateHomeActionProducerOwnership fails fast when hasCompletionAdapter and supportedCommands disagree', () => {
  const missingCompleteCommand = HOME_ACTION_PRODUCER_OWNERSHIP.map((entry) =>
    entry.producerId === 'loadPersonalizationActions' ? { ...entry, supportedCommands: ['DEFER', 'SNOOZE'] } : entry);
  const issuesA = validateHomeActionProducerOwnership(missingCompleteCommand);
  assert.ok(issuesA.some((issue) => issue.includes('loadPersonalizationActions') && issue.includes('neither COMPLETE nor ALREADY_DONE')));

  const unexpectedCompleteCommand = HOME_ACTION_PRODUCER_OWNERSHIP.map((entry) =>
    entry.producerId === 'loadProjectActions' ? { ...entry, supportedCommands: [...entry.supportedCommands, 'COMPLETE'] } : entry);
  const issuesB = validateHomeActionProducerOwnership(unexpectedCompleteCommand);
  assert.ok(issuesB.some((issue) => issue.includes('loadProjectActions') && issue.includes('hasCompletionAdapter is false')));
});

test('validateHomeActionProducerOwnership fails fast on inconsistent outcome-adapter flags', () => {
  const missingOwner = HOME_ACTION_PRODUCER_OWNERSHIP.map((entry) =>
    entry.producerId === 'loadProjectActions' ? { ...entry, hasOutcomeAdapter: true } : entry);
  const issuesA = validateHomeActionProducerOwnership(missingOwner);
  assert.ok(issuesA.some((issue) => issue.includes('loadProjectActions') && issue.includes('no outcomeAdapterOwner')));

  const unexpectedOwner = HOME_ACTION_PRODUCER_OWNERSHIP.map((entry) =>
    entry.producerId === 'loadProjectActions' ? { ...entry, outcomeAdapterOwner: 'made up for this test' } : entry);
  const issuesB = validateHomeActionProducerOwnership(unexpectedOwner);
  assert.ok(issuesB.some((issue) => issue.includes('loadProjectActions') && issue.includes('hasOutcomeAdapter is false')));
});

test('dynamic Home Action producers declare the runtime source kinds that resolve work items', () => {
  const orchestration = HOME_ACTION_PRODUCER_OWNERSHIP.find((entry) => entry.producerId === 'adaptOrchestratedActionToHomeAction');
  assert.deepEqual(orchestration.dynamicWorkItemOwnership, [
    { sourceKind: 'MAINTENANCE', workItemSourceType: 'MAINTENANCE' },
    { sourceKind: 'COVERAGE', workItemSourceType: 'COVERAGE' },
  ]);

  const activation = HOME_ACTION_PRODUCER_OWNERSHIP.find((entry) => entry.producerId === 'getActivationFirstValue');
  assert.deepEqual(
    activation.dynamicWorkItemOwnership.map((entry) => entry.sourceKind).sort(),
    ['COVERAGE', 'GUIDANCE', 'INCIDENT', 'MAINTENANCE', 'PROJECT'],
  );

  const acceptedWork = HOME_ACTION_PRODUCER_OWNERSHIP.find((entry) => entry.producerId === 'appendAcceptedOperationalWork');
  assert.equal(acceptedWork.carriesExistingWorkItem, true);
});

test('validateHomeActionProducerOwnership fails fast when hasOutcomeAdapter is true without a completion adapter', () => {
  const bad = HOME_ACTION_PRODUCER_OWNERSHIP.map((entry) =>
    entry.producerId === 'loadProjectActions' ? { ...entry, hasOutcomeAdapter: true, outcomeAdapterOwner: 'made up for this test' } : entry);
  const issues = validateHomeActionProducerOwnership(bad);
  assert.ok(issues.some((issue) => issue.includes('loadProjectActions') && issue.includes('no completion adapter to observe')));
});

test('validateHomeActionProducerOwnership rejects incomplete end-to-end outcome ownership', () => {
  const bad = HOME_ACTION_PRODUCER_OWNERSHIP.map((entry) =>
    entry.producerId === 'loadIncidentActions'
      ? { ...entry, endToEndOutcomeAdapters: [{ owner: '', completionPath: 'syncIncidentWorkItem', conditions: '' }] }
      : entry);
  const issues = validateHomeActionProducerOwnership(bad);
  assert.ok(issues.some((issue) => issue.includes('loadIncidentActions') && issue.includes('incomplete end-to-end')));
});

test('validateHomeActionProducerKindConsistency fails fast when a producer claims an outcome adapter its kind does not have', () => {
  const bad = HOME_ACTION_PRODUCER_OWNERSHIP.map((entry) =>
    entry.producerId === 'loadIncidentActions' ? { ...entry, hasOutcomeAdapter: true, outcomeAdapterOwner: 'made up for this test' } : entry);
  const issues = validateHomeActionProducerKindConsistency(bad, HOME_ACTION_ADAPTER_OWNERSHIP);
  assert.ok(issues.some((issue) => issue.includes('loadIncidentActions') && issue.includes('no outcome adapter at the kind level')));
});

function functionLikeDeclaration(node) {
  if (ts.isFunctionDeclaration(node) && node.name) return { name: node.name.text, declaration: node };
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer
    && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
    return { name: node.name.text, declaration: node.initializer, jsDocNode: node };
  }
  return null;
}

function returnsHomeActionDirectly(declaration, sourceFile) {
  if (!declaration.type) return false;
  const returnType = declaration.type.getText(sourceFile).replace(/\s+/g, '');
  const unwrapped = returnType.startsWith('Promise<') && returnType.endsWith('>')
    ? returnType.slice('Promise<'.length, -1)
    : returnType;
  const returnsHomeAction = unwrapped === 'HomeAction'
    || unwrapped === 'HomeAction[]'
    || unwrapped === 'readonlyHomeAction[]'
    || unwrapped === 'Array<HomeAction>'
    || unwrapped === 'ReadonlyArray<HomeAction>';
  if (!returnsHomeAction) return false;

  // A function that consumes HomeAction and returns HomeAction is a pipeline
  // transformer, not an independent recommendation source.
  return !declaration.parameters.some((parameter) => /\bHomeAction\b/.test(parameter.type?.getText(sourceFile) ?? ''));
}

function hasHomeActionProducerTag(node) {
  return ts.getJSDocTags(node).some((tag) => tag.tagName.text === 'homeActionProducer');
}

function producerNamesInSource(source, fileName = 'producer.ts') {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const producers = new Set();
  function visit(node) {
    const functionLike = functionLikeDeclaration(node);
    if (functionLike) {
      const tagged = hasHomeActionProducerTag(functionLike.jsDocNode ?? functionLike.declaration)
        || hasHomeActionProducerTag(functionLike.declaration);
      if (tagged || returnsHomeActionDirectly(functionLike.declaration, sourceFile)) producers.add(functionLike.name);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return producers;
}

function serviceSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return serviceSourceFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.ts') ? [fullPath] : [];
  });
}

test('every typed or tagged Home Action producer across backend services has an ownership entry', () => {
  const declaredProducerIds = new Set(HOME_ACTION_PRODUCER_OWNERSHIP.map((entry) => entry.producerId));
  const foundProducerIds = new Set();
  const foundLocations = new Map();
  const servicesRoot = path.join(__dirname, '../../src/services');

  for (const filePath of serviceSourceFiles(servicesRoot)) {
    const source = fs.readFileSync(filePath, 'utf8');
    for (const producerId of producerNamesInSource(source, filePath)) {
      foundProducerIds.add(producerId);
      foundLocations.set(producerId, path.relative(path.join(__dirname, '../../../..'), filePath));
    }
  }

  const missing = [...foundProducerIds].filter((id) => !declaredProducerIds.has(id));
  assert.deepEqual(missing, [], `Producer function(s) found in source but missing a homeActionProducerOwnership entry: ${missing.join(', ')}`);

  const stale = [...declaredProducerIds].filter((id) => !foundProducerIds.has(id));
  assert.deepEqual(stale, [], `homeActionProducerOwnership entry/entries reference producer function(s) no longer found in source: ${stale.join(', ')}`);

  const wrongSourceFiles = HOME_ACTION_PRODUCER_OWNERSHIP
    .filter((entry) => foundLocations.get(entry.producerId) !== entry.sourceFile)
    .map((entry) => `${entry.producerId}: registry=${entry.sourceFile}, source=${foundLocations.get(entry.producerId)}`);
  assert.deepEqual(wrongSourceFiles, [], `Producer sourceFile ownership drift: ${wrongSourceFiles.join('; ')}`);
});

test('producer discovery is type/tag based rather than function-name or fixed-file based', () => {
  const discovered = producerNamesInSource(`
    const deriveMitigationPlan = async (): Promise<HomeAction[]> => [];
    function buildRecommendation(): HomeAction { throw new Error('fixture'); }
    /** @homeActionProducer */
    function appendRecommendation(target: HomeAction[]): void { void target; }
    function transformExisting(actions: HomeAction[]): HomeAction[] { return actions; }
  `, 'services/a-new-fifth-file.ts');
  assert.deepEqual([...discovered].sort(), ['appendRecommendation', 'buildRecommendation', 'deriveMitigationPlan']);
});
