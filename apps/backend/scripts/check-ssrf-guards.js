#!/usr/bin/env node

/**
 * SSRF guard lint check:
 * - Finds every backend fetch(...) call.
 * - Fails unless the enclosing function/source scope also calls assertSafeUrl(...)
 *   with the same URL expression (or the expression before `.toString()`).
 *
 * This is intentionally strict for defense-in-depth.
 */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const SRC_ROOT = path.resolve(__dirname, '..', 'src');
const PROJECT_ROOT = path.resolve(__dirname, '..');

function collectTsFiles(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'tests') continue;
      collectTsFiles(full, out);
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    if (entry.name.endsWith('.d.ts')) continue;
    out.push(full);
  }
  return out;
}

function isFetchCall(node) {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'fetch';
}

function isAssertSafeUrlCall(node) {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'assertSafeUrl'
  );
}

function normalizeExpression(node, sourceFile) {
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.arguments.length === 0 &&
    node.expression.name.text === 'toString'
  ) {
    return node.expression.expression.getText(sourceFile).trim();
  }
  return node.getText(sourceFile).trim();
}

function enclosingScope(node) {
  let cur = node.parent;
  while (cur) {
    if (ts.isSourceFile(cur)) return cur;
    if (ts.isFunctionLike(cur) && cur.body) return cur;
    cur = cur.parent;
  }
  return undefined;
}

const scopeCache = new Map();

function collectSafeArgs(scopeNode, sourceFile) {
  const key = `${sourceFile.fileName}:${scopeNode.pos}:${scopeNode.end}`;
  const cached = scopeCache.get(key);
  if (cached) return cached;

  const safeArgs = new Set();
  const root = ts.isSourceFile(scopeNode) ? scopeNode : scopeNode.body;

  function visit(node) {
    if (isAssertSafeUrlCall(node) && node.arguments.length > 0) {
      const arg = node.arguments[0];
      safeArgs.add(arg.getText(sourceFile).trim());
      safeArgs.add(normalizeExpression(arg, sourceFile));
    }
    ts.forEachChild(node, visit);
  }

  if (root) visit(root);
  scopeCache.set(key, safeArgs);
  return safeArgs;
}

const files = collectTsFiles(SRC_ROOT);
const violations = [];

for (const file of files) {
  const code = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);

  function walk(node) {
    if (isFetchCall(node)) {
      const urlArg = node.arguments[0];
      if (urlArg) {
        const argText = urlArg.getText(sourceFile).trim();
        const normArgText = normalizeExpression(urlArg, sourceFile);
        const scope = enclosingScope(node) || sourceFile;
        const safeArgs = collectSafeArgs(scope, sourceFile);

        if (!safeArgs.has(argText) && !safeArgs.has(normArgText)) {
          const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          violations.push({
            file,
            line: pos.line + 1,
            col: pos.character + 1,
            arg: argText,
          });
        }
      }
    }
    ts.forEachChild(node, walk);
  }

  walk(sourceFile);
}

if (violations.length > 0) {
  console.error('[ssrf-lint] FAIL: fetch() calls missing assertSafeUrl() guard');
  for (const v of violations) {
    const rel = path.relative(PROJECT_ROOT, v.file);
    console.error(`  - ${rel}:${v.line}:${v.col} fetch(${v.arg})`);
  }
  console.error(
    '\nFix pattern:\n  await assertSafeUrl(url)\n  const res = await fetch(url)'
  );
  process.exit(1);
}

console.log(`[ssrf-lint] PASS: validated ${files.length} TypeScript files`);
