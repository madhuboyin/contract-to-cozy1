// tests/unit/homeHabitCoach.test.js
//
// Unit tests for Home Habit Coach business logic.
// Uses Node.js native test runner — no DB, no TS compilation required.
// All logic is inlined from the TypeScript source so tests are self-contained.

const test = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// State transition rules
// (mirrors VALID_STATUSES_FOR in homeHabitCoachService.ts)
// ---------------------------------------------------------------------------

const VALID_STATUSES_FOR = {
  complete: ['ACTIVE', 'SNOOZED'],
  snooze:   ['ACTIVE'],
  skip:     ['ACTIVE', 'SNOOZED'],
  dismiss:  ['ACTIVE', 'SNOOZED', 'SKIPPED'],
  reopen:   ['COMPLETED', 'SKIPPED', 'DISMISSED', 'EXPIRED'],
};

function canTransition(action, fromStatus) {
  return (VALID_STATUSES_FOR[action] ?? []).includes(fromStatus);
}

// complete
test('transition — complete from ACTIVE is allowed', () => {
  assert.equal(canTransition('complete', 'ACTIVE'), true);
});
test('transition — complete from SNOOZED is allowed', () => {
  assert.equal(canTransition('complete', 'SNOOZED'), true);
});
test('transition — complete from COMPLETED is not allowed', () => {
  assert.equal(canTransition('complete', 'COMPLETED'), false);
});
test('transition — complete from DISMISSED is not allowed', () => {
  assert.equal(canTransition('complete', 'DISMISSED'), false);
});
test('transition — complete from EXPIRED is not allowed', () => {
  assert.equal(canTransition('complete', 'EXPIRED'), false);
});

// snooze
test('transition — snooze from ACTIVE is allowed', () => {
  assert.equal(canTransition('snooze', 'ACTIVE'), true);
});
test('transition — snooze from SNOOZED is not allowed', () => {
  assert.equal(canTransition('snooze', 'SNOOZED'), false);
});
test('transition — snooze from COMPLETED is not allowed', () => {
  assert.equal(canTransition('snooze', 'COMPLETED'), false);
});
test('transition — snooze from DISMISSED is not allowed', () => {
  assert.equal(canTransition('snooze', 'DISMISSED'), false);
});

// skip
test('transition — skip from ACTIVE is allowed', () => {
  assert.equal(canTransition('skip', 'ACTIVE'), true);
});
test('transition — skip from SNOOZED is allowed', () => {
  assert.equal(canTransition('skip', 'SNOOZED'), true);
});
test('transition — skip from COMPLETED is not allowed', () => {
  assert.equal(canTransition('skip', 'COMPLETED'), false);
});
test('transition — skip from DISMISSED is not allowed', () => {
  assert.equal(canTransition('skip', 'DISMISSED'), false);
});

// dismiss
test('transition — dismiss from ACTIVE is allowed', () => {
  assert.equal(canTransition('dismiss', 'ACTIVE'), true);
});
test('transition — dismiss from SNOOZED is allowed', () => {
  assert.equal(canTransition('dismiss', 'SNOOZED'), true);
});
test('transition — dismiss from SKIPPED is allowed', () => {
  assert.equal(canTransition('dismiss', 'SKIPPED'), true);
});
test('transition — dismiss from COMPLETED is not allowed', () => {
  assert.equal(canTransition('dismiss', 'COMPLETED'), false);
});
test('transition — dismiss from DISMISSED is not allowed (already dismissed)', () => {
  assert.equal(canTransition('dismiss', 'DISMISSED'), false);
});
test('transition — dismiss from EXPIRED is not allowed', () => {
  assert.equal(canTransition('dismiss', 'EXPIRED'), false);
});

// reopen
test('transition — reopen from COMPLETED is allowed', () => {
  assert.equal(canTransition('reopen', 'COMPLETED'), true);
});
test('transition — reopen from SKIPPED is allowed', () => {
  assert.equal(canTransition('reopen', 'SKIPPED'), true);
});
test('transition — reopen from DISMISSED is allowed', () => {
  assert.equal(canTransition('reopen', 'DISMISSED'), true);
});
test('transition — reopen from EXPIRED is allowed', () => {
  assert.equal(canTransition('reopen', 'EXPIRED'), true);
});
test('transition — reopen from ACTIVE is not allowed (already active)', () => {
  assert.equal(canTransition('reopen', 'ACTIVE'), false);
});
test('transition — reopen from SNOOZED is not allowed', () => {
  assert.equal(canTransition('reopen', 'SNOOZED'), false);
});

// ---------------------------------------------------------------------------
// Snooze preset day mappings
// (mirrors SNOOZE_PRESET_DAYS in homeHabitCoachService.ts)
// ---------------------------------------------------------------------------

const SNOOZE_PRESET_DAYS = { '1d': 1, '3d': 3, '7d': 7, '14d': 14, '30d': 30 };

test('snooze preset — 1d resolves to 1 day', () => {
  assert.equal(SNOOZE_PRESET_DAYS['1d'], 1);
});
test('snooze preset — 7d resolves to 7 days', () => {
  assert.equal(SNOOZE_PRESET_DAYS['7d'], 7);
});
test('snooze preset — 30d resolves to 30 days', () => {
  assert.equal(SNOOZE_PRESET_DAYS['30d'], 30);
});
test('snooze preset — invalid key resolves to undefined', () => {
  assert.equal(SNOOZE_PRESET_DAYS['45d'], undefined);
});
test('snooze preset — all presets are positive integers', () => {
  for (const [key, days] of Object.entries(SNOOZE_PRESET_DAYS)) {
    assert.ok(Number.isInteger(days) && days > 0, `Preset ${key} invalid days: ${days}`);
  }
});

// ---------------------------------------------------------------------------
// Season calculation
// (mirrors getCurrentSeason in habitRuleEvaluator.ts)
// ---------------------------------------------------------------------------

function getCurrentSeason(month) {
  if (month === 12 || month <= 2) return 'WINTER';
  if (month <= 5) return 'SPRING';
  if (month <= 8) return 'SUMMER';
  return 'FALL';
}

test('season — December is WINTER', () => assert.equal(getCurrentSeason(12), 'WINTER'));
test('season — January is WINTER',  () => assert.equal(getCurrentSeason(1),  'WINTER'));
test('season — February is WINTER', () => assert.equal(getCurrentSeason(2),  'WINTER'));
test('season — March is SPRING',    () => assert.equal(getCurrentSeason(3),  'SPRING'));
test('season — May is SPRING',      () => assert.equal(getCurrentSeason(5),  'SPRING'));
test('season — June is SUMMER',     () => assert.equal(getCurrentSeason(6),  'SUMMER'));
test('season — August is SUMMER',   () => assert.equal(getCurrentSeason(8),  'SUMMER'));
test('season — September is FALL',  () => assert.equal(getCurrentSeason(9),  'FALL'));
test('season — November is FALL',   () => assert.equal(getCurrentSeason(11), 'FALL'));

// ---------------------------------------------------------------------------
// Cooldown windows
// (mirrors COOLDOWN_DAYS and DISMISS_COOLDOWN_DAYS in habitGenerationEngine.ts)
// ---------------------------------------------------------------------------

const COOLDOWN_DAYS = { DAILY: 1, WEEKLY: 6, MONTHLY: 25, SEASONAL: 60, ANNUAL: 300, AD_HOC: 0 };
const DISMISS_COOLDOWN_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

function isInCooldown(status, lastActionAt, cadence) {
  if (!lastActionAt) return false;
  const daysSince = (Date.now() - lastActionAt.getTime()) / DAY_MS;
  if (status === 'DISMISSED') return daysSince < DISMISS_COOLDOWN_DAYS;
  if (status === 'COMPLETED') {
    const cooldown = COOLDOWN_DAYS[cadence] ?? 0;
    return cooldown > 0 && daysSince < cooldown;
  }
  return false;
}

const tenDaysAgo      = new Date(Date.now() - 10  * DAY_MS);
const thirtyDaysAgo   = new Date(Date.now() - 30  * DAY_MS);
const sixtyFiveDaysAgo = new Date(Date.now() - 65 * DAY_MS);
const ninetyFiveDaysAgo = new Date(Date.now() - 95 * DAY_MS);
const threeSixtyDaysAgo = new Date(Date.now() - 360 * DAY_MS);

test('cooldown — monthly habit completed 10 days ago is in cooldown', () => {
  assert.equal(isInCooldown('COMPLETED', tenDaysAgo, 'MONTHLY'), true);
});
test('cooldown — monthly habit completed 30 days ago is NOT in cooldown (25d window)', () => {
  assert.equal(isInCooldown('COMPLETED', thirtyDaysAgo, 'MONTHLY'), false);
});
test('cooldown — seasonal habit completed 30 days ago is in cooldown (60d window)', () => {
  assert.equal(isInCooldown('COMPLETED', thirtyDaysAgo, 'SEASONAL'), true);
});
test('cooldown — seasonal habit completed 65 days ago is NOT in cooldown', () => {
  assert.equal(isInCooldown('COMPLETED', sixtyFiveDaysAgo, 'SEASONAL'), false);
});
test('cooldown — annual habit completed 360 days ago is NOT in cooldown (300d window)', () => {
  assert.equal(isInCooldown('COMPLETED', threeSixtyDaysAgo, 'ANNUAL'), false);
});
test('cooldown — AD_HOC habit never has a cooldown window', () => {
  assert.equal(isInCooldown('COMPLETED', tenDaysAgo, 'AD_HOC'), false);
});
test('cooldown — dismissed habit dismissed 10 days ago is in cooldown (90d window)', () => {
  assert.equal(isInCooldown('DISMISSED', tenDaysAgo, null), true);
});
test('cooldown — dismissed habit dismissed 95 days ago is NOT in cooldown', () => {
  assert.equal(isInCooldown('DISMISSED', ninetyFiveDaysAgo, null), false);
});
test('cooldown — null lastActionAt always returns false', () => {
  assert.equal(isInCooldown('COMPLETED', null, 'MONTHLY'), false);
  assert.equal(isInCooldown('DISMISSED', null, null), false);
});

// ---------------------------------------------------------------------------
// Priority scoring
// (mirrors computePriorityScore in habitGenerationEngine.ts)
// ---------------------------------------------------------------------------

const IMPACT_SCORE    = { PREVENT_DAMAGE: 10, IMPROVE_SAFETY: 9, REDUCE_WEAR: 7, IMPROVE_EFFICIENCY: 6, IMPROVE_AIR_QUALITY: 5, GENERAL_UPKEEP: 3 };
const DIFFICULTY_PENALTY = { EASY: 0, MODERATE: -3, ADVANCED: -8 };
const CADENCE_SCORE   = { DAILY: 8, WEEKLY: 9, MONTHLY: 10, SEASONAL: 12, ANNUAL: 6, AD_HOC: 2 };

function computePriorityScore(difficulty, impactType, cadence, matchedConditions, isSeasonal) {
  let score = 50;
  score += IMPACT_SCORE[impactType]    ?? 0;
  score += DIFFICULTY_PENALTY[difficulty] ?? 0;
  score += CADENCE_SCORE[cadence]     ?? 0;
  if (isSeasonal && matchedConditions.some((c) => c.startsWith('season:'))) score += 15;
  const specific = matchedConditions.filter((c) =>
    c.startsWith('flag:') || c.startsWith('heatingType:') ||
    c.startsWith('coolingType:') || c.startsWith('climateRegion:'),
  );
  score += specific.length * 5;
  return Math.round(score);
}

test('priority — PREVENT_DAMAGE EASY SEASONAL with season match', () => {
  // 50 + 10 + 0 + 12 + 15 = 87
  assert.equal(computePriorityScore('EASY', 'PREVENT_DAMAGE', 'SEASONAL', ['season:SPRING'], true), 87);
});
test('priority — GENERAL_UPKEEP ADVANCED AD_HOC no conditions', () => {
  // 50 + 3 + (-8) + 2 = 47
  assert.equal(computePriorityScore('ADVANCED', 'GENERAL_UPKEEP', 'AD_HOC', [], false), 47);
});
test('priority — flag match adds 5 per flag', () => {
  const base = computePriorityScore('EASY', 'IMPROVE_SAFETY', 'MONTHLY', [], false);
  const withFlag = computePriorityScore('EASY', 'IMPROVE_SAFETY', 'MONTHLY', ['flag:hasSumpPump=true'], false);
  assert.equal(withFlag - base, 5);
});
test('priority — safety beats general upkeep at same difficulty and cadence', () => {
  const safety  = computePriorityScore('EASY', 'IMPROVE_SAFETY', 'MONTHLY', [], false);
  const general = computePriorityScore('EASY', 'GENERAL_UPKEEP', 'MONTHLY', [], false);
  assert.ok(safety > general, `Safety(${safety}) should beat general(${general})`);
});
test('priority — ADVANCED difficulty reduces score by 8 vs EASY', () => {
  const easy     = computePriorityScore('EASY', 'IMPROVE_SAFETY', 'MONTHLY', [], false);
  const advanced = computePriorityScore('ADVANCED', 'IMPROVE_SAFETY', 'MONTHLY', [], false);
  assert.equal(easy - advanced, 8);
});
test('priority — two flag matches add 10 total', () => {
  const base = computePriorityScore('EASY', 'IMPROVE_SAFETY', 'MONTHLY', [], false);
  const two  = computePriorityScore('EASY', 'IMPROVE_SAFETY', 'MONTHLY', ['flag:hasSumpPump=true', 'flag:hasDrainageIssues=true'], false);
  assert.equal(two - base, 10);
});

// ---------------------------------------------------------------------------
// Live rank score (mirrors computeLiveRankScore in habitRankingEngine.ts)
// ---------------------------------------------------------------------------

function computeLiveRankScore(habit, signals) {
  let score = habit.priorityScore ?? 50;
  if (habit.dueAt) {
    const diffDays = (habit.dueAt.getTime() - Date.now()) / DAY_MS;
    if (diffDays < 0)      score += 20;
    else if (diffDays <= 1) score += 15;
    else if (diffDays <= 7) score += 8;
    else if (diffDays <= 14) score += 3;
  }
  const snoozeCount = (signals.snoozeCountByHabit && signals.snoozeCountByHabit.get(habit.id)) ?? 0;
  if (snoozeCount >= 5) score -= 20;
  else if (snoozeCount >= 3) score -= 10;
  const lastDismiss = signals.recentDismissByCategory && signals.recentDismissByCategory.get(habit.habitTemplate.category);
  if (lastDismiss) {
    const daysSince = (Date.now() - lastDismiss.getTime()) / DAY_MS;
    if (daysSince < 7)  score -= 15;
    else if (daysSince < 14) score -= 8;
  }
  return Math.max(0, Math.round(score));
}

const emptySignals = { snoozeCountByHabit: new Map(), recentDismissByCategory: new Map() };
const baseHabit = { id: 'h1', priorityScore: 60, dueAt: null, snoozedUntil: null, habitTemplate: { category: 'HVAC', estimatedMinutes: 5 } };

test('live rank — no signals returns base priorityScore', () => {
  assert.equal(computeLiveRankScore(baseHabit, emptySignals), 60);
});
test('live rank — overdue habit gets +20', () => {
  const h = { ...baseHabit, dueAt: new Date(Date.now() - 2 * DAY_MS) };
  assert.equal(computeLiveRankScore(h, emptySignals), 80);
});
test('live rank — due within 1 day gets +15', () => {
  const h = { ...baseHabit, dueAt: new Date(Date.now() + 12 * 60 * 60 * 1000) };
  assert.equal(computeLiveRankScore(h, emptySignals), 75);
});
test('live rank — due in 3 days gets +8', () => {
  const h = { ...baseHabit, dueAt: new Date(Date.now() + 3 * DAY_MS) };
  assert.equal(computeLiveRankScore(h, emptySignals), 68);
});
test('live rank — 3 snoozes applies -10', () => {
  const signals = { snoozeCountByHabit: new Map([['h1', 3]]), recentDismissByCategory: new Map() };
  assert.equal(computeLiveRankScore(baseHabit, signals), 50);
});
test('live rank — 5+ snoozes applies -20', () => {
  const signals = { snoozeCountByHabit: new Map([['h1', 6]]), recentDismissByCategory: new Map() };
  assert.equal(computeLiveRankScore(baseHabit, signals), 40);
});
test('live rank — category dismiss within 7 days applies -15', () => {
  const threeDaysAgo = new Date(Date.now() - 3 * DAY_MS);
  const signals = { snoozeCountByHabit: new Map(), recentDismissByCategory: new Map([['HVAC', threeDaysAgo]]) };
  assert.equal(computeLiveRankScore(baseHabit, signals), 45);
});
test('live rank — category dismiss 8–13 days ago applies -8', () => {
  const tenDaysAgoD = new Date(Date.now() - 10 * DAY_MS);
  const signals = { snoozeCountByHabit: new Map(), recentDismissByCategory: new Map([['HVAC', tenDaysAgoD]]) };
  assert.equal(computeLiveRankScore(baseHabit, signals), 52);
});
test('live rank — score is never negative', () => {
  const signals = { snoozeCountByHabit: new Map([['h1', 10]]), recentDismissByCategory: new Map([['HVAC', new Date(Date.now() - DAY_MS)]]) };
  const score = computeLiveRankScore({ ...baseHabit, priorityScore: 5 }, signals);
  assert.ok(score >= 0, `Score ${score} should be >= 0`);
});

// ---------------------------------------------------------------------------
// Targeting rule evaluator
// (mirrors evaluateTargetingRules in habitRuleEvaluator.ts)
// ---------------------------------------------------------------------------

function evaluateTargetingRules(rules, ctx) {
  const matched = [];
  const failed  = [];

  if (!rules || Object.keys(rules).length === 0) {
    return { matches: true, matchedConditions: [], failedConditions: [], isFallback: true };
  }

  const fail = (reason) => {
    failed.push(reason);
    return { matches: false, matchedConditions: matched, failedConditions: failed, isFallback: false };
  };

  if (rules.seasons?.length) {
    if (rules.seasons.includes(ctx.currentSeason)) {
      matched.push(`season:${ctx.currentSeason}`);
    } else {
      return fail(`season:${ctx.currentSeason} not in [${rules.seasons.join(',')}]`);
    }
  }

  if (rules.requiredFlags?.length) {
    for (const flag of rules.requiredFlags) {
      const val = ctx[flag];
      if (val === true)       matched.push(`flag:${flag}=true`);
      else if (val === false) return fail(`flag:${flag} required but is false`);
      // null/undefined → unknown, do not block
    }
  }

  if (rules.excludedFlags?.length) {
    for (const flag of rules.excludedFlags) {
      if (ctx[flag] === true) return fail(`flag:${flag} must not be present`);
    }
  }

  if (rules.requiredHeatingTypes?.length) {
    if (ctx.heatingType) {
      if (rules.requiredHeatingTypes.includes(ctx.heatingType)) {
        matched.push(`heatingType:${ctx.heatingType}`);
      } else {
        return fail(`heatingType:${ctx.heatingType} not in required list`);
      }
    }
    // null/undefined heatingType → skip constraint gracefully
  }

  return { matches: true, matchedConditions: matched, failedConditions: [], isFallback: false };
}

const springCtx = { currentSeason: 'SPRING', currentMonth: 3 };

test('rule evaluator — null rules → isFallback=true', () => {
  const r = evaluateTargetingRules(null, springCtx);
  assert.equal(r.isFallback, true);
  assert.equal(r.matches, true);
  assert.equal(r.matchedConditions.length, 0);
});
test('rule evaluator — empty object → isFallback=true', () => {
  const r = evaluateTargetingRules({}, springCtx);
  assert.equal(r.isFallback, true);
});
test('rule evaluator — season match succeeds in correct season', () => {
  const r = evaluateTargetingRules({ seasons: ['SPRING'] }, springCtx);
  assert.equal(r.matches, true);
  assert.ok(r.matchedConditions.includes('season:SPRING'));
});
test('rule evaluator — season mismatch fails', () => {
  const r = evaluateTargetingRules({ seasons: ['FALL', 'WINTER'] }, springCtx);
  assert.equal(r.matches, false);
  assert.ok(r.failedConditions.length > 0);
});
test('rule evaluator — required flag true succeeds', () => {
  const r = evaluateTargetingRules({ requiredFlags: ['hasSumpPump'] }, { ...springCtx, hasSumpPump: true });
  assert.equal(r.matches, true);
  assert.ok(r.matchedConditions.includes('flag:hasSumpPump=true'));
});
test('rule evaluator — required flag false fails', () => {
  const r = evaluateTargetingRules({ requiredFlags: ['hasSumpPump'] }, { ...springCtx, hasSumpPump: false });
  assert.equal(r.matches, false);
});
test('rule evaluator — required flag null/undefined does not block (graceful)', () => {
  const r = evaluateTargetingRules({ requiredFlags: ['hasSumpPump'] }, { ...springCtx, hasSumpPump: undefined });
  assert.equal(r.matches, true, 'Unknown flag should not block match');
});
test('rule evaluator — excluded flag true fails', () => {
  const r = evaluateTargetingRules({ excludedFlags: ['hasSumpPump'] }, { ...springCtx, hasSumpPump: true });
  assert.equal(r.matches, false);
});
test('rule evaluator — excluded flag false passes', () => {
  const r = evaluateTargetingRules({ excludedFlags: ['hasSumpPump'] }, { ...springCtx, hasSumpPump: false });
  assert.equal(r.matches, true);
});
test('rule evaluator — heating type match succeeds', () => {
  const r = evaluateTargetingRules({ requiredHeatingTypes: ['FORCED_AIR'] }, { ...springCtx, heatingType: 'FORCED_AIR' });
  assert.equal(r.matches, true);
  assert.ok(r.matchedConditions.includes('heatingType:FORCED_AIR'));
});
test('rule evaluator — heating type mismatch fails', () => {
  const r = evaluateTargetingRules({ requiredHeatingTypes: ['FORCED_AIR'] }, { ...springCtx, heatingType: 'BOILER' });
  assert.equal(r.matches, false);
});
test('rule evaluator — null heatingType does not block (graceful)', () => {
  const r = evaluateTargetingRules({ requiredHeatingTypes: ['FORCED_AIR'] }, { ...springCtx, heatingType: null });
  assert.equal(r.matches, true, 'Unknown heating type should not block');
});
test('rule evaluator — combined season + flag: both must match', () => {
  const ctx = { ...springCtx, hasSumpPump: true };
  const r = evaluateTargetingRules({ seasons: ['SPRING'], requiredFlags: ['hasSumpPump'] }, ctx);
  assert.equal(r.matches, true);
  assert.ok(r.matchedConditions.includes('season:SPRING'));
  assert.ok(r.matchedConditions.includes('flag:hasSumpPump=true'));
});
test('rule evaluator — season matches but required flag false → fails overall', () => {
  const ctx = { ...springCtx, hasSumpPump: false };
  const r = evaluateTargetingRules({ seasons: ['SPRING'], requiredFlags: ['hasSumpPump'] }, ctx);
  assert.equal(r.matches, false);
});

// ---------------------------------------------------------------------------
// Reason summary guardrails
// (ensures buildReasonSummary output is human-readable, never raw internal data)
// ---------------------------------------------------------------------------

function isValidReasonSummary(text) {
  if (!text || typeof text !== 'string') return false;
  if (text.trim().startsWith('{'))             return false; // raw JSON object
  if (text.includes('SYSTEM_RULE'))            return false; // internal constant leaked
  if (text.includes('"matchedConditions"'))    return false; // raw JSON field name leaked
  if (text.toLowerCase().includes('confidence')) return false; // should not expose confidence %
  if (text.length < 10)                        return false; // too short to be meaningful
  return true;
}

const VALID_SUMMARIES = [
  "It's spring — the right time to prepare systems before summer heat arrives.",
  'Your home has a sump pump that needs seasonal attention.',
  'This is a monthly check worth adding to your routine.',
  'Homes over 30 years old benefit from extra attention to this area.',
  'Forced-air heating systems need regular maintenance to run efficiently and safely.',
  'Matched your home profile.',
];

const INVALID_SUMMARIES = [
  '{"matchedConditions":["season:SPRING"],"isFallback":false}',
  'SYSTEM_RULE evaluation produced this habit.',
  '{"generationSource":"SYSTEM_RULE","matchedConditions":[]}',
  'Score: 0.73, confidence: HIGH',
  '',
  null,
];

test('reason summary — all valid summaries pass the guardrail', () => {
  for (const s of VALID_SUMMARIES) {
    assert.ok(isValidReasonSummary(s), `Expected valid: "${s}"`);
  }
});
test('reason summary — raw JSON object fails guardrail', () => {
  assert.equal(isValidReasonSummary(INVALID_SUMMARIES[0]), false);
  assert.equal(isValidReasonSummary(INVALID_SUMMARIES[2]), false);
});
test('reason summary — internal constant leakage fails guardrail', () => {
  assert.equal(isValidReasonSummary(INVALID_SUMMARIES[1]), false);
});
test('reason summary — confidence language fails guardrail', () => {
  assert.equal(isValidReasonSummary(INVALID_SUMMARIES[3]), false);
});
test('reason summary — empty string fails guardrail', () => {
  assert.equal(isValidReasonSummary(INVALID_SUMMARIES[4]), false);
});
test('reason summary — null fails guardrail', () => {
  assert.equal(isValidReasonSummary(INVALID_SUMMARIES[5]), false);
});

// ---------------------------------------------------------------------------
// Duplicate generation guard
// (mirrors dedup logic in generateHabitsForProperty)
// ---------------------------------------------------------------------------

function shouldSkipGeneration(templateId, aliveTemplateIds, cooledDownTemplateIds) {
  if (aliveTemplateIds.has(templateId))       return { skip: true, reason: 'already active or snoozed' };
  if (cooledDownTemplateIds.has(templateId))  return { skip: true, reason: 'in cooldown period after recent action' };
  return { skip: false };
}

test('dedup — active template is skipped', () => {
  const r = shouldSkipGeneration('t1', new Set(['t1']), new Set());
  assert.equal(r.skip, true);
  assert.equal(r.reason, 'already active or snoozed');
});
test('dedup — cooled-down template is skipped', () => {
  const r = shouldSkipGeneration('t2', new Set(), new Set(['t2']));
  assert.equal(r.skip, true);
  assert.equal(r.reason, 'in cooldown period after recent action');
});
test('dedup — new template is not skipped', () => {
  const r = shouldSkipGeneration('t3', new Set(['t1']), new Set(['t2']));
  assert.equal(r.skip, false);
});
test('dedup — same template cannot be created twice in one generation run', () => {
  const alive = new Set();
  // Simulate: first creation adds to alive set mid-run
  alive.add('t1');
  const second = shouldSkipGeneration('t1', alive, new Set());
  assert.equal(second.skip, true);
});

// ---------------------------------------------------------------------------
// Spotlight selection
// (mirrors selectSpotlight in habitRankingEngine.ts)
// ---------------------------------------------------------------------------

function selectSpotlight(habits, signals) {
  if (habits.length === 0) return null;
  const now = Date.now();
  const candidates = habits.filter(
    (h) => h.status === 'ACTIVE' ||
           (h.status === 'SNOOZED' && h.snoozedUntil != null && h.snoozedUntil.getTime() <= now),
  );
  if (candidates.length === 0) return null;

  const scored = candidates
    .map((h) => ({ habit: h, score: computeLiveRankScore(h, signals) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0].score;
  const nearTop = scored.filter((s) => s.score >= best - 5);
  if (nearTop.length > 1) {
    const quick = nearTop.find((s) => (s.habit.habitTemplate.estimatedMinutes ?? 999) <= 15);
    if (quick) return quick.habit;
  }
  return scored[0].habit;
}

const mkHabit = (id, status, priorityScore, minutes, snoozedUntil = null) => ({
  id,
  status,
  priorityScore,
  dueAt: null,
  snoozedUntil,
  habitTemplate: { category: 'GENERAL', estimatedMinutes: minutes },
});

test('spotlight — null for empty list', () => {
  assert.equal(selectSpotlight([], emptySignals), null);
});
test('spotlight — null when all habits are actively snoozed', () => {
  const futureSnoozed = mkHabit('s1', 'SNOOZED', 90, 5, new Date(Date.now() + 7 * DAY_MS));
  assert.equal(selectSpotlight([futureSnoozed], emptySignals), null);
});
test('spotlight — includes expired-snooze habit as candidate', () => {
  const expiredSnooze = mkHabit('s2', 'SNOOZED', 70, 5, new Date(Date.now() - DAY_MS));
  const result = selectSpotlight([expiredSnooze], emptySignals);
  assert.equal(result?.id, 's2');
});
test('spotlight — selects highest-scored active habit', () => {
  const low  = mkHabit('h1', 'ACTIVE', 40, 60);
  const high = mkHabit('h2', 'ACTIVE', 80, 60);
  assert.equal(selectSpotlight([low, high], emptySignals).id, 'h2');
});
test('spotlight — among near-top candidates, prefers quick task (≤15 min)', () => {
  const longHigh  = mkHabit('h1', 'ACTIVE', 80, 60); // long, highest score
  const quickNear = mkHabit('h2', 'ACTIVE', 77, 5);  // quick, within 5 pts
  const result = selectSpotlight([longHigh, quickNear], emptySignals);
  assert.equal(result.id, 'h2', 'Quick task should be preferred when scores are close');
});
test('spotlight — does not prefer quick task outside the 5-point window', () => {
  const longHigh  = mkHabit('h1', 'ACTIVE', 80, 60); // long, highest score
  const quickFar  = mkHabit('h2', 'ACTIVE', 70, 5);  // quick, but 10 pts below
  const result = selectSpotlight([longHigh, quickFar], emptySignals);
  assert.equal(result.id, 'h1', 'Should not sacrifice 10pts for quick task');
});
