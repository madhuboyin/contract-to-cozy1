#!/usr/bin/env node
/**
 * Schema-to-registry drift check (ASK_COZY_CROSS_DOMAIN_SEMANTIC_ARCHITECTURE_FRD.md FR-ONT-6, §19 #5).
 *
 * The entity/field registries are generated from Prisma plus reviewed overrides, and the runtime lexicon is generated from
 * them. This compares the live generated state with the committed snapshot and names every difference.
 *
 * Usage:
 *   node scripts/ask-semantic-registry-drift.js           Report drift (exit 0)
 *   node scripts/ask-semantic-registry-drift.js --check   Exit 1 when the registry or lexicon drifted from the snapshot
 *   node scripts/ask-semantic-registry-drift.js --write   Regenerate the snapshot after the change has been REVIEWED
 *
 * After a schema or catalogue change: run `npx prisma generate`, run this script, review the findings, then `--write`.
 */
const fs = require('node:fs');
const path = require('node:path');
require('ts-node/register/transpile-only');

const {
  buildRegistryDriftSnapshot,
  compareRegistryDrift,
} = require('../src/services/ask/semantic/governance/registryDrift.ts');

const SNAPSHOT_PATH = path.join(__dirname, '../src/services/ask/semantic/governance/registryDriftSnapshot.generated.json');
const args = process.argv.slice(2);
const live = buildRegistryDriftSnapshot();

if (args.includes('--write')) {
  fs.writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(live, null, 2)}\n`);
  console.log(`Wrote ${path.relative(process.cwd(), SNAPSHOT_PATH)} (digest ${live.digest.slice(0, 12)}, ${Object.keys(live.entities).length} entities, ${Object.keys(live.fields).length} fields, ${live.lexicon.lexemeCount} lexemes).`);
  process.exit(0);
}

if (!fs.existsSync(SNAPSHOT_PATH)) {
  console.error('No committed registry snapshot. Run with --write after reviewing the generated registries.');
  process.exit(1);
}
const committed = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
const findings = compareRegistryDrift(committed, live);

if (findings.length === 0) {
  console.log(`No registry drift (digest ${live.digest.slice(0, 12)}; ${Object.keys(live.entities).length} entities, ${Object.keys(live.fields).length} fields, ${live.lexicon.lexemeCount} lexemes).`);
  process.exit(0);
}
console.log(`Registry drift: ${findings.length} finding(s). Review, then regenerate with --write.\n`);
for (const finding of findings) console.log(`  [${finding.kind}] ${finding.subject}: ${finding.detail}`);
process.exit(args.includes('--check') ? 1 : 0);
