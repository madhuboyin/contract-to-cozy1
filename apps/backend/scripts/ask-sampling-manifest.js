#!/usr/bin/env node
// Phase 0c: the complete sampling manifest of the reliability FRD §10.1 (PROPOSED allocations, provisional per owner decision D4):
// which evaluation units must exist, how many rows each needs (tuning / calibration / sealed), and how many must be human-confirmed.
// Derived from the live operation registry and the committed data-point catalogue, so the units cannot silently go stale (FR-EVAL-9).
// It also reports today's coverage of the operation units by the existing routing corpora (which are NOT the sealed evaluation sets).
//   node scripts/ask-sampling-manifest.js [--write]   --write regenerates tests/fixtures/askSamplingManifest.json
const fs = require('node:fs'); const path = require('node:path');
const BACKEND = path.resolve(__dirname, '..');
process.env.TS_NODE_TRANSPILE_ONLY = process.env.TS_NODE_TRANSPILE_ONLY || 'true';
process.env.TS_NODE_PROJECT = process.env.TS_NODE_PROJECT || path.join(BACKEND, 'tsconfig.test-cache.json');
require(path.join(BACKEND, 'node_modules/ts-node/register'));
const { ASK_OPERATION_DEFINITIONS } = require(path.join(BACKEND, 'src/services/ask/askOperationRegistry.ts'));
const { getAskDomainCommandByOperation } = require(path.join(BACKEND, 'src/services/ask/askDomainCommandRegistry.ts'));
const { deriveCatalogue } = require('./lib/askDataCatalogue');
const MANIFEST = path.join(BACKEND, 'tests/fixtures/askSamplingManifest.json');

const routable = Object.values(ASK_OPERATION_DEFINITIONS).filter((d) => d.messageRoutable && !String(d.safetyClass).endsWith('_BOUNDARY') && d.operationId !== 'GROUNDED_GUIDANCE');
const writeCapable = routable.filter((d) => getAskDomainCommandByOperation(d.operationId));
const { fields } = deriveCatalogue({ includeFields: true });
const coarse = new Set(fields.map((f) => `${f.domain}|${f.family}|${f.sensitivity}`));
const domains = [...new Set(fields.map((f) => f.domain))];

// unit: rows are [tuning, calibration, sealed]; humanConfirmed is the number of those rows a person must confirm (FR-EVAL-1b)
const units = [
  { unit: 'operation', count: routable.length, rows: [30, 20, 30], humanConfirmed: (r) => r[2], note: 'per-operation screening floor; every write-capable operation row also human-confirmed in calibration' },
  { unit: 'data-point-group (coarse)', count: coarse.size, rows: [10, 10, 10], humanConfirmed: (r) => r[2], note: 'domain x value family x sensitivity; members get generated conformance and routing cases (FR-DATA-16)' },
  { unit: 'query-shape x domain', count: 9 * domains.length, rows: [10, 10, 10], humanConfirmed: (r) => r[2], note: 'FR-DATA-10 shapes 1-9' },
  { unit: 'facet-count stratum (1,2,3,4-6)', count: 4, rows: [50, 30, 200], humanConfirmed: (r) => r[2], note: '>= 99 sealed families per stratum (about 200 rows)' },
  { unit: 'facet-count stratum (>6, measurement only)', count: 1, rows: [20, 10, 40], humanConfirmed: (r) => r[2], note: 'not a release gate' },
  { unit: 'stage-one domain selection (pooled)', count: 1, rows: [100, 60, 762], humanConfirmed: (r) => r[2], note: '>= 381 independent families pooled; ~2 rows per family' },
  { unit: 'safety invariants (wrong-write, near-miss, adversarial routing, reader closure)', count: 4, rows: [0, 0, 381], humanConfirmed: (r) => r[2], note: '381 prompts each, zero observed failures' },
  { unit: 'independent human set (distribution-weighted aggregate)', count: 1, rows: [0, 0, 1000], humanConfirmed: (r) => r[2], note: 'written by people who did not build Ask, from home scenarios' },
];
let totals = [0, 0, 0]; let human = 0;
const out = units.map((u) => { const t = u.rows.map((r) => r * u.count); totals = totals.map((x, i) => x + t[i]); const h = u.humanConfirmed(u.rows) * u.count; human += h; return { unit: u.unit, count: u.count, rowsPerUnit: u.rows, totalRows: t, humanConfirmed: h, note: u.note }; });
const manifest = { schemaVersion: 1, status: 'PROPOSED allocations (owner decision D4: provisional until measured)', generatedFrom: { routableOperations: routable.length, writeCapableOperations: writeCapable.length, coarseGroups: coarse.size, domains: domains.length }, units: out, totals: { tuning: totals[0], calibration: totals[1], sealed: totals[2], humanConfirmed: human } };
if (process.argv.includes('--write')) { fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 1)}\n`); console.log(`wrote ${path.relative(process.cwd(), MANIFEST)}`); }

// today's coverage of the operation units by the existing corpora (descriptive only)
const corpora = ['askRoutingCorpus', 'askRoutingHoldoutCorpus', 'askRoutingHoldoutCorpus2'].map((f) => require(path.join(BACKEND, `tests/fixtures/${f}.js`)));
const have = {}; for (const c of corpora) for (const [op, prompts] of Object.entries(c)) have[op] = (have[op] ?? 0) + prompts.length;
const perOp = routable.map((d) => have[d.operationId] ?? 0); const need = 80;
const covered = perOp.filter((n) => n >= need).length; const some = perOp.filter((n) => n > 0).length;
console.log('Ask sampling manifest (Phase 0c, proposed allocations)\n');
console.log('unit'.padEnd(78), 'units'.padStart(6), 'rows/unit'.padStart(12), 'total rows'.padStart(14), 'human'.padStart(7));
for (const u of out) console.log(u.unit.slice(0, 77).padEnd(78), String(u.count).padStart(6), u.rowsPerUnit.join('/').padStart(12), u.totalRows.join('/').padStart(14), String(u.humanConfirmed).padStart(7));
console.log(`\nTOTAL rows tuning ${totals[0]} / calibration ${totals[1]} / sealed ${totals[2]}; human-confirmed ${human}`);
console.log(`\ntoday's coverage of operation units by the existing routing corpora: ${some} of ${routable.length} operations have any prompt; ${covered} have the ${need} proposed rows; median prompts per operation ${perOp.slice().sort((a, b) => a - b)[Math.floor(perOp.length / 2)]}; sealed human-confirmed sets: 0 of ${human} (none exist yet)`);
