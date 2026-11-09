// Scores compound prompts (tests/fixtures/askCompoundCorpus.js). A row lists the operations whose data a correct answer needs (`needs`) and the ones that
// can answer all of it alone today (`full`). Shared by scripts/ask-compound-sweep.js and tests/ask/compoundSweepRatchet.test.js.
// The caller must have registered ts-node first.
const path = require('node:path');

const BACKEND = path.resolve(__dirname, '..', '..');
const BASELINE_PATH = path.join(BACKEND, 'tests/fixtures/askCompoundSweepBaseline.json');
const RANK = { FULL: 3, PARTIAL: 2, CLARIFY: 1, WRONG: 0, FALLBACK: 0 };

function scoreRow(row, decision) {
  const routed = decision.operation.operationId;
  const candidates = decision.candidates.map((candidate) => candidate.operationId);
  if (decision.stage === 'CLARIFICATION') return { outcome: 'CLARIFY', got: `CLARIFY[${candidates.slice(0, 3).join(',')}]` };
  if (decision.stage === 'REMOTE_FALLBACK') return { outcome: 'FALLBACK', got: 'GROUNDED_GUIDANCE' };
  if (row.full.includes(routed)) return { outcome: 'FULL', got: routed };
  if (row.needs.includes(routed)) return { outcome: 'PARTIAL', got: routed };
  return { outcome: 'WRONG', got: routed };
}

function runCompoundSweep(corpus) {
  const { resolveAskRoutingCascade } = require(path.join(BACKEND, 'src/services/ask/askRoutingCascade.ts'));
  return corpus.map((row) => {
    const decision = resolveAskRoutingCascade(row.prompt, { localRoutingEnabled: true, classifierEnabled: true, embeddingRetrievalEnabled: true, propertyId: 'sweep-property' });
    return { prompt: row.prompt, needs: row.needs, full: row.full, ...scoreRow(row, decision) };
  });
}

function summarize(results) {
  const total = { FULL: 0, PARTIAL: 0, CLARIFY: 0, WRONG: 0, FALLBACK: 0 };
  for (const result of results) total[result.outcome] += 1;
  return { n: results.length, ...total };
}

const baselineFrom = (results) => ({ version: 1, outcomes: Object.fromEntries(results.map((r) => [r.prompt, r.outcome]).sort(([a], [b]) => a.localeCompare(b))) });

/** A prompt must not do worse than the baseline recorded for it; a better outcome is allowed and is recorded with --write-baseline. */
function compareToBaseline(results, baseline) {
  const worse = []; const better = []; const unrecorded = [];
  for (const result of results) {
    const recorded = baseline.outcomes[result.prompt];
    if (recorded === undefined) { unrecorded.push(result); continue; }
    if (RANK[result.outcome] < RANK[recorded]) worse.push({ ...result, was: recorded });
    else if (RANK[result.outcome] > RANK[recorded]) better.push({ ...result, was: recorded });
  }
  const removed = Object.keys(baseline.outcomes).filter((prompt) => !results.some((r) => r.prompt === prompt));
  return { worse, better, unrecorded, removed };
}

module.exports = { BACKEND, BASELINE_PATH, RANK, runCompoundSweep, summarize, baselineFrom, compareToBaseline };
