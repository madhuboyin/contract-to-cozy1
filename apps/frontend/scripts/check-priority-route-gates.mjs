#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const configPath = path.join(rootDir, 'qa', 'priority-route-gates.json');

if (!fs.existsSync(configPath)) {
  console.error(`[priority-route-gates] Missing config at ${configPath}`);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const routes = Array.isArray(config.routes) ? config.routes : [];

if (routes.length === 0) {
  console.error('[priority-route-gates] No routes configured.');
  process.exit(1);
}

function readRouteContent(routeConfig) {
  const chunks = [];
  for (const relativeFile of routeConfig.files || []) {
    const absoluteFile = path.join(rootDir, relativeFile);
    if (!fs.existsSync(absoluteFile)) {
      throw new Error(`Configured file does not exist: ${relativeFile}`);
    }
    const source = fs.readFileSync(absoluteFile, 'utf8');
    chunks.push(`\n/* FILE: ${relativeFile} */\n${source}`);
  }
  return chunks.join('\n');
}

function runCheck(routeLabel, checkName, checkConfig, source) {
  if (!checkConfig?.required) {
    return { ok: true, skipped: true, reason: 'not required' };
  }

  const patterns = Array.isArray(checkConfig.any) ? checkConfig.any : [];
  if (patterns.length === 0) {
    return { ok: false, skipped: false, reason: `missing patterns for ${checkName}` };
  }

  const matchedPattern = patterns.find((pattern) => source.includes(pattern));
  if (!matchedPattern) {
    return {
      ok: false,
      skipped: false,
      reason: `expected one of: ${patterns.join(' | ')}`,
    };
  }

  return { ok: true, skipped: false, matchedPattern };
}

const failures = [];
const summaries = [];

for (const route of routes) {
  try {
    const routeSource = readRouteContent(route);
    const checks = route.checks || {};
    const hierarchy = runCheck(route.route, 'hierarchy', checks.hierarchy, routeSource);
    const trust = runCheck(route.route, 'trust', checks.trust, routeSource);
    const mobile = runCheck(route.route, 'mobile', checks.mobile, routeSource);
    const consistency = runCheck(route.route, 'consistency', checks.consistency, routeSource);

    const routeFailures = [
      ['hierarchy', hierarchy],
      ['trust', trust],
      ['mobile', mobile],
      ['consistency', consistency],
    ].filter(([, result]) => !result.ok);

    if (routeFailures.length > 0) {
      for (const [checkName, result] of routeFailures) {
        failures.push(`${route.route} -> ${checkName}: ${result.reason}`);
      }
    } else {
      summaries.push(route.route);
    }
  } catch (error) {
    failures.push(`${route.route} -> config/file error: ${error.message}`);
  }
}

if (failures.length > 0) {
  console.error('\n[priority-route-gates] FAILED');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('[priority-route-gates] PASSED');
console.log(`Validated routes (${summaries.length}): ${summaries.join(', ')}`);

