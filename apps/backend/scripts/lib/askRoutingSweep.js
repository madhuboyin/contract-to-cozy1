// Shared by scripts/ask-routing-sweep.js and tests/ask/routingSweepRatchet.test.js so the command line and CI score the corpus identically.
// The caller must have registered ts-node first (the source it loads is TypeScript).
const path = require('node:path');

const BACKEND = path.resolve(__dirname, '..', '..');
const BASELINE_PATH = path.join(BACKEND, 'tests/fixtures/askRoutingSweepBaseline.json');

// Operations that would still give a correct answer for the same intent. Keep this short: every entry hides a real gap.
const EQUIVALENT = {
  WORK_OVERVIEW: ['HOME_ACTIONS', 'HOME_WORK_ITEMS'], HOME_ACTIONS: ['WORK_OVERVIEW', 'HOME_WORK_ITEMS'],
  APPLIANCE_FAILURE_RISK: ['HOME_STATUS_BOARD', 'MAINTENANCE_FORECAST', 'INVENTORY_LOOKUP'], MAINTENANCE_FORECAST: ['APPLIANCE_FAILURE_RISK'],
  REFINANCE_RATE_MONITOR: ['REFINANCE_ANALYSIS'], MAINTENANCE_BUDGET_FORECAST: ['CAPITAL_RESERVE_PLAN'], CAPITAL_RESERVE_PLAN: ['MAINTENANCE_BUDGET_FORECAST'],
  INSPECTION_FINDINGS: ['INSPECTION_REPORT_FINDINGS'], INSPECTION_REPORT_FINDINGS: ['INSPECTION_FINDINGS'], INSPECTION_REPORTS: ['INSPECTION_REPORT_FINDINGS'],
  QUOTE_COMPARISON_REVIEW: ['SERVICE_PRICE_CHECKS'], SERVICE_PRICE_CHECKS: ['QUOTE_COMPARISON_REVIEW'],
  COVERAGE_GAPS: ['COVERAGE_REVIEW_STATUS'], COVERAGE_REVIEW_STATUS: ['COVERAGE_GAPS'],
  HOME_CHANGE_SUMMARY: ['HOME_TIMELINE_EVENTS'], HOME_TIMELINE_EVENTS: ['PROJECT_TRACKER_PROJECTS'], PROJECT_TRACKER_PROJECTS: ['HOME_TIMELINE_EVENTS', 'DIY_PROJECTS'],
  PAST_HAZARD_EXPOSURE: ['ENVIRONMENT_REPORT'], OWNERSHIP_COSTS: ['SAVINGS_OPPORTUNITIES'], REPLACEMENT_GUIDANCE: ['HVAC_DECISION_START'],
  HVAC_DECISION_START: ['REPLACEMENT_GUIDANCE'], MAINTENANCE_TASK_UPDATE: ['OPERATIONAL_WORK_UPDATE'], BUYER_NEGOTIATION_READINESS: ['INSPECTION_NEGOTIATION_PACKAGE'],
  INSPECTION_NEGOTIATION_PACKAGE: ['BUYER_NEGOTIATION_READINESS'], BUYER_PLAN_STATUS: ['BUYER_DEADLINES'], PROPERTY_SUMMARY: ['INVENTORY_LOOKUP'],
  HOME_DEADLINE_MONITOR: ['HOME_ACTIONS'], MAJOR_EVENT_ENTRY: ['SELLER_PREP_CHECKLIST'], SELLER_PREP_CHECKLIST: ['MAJOR_EVENT_ENTRY'],
};

/** Scores one routing decision against the operations that would be a correct answer for the prompt. */
function classifyDecision(decision, acceptable) {
  const candidates = decision.candidates.map((candidate) => candidate.operationId);
  const routed = decision.operation.operationId;
  const outcome = decision.stage === 'CLARIFICATION' ? (candidates.some((id) => acceptable.has(id)) ? 'clarOk' : 'clarBad')
    : decision.stage === 'REMOTE_FALLBACK' ? 'fb'
      : acceptable.has(routed) ? 'hit' : 'mis';
  return { outcome, routed, candidates, got: decision.stage === 'CLARIFICATION' ? `CLARIFY[${candidates.slice(0, 3).join(',')}]` : routed };
}

/** Runs every prompt through the real routing cascade with the production options and scores it against the expected operation. */
function runSweep(corpus, { only = [] } = {}) {
  const { resolveAskRoutingCascade } = require(path.join(BACKEND, 'src/services/ask/askRoutingCascade.ts'));
  const { ASK_OPERATION_DEFINITIONS } = require(path.join(BACKEND, 'src/services/ask/askOperationRegistry.ts'));
  const perOp = {};
  const hijack = {};
  const unknownOperations = [];
  for (const [operationId, prompts] of Object.entries(corpus)) {
    if (only.length && !only.includes(operationId)) continue;
    if (!ASK_OPERATION_DEFINITIONS[operationId]) { unknownOperations.push(operationId); continue; }
    const row = perOp[operationId] = { hit: 0, clarOk: 0, clarBad: 0, fb: 0, mis: 0, n: 0, hits: [], misrouted: [], misses: [] };
    const acceptable = new Set([operationId, ...(EQUIVALENT[operationId] ?? [])]);
    for (const message of prompts) {
      const decision = resolveAskRoutingCascade(message, { localRoutingEnabled: true, classifierEnabled: true, embeddingRetrievalEnabled: true, propertyId: 'sweep-property' });
      const { outcome, routed, got } = classifyDecision(decision, acceptable);
      row.n += 1; row[outcome] += 1;
      if (outcome === 'hit') row.hits.push(message);
      if (outcome === 'mis') { hijack[routed] = (hijack[routed] ?? 0) + 1; row.misrouted.push(message); }
      if (outcome !== 'hit') row.misses.push({ message, outcome, got });
    }
  }
  const total = { hit: 0, clarOk: 0, clarBad: 0, fb: 0, mis: 0, n: 0 };
  for (const row of Object.values(perOp)) for (const key of Object.keys(total)) total[key] += row[key];
  return { total, perOp, hijack, unknownOperations };
}

/** The baseline records which prompts route correctly and which route to a wrong operation today. */
function baselineFrom(result) {
  const knownGood = {}; const knownMisrouted = {};
  for (const operationId of Object.keys(result.perOp).sort()) {
    const row = result.perOp[operationId];
    if (row.hits.length) knownGood[operationId] = [...row.hits].sort();
    if (row.misrouted.length) knownMisrouted[operationId] = [...row.misrouted].sort();
  }
  return { version: 1, knownGood, knownMisrouted };
}

/**
 * The ratchet: a prompt that routed correctly must still do so, and a prompt must not newly route to a wrong operation. Everything else
 * (a fallback becoming a hit, a new prompt that falls back) is allowed; improvements are recorded with --write-baseline.
 */
function compareToBaseline(result, baseline) {
  const lost = []; const newMisroutes = [];
  const known = (map, operationId) => new Set(map?.[operationId] ?? []);
  for (const [operationId, prompts] of Object.entries(baseline.knownGood ?? {})) {
    const row = result.perOp[operationId];
    if (!row) continue;
    const hits = new Set(row.hits);
    const inCorpus = new Set([...row.hits, ...row.misses.map((miss) => miss.message)]);
    for (const message of prompts) if (inCorpus.has(message) && !hits.has(message)) lost.push({ operationId, message, now: row.misses.find((miss) => miss.message === message)?.got ?? 'unknown' });
  }
  for (const [operationId, row] of Object.entries(result.perOp)) {
    const allowed = known(baseline.knownMisrouted, operationId);
    for (const message of row.misrouted) if (!allowed.has(message)) newMisroutes.push({ operationId, message, now: row.misses.find((miss) => miss.message === message)?.got ?? 'unknown' });
  }
  return { lost, newMisroutes };
}

/**
 * The same corpus with the model-assisted router in front of the generic fallback and clarification, using a real model provider.
 * Needs network and a working GEMINI_API_KEY; counts how often the model was unavailable so a dead key is not mistaken for a bad model.
 */
async function runModelSweep(corpus, { provider, only = [], limit = Infinity }) {
  const { resolveAskRoutingCascade } = require(path.join(BACKEND, 'src/services/ask/askRoutingCascade.ts'));
  const { ASK_OPERATION_DEFINITIONS } = require(path.join(BACKEND, 'src/services/ask/askOperationRegistry.ts'));
  const { refineAskRoutingWithModel } = require(path.join(BACKEND, 'src/services/ask/askModelRouter.ts'));
  const eligible = Object.values(ASK_OPERATION_DEFINITIONS).filter((definition) => !definition.safetyClass.endsWith('_BOUNDARY')).map((definition) => definition.operationId);
  const local = { hit: 0, mis: 0, fb: 0, clar: 0, n: 0 }; const withModel = { hit: 0, mis: 0, fb: 0, clar: 0, n: 0 };
  const modelOutcomes = {}; const changed = []; let calls = 0;
  for (const [operationId, prompts] of Object.entries(corpus)) {
    if (only.length && !only.includes(operationId)) continue;
    if (!ASK_OPERATION_DEFINITIONS[operationId]) continue;
    const acceptable = new Set([operationId, ...(EQUIVALENT[operationId] ?? [])]);
    for (const message of prompts) {
      const options = { localRoutingEnabled: true, classifierEnabled: true, embeddingRetrievalEnabled: true, propertyId: 'sweep-property' };
      const decision = resolveAskRoutingCascade(message, options);
      const before = classifyDecision(decision, acceptable).outcome;
      let after = before; let refined = decision;
      if ((decision.stage === 'REMOTE_FALLBACK' || decision.stage === 'CLARIFICATION') && calls < limit) {
        calls += 1;
        refined = await refineAskRoutingWithModel(decision, { enabled: true, message, provider, eligibleOperationIds: eligible, onOutcome: (outcome) => { modelOutcomes[outcome] = (modelOutcomes[outcome] ?? 0) + 1; } });
        after = classifyDecision(refined, acceptable).outcome;
      }
      const bucket = (outcome) => (outcome === 'clarOk' || outcome === 'clarBad' ? 'clar' : outcome);
      local.n += 1; local[bucket(before)] += 1; withModel.n += 1; withModel[bucket(after)] += 1;
      if (before !== after) changed.push({ operationId, message, before, after, got: classifyDecision(refined, acceptable).got });
    }
  }
  return { local, withModel, modelOutcomes, changed, modelCalls: calls };
}

module.exports = { BACKEND, BASELINE_PATH, EQUIVALENT, classifyDecision, runSweep, runModelSweep, baselineFrom, compareToBaseline };
