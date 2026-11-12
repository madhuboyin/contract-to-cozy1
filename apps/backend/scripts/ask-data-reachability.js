#!/usr/bin/env node
// Phase 0c: how much of the data-point catalogue can Ask read today? (reliability FRD FR-DATA-7, §4.4 "data-point reachability").
// Static analysis with the TypeScript compiler API; offline, read-only, ~20 s. Two BOUNDS are reported because entity-level reachability cannot be exact:
//   lower bound  entities read directly by code under src/services/ask (a `prisma.<model>.find*/count/aggregate/groupBy` call in that tree)
//   upper bound  entities read by any function reachable from an operation's propose-time handler (follows every in-program reference; over-approximates,
//                because shared helpers read many entities that a given question never touches)
// Field-level reachability is NOT derivable statically and is not claimed. Derived values are not covered. Output is descriptive, not a gate.
//   node scripts/ask-data-reachability.js [--json=out.json]
const ts = require('typescript'); const path = require('node:path'); const fs = require('node:fs');
const { deriveCatalogue } = require('./lib/askDataCatalogue');
const args = process.argv.slice(2); const jsonOut = (args.find((a) => a.startsWith('--json=')) ?? '').slice(7) || null;

const cfgPath = ts.findConfigFile(path.resolve(__dirname, '..'), ts.sys.fileExists, 'tsconfig.json');
const cfg = ts.readConfigFile(cfgPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, path.dirname(cfgPath));
const files = parsed.fileNames.filter((f) => f.includes(`${path.sep}src${path.sep}`) && !f.includes('.test.'));
const program = ts.createProgram(files, { ...parsed.options, noEmit: true, skipLibCheck: true, incremental: false });
const checker = program.getTypeChecker();
const READ_METHODS = new Set(['findMany', 'findFirst', 'findUnique', 'findFirstOrThrow', 'findUniqueOrThrow', 'count', 'aggregate', 'groupBy']);
const isProgramFile = (sf) => !sf.isDeclarationFile && !sf.fileName.includes('node_modules');
const isFnLike = (n) => ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isConstructorDeclaration(n);
const key = (n) => `${n.getSourceFile().fileName}:${n.pos}`;
function declFns(symbol) {
  if (!symbol) return [];
  if (symbol.flags & ts.SymbolFlags.Alias) { try { symbol = checker.getAliasedSymbol(symbol); } catch { return []; } }
  const out = [];
  for (const d of symbol.declarations ?? []) {
    if (!isProgramFile(d.getSourceFile())) continue;
    if (isFnLike(d)) out.push(d);
    else if (ts.isVariableDeclaration(d) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) out.push(d.initializer);
    else if (ts.isPropertyAssignment(d) && d.initializer && isFnLike(d.initializer)) out.push(d.initializer);
  }
  return out;
}
const info = new Map();
function analyse(node) {
  const k = key(node); if (info.has(k)) return info.get(k);
  const rec = { reads: new Set(), refs: new Set(), file: node.getSourceFile().fileName }; info.set(k, rec);
  (function visit(n) {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && READ_METHODS.has(n.expression.name.text)) {
      const m = /([A-Za-z]+)Delegate/.exec(checker.typeToString(checker.getTypeAtLocation(n.expression.expression)));
      if (m) rec.reads.add(m[1]);
    }
    if (ts.isIdentifier(n) || (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.name))) {
      let sym; try { sym = checker.getSymbolAtLocation(ts.isIdentifier(n) ? n : n.name); } catch { sym = undefined; }
      for (const d of declFns(sym)) { if (d !== node) rec.refs.add(key(d)); analyse(d); }
    }
    ts.forEachChild(n, visit);
  })(node.body ?? node);
  return rec;
}
// roots: every registerCapabilityHandler('<key>', fn) under src/services/ask
const roots = [];
for (const sf of program.getSourceFiles()) {
  if (!isProgramFile(sf) || !sf.fileName.includes(`${path.sep}services${path.sep}ask${path.sep}`)) continue;
  (function visit(n) {
    if (ts.isCallExpression(n) && n.expression.getText() === 'registerCapabilityHandler' && n.arguments.length >= 2 && ts.isStringLiteralLike(n.arguments[0])) {
      const h = n.arguments[1]; const nodes = isFnLike(h) ? [h] : declFns(checker.getSymbolAtLocation(h)); roots.push(...nodes);
    }
    ts.forEachChild(n, visit);
  })(sf);
}
const upper = new Set(); const seen = new Set(); const queue = [];
for (const r of roots) { analyse(r); seen.add(key(r)); queue.push(key(r)); }
while (queue.length) { const rec = info.get(queue.shift()); for (const m of rec.reads) upper.add(m); for (const r of rec.refs) if (!seen.has(r)) { seen.add(r); queue.push(r); } }
// lower bound: direct delegate reads in files under src/services/ask
const lower = new Set();
for (const sf of program.getSourceFiles()) {
  if (!isProgramFile(sf) || !sf.fileName.includes(`${path.sep}services${path.sep}ask${path.sep}`)) continue;
  (function visit(n) {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && READ_METHODS.has(n.expression.name.text)) {
      const m = /([A-Za-z]+)Delegate/.exec(checker.typeToString(checker.getTypeAtLocation(n.expression.expression))); if (m) lower.add(m[1]);
    }
    ts.forEachChild(n, visit);
  })(sf);
}
const { entities } = deriveCatalogue();
const cand = entities.filter((e) => e.disposition === 'CANDIDATE');
const byDomain = {};
for (const e of cand) {
  const d = (byDomain[e.domain] ??= { candidates: 0, lower: 0, upper: 0, fieldsLower: 0, fieldsUpper: 0, fields: 0, unreachable: [] });
  d.candidates += 1; d.fields += e.candidateFields;
  if (lower.has(e.entity)) { d.lower += 1; d.fieldsLower += e.candidateFields; }
  if (upper.has(e.entity)) { d.upper += 1; d.fieldsUpper += e.candidateFields; } else d.unreachable.push(e.entity);
}
const total = Object.values(byDomain).reduce((a, d) => ({ c: a.c + d.candidates, l: a.l + d.lower, u: a.u + d.upper, f: a.f + d.fields, fl: a.fl + d.fieldsLower, fu: a.fu + d.fieldsUpper }), { c: 0, l: 0, u: 0, f: 0, fl: 0, fu: 0 });
const pct = (a, b) => `${((100 * a) / b).toFixed(0)}%`;
console.log(`Ask data-point reachability baseline (Phase 0c): ${roots.length} propose-time handler roots\n`);
console.log('domain'.padEnd(28), 'entities'.padStart(9), 'direct'.padStart(8), 'reachable'.padStart(10), 'data pts'.padStart(9), 'direct%'.padStart(8), 'reach%'.padStart(8));
for (const [name, d] of Object.entries(byDomain)) console.log(name.padEnd(28), String(d.candidates).padStart(9), String(d.lower).padStart(8), String(d.upper).padStart(10), String(d.fields).padStart(9), pct(d.fieldsLower, d.fields).padStart(8), pct(d.fieldsUpper, d.fields).padStart(8));
console.log('TOTAL'.padEnd(28), String(total.c).padStart(9), String(total.l).padStart(8), String(total.u).padStart(10), String(total.f).padStart(9), pct(total.fl, total.f).padStart(8), pct(total.fu, total.f).padStart(8));
console.log('\n(direct% / reach% weight each entity by its candidate data points; an entity read by Ask does not mean every one of its fields is readable.)');
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ generatedAt: new Date().toISOString(), roots: roots.length, total, byDomain }, null, 2));
