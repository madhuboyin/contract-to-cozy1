const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Ask is the product surface (owner decision, 2026-10-10): an answer may link only to a place inside the conversation, and the answer-trust
// pass removes every other destination. A handler that still builds a desktop link therefore ships dead code and, worse, a next step that
// silently does not exist. This guard stops new ones and makes the existing ones a shrinking list.
//
// It is a ratchet, not a clean-room check: each file may contain no MORE desktop paths than its baseline below, and a file that contains
// FEWER must lower its baseline in the same change, so the list can only shrink. Add nothing to BASELINE for new code; give the answer an
// in-Ask action (a START_WORKFLOW or CONVERSATION_CONTINUE) or say the capability is not currently available in Ask.
// Handler sweep and categories: docs/product/ASK_COZY_ALL_TOOLS_PARITY_IMPLEMENTATION.md, "Handler sweep".
//
// Limits, on purpose: the copy check is conservative and misses a sentence that names a tool without the word page, panel, planner or
// workspace ("Open Service Price Radar for the full breakdown"), and a path assembled at runtime from parts. Comments are not counted.

const ASK_ROOT = path.join(__dirname, '..', '..', 'src', 'services', 'ask');

// Files whose job is to name or document paths, not to emit them.
const EXEMPT = new Set([
  'askAnswerTrustPolicy.ts', // defines the rule and its tests of paths
  'askInteractionCoverageMatrix.ts', // documentation strings only
]);

// A desktop path: /dashboard... other than /dashboard/ask, or the public closeout recipient page.
const DESKTOP_PATH = /(?<![A-Za-z0-9])\/(?:dashboard(?!\/ask(?![A-Za-z0-9_-]))(?=[/?#'"`\s)$,;]|$)|renovation-closeout)/g;

// Copy that tells the user to go to a page, a panel or a workspace Ask does not offer. Conservative on purpose.
const PAGE_COPY = /\b(?:[Oo]pen|[Ss]ee|[Vv]isit|[Uu]se)\s+(?:the\s+)?(?:[A-Z][A-Za-z&' -]{2,40}\s)?(?:page|panel|planner|workspace)\b|\b(?:on|from|in)\s+(?:the|its|that|this)\s+(?:[A-Z][A-Za-z&' -]{0,40}\s)?(?:page|tool|panel)\b|\bon its own page\b|\bin-app (?:decision )?panel\b|\bopen the in-app\b/g;

// Per-file counts at the time of the handler sweep (2026-10-12). Lower these as handlers are fixed; never raise them.
// handlers/projectTracker.handler.ts keeps one path on purpose: the closeout recipient link is shown to the owner as copyable text (it is
// not an Ask link, carries no href, and cannot shrink). Its copy match is the "as on the page" description of the project list.
const PATH_BASELINE = {
  'askFocusedGuidance.ts': 5,
  'conversationalUnderstanding/conversationalCapture.ts': 2,
  'execution/askConcierge.ts': 1,
  'handlers/applianceOracleBudget.handler.ts': 2,
  'handlers/aroundYourHome.handler.ts': 1,
  'handlers/capitalPlanning.handler.ts': 6,
  'handlers/documents.handler.ts': 3,
  'handlers/guidanceOverview.handler.ts': 3,
  'handlers/hoaCompliance.handler.ts': 2,
  'handlers/homeActions.handler.ts': 5,
  'handlers/homeEventRadar.handler.ts': 1,
  'handlers/homeHabitCoach.handler.ts': 1,
  'handlers/homeRiskReplay.handler.ts': 1,
  'handlers/homeUpgradePlanner.handler.ts': 1,
  'handlers/hvacDecision.handler.ts': 1,
  'handlers/inspection.handler.ts': 1,
  'handlers/miscHandlers.handler.ts': 3,
  'handlers/projectTracker.handler.ts': 1,
  'handlers/propertyBrief.handler.ts': 1,
  'handlers/propertySummary.handler.ts': 1,
  'handlers/recallReview.handler.ts': 1,
  'handlers/recordConfirm.handler.ts': 1,
  'handlers/refinance.handler.ts': 7,
  'handlers/savingsOwnership.handler.ts': 2,
  'handlers/sellHoldRent.handler.ts': 4,
  'handlers/servicePriceRadar.handler.ts': 1,
  'handlers/statusBoard.handler.ts': 1,
  'handlers/warranties.handler.ts': 1,
  'handlers/workflowConfirm.handler.ts': 1,
  'support/capabilityDiscovery.ts': 2,
  'support/capture.ts': 4,
};
const COPY_BASELINE = {
  'askCapabilityCardLaunch.ts': 3,
  'askGuidanceStepHandlers.ts': 3,
  'handlers/applianceOracleBudget.handler.ts': 3,
  'handlers/homeEventRadar.handler.ts': 1,
  'handlers/homeUpgradePlanner.handler.ts': 3,
  'handlers/hvacDecision.handler.ts': 6,
  'handlers/projectTracker.handler.ts': 1,
  'handlers/propertyBrief.handler.ts': 1,
  'handlers/servicePriceRadar.handler.ts': 2,
  'handlers/workflowConfirm.handler.ts': 1,
};

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

// Drop block comments and whole-line comments, so prose about a page in a comment is not counted as emitted code.
function codeOnly(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((line) => (/^\s*\/\//.test(line) ? '' : line))
    .join('\n');
}

function measure(pattern) {
  const counts = {};
  for (const file of walk(ASK_ROOT)) {
    const relative = path.relative(ASK_ROOT, file).split(path.sep).join('/');
    if (EXEMPT.has(path.basename(file))) continue;
    const matches = codeOnly(fs.readFileSync(file, 'utf8')).match(pattern);
    if (matches?.length) counts[relative] = matches.length;
  }
  return counts;
}

function ratchet(label, actual, baseline) {
  const grew = [];
  const shrank = [];
  for (const file of new Set([...Object.keys(actual), ...Object.keys(baseline)])) {
    const now = actual[file] ?? 0;
    const was = baseline[file] ?? 0;
    if (now > was) grew.push(`${file}: ${was} -> ${now}`);
    if (now < was) shrank.push(`${file}: ${was} -> ${now}`);
  }
  assert.deepEqual(grew, [], `${label} grew in: ${grew.join('; ')}. Give the answer an in-Ask action, or say it is not currently available in Ask; do not raise the baseline.`);
  assert.deepEqual(shrank, [], `${label} shrank in: ${shrank.join('; ')}. Lower its baseline in this test so the list keeps shrinking.`);
}

test('no handler builds a new link to a desktop page, and the existing ones only shrink', () => {
  ratchet('Desktop paths', measure(DESKTOP_PATH), PATH_BASELINE);
});

test('no handler adds copy that sends the user to a page Ask does not offer, and the existing copy only shrinks', () => {
  ratchet('Page-referencing copy', measure(PAGE_COPY), COPY_BASELINE);
});

test('the guard itself recognises what it is meant to catch', () => {
  const hit = (text) => (text.match(DESKTOP_PATH) ?? []).length;
  assert.equal(hit('`/dashboard/properties/${id}/claims`'), 1);
  assert.equal(hit("'/dashboard/warranties'"), 1);
  assert.equal(hit('`/dashboard?propertyId=${id}`'), 1);
  assert.equal(hit('`/renovation-closeout/share/${token}`'), 1);
  assert.equal(hit("'/dashboard/ask?threadId=1'"), 0);
  assert.equal(hit("'/dashboard/ask'"), 0);
  const copy = (text) => (text.match(PAGE_COPY) ?? []).length;
  assert.equal(copy('open the page for the full record'), 1);
  assert.equal(copy('Replacement model suggestions are on the Appliance Oracle page.'), 1);
  assert.equal(copy('Open the in-app decision panel to continue'), 1);
  assert.equal(copy('Open the Maintenance page to continue'), 1);
  assert.equal(copy('See the Property Brief page'), 1);
  assert.equal(copy('Add an item to your home inventory'), 0);
});
