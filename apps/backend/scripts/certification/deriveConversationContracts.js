// Derives the conversation (execution) contracts used by the browser certification of the inline Work, Saved and Notifications answers.
// Nothing here is invented and nothing needs a database: the pages are the REAL captured destination contracts (see captureAskContracts.js), the
// answers are built by the REAL pure answer builders (workOverviewFromPage, savedResultsFromPage, notificationsFromPage), and the response envelope
// is the REAL mapPersistedExecution. Run: TS_NODE_TRANSPILE_ONLY=1 node scripts/certification/deriveConversationContracts.js [--check]
require('ts-node/register');
const fs = require('node:fs');
const path = require('node:path');

require('../../src/services/ask/askOrchestrator.service.ts');
const { mapPersistedExecution } = require('../../src/services/ask/support/executionState.ts');
const { buildWorkViewState, workOverviewFromPage } = require('../../src/services/ask/handlers/workOverview.handler.ts');
const { buildSavedViewState, savedResultsFromPage } = require('../../src/services/ask/handlers/savedResults.handler.ts');
const { buildNotificationsViewState, notificationsFromPage } = require('../../src/services/ask/handlers/notificationsOverview.handler.ts');

const dir = path.join(__dirname, '..', '..', '..', 'frontend', 'e2e', 'ask-certification', 'contracts');
const read = (name) => JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'));
const PROPERTY = { id: 'ask-property-fixture', label: 'Acceptance Home' };
const STAMP = new Date('2026-10-20T00:20:00.000Z');

// The builders mint a random viewState.resultId; pin it to a stable value derived from the execution id so the output is reproducible (--check).
function stabilize(id, result) {
  const randomId = result.parameters?.viewState?.resultId;
  if (!randomId) return result;
  return JSON.parse(JSON.stringify(result).split(randomId).join(`result-${id}`));
}

function execution(id, message, operationId, rawResult) {
  const result = stabilize(id, rawResult);
  const row = {
    id, sessionId: 'ask-acceptance-session', message, status: result.status, reasonCode: result.reasonCode ?? null, propertyId: PROPERTY.id, operationId,
    operationVersion: '1.0', intentFamily: 'STATUS_SUMMARY', contextVersion: 'conversation-certification-v1', parametersJson: result.parameters ?? null,
    resultJson: { schemaVersion: '1.0', blocks: result.blocks, captureRequests: [], confirmation: null, clarification: null, suggestions: result.suggestions ?? [], skillHandoff: null },
    createdAt: STAMP, updatedAt: STAMP,
  };
  return mapPersistedExecution(row, PROPERTY);
}

const workState = { view: 'NEEDS_YOU', kind: null, limit: 10 };
const savedState = { archived: false, type: null, freshness: null, limit: 10 };
const inboxState = { dismissed: false, unreadOnly: false, category: null, limit: 10 };
const dismissedState = { dismissed: true, unreadOnly: false, category: null, limit: 10 };

// The stale/superseded Saved rows the journey 6 test derives from the captured Saved page (kept identical to reconciliation.spec.ts's savedRows).
function staleSavedPage() {
  const page = read('savedPage');
  const base = page.rows[1];
  const oldKey = 'quote-comparison:thread-hvac-v1';
  const rows = [{
    ...base, artifactKey: oldKey, artifactType: 'QUOTE_COMPARISON', category: 'COMPARISON', title: 'HVAC quote comparison', summary: '3 quotes compared',
    freshness: { state: 'STALE', reason: 'A quote changed after this was compared.' }, version: { behavior: 'NEW_VERSION', label: 'Version 1', superseded: false, supersededBy: null, supersedes: null },
    entity: { type: 'DECISION_THREAD', id: 'thread-hvac' }, reopen: { operationId: 'QUOTE_COMPARISON', entityType: 'DECISION_THREAD', entityId: 'thread-hvac', decisionThreadId: 'thread-hvac', contextVersion: 'Version 1' },
  }];
  return { ...page, rows, delivered: rows.length, counts: { active: rows.length, archived: 0 } };
}

const outputs = {
  conversationWork: execution('execution-conversation-work', 'What needs me?', 'WORK_OVERVIEW', workOverviewFromPage({ page: read('workNeedsYou'), state: workState, viewState: buildWorkViewState(null, workState) })),
  conversationSaved: execution('execution-conversation-saved', 'Show my saved results', 'SAVED_RESULTS', savedResultsFromPage({ page: read('savedPage'), state: savedState, viewState: buildSavedViewState(null, savedState) })),
  conversationSavedStale: execution('execution-conversation-saved-stale', 'Show my saved results', 'SAVED_RESULTS', savedResultsFromPage({ page: staleSavedPage(), state: savedState, viewState: buildSavedViewState(null, savedState) })),
  conversationNotifications: execution('execution-conversation-notifications', "What's new?", 'NOTIFICATIONS_OVERVIEW', notificationsFromPage({ page: read('notifications'), state: inboxState, viewState: buildNotificationsViewState(null, inboxState) })),
  conversationNotificationsDismissed: execution('execution-conversation-notifications-dismissed', 'Show dismissed notifications', 'NOTIFICATIONS_OVERVIEW', notificationsFromPage({ page: read('notificationsDismissed'), state: dismissedState, viewState: buildNotificationsViewState(null, dismissedState) })),
};

const check = process.argv.includes('--check');
let stale = 0;
for (const [name, value] of Object.entries(outputs)) {
  const file = path.join(dir, `${name}.json`);
  const next = `${JSON.stringify(value, null, 2)}\n`;
  if (check) { if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== next) { stale += 1; console.error(`stale: ${name}.json`); } } else fs.writeFileSync(file, next);
}
if (check) process.exit(stale ? 1 : 0);
console.log(`wrote ${Object.keys(outputs).length} conversation contracts`);
