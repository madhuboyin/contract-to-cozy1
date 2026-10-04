#!/usr/bin/env node
// ASK_COZY_SUGGESTED_NEXT_ACTIONS_IMPLEMENTATION_PLAN §5.3 / Phase 1: the categorized inventory of every place that persists an Ask
// result (the persistence boundary) and every raw `suggestions:` declaration. The persistence-boundary baseline is checked in at
// docs/architecture/ask-suggested-actions-persistence-sites.json; the guard test fails when a file gains or loses a site, so a
// new place that can persist compact follow-ups must be consciously classified and routed through the shared finalizer (Phase 2).
//
//   node scripts/ask-suggestion-sites.js            print the inventory
//   node scripts/ask-suggestion-sites.js --check    exit 1 when the persistence-boundary baseline drifted
//   node scripts/ask-suggestion-sites.js --write    rewrite the baseline (review the diff, then update the plan)
const fs = require('node:fs');
const path = require('node:path');

const BACKEND = path.resolve(__dirname, '..');
const SRC = path.join(BACKEND, 'src');
const BASELINE = path.resolve(BACKEND, '../../docs/architecture/ask-suggested-actions-persistence-sites.json');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'graphify-out' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) out.push(full);
  }
  return out;
}

const rel = (file) => path.relative(BACKEND, file).split(path.sep).join('/');

// A write of an AskExecution result: `resultJson: asInputJson(` / `resultJson: {` / `resultJson: (…)` inside Ask code. Reads such as
// `select: { resultJson: true }` and type annotations (`resultJson: unknown`) are not writes.
const RESULT_WRITE = /\bresultJson:\s*(?:asInputJson\(|\{|\(|[A-Za-z_]+\s*(?:,|\}|\)))/;
const NOT_A_WRITE = /resultJson:\s*(?:true|false|unknown|Prisma\.JsonValue|string|null\b)/;

function classifyPersistence(file) {
  if (file.startsWith('src/services/ask/execution/')) return 'EXECUTION_LIFECYCLE';
  if (/^src\/services\/ask\/handlers\/.*[Cc]onfirm/.test(file)) return 'CONFIRM_HANDLER';
  if (file.startsWith('src/services/ask/conversationalUnderstanding/')) return 'CONVERSATIONAL_CAPTURE';
  if (file.startsWith('src/services/ask/')) return 'ASK_SERVICE';
  return null;
}

function classifySuggestions(file) {
  if (file.startsWith('src/services/ask/handlers/')) return 'OPERATION_HANDLER';
  if (file.startsWith('src/services/ask/execution/')) return 'EXECUTION_LIFECYCLE';
  if (file.startsWith('src/services/ask/suggestedActions/')) return 'SUGGESTED_ACTIONS_MODULE';
  if (file.startsWith('src/services/ask/')) return 'ASK_SERVICE';
  if (file.startsWith('src/productFramework/')) return 'CONTRACT';
  return 'OTHER_DOMAIN';
}

function scan() {
  const persistence = {};
  const suggestions = {};
  for (const abs of walk(SRC)) {
    const file = rel(abs);
    const lines = fs.readFileSync(abs, 'utf8').split('\n');
    const persistenceKind = classifyPersistence(file);
    lines.forEach((line) => {
      if (persistenceKind && RESULT_WRITE.test(line) && !NOT_A_WRITE.test(line) && !/^\s*(?:\/\/|\*)/.test(line)) {
        persistence[file] = persistence[file] ?? { category: persistenceKind, sites: 0 };
        persistence[file].sites += 1;
      }
      if (/\bsuggestions:/.test(line) && !/^\s*(?:\/\/|\*)/.test(line)) {
        suggestions[file] = suggestions[file] ?? { category: classifySuggestions(file), declarations: 0 };
        suggestions[file].declarations += 1;
      }
    });
  }
  return { persistence, suggestions };
}

function summarize(map, key) {
  const byCategory = {};
  for (const info of Object.values(map)) {
    byCategory[info.category] = byCategory[info.category] ?? { files: 0, [key]: 0 };
    byCategory[info.category].files += 1;
    byCategory[info.category][key] += info[key];
  }
  return byCategory;
}

function baselineShape(persistence) {
  return Object.fromEntries(Object.keys(persistence).sort().map((file) => [file, persistence[file]]));
}

function diff(current, baseline) {
  const problems = [];
  for (const file of new Set([...Object.keys(current), ...Object.keys(baseline)])) {
    const now = current[file]?.sites ?? 0;
    const before = baseline[file]?.sites ?? 0;
    if (now !== before) problems.push(`${file}: ${before} -> ${now} persisted-result site(s)`);
  }
  return problems;
}

module.exports = { scan, baselineShape, diff, BASELINE };

if (require.main === module) {
  const { persistence, suggestions } = scan();
  const mode = process.argv[2];
  if (mode === '--write') {
    fs.writeFileSync(BASELINE, `${JSON.stringify({ comment: 'Ask persisted-result write sites (plan §5.3). Regenerate with `node scripts/ask-suggestion-sites.js --write` and update the plan inventory.', files: baselineShape(persistence) }, null, 2)}\n`);
    console.log(`wrote ${path.relative(process.cwd(), BASELINE)}`);
  } else if (mode === '--check') {
    const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).files;
    const problems = diff(persistence, baseline);
    if (problems.length) { console.error(`Persistence-boundary baseline drifted:\n  ${problems.join('\n  ')}`); process.exit(1); }
    console.log('persistence-boundary baseline matches');
  } else {
    const persistenceTotal = Object.values(persistence).reduce((n, i) => n + i.sites, 0);
    const suggestionTotal = Object.values(suggestions).reduce((n, i) => n + i.declarations, 0);
    console.log(JSON.stringify({
      persistenceBoundary: { files: Object.keys(persistence).length, sites: persistenceTotal, byCategory: summarize(persistence, 'sites'), perFile: baselineShape(persistence) },
      rawSuggestionDeclarations: { files: Object.keys(suggestions).length, declarations: suggestionTotal, byCategory: summarize(suggestions, 'declarations') },
    }, null, 2));
  }
}
