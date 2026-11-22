#!/usr/bin/env node
// BICC-1A.1: the authoritative, reproducible deterministic-reach inventory (plan docs/architecture/ASK_COZY_BEST_IN_CLASS_CONVERSATIONAL_CONCIERGE_IMPLEMENTATION_PLAN.md).
// Offline, no database, no network. It classifies every registered operation and every catalogue data point so the reach denominator and the missing-target list
// are generated, not hand-counted (BICC-OPS-004). It claims no gate: it produces evidence only.
//
//   node scripts/ask-bicc-reach-inventory.js [--json=out.json] [--md=out.md]
const fs = require('node:fs');
const path = require('node:path');
const BACKEND = path.resolve(__dirname, '..');
process.env.TS_NODE_TRANSPILE_ONLY = process.env.TS_NODE_TRANSPILE_ONLY || 'true';
process.env.TS_NODE_PROJECT = process.env.TS_NODE_PROJECT || path.join(BACKEND, 'tsconfig.test-cache.json');
require(path.join(BACKEND, 'node_modules/ts-node/register'));

const ask = (p) => require(path.join(BACKEND, 'src/services/ask', p));
const { ASK_OPERATION_DEFINITIONS } = ask('askOperationRegistry.ts');
const { isWriteCapableOperation } = ask('support/writeCapability.ts');
const cert = ask('fastPath/fastPathCertificates.ts');
const { DATA_POINT_DEFINITIONS, resolveDataPoint } = ask('dataPoint/dataPointCatalogue.ts');

const args = process.argv.slice(2);
const val = (name) => (args.find((a) => a.startsWith(`--${name}=`)) ?? '').slice(name.length + 3) || null;

// ---------------- operations ----------------
const rulesByOp = new Map();
for (const rule of cert.FAST_PATH_RULES) rulesByOp.set(rule.operationId, [...(rulesByOp.get(rule.operationId) ?? []), rule]);
function operationRoute(id, def) {
  if (def.safetyClass && String(def.safetyClass).endsWith('_BOUNDARY')) return 'SAFETY_BOUNDARY';
  if (!def.messageRoutable) return 'NOT_MESSAGE_ROUTABLE';
  if (isWriteCapableOperation(id)) return 'WRITE_PREVIEW_ONLY';
  const rules = rulesByOp.get(id) ?? [];
  if (rules.some((rule) => rule.status === 'CERTIFIED')) return 'CERTIFIED_FAST_PATH';
  if (cert.PROVISIONAL_READ_OPERATIONS.has(id)) return 'PROVISIONAL_READ';
  if (rules.length) return 'DEMOTED_FAST_PATH_ONLY';
  return 'CLASSIFIER_OR_CLARIFICATION_ONLY';
}
const operations = Object.entries(ASK_OPERATION_DEFINITIONS).map(([id, def]) => ({
  id, family: def.family, executionMode: def.executionMode, effect: def.semantic?.effect ?? null, messageRoutable: Boolean(def.messageRoutable),
  fastPathRules: (rulesByOp.get(id) ?? []).length, fastPathCertified: (rulesByOp.get(id) ?? []).filter((r) => r.status === 'CERTIFIED').length, route: operationRoute(id, def),
})).sort((a, b) => a.id.localeCompare(b.id));
const routeCounts = {}; for (const op of operations) routeCounts[op.route] = (routeCounts[op.route] ?? 0) + 1;

// ---------------- data points ----------------
const basic = JSON.parse(fs.readFileSync(path.join(BACKEND, 'tests/fixtures/askBasicQuestions.json'), 'utf8'));
const testedBy = new Map();
for (const entry of basic) { const point = resolveDataPoint(entry.question); if (point) testedBy.set(point.id, (testedBy.get(point.id) ?? 0) + 1); }
const probesFor = (point) => {
  const cue = point.cues?.[0];
  const bases = point.aliases.length ? point.aliases : [point.label.toLowerCase().replace(/^the /, '')];
  return bases.flatMap((alias) => [cue ? `what is my ${cue} ${alias}` : `what is my ${alias}`, cue ? `what is the ${alias} on my ${cue}` : `what is the ${alias} of my item`, cue ? `when is my ${cue} ${alias}` : `when is my ${alias}`]);
};
const dataPoints = DATA_POINT_DEFINITIONS.map((point) => {
  const probes = probesFor(point);
  const hits = new Set(probes.map((probe) => resolveDataPoint(probe)?.id ?? null));
  const competing = [...hits].filter((id) => id && id !== point.id);
  const own = hits.has(point.id);
  const status = own ? (competing.length ? 'REACHABLE_WITH_COLLISIONS' : 'REACHABLE') : (competing.length ? 'SHADOWED_BY_OTHER_POINT' : 'NOT_REACHED_BY_ALIAS');
  const gap = status === 'REACHABLE' ? null : status === 'NOT_REACHED_BY_ALIAS' ? 'MISSING_ALIAS_OR_CUE' : 'ALIAS_COLLISION';
  return { id: point.id, domain: point.domain, entity: point.entity, family: point.family, audience: point.audience, aliases: point.aliases.length, hasCue: Boolean(point.cues?.length), status, gap, competing, probes: probes.length, tunedQuestions: testedBy.get(point.id) ?? 0 };
}).sort((a, b) => a.id.localeCompare(b.id));
const statusCounts = {}; for (const p of dataPoints) statusCounts[p.status] = (statusCounts[p.status] ?? 0) + 1;
const ids = dataPoints.map((p) => p.id);

const inventory = {
  scope: 'DETERMINISTIC_REACH_EVIDENCE_NO_GATE_CLAIMED',
  operations: { total: operations.length, byRoute: routeCounts, rows: operations },
  dataPoints: { total: dataPoints.length, byStatus: statusCounts, duplicateIds: ids.length - new Set(ids).size, untuned: dataPoints.filter((p) => !p.tunedQuestions).length, rows: dataPoints },
  missingTargets: dataPoints.filter((p) => p.gap).map((p) => ({ id: p.id, gap: p.gap, competing: p.competing })),
};
if (val('json')) fs.writeFileSync(val('json'), JSON.stringify(inventory, null, 2));
if (val('md')) {
  const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`;
  const lines = [
    '# Ask Cozy BICC — Deterministic Reach Inventory', '',
    '**Slice:** `BICC-1A.1`. **Generated by:** `node apps/backend/scripts/ask-bicc-reach-inventory.js --md=<file>` (offline; no database or network). **Claims no gate.**', '',
    '## 1. Operations', '', `${inventory.operations.total} registered operations (generated from \`ASK_OPERATION_DEFINITIONS\`, not hand-counted, BICC-OPS-004).`, '',
    '| Route today | Operations |', '|---|---|', ...Object.entries(routeCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| \`${k}\` | ${v} |`), '',
    'Routes: `CERTIFIED_FAST_PATH` executes deterministically; `PROVISIONAL_READ` may start a harmless read; `DEMOTED_FAST_PATH_ONLY` has rules that are demoted (no certificate); `CLASSIFIER_OR_CLARIFICATION_ONLY` is reached only through the local classifier or a clarification; `WRITE_PREVIEW_ONLY` may only open a validated preview; `SAFETY_BOUNDARY` and `NOT_MESSAGE_ROUTABLE` are outside message routing.', '',
    '## 2. Data points', '', `${inventory.dataPoints.total} catalogue data points. A point is **reachable** when a probe built from its own aliases and cue resolves to it.`, '',
    '| Status | Data points | Share |', '|---|---|---|', ...Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| \`${k}\` | ${v} | ${pct(v, dataPoints.length)} |`), '',
    `Data points with no tuning question (\`askBasicQuestions.json\`): **${inventory.dataPoints.untuned}** of ${dataPoints.length}.`, '',
    '## 3. Missing-target list', '',
    inventory.missingTargets.length ? ['| Data point | Gap class | Competing point(s) |', '|---|---|---|', ...inventory.missingTargets.map((m) => `| \`${m.id}\` | ${m.gap === 'MISSING_ALIAS_OR_CUE' ? 'missing alias or cue (parser/catalogue gap)' : 'alias collision (entity/filter gap)'} | ${m.competing.map((c) => `\`${c}\``).join(', ') || '—'} |`)].join('\n') : 'None: every data point is reachable by its own aliases.', '',
    '## 4. Limits', '',
    '- Probes are generated from the catalogue itself, so they measure whether the catalogue can reach its own entries, not whether real homeowner phrasings do (that is the held-out measure, `BICC-GATE-001`/`-003`).',
    '- Entity-level data reachability (which database entities Ask can read) is measured separately by `scripts/ask-data-reachability.js`.',
    '- Gap classes available beyond these two (unavailable canonical reader, intentional boundary) need a reader and boundary inventory and are not derived here.', '',
  ];
  fs.writeFileSync(val('md'), lines.join('\n'));
}
console.log(`operations ${operations.length} (${Object.entries(routeCounts).map(([k, v]) => `${k} ${v}`).join(', ')})`);
console.log(`data points ${dataPoints.length} (${Object.entries(statusCounts).map(([k, v]) => `${k} ${v}`).join(', ')}); untuned ${inventory.dataPoints.untuned}`);
console.log(`missing targets ${inventory.missingTargets.length}`);
