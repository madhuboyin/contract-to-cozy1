// FR-FAST-2 / FR-FAST-8 / FR-FAST-9: the pure core of fast-path certification. No I/O, no ts-node: the resolver is injected, so the logic is testable on synthetic rows.
//
// A SEALED SET is a human-confirmed file (never authored by whoever wrote the rules, FR-FAST-8):
//   { "id": "sealed-2026-12-a", "humanConfirmed": true, "confirmedBy": "<role>", "rows": [
//       { "family": "f001", "prompt": "...", "kind": "POSITIVE" | "ADJACENT_NEGATIVE" | "CROSS_OPERATION",
//         "pool": "MAINTENANCE_TASK_CREATE",          // the operation whose rule pool this row exercises
//         "expected": "MAINTENANCE_TASK_CREATE" | "<other op>" | null,   // POSITIVE: the pool op; negatives: the op the prompt really belongs to (null = none)
//         "rules": ["DET_..._01"] } ] }               // optional: the rules this negative is exposed to; default = every rule of the pool
// Perturbations and paraphrases of one prompt share a `family` (FR-EVAL-4), and a family is one trial.
//
// Per operation (the rule pool, FR-FAST-8: related rules are certified together):
//   trials              = distinct families of the pool's rows
//   error               = a rule of the pool CLAIMED the prompt (resolved to the pool operation) although `expected` is not the pool operation
//   incorrectUpperBound = one-sided 95% Wilson upper bound of errors / trials. 0 errors needs >= 381 trials to be below 1% (3.84 / (381 + 3.84) = 0.00998).
//   mixture             = positives are at most half of the trials, and every rule has at least 30 adjacent and 30 cross-operation negatives (FR-FAST-9).
const MIN_TRIALS = 381; const MAX_ERROR = 0.01; const MIN_ADJACENT = 30; const MIN_CROSS = 30; const MAX_POSITIVE_SHARE = 0.5;
const Z = 1.96;

const wilsonUpper = (errors, trials) => {
  if (trials <= 0) return 1;
  const p = errors / trials; const z2 = Z * Z;
  return (p + z2 / (2 * trials) + Z * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials))) / (1 + z2 / trials);
};

/** Structural problems that make a sealed set unusable, before any rule is looked at. */
function validateSealedSet(set, { tuningPrompts = new Set() } = {}) {
  const issues = [];
  if (!set || typeof set !== 'object') return ['sealed set is not an object'];
  if (!set.id) issues.push('sealed set has no id');
  if (set.humanConfirmed !== true) issues.push('sealed set is not marked humanConfirmed (FR-EVAL-1b): the author of the rules may not label the set that certifies them');
  if (!set.confirmedBy) issues.push('sealed set does not say who confirmed it');
  if (!Array.isArray(set.rows) || !set.rows.length) return [...issues, 'sealed set has no rows'];
  const kinds = new Set(['POSITIVE', 'ADJACENT_NEGATIVE', 'CROSS_OPERATION']);
  set.rows.forEach((row, i) => {
    if (!row.family || !row.prompt || !row.pool || !kinds.has(row.kind)) issues.push(`row ${i}: needs family, prompt, pool and a kind of ${[...kinds].join(' | ')}`);
    else if (row.kind === 'POSITIVE' && row.expected !== row.pool) issues.push(`row ${i}: a POSITIVE row must expect its own pool operation`);
    else if (row.kind !== 'POSITIVE' && row.expected === row.pool) issues.push(`row ${i}: a negative row must not expect the pool operation`);
    if (tuningPrompts.has(String(row.prompt).trim().toLowerCase())) issues.push(`row ${i}: prompt is also in a tuning corpus; the sealed set must not overlap it (FR-FAST-8)`);
  });
  return issues;
}

/**
 * Run every row through the resolver and compute one evidence record per operation pool.
 * @param resolve (prompt) => { operationId, ruleId|null }
 * @param rulesOf (operationId) => string[]  the pool's current rule ids
 * @param adjacentOf (operationId) => string[]  the operations the adjacency manifest names
 */
function evaluateSealedSet({ rows, resolve, rulesOf, adjacentOf }) {
  const pools = new Map();
  for (const row of rows) {
    if (!pools.has(row.pool)) pools.set(row.pool, []);
    pools.get(row.pool).push(row);
  }
  const result = {};
  for (const [pool, poolRows] of pools) {
    const rules = [...rulesOf(pool)].sort();
    const families = new Set(poolRows.map((row) => row.family));
    const positiveFamilies = new Set(poolRows.filter((row) => row.kind === 'POSITIVE').map((row) => row.family));
    const perRule = Object.fromEntries(rules.map((id) => [id, { fired: 0, wrong: 0, adjacentRows: 0, crossRows: 0, wrongPrompts: [] }]));
    const errorFamilies = new Set();
    const adjacentCovered = new Set();
    let adjacentWrong = 0; let crossWrong = 0;
    for (const row of poolRows) {
      const resolved = resolve(row.prompt);
      const claimedBy = resolved.operationId === pool && resolved.ruleId && perRule[resolved.ruleId] ? resolved.ruleId : null;
      const exposed = row.rules?.length ? row.rules.filter((id) => perRule[id]) : rules;
      if (row.kind === 'ADJACENT_NEGATIVE') { exposed.forEach((id) => { perRule[id].adjacentRows += 1; }); if (row.expected) adjacentCovered.add(row.expected); }
      if (row.kind === 'CROSS_OPERATION') exposed.forEach((id) => { perRule[id].crossRows += 1; });
      if (claimedBy) {
        perRule[claimedBy].fired += 1;
        if (row.expected !== pool) {
          perRule[claimedBy].wrong += 1; perRule[claimedBy].wrongPrompts.push(row.prompt); errorFamilies.add(row.family);
          if (row.kind === 'ADJACENT_NEGATIVE') adjacentWrong += 1; else if (row.kind === 'CROSS_OPERATION') crossWrong += 1;
        }
      }
    }
    const errors = errorFamilies.size;
    const incorrectUpperBound = wilsonUpper(errors, families.size);
    const requiredAdjacent = adjacentOf(pool);
    const mixtureIssues = [];
    if (positiveFamilies.size > families.size * MAX_POSITIVE_SHARE) mixtureIssues.push(`positives are ${positiveFamilies.size} of ${families.size} trials, above ${MAX_POSITIVE_SHARE * 100}%`);
    const leaveOneRuleOut = rules.every((id) => {
      const others = rules.filter((other) => other !== id).reduce((sum, other) => sum + perRule[other].wrong, 0);
      return perRule[id].wrong === 0 && wilsonUpper(others, families.size) < MAX_ERROR;
    });
    const rows_ = Object.fromEntries(rules.map((id) => [id, {
      ...perRule[id],
      evidence: {
        sealedFamilies: families.size, incorrectHighConfidence: errors, incorrectUpperBound,
        adjacentNegativeRows: perRule[id].adjacentRows, crossOperationRows: perRule[id].crossRows,
        adjacentNegativesPassed: adjacentWrong === 0, crossOperationNegativesPassed: crossWrong === 0,
        perRuleFailures: perRule[id].wrong, leaveOneRuleOutPassed: leaveOneRuleOut,
        poolRuleIds: rules, adjacentOperationIds: [...adjacentCovered].sort(),
      },
    }]));
    result[pool] = { pool, trials: families.size, errors, incorrectUpperBound, mixtureIssues, requiredAdjacent, adjacentCovered: [...adjacentCovered].sort(), rules: rows_ };
  }
  return result;
}

/** Which pools have no rows at all: they stay demoted and the report says so. */
const uncoveredPools = (evaluated, allPools) => allPools.filter((pool) => !evaluated[pool]);

/** FR-FAST-8: a rule version that already failed on a sealed set may not be certified on it again. `attempts` = [{ ruleId, version, sealedSetId, passed }]. */
const reusedAfterFailure = (attempts, ruleId, version, sealedSetId) => attempts.some((a) => a.ruleId === ruleId && a.sealedSetId === sealedSetId && a.version !== version && !a.passed);

module.exports = { MIN_TRIALS, MAX_ERROR, MIN_ADJACENT, MIN_CROSS, MAX_POSITIVE_SHARE, wilsonUpper, validateSealedSet, evaluateSealedSet, uncoveredPools, reusedAfterFailure };
