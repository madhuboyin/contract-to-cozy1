#!/usr/bin/env node
// ASK_COZY_SUGGESTED_NEXT_ACTIONS_IMPLEMENTATION_PLAN Appendix C.14 ("Phase 5 containment"): a ratchet on raw string-suggestion
// producers in production Ask code. It does NOT claim that every follow-up is typed; the ~40 unconverted handlers still produce plain
// chips at runtime. The guarantee is narrower: no new raw producer file and no additional raw producer site may be introduced, and
// existing legacy producers stay bounded at the reviewed per-file baseline (docs/architecture/ask-raw-suggestion-producers.json).
//
// What counts as a raw producer: a `suggestions:` property in an object literal under src/services/ask whose value contains a string or
// template literal (it generates compact text). What does not: `suggestions: []`, pass-throughs of an existing value
// (`result.suggestions`, `stored.suggestions ?? []`, shorthand), a block's own metadata (an object with a string-literal `type`),
// test files, typed candidates, and anything outside src/services/ask. Indirect producers (a variable assigned a list and returned
// later) are not tracked; that limitation is deliberate and recorded in C.14.
//
//   node scripts/ask-raw-suggestion-producers.js            print the per-file counts
//   node scripts/ask-raw-suggestion-producers.js --check    exit 1 on a new producer file or a per-file increase
//   node scripts/ask-raw-suggestion-producers.js --write    rewrite the baseline (an increase needs explicit review; see C.14)
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

/** Increases and new files fail; decreases and removed files are reported but allowed. */
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
    'New raw string-suggestion producers are not allowed (plan C.14). Build a typed Suggested Next Action candidate instead.',
    ...increases.map(({ file, before, now, isNewFile }) => `  ${file}: ${before} -> ${now} (+${now - before})${isNewFile ? ' [new producer file]' : ''}`),
    'If an increase is genuinely approved, run `node scripts/ask-raw-suggestion-producers.js --write`, review the diff, and record the approval in plan C.14.',
  ].join('\n');
}

const total = (files) => Object.values(files).reduce((sum, n) => sum + n, 0);

module.exports = { scan, countRawProducers, compare, formatIncreases, total, BASELINE };

if (require.main === module) {
  const current = scan();
  const mode = process.argv[2];
  if (mode === '--write') {
    const files = Object.fromEntries(Object.keys(current).sort().map((file) => [file, current[file]]));
    fs.writeFileSync(BASELINE, `${JSON.stringify({ comment: 'Reviewed per-file counts of raw string-suggestion producers in src/services/ask (plan C.14, Phase 5 containment). Counts may fall freely; an increase or a new file needs an explicit reviewed update: `node scripts/ask-raw-suggestion-producers.js --write`.', files }, null, 2)}\n`);
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
