#!/usr/bin/env node
//
// Generates the manual mobile QA matrix AND runs the automated PWA contract
// check (PWA audit D2 / F12). The device-by-device journey table below is still
// filled in by hand, but the PWA layer — manifest, icons, offline fallback,
// registration, headers — is now verified here and this script exits non-zero
// if that contract is broken.

import fs from 'node:fs';
import path from 'node:path';
import { runPwaContractChecks } from '../check-pwa-contract.mjs';

const rootDir = process.cwd();
const outputPath = path.resolve(rootDir, '..', '..', 'docs', 'audit-gemini', 'sprint3-mobile-qa-matrix.md');

const cases = [
  {
    id: 'M-1',
    journey: 'Homeowner auth to dashboard',
    path: '/login -> /dashboard',
    expected: 'Sign-in succeeds and command center renders without layout overflow.',
  },
  {
    id: 'M-2',
    journey: 'Resolution to providers handoff',
    path: '/dashboard/resolution-center -> /dashboard/providers -> /dashboard/providers/[id] -> /dashboard/providers/[id]/book',
    expected: 'Category, service label, return path, and action context remain intact through booking.',
  },
  {
    id: 'M-3',
    journey: 'Protect and vault safety surfaces',
    path: '/dashboard/protect -> /dashboard/properties/[id]/vault',
    expected: 'Coverage, incidents, and trust metadata render correctly in mobile layout.',
  },
  {
    id: 'M-4',
    journey: 'Provider portal auth and queue',
    path: '/providers/login -> /providers/dashboard -> /providers/bookings -> /providers/bookings/[id]',
    expected: 'Provider can access queue and execute booking lifecycle actions.',
  },
  {
    id: 'M-5',
    journey: 'Provider operations screens',
    path: '/providers/services + /providers/calendar + /providers/portfolio + /providers/profile',
    expected: 'Core provider sections open from nav and preserve responsive usability.',
  },
];

const lines = [];
lines.push('# Sprint 3 Mobile QA Matrix');
lines.push('');
lines.push(`Date: ${new Date().toISOString().slice(0, 10)}`);
lines.push('Owner: QA Mobile + FE');
lines.push('Devices: iOS Safari, Android Chrome');
lines.push('');
lines.push('## Execution Rules');
lines.push('');
lines.push('1. Capture screenshot or video evidence for each case and device.');
lines.push('2. Mark `PASS` only when no P0/P1 issue exists for the case on that device.');
lines.push('3. Log any defect with route, repro steps, and severity before marking the case complete.');
lines.push('');
lines.push('## Matrix');
lines.push('');
lines.push('| ID | Journey | Path | Expected Result | iOS Safari | Android Chrome | Evidence | Notes |');
lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const testCase of cases) {
  lines.push(`| ${testCase.id} | ${testCase.journey} | ${testCase.path} | ${testCase.expected} | PENDING | PENDING | Pending capture | |`);
}
lines.push('');
// ── Automated PWA contract (D1) ─────────────────────────────────────────────
const { passed, failures } = runPwaContractChecks();

lines.push('## Automated PWA contract');
lines.push('');
lines.push(
  failures.length === 0
    ? `\`PASS\` — ${passed.length} checks (manifest, icons, offline fallback, registration, headers).`
    : `\`FAIL\` — ${failures.length} of ${passed.length + failures.length} checks failed:`,
);
lines.push('');
for (const name of failures) lines.push(`- \`FAIL\` ${name}`);
if (failures.length > 0) lines.push('');

lines.push('## Sign-off');
lines.push('');
lines.push('| Role | Name | Date | Status |');
lines.push('| --- | --- | --- | --- |');
lines.push('| QA Mobile Lead |  |  | PENDING |');
lines.push('| Frontend Lead |  |  | PENDING |');
lines.push('| PM |  |  | PENDING |');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${lines.join('\n')}\n`);

console.log(`[sprint3-mobile-matrix] Wrote ${outputPath}`);

if (failures.length > 0) {
  console.error(`[sprint3-mobile-matrix] PWA contract FAILED (${failures.length}):`);
  for (const name of failures) console.error(`  - ${name}`);
  process.exit(1);
}
console.log(`[sprint3-mobile-matrix] PWA contract passed (${passed.length} checks)`);
