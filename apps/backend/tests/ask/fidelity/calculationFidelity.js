// BICC-EVAL-019 / BICC-GATE-004A2 (docs/product/ASK_COZY_BEST_IN_CLASS_CONVERSATIONAL_CONCIERGE_FRD.md): the reusable, parameterised deterministic suite for the
// calculations Ask performs on a home's capital plan: cost growth, the cost basis at a named date, the point estimate, the funding plan (still to fund, monthly need,
// additional saving), the deposit rate, and the readers of the dates and amounts a homeowner types. It is a fixed partition matrix, not a sample: it reports
// partition coverage and makes no population claim. Every expected value is derived here, independently of the code under test, by exact integer (BigInt) or
// calendar arithmetic written separately; a failure adds a permanent regression case and the suite is never burned (EVAL-019).
require('ts-node/register');
const { grow, yearsBetween, itemCostBases } = require('../../../src/services/ask/support/itemCost.ts');
const { pointEstimate, monthsUntil, buildFundingPlan, depositsPerMonth, NEAR_TERM_MONTHS } = require('../../../src/services/ask/support/itemFunding.ts');
const { parseTargetDate } = require('../../../src/services/ask/support/targetDate.ts');
const { parseMoneyAmounts, parseMonthlyBudget } = require('../../../src/services/ask/support/moneyAmount.ts');
const { namedFundingTerms, selectFundingItems, wantsAllFundingItems } = require('../../../src/services/ask/support/itemFundingWording.ts');

const NOW = new Date(2026, 4, 15, 12, 0, 0); // 15 May 2026, local time (the code reads local calendar fields)
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
const at = (monthsAhead) => new Date(2026, 4 + monthsAhead, 1);

const cases = [];
const add = (id, partition, description, run) => cases.push({ id, partition, description, run });
function assert(condition, message) { if (!condition) throw new Error(message || 'assertion failed'); }
const same = (actual, expected, what = 'value') => { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };

// ---- independent reference arithmetic (exact, integer) --------------------------------------------------------------------------------------------
const roundDiv = (num, den) => Number((2n * num + den) / (2n * den)); // round half up, non-negative operands
/** cents × ((10000+bps)/10000)^years, years a whole number >= 0, exact. */
const growExact = (cents, bps, years) => roundDiv(BigInt(cents) * BigInt(10000 + bps) ** BigInt(years), 10000n ** BigInt(years));
/** (cents ÷ (1+r)^back) × (1+r)^forward, exact. */
const rebase = (cents, bps, back, forward) => roundDiv(BigInt(cents) * BigInt(10000 + bps) ** BigInt(forward) * 10000n ** BigInt(back), 10000n ** BigInt(forward) * BigInt(10000 + bps) ** BigInt(back));
/** Whole calendar months from `from` to `to`, at least 1 (the plan counts calendar months, not days). */
const calendarMonths = (from, to) => Math.max(1, (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()));
const ceilDiv = (a, b) => Math.floor((a + b - 1) / b);

// ============ VALUE: cost growth, exact over rate x years x amount ============
for (const bps of [0, 200, 350, 500, 800]) for (const years of [0, 1, 2, 3, 5, 10, 20]) for (const cents of [999, 100000, 1234567]) {
  add(`value:grow:${bps}bps:${years}y:${cents}`, 'VALUE', `${cents} cents grown ${years} years at ${bps / 100}%`, () => same(grow(cents, bps / 10000, years), growExact(cents, bps, years)));
}
// the cost basis at a named date, from a stored cost that was grown to the middle of the item's window (exact whole-year geometry)
for (const bps of [200, 350, 500]) for (const toMid of [1, 2, 5]) for (const toTarget of [0, 1, 3]) for (const stored of [1000000, 2345678]) {
  add(`value:bases:${bps}bps:mid${toMid}:target${toTarget}:${stored}`, 'VALUE', `stored ${stored} with window middle in ${toMid}y and target in ${toTarget}y at ${bps / 100}%`, () => {
    const start = new Date(NOW.getTime() + (toMid - 1) * YEAR_MS); const end = new Date(NOW.getTime() + (toMid + 1) * YEAR_MS);
    const bases = itemCostBases({ storedMinCents: stored, storedMaxCents: stored * 2, windowStart: start, windowEnd: end, growthRate: bps / 10000, now: NOW, targetDate: new Date(NOW.getTime() + toTarget * YEAR_MS) });
    same(bases.today, { minCents: rebase(stored, bps, toMid, 0), maxCents: rebase(stored * 2, bps, toMid, 0) }, 'today');
    same(bases.window, { minCents: stored, maxCents: stored * 2 }, 'window');
    same(bases.target, { minCents: rebase(stored, bps, toMid, toTarget), maxCents: rebase(stored * 2, bps, toMid, toTarget) }, 'target');
  });
}

// ============ DATE: the date a homeowner names ============
for (let n = 1; n <= 20; n += 1) add(`date:in-years:${n}`, 'DATE', `in ${n} year(s)`, () => {
  const parsed = parseTargetDate(`how much should I save to replace the roof in ${n} years`, NOW);
  same([parsed.months, parsed.date.getTime(), parsed.label], [12 * n, at(12 * n).getTime(), `in ${n} ${n === 1 ? 'year' : 'years'}`]);
});
for (let n = 1; n <= 24; n += 1) add(`date:in-months:${n}`, 'DATE', `in ${n} month(s)`, () => {
  const parsed = parseTargetDate(`replace the furnace in ${n} months`, NOW);
  same([parsed.months, parsed.date.getTime(), parsed.label], [n, at(n).getTime(), `in ${n} ${n === 1 ? 'month' : 'months'}`]);
});
for (const [word, value] of [['one', 1], ['two', 2], ['three', 3], ['four', 4], ['five', 5], ['six', 6], ['seven', 7], ['eight', 8], ['nine', 9], ['ten', 10], ['eleven', 11], ['twelve', 12], ['fifteen', 15], ['twenty', 20]]) {
  add(`date:word:${word}`, 'DATE', `"in ${word} years"`, () => { const parsed = parseTargetDate(`replace the roof in ${word} years`, NOW); same([parsed.months, parsed.date.getTime()], [value === 1 ? 12 : 12 * value, at(12 * value).getTime()]); });
}
for (let year = 2027; year <= 2040; year += 1) add(`date:by-year:${year}`, 'DATE', `by ${year}`, () => {
  const months = 12 * (year - 2026) + 7; // to December of that year, from May
  const parsed = parseTargetDate(`how much should I save by ${year}`, NOW);
  same([parsed.months, parsed.date.getTime(), parsed.label], [months, at(months).getTime(), `by the end of ${year}`]);
});
for (const n of [3, 5, 7, 10, 15]) add(`date:plan:${n}`, 'DATE', `a ${n} year plan`, () => { const parsed = parseTargetDate(`show my ${n} year plan`, NOW); same([parsed.months, parsed.label], [12 * n, `in ${n} years`]); });
for (const [text, months, label] of [['next year', 12, 'next year'], ['this year', 8, 'this year'], ['in the next few years', 36, 'in the next few years'], ['in a year', 12, 'in one year']]) {
  add(`date:phrase:${text}`, 'DATE', `"${text}"`, () => { const parsed = parseTargetDate(`replace the water heater ${text}`, NOW); same([parsed.months, parsed.label, parsed.date.getTime()], [months, label, at(months).getTime()]); });
}

// ============ UNIT: amounts, units and the monthly saving ============
const UNITS = [['$', (n) => `$${n}`, 1], ['k', (n) => `${n}k`, 1000], ['thousand', (n) => `${n} thousand`, 1000], ['m', (n) => `${n}m`, 1e6], ['million', (n) => `${n} million`, 1e6], ['dollars', (n) => `${n} dollars`, 1], ['bucks', (n) => `${n} bucks`, 1]];
for (const n of [2, 15, 250, 1200, 3.5, 0.5]) for (const [unit, write, multiplier] of UNITS) {
  add(`unit:amount:${n}:${unit}`, 'UNIT', `${write(n)}`, () => same(parseMoneyAmounts(`the roof will cost ${write(n)} probably`).map((a) => a.dollars), n * multiplier <= 1e9 ? [n * multiplier] : []));
}
for (const n of [2, 15, 250, 1200, 3.5, 0.5]) add(`unit:bare:${n}`, 'UNIT', `a bare ${n} is not an amount`, () => same(parseMoneyAmounts(`the roof is ${n} things`).map((a) => a.dollars), []));
for (const [text, dollars] of [['$1,200', 1200], ['$12,500.50', 12500.5], ['1,200 dollars', 1200], ['$1,234,567', 1234567]]) add(`unit:grouped:${text}`, 'UNIT', text, () => same(parseMoneyAmounts(`budget ${text}`).map((a) => a.dollars), [dollars]));
for (const n of [50, 100, 250, 300, 500, 1200]) for (const [name, write] of [['a-month', (v) => `I can save $${v} a month`], ['per-month', (v) => `I can put aside $${v} per month`], ['slash-mo', (v) => `we can contribute $${v}/mo`], ['monthly-budget', (v) => `my monthly budget of $${v}`]]) {
  add(`unit:monthly:${n}:${name}`, 'UNIT', write(n), () => same(parseMonthlyBudget(write(n))?.dollars, n));
}
for (const text of ['a $5,000 roof', 'budget $400 for the roof', 'save 300', 'it costs $250 each']) add(`unit:not-monthly:${text}`, 'UNIT', `"${text}" is not a monthly amount`, () => same(parseMonthlyBudget(text), null));

// ============ FORMULA_BRANCH: point estimate, months, funding plan ============
for (const [min, max, moderate] of [[100, 200, 150], [100, 101, 101], [5, 5, 5], [0, 0, 0], [1000, 3001, 2001], [7, 10, 9]]) for (const [posture, expected] of [['CONSERVATIVE', max], ['AGGRESSIVE', min], ['MODERATE', moderate]]) {
  add(`formula:point:${min}-${max}:${posture}`, 'FORMULA_BRANCH', `${posture} point of ${min}-${max}`, () => same(pointEstimate(min, max, posture), expected));
}
for (const [fy, fm, ty, tm] of [[2026, 4, 2026, 4], [2026, 4, 2026, 5], [2026, 4, 2027, 4], [2026, 4, 2026, 3], [2026, 11, 2027, 0], [2026, 0, 2030, 11], [2026, 4, 2025, 0], [2026, 4, 2036, 4]]) {
  add(`formula:months:${fy}-${fm}:${ty}-${tm}`, 'FORMULA_BRANCH', 'calendar months between dates', () => same(monthsUntil(new Date(fy, fm, 20), new Date(ty, tm, 2)), calendarMonths(new Date(fy, fm, 20), new Date(ty, tm, 2))));
}
const planItem = (min, max, setAside, id = 'i1', name = 'Roof', target = 0) => ({ id, name, windowStart: at(1), windowEnd: at(3), costMinCents: min, costMaxCents: max, targetCents: target, setAsideCents: setAside });
for (const months of [1, 3, 6, 7, 12, 36, 120]) for (const posture of ['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE']) for (const [min, max] of [[20000000, 30000000], [500000, 500000]]) for (const setAside of [null, 5000000]) {
  add(`formula:plan:${months}m:${posture}:${min}-${max}:${setAside}`, 'FORMULA_BRANCH', `${posture} plan, ${months} months, set aside ${setAside}`, () => {
    const plan = buildFundingPlan({ now: NOW, items: [planItem(min, max, setAside)], posture, targetDate: at(months), growthRate: 0, depositsPerMonthCents: null, fundTargetTotalCents: 0 });
    const cost = posture === 'CONSERVATIVE' ? max : posture === 'AGGRESSIVE' ? min : Math.round((min + max) / 2);
    const aside = Math.min(setAside ?? 0, cost); const still = cost - aside;
    same([plan.months, plan.costAtTargetCents, plan.setAsideCents, plan.stillToFundCents], [months, cost, aside, still]);
    same(plan.nearTerm, months <= 6);
    same(plan.neededPerMonthCents, months <= 6 ? null : ceilDiv(still, months));
    same([plan.currentPerMonthCents, plan.additionalPerMonthCents], [null, null]);
  });
}
for (const [deposits, target, fund] of [[null, 100, 400], [0, 100, 400], [10000, 100, 400], [70000, 100, 400], [10000, 400, 400], [10000, 800, 400], [10000, 100, 0], [333, 1, 3]]) for (const months of [12, 60]) {
  add(`formula:deposit-share:${deposits}:${target}:${fund}:${months}m`, 'FORMULA_BRANCH', `deposit ${deposits}, target ${target} of fund ${fund}, ${months} months`, () => {
    const plan = buildFundingPlan({ now: NOW, items: [planItem(6000000, 6000000, 0, 'i1', 'Roof', target)], posture: 'MODERATE', targetDate: at(months), growthRate: 0, depositsPerMonthCents: deposits, fundTargetTotalCents: fund });
    const needed = ceilDiv(6000000, months);
    const share = fund > 0 ? Math.min(1, target / fund) : 0;
    const current = deposits == null ? null : Math.round(deposits * share);
    same([plan.neededPerMonthCents, plan.currentPerMonthCents, plan.additionalPerMonthCents], [needed, current, current == null ? null : Math.max(0, needed - current)]);
  });
}

// ============ BOUNDARY ============
add('boundary:grow-negative-years', 'BOUNDARY', 'a negative number of years never shrinks money', () => same(grow(100000, 0.05, -3), 100000));
add('boundary:years-reversed', 'BOUNDARY', 'a target before today is zero years, not negative', () => same(yearsBetween(NOW, new Date(2020, 0, 1)), 0));
add('boundary:years-one-julian', 'BOUNDARY', 'exactly 365.25 days is one year', () => same(yearsBetween(NOW, new Date(NOW.getTime() + YEAR_MS)), 1));
add('boundary:date-zero-years', 'BOUNDARY', '"in 0 years" names no date', () => same(parseTargetDate('replace it in 0 years', NOW), null));
add('boundary:date-fifty-years', 'BOUNDARY', '50 years is the longest accepted', () => same(parseTargetDate('replace it in 50 years', NOW).months, 600));
add('boundary:date-fifty-one-years', 'BOUNDARY', '51 years is refused', () => same(parseTargetDate('replace it in 51 years', NOW), null));
add('boundary:date-past-year', 'BOUNDARY', 'a year already past names no date', () => same(parseTargetDate('what did I save by 2025', NOW), null));
add('boundary:date-this-year-by', 'BOUNDARY', '"by 2026" runs to the end of this year', () => same(parseTargetDate('save by 2026', NOW).months, 7));
add('boundary:date-age-not-plan', 'BOUNDARY', '"5 years old" is an age, not a plan horizon', () => same(parseTargetDate('my roof is 5 years old', NOW), null));
add('boundary:date-december-this-year', 'BOUNDARY', 'in December, "this year" is at least one month', () => same(parseTargetDate('replace it this year', new Date(2026, 11, 10)).months, 1));
add('boundary:money-zero', 'BOUNDARY', '$0 is not an amount', () => same(parseMoneyAmounts('I have $0 saved'), []));
add('boundary:money-too-large', 'BOUNDARY', 'an amount above one billion is refused', () => same(parseMoneyAmounts('it costs 2000 million'), []));
add('boundary:money-billion-ok', 'BOUNDARY', 'exactly one billion is accepted', () => same(parseMoneyAmounts('it costs 1000 million').map((a) => a.dollars), [1e9]));
add('boundary:money-two-amounts', 'BOUNDARY', 'two amounts are read in order', () => same(parseMoneyAmounts('between $5,000 and 8k').map((a) => a.dollars), [5000, 8000]));
add('boundary:near-term-limit', 'BOUNDARY', `${NEAR_TERM_MONTHS} months is near term, ${NEAR_TERM_MONTHS + 1} is not`, () => {
  const run = (m) => buildFundingPlan({ now: NOW, items: [planItem(1200000, 1200000, 0)], posture: 'MODERATE', targetDate: at(m), growthRate: 0, depositsPerMonthCents: null, fundTargetTotalCents: 0 });
  same([run(6).nearTerm, run(6).neededPerMonthCents], [true, null]); same([run(7).nearTerm, run(7).neededPerMonthCents], [false, 171429]);
});
add('boundary:set-aside-capped', 'BOUNDARY', 'what is set aside never exceeds the cost', () => {
  const plan = buildFundingPlan({ now: NOW, items: [planItem(1000000, 1000000, 99999999)], posture: 'MODERATE', targetDate: at(24), growthRate: 0, depositsPerMonthCents: null, fundTargetTotalCents: 0 });
  same([plan.setAsideCents, plan.stillToFundCents, plan.neededPerMonthCents], [1000000, 0, 0]);
});
add('boundary:additional-never-negative', 'BOUNDARY', 'saving more than needed asks for no additional saving', () => {
  const plan = buildFundingPlan({ now: NOW, items: [planItem(1200000, 1200000, 0, 'i1', 'Roof', 100)], posture: 'MODERATE', targetDate: at(12), growthRate: 0, depositsPerMonthCents: 500000, fundTargetTotalCents: 100 });
  same([plan.neededPerMonthCents, plan.currentPerMonthCents, plan.additionalPerMonthCents], [100000, 500000, 0]);
});
const SINCE = new Date(2025, 10, 15); // six months back from 15 May 2026
add('boundary:deposit-on-window-start', 'BOUNDARY', 'a deposit exactly at the window start counts', () => same(depositsPerMonth([{ type: 'DEPOSIT', amountCents: 600, occurredAt: SINCE }], NOW), { perMonthCents: 100, depositCount: 1 }));
add('boundary:deposit-before-window', 'BOUNDARY', 'a deposit a minute before the window does not', () => same(depositsPerMonth([{ type: 'DEPOSIT', amountCents: 600, occurredAt: new Date(SINCE.getTime() - 60000) }], NOW), { perMonthCents: 0, depositCount: 0 }));
add('boundary:deposit-types', 'BOUNDARY', 'only DEPOSIT rows with a positive amount count', () => same(depositsPerMonth([
  { type: 'WITHDRAWAL', amountCents: 900, occurredAt: NOW }, { type: 'BALANCE_CORRECTION', amountCents: 900, occurredAt: NOW }, { type: 'DEPOSIT', amountCents: 0, occurredAt: NOW }, { type: 'DEPOSIT', amountCents: -50, occurredAt: NOW }, { type: 'DEPOSIT', amountCents: 1200, occurredAt: NOW },
], NOW), { perMonthCents: 200, depositCount: 1 }));
add('boundary:deposit-rounding', 'BOUNDARY', 'the monthly rate rounds to the nearest cent', () => same(depositsPerMonth([{ type: 'DEPOSIT', amountCents: 1000, occurredAt: NOW }], NOW).perMonthCents, 167));
add('boundary:deposit-custom-window', 'BOUNDARY', 'a twelve month window divides by twelve', () => same(depositsPerMonth([{ type: 'DEPOSIT', amountCents: 1200, occurredAt: new Date(2025, 8, 1) }], NOW, 12), { perMonthCents: 100, depositCount: 1 }));

// ============ MISSING_DATA ============
add('missing:no-deposits-unknown', 'MISSING_DATA', 'no logged deposits is unknown, not zero', () => {
  const plan = buildFundingPlan({ now: NOW, items: [planItem(1200000, 1200000, 0)], posture: 'MODERATE', targetDate: at(12), growthRate: 0, depositsPerMonthCents: null, fundTargetTotalCents: 0 });
  same([plan.currentPerMonthCents, plan.additionalPerMonthCents], [null, null]);
});
add('missing:no-deposit-rows', 'MISSING_DATA', 'an empty ledger yields no deposits', () => same(depositsPerMonth([], NOW), { perMonthCents: 0, depositCount: 0 }));
add('missing:no-fund-targets', 'MISSING_DATA', 'a fund with no targets credits the item with none of the deposits', () => {
  const plan = buildFundingPlan({ now: NOW, items: [planItem(1200000, 1200000, 0, 'i1', 'Roof', 0)], posture: 'MODERATE', targetDate: at(12), growthRate: 0, depositsPerMonthCents: 5000, fundTargetTotalCents: 0 });
  same(plan.currentPerMonthCents, 0);
});
add('missing:no-target-date-uses-earliest-window', 'MISSING_DATA', 'with no date named the plan uses the earliest window start', () => {
  const items = [{ ...planItem(100, 100, 0, 'a'), windowStart: at(30) }, { ...planItem(100, 100, 0, 'b'), windowStart: at(14) }];
  const plan = buildFundingPlan({ now: NOW, items, posture: 'MODERATE', targetDate: null, growthRate: 0, depositsPerMonthCents: null, fundTargetTotalCents: 0 });
  same([plan.planningDate.getTime(), plan.planningDateFromHomeowner, plan.months], [at(14).getTime(), false, 14]);
});
add('missing:no-set-aside-is-zero', 'MISSING_DATA', 'an item with no reserve line has nothing set aside', () => {
  const plan = buildFundingPlan({ now: NOW, items: [planItem(100000, 100000, null)], posture: 'MODERATE', targetDate: at(12), growthRate: 0, depositsPerMonthCents: null, fundTargetTotalCents: 0 });
  same([plan.setAsideCents, plan.stillToFundCents], [0, 100000]);
});
add('missing:zero-cost-item', 'MISSING_DATA', 'an item with no cost plans for zero and needs nothing', () => {
  const plan = buildFundingPlan({ now: NOW, items: [planItem(0, 0, null)], posture: 'MODERATE', targetDate: at(12), growthRate: 0, depositsPerMonthCents: null, fundTargetTotalCents: 0 });
  same([plan.costAtTargetCents, plan.stillToFundCents, plan.neededPerMonthCents], [0, 0, 0]);
});
for (const text of ['how old is my roof', 'what is my water heater warranty', 'tell me about my home', 'show my plan', 'save for the roof']) add(`missing:no-date:${text}`, 'MISSING_DATA', `"${text}" names no date`, () => same(parseTargetDate(text, NOW), null));
for (const text of ['how old is my roof', 'what is due this week', 'I have 5 items', 'room 12 in 3 days']) add(`missing:no-amount:${text}`, 'MISSING_DATA', `"${text}" names no amount`, () => same(parseMoneyAmounts(text), []));

// ============ ENTITY: which items a question plans for ============
const ITEMS = [
  { id: 'roof', name: 'Roof', category: 'ROOF' }, { id: 'hvac', name: 'Gas furnace', category: 'HVAC' }, { id: 'wh', name: 'Water heater', category: 'PLUMBING' },
  { id: 'dw', name: 'Dishwasher', category: 'APPLIANCE' }, { id: 'washer', name: 'Washer', category: 'APPLIANCE' }, { id: 'fridge', name: 'Refrigerator', category: 'APPLIANCE' },
];
const NAMES = [['roof', ['roof']], ['furnace', ['hvac']], ['water heater', ['wh']], ['dishwasher', ['dw']], ['washing machine', ['washer']], ['fridge', ['fridge']], ['roofing', ['roof']], ['hvac', ['hvac']]];
for (const [phrase, expected] of NAMES) for (const [shape, write] of [['save', (p) => `how much should I save to replace my ${p} in 5 years`], ['cost', (p) => `how much to put aside for the ${p}`], ['afford', (p) => `can I afford a new ${p}`]]) {
  add(`entity:${phrase}:${shape}`, 'ENTITY', write(phrase), () => same(selectFundingItems(write(phrase), ITEMS).map((i) => i.id), expected));
}
add('entity:washer-not-dishwasher', 'ENTITY', '"washer" never selects the dishwasher', () => same(selectFundingItems('save for my washer', ITEMS).map((i) => i.id), ['washer']));
add('entity:none-named', 'ENTITY', 'no named item selects nothing', () => same(selectFundingItems('how much should I save', ITEMS), []));
add('entity:all-items', 'ENTITY', 'big replacements wording means every item', () => same([wantsAllFundingItems('how much should I save for all my big replacements'), namedFundingTerms('how much should I save for all my big replacements')], [true, []]));
add('entity:named-beats-all', 'ENTITY', 'a named item is never widened to all items', () => same(wantsAllFundingItems('save for all the replacements including the roof'), false));
add('entity:plan-keeps-items', 'ENTITY', 'a plan keeps every item in order and its totals are their sums', () => {
  const items = [planItem(1000000, 1000000, 100000, 'a', 'Roof'), planItem(500000, 500000, 0, 'b', 'Furnace'), planItem(200000, 200000, 50000, 'c', 'Water heater')];
  const plan = buildFundingPlan({ now: NOW, items, posture: 'MODERATE', targetDate: at(24), growthRate: 0, depositsPerMonthCents: null, fundTargetTotalCents: 0 });
  same(plan.items.map((i) => i.id), ['a', 'b', 'c']);
  same([plan.costAtTargetCents, plan.setAsideCents, plan.stillToFundCents, plan.neededPerMonthCents], [1700000, 150000, 1550000, ceilDiv(1550000, 24)]);
});
add('entity:item-set-aside-own-line', 'ENTITY', 'each item is capped by its own set-aside, not the fund total', () => {
  const items = [planItem(100000, 100000, 900000, 'a', 'Roof'), planItem(100000, 100000, 0, 'b', 'Furnace')];
  const plan = buildFundingPlan({ now: NOW, items, posture: 'MODERATE', targetDate: at(24), growthRate: 0, depositsPerMonthCents: null, fundTargetTotalCents: 0 });
  same(plan.items.map((i) => [i.setAsideCents, i.stillToFundCents]), [[100000, 0], [0, 100000]]);
});

// ============ AUTHORIZATION: no figure is computed for a home the person cannot reach ============
const accessModule = () => require('../../../src/services/propertyAccess.service.ts');
const HANDLERS = [
  ['funding goal', () => require('../../../src/services/ask/handlers/capitalItemFunding.handler.ts').itemFundingGoalResult, ['how much should I save to replace the roof in 5 years', 'save for my furnace in 3 years', 'how much do I need for all my big replacements by 2031']],
  ['replacement cost', () => require('../../../src/services/ask/handlers/itemReplacementCost.handler.ts').itemReplacementCostResult, ['how much does a new roof cost in 5 years', 'what does a new water heater cost', 'how much would a new furnace cost by 2030']],
];
for (const [name, handler, messages] of HANDLERS) for (const message of messages) {
  add(`authorization:${name}:${message}`, 'AUTHORIZATION', `${name}: "${message}" for a home the person cannot reach`, async () => {
    const { prisma } = require('../../../src/lib/prisma.ts');
    const access = accessModule(); const original = access.resolvePropertyAccess; const reads = [];
    const originals = {};
    for (const [delegate, method] of [['property', 'findUnique'], ['inventoryItem', 'count'], ['inventoryItem', 'findMany'], ['homeCapitalTimelineAnalysis', 'findFirst']]) {
      if (prisma[delegate] && prisma[delegate][method]) { originals[`${delegate}.${method}`] = prisma[delegate][method]; prisma[delegate][method] = async () => { reads.push(`${delegate}.${method}`); return null; }; }
    }
    access.resolvePropertyAccess = async () => null;
    try {
      let error = null;
      try { await handler()('someone-else', 'property-not-theirs', message, NOW); } catch (caught) { error = caught; }
      assert(error && error.code === 'ASK_PROPERTY_NOT_FOUND', `expected a denied-access error, got ${error && error.message}`);
      same(reads, [], 'reads before the access check');
    } finally {
      access.resolvePropertyAccess = original;
      for (const [key, fn] of Object.entries(originals)) { const [delegate, method] = key.split('.'); prisma[delegate][method] = fn; }
    }
  });
}

/** Cases recorded after a defect was found, so the suite only ever grows (EVAL-019). Each carries the defect it guards. */
// value:grow:350bps:2y:100000 - float compounding rounded the exact tie 107122.5 down (found by this suite on its first run, 2026-11-23).
const PERMANENT_REGRESSIONS = new Set(['value:grow:350bps:2y:100000']);

module.exports = { cases, PERMANENT_REGRESSIONS, manifest: () => ({ version: '1', suite: 'CALCULATION', cases: cases.map((c) => ({ id: c.id, partition: c.partition, description: c.description, ...(PERMANENT_REGRESSIONS.has(c.id) ? { permanentRegression: true } : {}) })), claimsPopulationBound: false }) };
