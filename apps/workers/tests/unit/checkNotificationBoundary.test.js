// apps/workers/tests/unit/checkNotificationBoundary.test.js
//
// W4 item 6: unit coverage for the AST matchers that back
// scripts/check-notification-boundary.js (workers side).

const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');

const { isNotificationCreateCall, isSendEmailCall } = require('../../scripts/check-notification-boundary.js');

function findMatches(source, matcher) {
  const sourceFile = ts.createSourceFile('test.ts', source, ts.ScriptTarget.Latest, true);
  const found = [];
  function walk(node) {
    if (matcher(node)) found.push(node.getText(sourceFile));
    ts.forEachChild(node, walk);
  }
  walk(sourceFile);
  return found;
}

test('isNotificationCreateCall flags prisma.notification.create(...)', () => {
  const calls = findMatches(`await prisma.notification.create({ data: {} });`, isNotificationCreateCall);
  assert.equal(calls.length, 1);
});

test('isSendEmailCall flags a bare sendEmail(...) call', () => {
  const calls = findMatches(`await sendEmail({ to, subject, html });`, isSendEmailCall);
  assert.equal(calls.length, 1);
});

test('isSendEmailCall does not flag a differently-named function or a method call named sendEmail', () => {
  const calls = findMatches(`await mailer.sendEmail({ to }); await sendSms({ to });`, isSendEmailCall);
  assert.equal(calls.length, 0);
});
