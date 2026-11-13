// Scans resolveAskOperation (askOperationRegistry.ts) into deterministic RULES with the TypeScript parser (FR-FAST-1). Pure: callers pass the registry source text, so a test can scan a modified copy.
const fs = require('node:fs'); const path = require('node:path'); const crypto = require('node:crypto'); const ts = require('typescript');
const askDir = path.join(__dirname, '../../src/services/ask');
const REGISTRY = path.join(askDir, 'askOperationRegistry.ts');
const parse = (file, text) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const GLOBALS = new Set(['message', 'test', 'Boolean', 'String', 'Number', 'Math', 'RegExp', 'Array', 'Object', 'resolved', 'undefined', 'length', 'includes', 'trim', 'toLowerCase', 'match', 'some', 'every', 'filter', 'has']);

/** Every `return resolved(...)` site with the `if` conditions that guard it (an `else` branch is the negated condition). */
function findSites(sf) {
  const fn = sf.statements.find((s) => ts.isFunctionDeclaration(s) && s.name && s.name.text === 'resolveAskOperation');
  if (!fn) throw new Error('resolveAskOperation not found');
  const found = [];
  const visit = (node, conditions) => {
    if (ts.isReturnStatement(node) && node.expression && ts.isCallExpression(node.expression) && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'resolved') { found.push({ call: node.expression, conditions: [...conditions] }); return; }
    if (ts.isIfStatement(node)) {
      visit(node.thenStatement, [...conditions, { text: norm(node.expression.getText(sf)), node: node.expression }]);
      if (node.elseStatement) visit(node.elseStatement, [...conditions, { text: `!(${norm(node.expression.getText(sf))})`, node: node.expression }]);
      return;
    }
    ts.forEachChild(node, (child) => visit(child, conditions));
  };
  visit(fn.body, []);
  return found;
}
const operationOf = (call) => (ts.isStringLiteral(call.arguments[0]) ? call.arguments[0].text : null);

/** Module-level declarations of a file (variables and functions) and its relative named imports. `override` supplies the text of one file (the registry) instead of reading it. */
function makeLoader(registryPath, registrySource) {
  const cache = new Map();
  const load = (file) => { if (!cache.has(file)) { const text = file === registryPath && registrySource !== undefined ? registrySource : fs.readFileSync(file, 'utf8'); cache.set(file, parse(file, text)); } return cache.get(file); };
  const tops = new Map();
  const topLevel = (file) => {
    if (tops.has(file)) return tops.get(file);
    const f = load(file); const decls = new Map(); const imports = new Map();
    for (const st of f.statements) {
      if (ts.isVariableStatement(st)) { for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) decls.set(d.name.text, st.getText(f)); }
      else if (ts.isFunctionDeclaration(st) && st.name) decls.set(st.name.text, st.getText(f));
      if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && st.moduleSpecifier.text.startsWith('.') && st.importClause?.namedBindings && ts.isNamedImports(st.importClause.namedBindings)) {
        const base = path.resolve(path.dirname(file), st.moduleSpecifier.text); const target = ['.ts', '/index.ts'].map((x) => base + x).find((x) => fs.existsSync(x));
        if (target) for (const el of st.importClause.namedBindings.elements) imports.set(el.name.text, { file: target, exported: (el.propertyName ?? el.name).text });
      }
    }
    const out = { decls, imports }; tops.set(file, out); return out;
  };
  return { topLevel };
}
function identifiersOf(text, file) { const ids = new Set(); const walk = (n) => { if (ts.isIdentifier(n)) ids.add(n.text); ts.forEachChild(n, walk); }; walk(parse(file, text)); return ids; }

/** The text of every declaration a set of names depends on, followed through relative imports up to `depth` levels. */
function dependencies(loader, names, file, depth, seen, out) {
  const { decls, imports } = loader.topLevel(file);
  for (const name of names) {
    const key = `${file}:${name}`; if (seen.has(key)) continue; seen.add(key);
    let owner = null; let declName = name;
    if (decls.has(name)) owner = file; else if (imports.has(name)) { const imp = imports.get(name); if (loader.topLevel(imp.file).decls.has(imp.exported)) { owner = imp.file; declName = imp.exported; } }
    if (!owner) continue;
    const text = loader.topLevel(owner).decls.get(declName);
    out.push(`${path.relative(askDir, owner)}:${declName}=${norm(text)}`);
    if (depth > 0) dependencies(loader, [...identifiersOf(text, owner)].filter((x) => x !== declName), owner, depth - 1, seen, out);
  }
}

/** Analyse the registry source: one entry per rule site with its stable id (already in the source or null), hash and dependencies. */
function analyze(registrySource, registryPath = REGISTRY) {
  const sf = parse(registryPath, registrySource); const loader = makeLoader(registryPath, registrySource);
  return findSites(sf).map((s, order) => {
    const operationId = operationOf(s.call); const confidence = Number(s.call.arguments[1].getText(sf)); const idArg = s.call.arguments[2];
    const conditionText = s.conditions.map((c) => c.text).join(' && ');
    const names = new Set(); const walk = (n) => { if (ts.isIdentifier(n) && !GLOBALS.has(n.text)) names.add(n.text); ts.forEachChild(n, walk); };
    for (const c of s.conditions) walk(c.node);
    const deps = []; dependencies(loader, [...names], registryPath, 3, new Set(), deps);
    const hash = sha([`condition=${conditionText}`, `returns=${operationId}@${confidence}`, ...deps.sort()].join('\n'));
    return { call: s.call, id: idArg && ts.isStringLiteral(idArg) ? idArg.text : null, operationId, confidence, order, hash, condition: conditionText.length > 140 ? `${conditionText.slice(0, 137)}...` : conditionText, references: deps.map((d) => d.split('=')[0]).sort() };
  });
}
module.exports = { analyze, REGISTRY, askDir };
