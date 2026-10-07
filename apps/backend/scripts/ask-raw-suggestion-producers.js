#!/usr/bin/env node
// ASK_COZY_SUGGESTED_NEXT_ACTIONS_IMPLEMENTATION_PLAN Phase 5: production Ask may not construct raw string follow-up chips.
// Historical persisted results retain frontend read compatibility; every newly constructed compact follow-up is typed and ledger-backed.
//
// What counts as a raw producer: a `suggestions:` property in an object literal, or a later `.suggestions = ...` assignment, under
// src/services/ask whose value contains a string or template literal (it generates compact text). What does not: `suggestions: []`, pass-throughs of an existing value
// (`result.suggestions`, `stored.suggestions ?? []`, shorthand), a block's own metadata (an object with a string-literal `type`),
// test files, typed candidates, and anything outside src/services/ask.
//
//   node scripts/ask-raw-suggestion-producers.js            print the per-file counts
//   node scripts/ask-raw-suggestion-producers.js --check    exit 1 on any raw producer
//   node scripts/ask-raw-suggestion-producers.js --write    rewrite the zero baseline after reviewed removals
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const BACKEND = path.resolve(__dirname, '..');
const SCAN_ROOT = path.join(BACKEND, 'src/services/ask');
const BASELINE = path.resolve(BACKEND, '../../docs/architecture/ask-raw-suggestion-producers.json');

const rel = (file) => path.relative(BACKEND, file).split(path.sep).join('/');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) out.push(full);
  }
  return out;
}

function containsTextLiteral(node) {
  let found = false;
  (function visit(n) {
    if (found) return;
    if (ts.isStringLiteralLike(n) || ts.isTemplateExpression(n)) { found = true; return; }
    ts.forEachChild(n, visit);
  })(node);
  return found;
}

const isBlockObject = (obj) => obj.properties.some((p) => ts.isPropertyAssignment(p) && p.name.getText() === 'type' && ts.isStringLiteralLike(p.initializer));

/** Counts raw producer sites in one source text. */
function countRawProducers(fileName, text) {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  let count = 0;
  (function visit(n) {
    if (ts.isPropertyAssignment(n) && n.name.getText() === 'suggestions' && ts.isObjectLiteralExpression(n.parent)
      && !isBlockObject(n.parent) && containsTextLiteral(n.initializer)) count += 1;
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(n.left) && n.left.name.text === 'suggestions'
      && containsTextLiteral(n.right)) count += 1;
    ts.forEachChild(n, visit);
  })(sf);
  return count;
}

function scan() {
  const files = {};
  for (const abs of walk(SCAN_ROOT)) {
    const count = countRawProducers(abs, fs.readFileSync(abs, 'utf8'));
    if (count > 0) files[rel(abs)] = count;
  }
  return files;
}

/** The baseline is pinned at zero; compare remains exported for focused scanner tests. */
function compare(current, baseline) {
  const increases = [];
  const decreases = [];
  for (const file of [...new Set([...Object.keys(current), ...Object.keys(baseline)])].sort()) {
    const now = current[file] ?? 0;
    const before = baseline[file] ?? 0;
    if (now > before) increases.push({ file, before, now, isNewFile: before === 0 });
    else if (now < before) decreases.push({ file, before, now });
  }
  return { increases, decreases };
}

function formatIncreases(increases) {
  return [
    'Raw string-suggestion producers are not allowed (plan Phase 5). Build a typed Suggested Next Action candidate instead.',
    ...increases.map(({ file, before, now, isNewFile }) => `  ${file}: ${before} -> ${now} (+${now - before})${isNewFile ? ' [new producer file]' : ''}`),
    'Do not update the zero baseline. Remove the string or build a governed typed candidate.',
  ].join('\n');
}

const total = (files) => Object.values(files).reduce((sum, n) => sum + n, 0);

module.exports = { scan, countRawProducers, compare, formatIncreases, total, BASELINE };

if (require.main === module) {
  const current = scan();
  const mode = process.argv[2];
  if (mode === '--write') {
    const files = Object.fromEntries(Object.keys(current).sort().map((file) => [file, current[file]]));
    fs.writeFileSync(BASELINE, `${JSON.stringify({ comment: 'Phase 5 zero baseline: production Ask code may not construct raw string follow-up suggestions. Historical persisted strings are read-compatible in the frontend only.', files }, null, 2)}\n`);
    console.log(`wrote ${path.relative(process.cwd(), BASELINE)} (${total(current)} producers in ${Object.keys(files).length} files)`);
  } else {
    const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).files;
    const { increases, decreases } = compare(current, baseline);
    if (mode === '--check') {
      decreases.forEach(({ file, before, now }) => console.log(`  down: ${file}: ${before} -> ${now}`));
      if (increases.length) { console.error(formatIncreases(increases)); process.exit(1); }
      console.log(`ok: ${total(current)} raw producers (baseline ${total(baseline)})`);
    } else {
      console.log(JSON.stringify(current, null, 2));
      console.log(`${total(current)} raw producers in ${Object.keys(current).length} files`);
    }
  }
}
