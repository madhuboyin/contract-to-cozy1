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

// Reviewed finalizer classification per persisting file (plan §7.4 / Phase 2). A file that gains a persistence site, or a new file
// that persists an Ask result, must be classified here -- an unclassified file fails the guard test.
//   WIRED                        calls finalizeSuggestedNextActions itself before persisting
//   VIA_EXECUTE_OPERATION        its handler results come from executeOperation, whose finalize() runs the finalizer
//   PENDING_INTERACTION          writes while a confirmation/clarification is open; no compact actions (eligibility rule 9)
//   RECOVERY_FINALIZED           expiry/conflict/stale/failure/cancel branches; typed recovery chips come from recoveryCandidates.ts via the shared finalizer (plan C.13), or the branch deliberately has none
//   LEDGER_PRESERVING            copies or spreads an existing stored result without producing new actions
const FINALIZER_CLASSIFICATION = {
  'src/services/ask/execution/executeOperation.ts': { finalizer: 'WIRED', note: 'finalize() seam; refreshAskExecutionAfterConflict atomically replaces the stored ledger' },
  'src/services/ask/execution/createAskExecution.ts': { finalizer: 'WIRED', note: 'routing clarification calls the finalizer; the main result comes from executeOperation; failure branch persists no chip (retry button); stale-selection recovery is the typed unavailable result, no chip' },
  'src/services/ask/execution/askConfirm.ts': { finalizer: 'WIRED', note: 'confirmed result calls the finalizer; expiry and conflict branches build typed recovery chips through finalizeRecoveryActions (C.13); cancel/unavailable persist no compact strings' },
  'src/services/ask/execution/askClarification.ts': { finalizer: 'VIA_EXECUTE_OPERATION', note: 'resumption and property selection run executeOperation; expiry builds the restart chip through finalizeRecoveryActions; failure branches persist no chip (the retry button covers them)' },
  'src/services/ask/execution/askCapture.ts': { finalizer: 'VIA_EXECUTE_OPERATION', note: 'capture/replay results come from executeOperation; ledger preserved on refresh; unavailable branch persists no compact strings (C.13)' },
  'src/services/ask/execution/askRetry.ts': { finalizer: 'LEDGER_PRESERVING', note: 'spreads the retried result and only adds continuesExecutionId' },
  'src/services/ask/execution/askSessions.ts': { finalizer: 'RECOVERY_FINALIZED', note: 'pending-work expiry builds the restart chip through finalizeRecoveryActions (C.13); orphan reclaim persists no chip' },
  'src/services/ask/execution/askFeedback.ts': { finalizer: 'PENDING_INTERACTION', note: 'writes a clarification (no suggestions)' },
  'src/services/ask/support/executionState.ts': { finalizer: 'RECOVERY_FINALIZED', note: 'skill-binding expiry and unsupported-schema fallback results (no actions)' },
  'src/services/ask/askNotificationContinuation.service.ts': { finalizer: 'RECOVERY_FINALIZED', note: 'proactive continuation execution; string suggestions only; out of Phase 4 recovery scope' },
  'src/services/ask/conversationalUnderstanding/conversationalCapture.ts': { finalizer: 'PENDING_INTERACTION', note: 'child capture executions are created NEEDS_CONFIRMATION with suggestions: []' },
  'src/services/ask/handlers/buyerConfirm.handler.ts': { finalizer: 'PENDING_INTERACTION', note: 'confirmation edit write' },
  'src/services/ask/handlers/maintenanceConfirm.handler.ts': { finalizer: 'PENDING_INTERACTION', note: 'confirmation edit write' },
  'src/services/ask/handlers/radarConfirm.handler.ts': { finalizer: 'PENDING_INTERACTION', note: 'confirmation edit write' },
  'src/services/ask/handlers/recordConfirm.handler.ts': { finalizer: 'PENDING_INTERACTION', note: 'confirmation edit writes' },
  'src/services/ask/handlers/workflowConfirm.handler.ts': { finalizer: 'PENDING_INTERACTION', note: 'confirmation edit writes' },
};

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
  return Object.fromEntries(Object.keys(persistence).sort().map((file) => [file, { ...persistence[file], ...(FINALIZER_CLASSIFICATION[file] ?? { finalizer: 'UNCLASSIFIED', note: '' }) }]));
}

function unclassified(persistence) {
  return Object.keys(persistence).filter((file) => !FINALIZER_CLASSIFICATION[file]);
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

module.exports = { scan, baselineShape, diff, unclassified, FINALIZER_CLASSIFICATION, BASELINE };

if (require.main === module) {
  const { persistence, suggestions } = scan();
  const mode = process.argv[2];
  if (mode === '--write') {
    fs.writeFileSync(BASELINE, `${JSON.stringify({ comment: 'Ask persisted-result write sites (plan §5.3). Regenerate with `node scripts/ask-suggestion-sites.js --write` and update the plan inventory.', files: baselineShape(persistence) }, null, 2)}\n`);
    console.log(`wrote ${path.relative(process.cwd(), BASELINE)}`);
  } else if (mode === '--check') {
    const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).files;
    const problems = [...diff(persistence, baseline), ...unclassified(persistence).map((file) => `${file}: persists an Ask result but has no finalizer classification`)];
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
