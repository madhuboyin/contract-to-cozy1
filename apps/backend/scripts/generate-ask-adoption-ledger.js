#!/usr/bin/env node
// Writes docs/architecture/ask-cozy/presentation-audit/ASK_PRESENTATION_ADOPTION_LEDGER.md from the operation registry.
// Usage (from apps/backend): node scripts/generate-ask-adoption-ledger.js
require('ts-node/register/transpile-only');
const fs = require('node:fs');
const path = require('node:path');
const { buildAdoptionLedger, ADOPTION_CLASSES } = require('../src/services/ask/presentation/adoptionLedger.ts');

const out = path.resolve(__dirname, '../../../docs/architecture/ask-cozy/presentation-audit/ASK_PRESENTATION_ADOPTION_LEDGER.md');
const ledger = buildAdoptionLedger();
const counts = Object.fromEntries(ADOPTION_CLASSES.map((cls) => [cls, ledger.filter((entry) => entry.adoptionClass === cls).length]));
const LABEL = {
  ALREADY_COMPLIANT: 'Already compliant (covered by a fixture or journey test; not runtime-verified)',
  REQUIRES_COLLECTION_ADOPTION: 'Requires collection adoption',
  REQUIRES_TRUST_ADOPTION: 'Requires trust or rationale adoption',
  COMPACT_RECEIPT: 'Compact receipt: no rich migration needed',
  SPECIALIZED_REVIEW_LATER: 'Specialized workflow requiring later review',
  NOT_APPLICABLE: 'Not applicable (boundary operations)',
};
const lines = [
  '# Ask Presentation Adoption Ledger',
  '',
  '**Generated:** by `apps/backend/scripts/generate-ask-adoption-ledger.js` from the live operation registry. Do not edit by hand.',
  '',
  `**Operations:** ${ledger.length}`,
  '',
  'Each registered Ask operation has exactly one class. The class is derived from registry facts (family, allowed block types) plus an explicit',
  'list of operations this effort reviewed (`REVIEWED_OPERATIONS` in `apps/backend/src/services/ask/presentation/adoptionLedger.ts`). A test fails',
  'when an operation has no class or this file is out of date. "Already compliant" means covered by a deterministic fixture or contract-level',
  'journey test, not verified in a browser or against a live backend.',
  '',
  '| Class | Operations |',
  '|---|---:|',
  ...ADOPTION_CLASSES.map((cls) => `| ${LABEL[cls]} | ${counts[cls]} |`),
  '',
];
for (const cls of ADOPTION_CLASSES) {
  lines.push(`## ${LABEL[cls]}`, '', '| Operation | Why |', '|---|---|');
  for (const entry of ledger.filter((item) => item.adoptionClass === cls)) lines.push(`| \`${entry.operationId}\` | ${entry.reason.replace(/\|/g, '/')} |`);
  lines.push('');
}
fs.writeFileSync(out, lines.join('\n'));
console.log(`wrote ${out} (${ledger.length} operations)`, counts);
