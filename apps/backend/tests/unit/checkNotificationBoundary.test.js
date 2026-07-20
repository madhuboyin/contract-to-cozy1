// apps/backend/tests/unit/checkNotificationBoundary.test.js
//
// W4 item 6: unit coverage for the AST matcher that backs
// scripts/check-notification-boundary.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');

const { isNotificationCreateCall } = require('../../scripts/check-notification-boundary.js');

function findCalls(source) {
  const sourceFile = ts.createSourceFile('test.ts', source, ts.ScriptTarget.Latest, true);
  const found = [];
  function walk(node) {
    if (isNotificationCreateCall(node)) found.push(node.getText(sourceFile));
    ts.forEachChild(node, walk);
  }
  walk(sourceFile);
  return found;
}

test('flags prisma.notification.create(...)', () => {
  const calls = findCalls(`await prisma.notification.create({ data: {} });`);
  assert.equal(calls.length, 1);
});

test('flags tx.notification.create(...) inside a transaction callback too', () => {
  const calls = findCalls(`await prisma.$transaction(async (tx) => { await tx.notification.create({ data: {} }); });`);
  assert.equal(calls.length, 1);
});

test('does not flag unrelated .create(...) calls', () => {
  const calls = findCalls(`await prisma.notificationDelivery.create({ data: {} }); await prisma.user.create({ data: {} });`);
  assert.equal(calls.length, 0);
});

test('does not flag notification.findFirst or other non-create notification calls', () => {
  const calls = findCalls(`await prisma.notification.findFirst({ where: {} });`);
  assert.equal(calls.length, 0);
});
