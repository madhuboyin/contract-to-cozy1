#!/usr/bin/env node

/**
 * Notification boundary lint check (W4 item 6), workers side:
 * - Finds every `<expr>.notification.create(...)` call in apps/workers/src.
 * - Finds every direct `sendEmail(...)` call in apps/workers/src.
 * - Fails unless the call site is inside the approved delivery boundary.
 *
 * Why: a raw `notification.create` bypasses preference/cadence/quiet-hours
 * resolution (the exact WKR-001/WKR-002 bug class). A raw `sendEmail`
 * outside the canonical email-delivery job (or an explicitly-carved-out
 * internal-recipient job — feedback alerts, ops digests, job-failure
 * alerts, none of which go to a homeowner) sends mail with none of that
 * governance either. This check exists so a new call site can't
 * reintroduce either silently.
 */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const SRC_ROOT = path.resolve(__dirname, '..', 'src');
const PROJECT_ROOT = path.resolve(__dirname, '..');

// The only file allowed to create a Notification row directly (mirrors
// the workers-safe stub of NotificationService.create — apps/workers/stubs
// isn't under src/, so it isn't scanned by this script at all, but is the
// real-world analogue on the built-image side).
const ALLOWED_NOTIFICATION_CREATE_FILES = new Set([]);

// Files allowed to call sendEmail(...) directly. sendEmailNotification.job.ts
// IS the canonical homeowner email-delivery job (driven by NotificationDelivery
// rows created via NotificationService — this is the approved boundary, not a
// bypass of it). The rest are internal-recipient-only paths (ops/feedback
// alerts), an existing carve-out confirmed during the W2 slice.
const ALLOWED_SEND_EMAIL_FILES = new Set(
  [
    'jobs/sendEmailNotification.job.ts',
    'jobs/sendFeedbackNotification.job.ts',
    'jobs/weeklyRetentionReport.job.ts',
    'lib/jobFailureAlert.ts',
    'email/email.service.ts', // sendEmail's own definition, not a call site
  ].map((p) => path.join(SRC_ROOT, ...p.split('/'))),
);

function collectTsFiles(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      collectTsFiles(full, out);
      continue;
    }
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.d.ts')) continue;
    out.push(full);
  }
  return out;
}

function isNotificationCreateCall(node) {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee)) return false;
  if (callee.name.text !== 'create') return false;
  const receiver = callee.expression;
  return ts.isPropertyAccessExpression(receiver) && receiver.name.text === 'notification';
}

function isSendEmailCall(node) {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'sendEmail';
}

function findViolations(files) {
  const violations = [];
  for (const file of files) {
    const code = fs.readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);

    function walk(node) {
      if (isNotificationCreateCall(node) && !ALLOWED_NOTIFICATION_CREATE_FILES.has(file)) {
        const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        violations.push({ file, line: pos.line + 1, col: pos.character + 1, kind: 'notification.create' });
      }
      if (isSendEmailCall(node) && !ALLOWED_SEND_EMAIL_FILES.has(file)) {
        const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        violations.push({ file, line: pos.line + 1, col: pos.character + 1, kind: 'sendEmail' });
      }
      ts.forEachChild(node, walk);
    }
    walk(sourceFile);
  }
  return violations;
}

if (require.main === module) {
  const files = collectTsFiles(SRC_ROOT);
  const violations = findViolations(files);

  if (violations.length > 0) {
    console.error('[notification-boundary] FAIL: notification delivery boundary bypassed');
    for (const v of violations) {
      const rel = path.relative(PROJECT_ROOT, v.file);
      console.error(`  - ${rel}:${v.line}:${v.col} (${v.kind})`);
    }
    console.error(
      '\nFix: route homeowner-facing notifications through NotificationService.create(...) and the\n' +
      'canonical email-notification-queue, not a direct notification.create(...) or sendEmail(...) call.\n' +
      'If this really is an internal-recipient-only send (ops/feedback alert, no homeowner involved),\n' +
      'add the file to ALLOWED_SEND_EMAIL_FILES in this script with a comment explaining why.'
    );
    process.exit(1);
  }

  console.log(`[notification-boundary] PASS: validated ${files.length} TypeScript files`);
}

module.exports = {
  collectTsFiles,
  isNotificationCreateCall,
  isSendEmailCall,
  findViolations,
  SRC_ROOT,
  ALLOWED_SEND_EMAIL_FILES,
};
