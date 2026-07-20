#!/usr/bin/env node

/**
 * Notification boundary lint check (W4 item 6):
 * - Finds every `<expr>.notification.create(...)` call in apps/backend/src.
 * - Fails unless the call site is inside the approved delivery boundary
 *   (NotificationService.create itself).
 *
 * Why: every direct `prisma.notification.create(...)` outside
 * NotificationService bypasses preference/cadence/quiet-hours resolution
 * and the transportEnabled worker-execution-policy threading — this is
 * the exact bug class fixed in WKR-001/WKR-002 (maintenance reminders and
 * seasonal notifications both used to call a raw transport/creation path
 * directly). This check exists so a new call site can't reintroduce it
 * silently.
 */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const SRC_ROOT = path.resolve(__dirname, '..', 'src');
const PROJECT_ROOT = path.resolve(__dirname, '..');

// The only file allowed to create a Notification row directly.
const ALLOWED_FILES = new Set([path.join(SRC_ROOT, 'services', 'notification.service.ts')]);

function collectTsFiles(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'tests') continue;
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

function findViolations(files) {
  const violations = [];
  for (const file of files) {
    if (ALLOWED_FILES.has(file)) continue;
    const code = fs.readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);

    function walk(node) {
      if (isNotificationCreateCall(node)) {
        const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        violations.push({ file, line: pos.line + 1, col: pos.character + 1 });
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
    console.error('[notification-boundary] FAIL: notification.create(...) called outside NotificationService');
    for (const v of violations) {
      const rel = path.relative(PROJECT_ROOT, v.file);
      console.error(`  - ${rel}:${v.line}:${v.col}`);
    }
    console.error(
      '\nFix: route this through NotificationService.create(...) instead — it resolves preference/' +
      'cadence/quiet-hours policy and threads the worker-execution-policy transportEnabled flag, ' +
      'neither of which a raw prisma.notification.create(...) gets for free.'
    );
    process.exit(1);
  }

  console.log(`[notification-boundary] PASS: validated ${files.length} TypeScript files`);
}

module.exports = { collectTsFiles, isNotificationCreateCall, findViolations, SRC_ROOT, ALLOWED_FILES };
