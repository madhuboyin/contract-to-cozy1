#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const reportPath = path.resolve(rootDir, '..', '..', 'docs', 'audit-gemini', 'sprint3-provider-smoke-report.md');

function read(relativePath) {
  const fullPath = path.join(rootDir, relativePath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, 'utf8');
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

const requiredRoutes = [
  { route: '/providers/login', file: 'src/app/providers/login/page.tsx' },
  { route: '/providers/join', file: 'src/app/providers/join/page.tsx' },
  { route: '/providers/dashboard', file: 'src/app/providers/(dashboard)/dashboard/page.tsx' },
  { route: '/providers/bookings', file: 'src/app/providers/(dashboard)/bookings/page.tsx' },
  { route: '/providers/bookings/[id]', file: 'src/app/providers/(dashboard)/bookings/[id]/page.tsx' },
  { route: '/providers/services', file: 'src/app/providers/(dashboard)/services/page.tsx' },
  { route: '/providers/calendar', file: 'src/app/providers/(dashboard)/calendar/page.tsx' },
  { route: '/providers/portfolio', file: 'src/app/providers/(dashboard)/portfolio/page.tsx' },
  { route: '/providers/profile', file: 'src/app/providers/(dashboard)/profile/page.tsx' },
];

const loginSource = read('src/app/providers/login/page.tsx') || '';
const joinSource = read('src/app/providers/join/page.tsx') || '';
const bookingsSource = read('src/app/providers/(dashboard)/bookings/page.tsx') || '';
const bookingDetailSource = read('src/app/providers/(dashboard)/bookings/[id]/page.tsx') || '';
const layoutSource = read('src/app/providers/(dashboard)/layout.tsx') || '';

const checks = [
  {
    id: 'R-1',
    name: 'Provider route inventory exists',
    pass: requiredRoutes.every((item) => fileExists(item.file)),
    details: requiredRoutes
      .map((item) => `${fileExists(item.file) ? 'OK' : 'MISSING'} ${item.route} -> ${item.file}`)
      .join('; '),
  },
  {
    id: 'A-1',
    name: 'Provider auth routing loop wired',
    pass:
      loginSource.includes('/providers/dashboard') &&
      loginSource.includes('/providers/join') &&
      joinSource.includes('/providers/login') &&
      joinSource.includes("role: 'PROVIDER'") &&
      joinSource.includes('/providers/dashboard'),
    details:
      'Validated login redirect, join/login cross-links, and provider-role signup payload in auth pages.',
  },
  {
    id: 'B-1',
    name: 'Booking queue lifecycle actions wired',
    pass:
      bookingsSource.includes('api.confirmBooking') &&
      bookingsSource.includes('api.startBooking') &&
      bookingsSource.includes('api.completeBooking') &&
      bookingsSource.includes('api.cancelBooking') &&
      bookingsSource.includes('/providers/bookings/${booking.id}'),
    details:
      'Queue page includes accept/start/complete/cancel mutations and detail-route deep link from list items.',
  },
  {
    id: 'B-2',
    name: 'Booking detail page supports provider actions',
    pass:
      bookingDetailSource.includes('api.confirmBooking') &&
      bookingDetailSource.includes('api.startBooking') &&
      bookingDetailSource.includes('api.completeBooking') &&
      bookingDetailSource.includes('api.cancelBooking') &&
      bookingDetailSource.includes('/providers/bookings'),
    details:
      'Detail page supports status transitions and return path to queue.',
  },
  {
    id: 'N-1',
    name: 'Provider dashboard navigation exposes all core sections',
    pass:
      layoutSource.includes('/providers/dashboard') &&
      layoutSource.includes('/providers/bookings') &&
      layoutSource.includes('/providers/services') &&
      layoutSource.includes('/providers/calendar') &&
      layoutSource.includes('/providers/portfolio') &&
      layoutSource.includes('/providers/profile'),
    details:
      'Layout navigation includes dashboard, bookings, services, calendar, portfolio, and profile.',
  },
];

const failed = checks.filter((check) => !check.pass);

const lines = [];
lines.push('# Sprint 3 Provider Portal Smoke Report');
lines.push('');
lines.push(`Date: ${new Date().toISOString().slice(0, 10)}`);
lines.push('Scope: Provider auth, dashboard navigation, queue lifecycle, booking detail interactions.');
lines.push('');
lines.push('## Results');
lines.push('');
lines.push('| Check | Status | Notes |');
lines.push('| --- | --- | --- |');
for (const check of checks) {
  lines.push(`| ${check.id} ${check.name} | ${check.pass ? 'PASS' : 'FAIL'} | ${check.details} |`);
}
lines.push('');
lines.push('## Summary');
lines.push('');
lines.push(`- Checks run: ${checks.length}`);
lines.push(`- Passed: ${checks.length - failed.length}`);
lines.push(`- Failed: ${failed.length}`);
lines.push(`- Status: ${failed.length === 0 ? 'PASS' : 'FAIL'}`);

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${lines.join('\n')}\n`);

if (failed.length > 0) {
  console.error(`[sprint3-provider-smoke] FAILED: ${failed.length} check(s).`);
  console.error(`[sprint3-provider-smoke] Report: ${reportPath}`);
  process.exit(1);
}

console.log('[sprint3-provider-smoke] PASSED');
console.log(`[sprint3-provider-smoke] Report: ${reportPath}`);
