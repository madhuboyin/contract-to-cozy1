// Library for scripts/ask-owner-reachability.js and tests/ask/ownerReachability.test.js. See the script header for what the measurement is and is not
// (SYNTHETIC phrasings generated from the catalogue's own aliases and cues; offline; no database or model; not the sealed human set).
require('ts-node/register/transpile-only');
const { DATA_POINT_DEFINITIONS, resolveDataPoint } = require('../../src/services/ask/dataPoint/dataPointCatalogue.ts');
const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const { QUERY_TEMPLATES, planDataPointQuery } = require('../../src/services/ask/dataPoint/dataPointQueryPlan.ts');

// A representative thing the owner would name, per entity (named reads need one; singletons and relation reads take their compound cue).
const SUBJECT = { InventoryItem: 'refrigerator', Warranty: 'dishwasher', InsurancePolicy: 'homeowners', PropertyMaintenanceTask: 'gutter cleaning', PropertyRecord: 'roof permit', Claim: 'basement flood' };
const NOUN = { Warranty: 'warranty', InsurancePolicy: 'insurance policy', PropertyMaintenanceTask: 'task', PropertyRecord: 'document', InventoryItem: '' };

function phrasings(point) {
  const out = new Set(); const subject = SUBJECT[point.entity] ?? '';
  const cues = point.cues?.length ? [...point.cues] : [NOUN[point.entity] ?? ''];
  for (const alias of point.aliases) for (const cue of cues) {
    const target = point.cues ? `${cue}${subject ? ` ${subject}` : ''}`.trim() : `${subject}`.trim();
    out.add(`What is the ${alias} of my ${target}?`);
    out.add(`Tell me the ${alias} for my ${target}.`);
    if (point.family === 'date') out.add(`When is my ${target} ${alias}?`);
  }
  return [...out].slice(0, 12);
}
const reaches = (message, expectId) => {
  let op; try { op = resolveAskOperation(message).operationId; } catch { return false; }
  // A point read may be taken by a more specific operation that answers the same question (the catalogue points to it, FR-DATA-6): recorded separately, not counted as routed.
  return resolveDataPoint(message)?.id === expectId ? (op === 'DATA_POINT_READ' ? 'ROUTED' : 'RESOLVES_BUT_OTHER_OPERATION') : false;
};

function measure(verbose = false) {
  const byDomain = new Map(); const unreachable = [];
  for (const point of DATA_POINT_DEFINITIONS) {
    const list = phrasings(point); let routed = 0; let resolvesOnly = 0;
    const d = byDomain.get(point.domain) ?? { points: 0, reachable: 0, resolvesOnlyPoints: 0, phrasings: 0, routed: 0 }; byDomain.set(point.domain, d);
    for (const m of list) { const r = reaches(m, point.id); d.phrasings += 1; if (r === 'ROUTED') { routed += 1; d.routed += 1; } else if (r === 'RESOLVES_BUT_OTHER_OPERATION') resolvesOnly += 1; }
    d.points += 1;
    if (routed > 0) d.reachable += 1; else if (resolvesOnly > 0) d.resolvesOnlyPoints += 1; else unreachable.push({ id: point.id, example: list[0] ?? null });
    if (verbose) console.log(`${routed > 0 ? 'OK ' : resolvesOnly > 0 ? 'RES' : 'NO '} ${point.id}  (${routed}/${list.length} routed)  e.g. ${list[0]}`);
  }
  // query shapes 3-6: one canonical owner question per (template, shape, declared field) that must plan to the intended shape
  const queryRows = []; const NOW = new Date('2026-11-13T12:00:00Z');
  for (const t of QUERY_TEMPLATES) {
    const plural = t.nouns[0];
    const asks = [[`How many ${plural} do I have?`, 'AGGREGATE'], [`What ${plural} do I have?`, 'LIST']];
    for (const [key, f] of Object.entries(t.fields)) {
      if (f.type === 'date' && key === t.dateField && t.id !== 'inventory') asks.push([`Which ${plural} are ${/expir/.test(f.words[0]) ? 'expiring in the next 90 days' : 'due in the next 30 days'}?`, 'FILTER']);
      if (f.measure) { asks.push([`What is the total ${f.label} of my ${plural}?`, 'AGGREGATE']); asks.push([`Which ${plural} cost more than $500 by ${f.label}?`, 'FILTER']); asks.push([`What are my top 3 ${plural} by ${f.label}?`, 'TOP_K']); }
    }
    for (const [message, shape] of asks) {
      const o = planDataPointQuery(message, NOW); const op = (() => { try { return resolveAskOperation(message).operationId; } catch { return 'ERROR'; } })();
      queryRows.push({ template: t.id, shape, message, planned: o.kind === 'PLAN' ? o.plan.shape : o.kind, ok: o.kind === 'PLAN' && o.plan.shape === shape, operation: op });
    }
  }
  return { byDomain, unreachable, queryRows };
}
module.exports = { measure, phrasings };
