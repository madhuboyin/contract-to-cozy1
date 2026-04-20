#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const appRoot = path.join(rootDir, 'src', 'app');
const reportPath = path.resolve(rootDir, '..', '..', 'docs', 'audit-gemini', 'sprint3-final-cta-traversal-report.md');

const scopeFiles = [
  'src/app/(dashboard)/dashboard/page.tsx',
  'src/app/(dashboard)/dashboard/resolution-center/ResolutionCenterClient.tsx',
  'src/app/(dashboard)/dashboard/protect/RiskProtectionClient.tsx',
  'src/app/(dashboard)/dashboard/save/FinancialEfficiencyClient.tsx',
  'src/app/(dashboard)/dashboard/providers/page.tsx',
  'src/app/(dashboard)/dashboard/providers/[id]/page.tsx',
  'src/app/(dashboard)/dashboard/providers/[id]/book/page.tsx',
  'src/app/(dashboard)/dashboard/properties/[id]/vault/page.tsx',
  'src/app/providers/(dashboard)/layout.tsx',
  'src/app/providers/(dashboard)/dashboard/page.tsx',
  'src/app/providers/(dashboard)/bookings/page.tsx',
  'src/app/providers/(dashboard)/bookings/[id]/page.tsx',
  'src/app/providers/(dashboard)/services/page.tsx',
  'src/app/providers/(dashboard)/calendar/page.tsx',
  'src/app/providers/(dashboard)/portfolio/page.tsx',
  'src/app/providers/(dashboard)/profile/page.tsx',
  'src/app/providers/login/page.tsx',
  'src/app/providers/join/page.tsx',
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (entry.isFile() && entry.name === 'page.tsx') {
      out.push(full);
    }
  }
  return out;
}

function toRoute(filePath) {
  const rel = path.relative(appRoot, filePath).replace(/\\/g, '/');
  if (rel === 'page.tsx') return '/';

  let route = `/${rel
    .replace(/\/page\.tsx$/, '')
    .replace(/\/\(.*?\)\//g, '/')
    .replace(/\(.*?\)/g, '')
    .replace(/\/index$/, '')}`;

  route = route.replace(/\/+/g, '/');
  route = route === '/' ? '/' : route.replace(/\/$/, '');
  return route;
}

function normalizeTarget(rawTarget) {
  let value = rawTarget.trim();
  if (!value.startsWith('/')) return null;
  if (value.startsWith('//')) return null;

  value = value.split('#')[0];
  value = value.split('?')[0];
  value = value.replace(/\$\{[^}]+\}/g, '[dynamic]');
  value = value.replace(/\/+/g, '/');

  if (value.length > 1 && value.endsWith('/')) {
    value = value.slice(0, -1);
  }

  return value || '/';
}

function isDynamicSegment(segment) {
  return segment === '[dynamic]' || /^\[[^\]]+\]$/.test(segment);
}

function routeMatches(target, route) {
  const a = target.split('/').filter(Boolean);
  const b = route.split('/').filter(Boolean);
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === b[i]) continue;
    if (isDynamicSegment(a[i]) || isDynamicSegment(b[i])) continue;
    return false;
  }
  return true;
}

function extractTargets(source) {
  const matches = [];
  const patterns = [
    /href\s*=\s*["'`]([^"'`]+)["'`]/g,
    /href\s*=\s*{\s*`([^`]+)`\s*}/g,
    /router\.(?:push|replace)\(\s*["'`]([^"'`]+)["'`]/g,
    /router\.(?:push|replace)\(\s*`([^`]+)`/g,
    /window\.location\.href\s*=\s*["'`]([^"'`]+)["'`]/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const raw = match[1];
      const line = source.slice(0, match.index).split('\n').length;
      matches.push({ raw, line });
    }
  }

  return matches;
}

const routeFiles = walk(appRoot);
const routeManifest = routeFiles.map(toRoute);
const unresolved = [];
const scannedLinks = [];

for (const relativeFile of scopeFiles) {
  const absoluteFile = path.join(rootDir, relativeFile);
  if (!fs.existsSync(absoluteFile)) {
    unresolved.push({
      file: relativeFile,
      line: 1,
      target: '[file-missing]',
      reason: 'Scoped file does not exist',
    });
    continue;
  }

  const source = fs.readFileSync(absoluteFile, 'utf8');
  const targets = extractTargets(source);

  for (const item of targets) {
    const normalized = normalizeTarget(item.raw);
    if (!normalized) continue;

    const exists = routeManifest.some((route) => routeMatches(normalized, route));
    scannedLinks.push({ file: relativeFile, line: item.line, target: normalized, exists });

    if (!exists) {
      unresolved.push({
        file: relativeFile,
        line: item.line,
        target: normalized,
        reason: 'No matching app route found',
      });
    }
  }
}

const uniqueScanned = new Map();
for (const link of scannedLinks) {
  const key = `${link.file}:${link.line}:${link.target}`;
  if (!uniqueScanned.has(key)) uniqueScanned.set(key, link);
}

const lines = [];
lines.push('# Sprint 3 Final CTA Traversal Report');
lines.push('');
lines.push(`Date: ${new Date().toISOString().slice(0, 10)}`);
lines.push('Scope: Tier-1 homeowner + provider surfaces');
lines.push('');
lines.push('## Summary');
lines.push('');
lines.push(`- Files audited: ${scopeFiles.length}`);
lines.push(`- CTA links scanned: ${uniqueScanned.size}`);
lines.push(`- Broken links found: ${unresolved.length}`);
lines.push('');

if (unresolved.length === 0) {
  lines.push('## Result');
  lines.push('');
  lines.push('- PASS: No unresolved static CTA targets detected in Sprint 3 scope.');
} else {
  lines.push('## Broken Targets');
  lines.push('');
  lines.push('| File | Line | Target | Reason |');
  lines.push('| --- | ---: | --- | --- |');
  for (const issue of unresolved) {
    lines.push(`| ${issue.file} | ${issue.line} | ${issue.target} | ${issue.reason} |`);
  }
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${lines.join('\n')}\n`);

if (unresolved.length > 0) {
  console.error(`[sprint3-cta] FAILED: ${unresolved.length} broken CTA target(s).`);
  console.error(`[sprint3-cta] Report: ${reportPath}`);
  process.exit(1);
}

console.log('[sprint3-cta] PASSED');
console.log(`[sprint3-cta] Report: ${reportPath}`);
