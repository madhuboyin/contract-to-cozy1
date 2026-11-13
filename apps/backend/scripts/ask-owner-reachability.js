#!/usr/bin/env node
// Owner reachability (reliability FRD FR-DATA-3 / FR-DATA-7, measured DYNAMICALLY and OFFLINE): for every catalogued data point and every query template, can a plain-English owner question reach it through the real router
// (`resolveAskOperation`) and the real resolvers (`resolveDataPoint`, `planDataPointQuery`)? No database, no model. IMPORTANT LIMITS: the phrasings are SYNTHETIC, generated from each point's own aliases and cues, so this
// measures alias/cue/routing mechanics, not how real owners phrase things; it is not the sealed human-written set and it proves nothing about the 90% objective. Two numbers per domain:
//   reachable      the point has at least one generated phrasing that routes to DATA_POINT_READ and resolves to exactly this point (FR-DATA-3: "at least one deterministic read path")
//   honor rate     the share of ALL generated phrasings for the domain that do so (a rough robustness signal)
//   node scripts/ask-owner-reachability.js [--json=out.json] [--verbose]
require('ts-node/register/transpile-only');
const args = process.argv.slice(2); const jsonOut = (args.find((a) => a.startsWith('--json=')) ?? '').slice(7) || null; const verbose = args.includes('--verbose');
const { measure } = require('./lib/askOwnerReachability');
const { byDomain, unreachable, queryRows } = measure(verbose);
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : 'n/a');
const total = [...byDomain.values()].reduce((s, d) => ({ points: s.points + d.points, reachable: s.reachable + d.reachable, resolvesOnly: s.resolvesOnly + d.resolvesOnlyPoints, phrasings: s.phrasings + d.phrasings, routed: s.routed + d.routed }), { points: 0, reachable: 0, resolvesOnly: 0, phrasings: 0, routed: 0 });
console.log('Owner reachability over SYNTHETIC phrasings (offline, no database, no model; not the sealed human set)\n');
console.log('domain'.padEnd(26), 'points'.padStart(6), 'reachable'.padStart(10), 'resolves-only'.padStart(14), 'phrasing honor'.padStart(15));
for (const [domain, d] of [...byDomain.entries()].sort()) console.log(domain.padEnd(26), String(d.points).padStart(6), `${d.reachable} (${pct(d.reachable, d.points)})`.padStart(10), String(d.resolvesOnlyPoints).padStart(14), `${d.routed}/${d.phrasings} (${pct(d.routed, d.phrasings)})`.padStart(15));
console.log('TOTAL'.padEnd(26), String(total.points).padStart(6), `${total.reachable} (${pct(total.reachable, total.points)})`.padStart(10), String(total.resolvesOnly).padStart(14), `${total.routed}/${total.phrasings} (${pct(total.routed, total.phrasings)})`.padStart(15));
console.log(`\nUnreachable (no generated phrasing resolves to the point): ${unreachable.length}`); for (const u of unreachable) console.log(`  ${u.id}   e.g. "${u.example}"`);
const qOk = queryRows.filter((r) => r.ok).length; console.log(`\nQuery shapes 3-6: ${qOk}/${queryRows.length} canonical questions plan to the intended shape (${pct(qOk, queryRows.length)}); routed to DATA_POINT_READ: ${queryRows.filter((r) => r.operation === 'DATA_POINT_READ').length}`);
for (const r of queryRows.filter((x) => !x.ok || x.operation !== 'DATA_POINT_READ')) console.log(`  [${r.template}/${r.shape}] "${r.message}" -> plan ${r.planned}, operation ${r.operation}`);
if (jsonOut) require('node:fs').writeFileSync(jsonOut, JSON.stringify({ generated: 'synthetic phrasings', byDomain: Object.fromEntries(byDomain), total, unreachable, queryRows }, null, 2));
