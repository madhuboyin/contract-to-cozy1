#!/usr/bin/env node
// Writes the real presentation blocks the cross-domain executor builds for a fixed set of prompts, for the browser acceptance spec (apps/frontend/e2e/ask/compactAnswers.spec.ts).
// The browser spec serves these through its Ask API fixture, so it measures what the backend really emits, not a hand-written copy.
//   node scripts/ask-dump-cross-domain-answers.js            write apps/frontend/e2e/ask/compactAnswerBlocks.json
//   node scripts/ask-dump-cross-domain-answers.js --check    exit 1 if the committed file is out of date
const fs = require('node:fs'); const path = require('node:path');
process.env.TS_NODE_TRANSPILE_ONLY = 'true';
require('ts-node').register({ transpileOnly: true });
const X = require('../src/services/ask/semantic/crossDomain/crossDomainExecutor.ts');
const { buildSeededCrossDomainSnapshot } = require('../src/services/ask/semantic/crossDomain/index.ts');

const OUT = path.resolve(__dirname, '../../frontend/e2e/ask/compactAnswerBlocks.json');
const base = buildSeededCrossDomainSnapshot();
const project = (id, title, permitStatus) => ({ id, propertyId: base.propertyId, title, status: 'ACTIVE', permitStatus });
const CASES = {
  permitsUnknownOnly: { prompt: 'which active projects still need a permit?', patch: { projects: [project('p-desk', 'Office Desk', 'UNKNOWN')] } },
  permitsMixed: { prompt: 'which active projects still need a permit?', patch: { projects: [project('p-panel', '200A Electrical Panel Upgrade', 'NEEDS_PERMIT'), project('p-deck', 'Deck rebuild', 'UNKNOWN'), project('p-fence', 'Fence repair', 'UNKNOWN')] } },
  ownVsRentComputed: { prompt: 'how long until owning beats renting?', patch: {} },
  ownVsRentMissingRent: { prompt: 'how long until owning beats renting?', patch: { financeSlots: { ...base.financeSlots, monthlyRentCents: null, netHoldCents: 8000000, netRentCents: 31300000, sellHoldRentWinner: 'SELL' } } },
  // Stress shapes: long titles (one with an unbroken token), many rows, and unconfirmed rows together.
  permitsLongAndMany: { prompt: 'which active projects still need a permit?', patch: { projects: [
    project('p1', 'Replace the entire north-facing roof deck and flashing including the skylight curb, the chimney saddle and the valley underlayment', 'NEEDS_PERMIT'),
    project('p2', 'Reinforced-concrete-retaining-wall-with-drainage-and-engineered-footings-along-the-entire-rear-property-line', 'NEEDS_PERMIT'),
    ...Array.from({ length: 6 }, (_, i) => project(`p${i + 3}`, `Kitchen and primary bathroom remodel phase ${i + 1} including plumbing relocation`, 'NEEDS_PERMIT')),
    project('u1', 'Detached garage conversion to an accessory dwelling unit with a separate meter', 'UNKNOWN'),
    project('u2', 'Office Desk', 'UNKNOWN'),
  ] } },
  openClaims: { prompt: 'what claims are open?', patch: {} },
  noWarranty: { prompt: 'which appliances have no warranty?', patch: {} },
  maintenanceNextMonth: { prompt: 'show maintenance tasks due next month', patch: {} },
};

(async () => {
  const out = {};
  for (const [key, { prompt, patch }] of Object.entries(CASES)) {
    const execution = await X.executeCrossDomainSnapshot({ rawText: prompt, snapshot: { ...base, ...patch, ...(patch.financeSlots ? { financeSlots: patch.financeSlots } : {}) }, role: 'OWNER', propertyAuthorized: true });
    const operation = X.buildOperationResultFromCrossDomainExecution(execution);
    out[key] = { question: prompt, status: operation.status, blocks: operation.blocks };
  }
  const text = `${JSON.stringify(out, null, 1)}\n`;
  if (process.argv.includes('--check')) { process.exit(fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8') === text ? 0 : 1); }
  fs.writeFileSync(OUT, text); console.log(`wrote ${Object.keys(out).length} cases to ${path.relative(process.cwd(), OUT)}`);
  process.exit(0);
})();
