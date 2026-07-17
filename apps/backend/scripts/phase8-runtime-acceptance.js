#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function required(value, label) {
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, '');
}

function getFactValue(snapshot, key) {
  const fact = snapshot?.facts?.[key];
  return fact && typeof fact === 'object' && 'value' in fact ? fact.value : undefined;
}

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}

async function responseJson(response, label) {
  const body = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`${label} returned non-JSON (${response.status()}): ${body.slice(0, 300)}`);
  }
  if (!response.ok()) {
    throw new Error(`${label} failed (${response.status()}): ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

async function main() {
  const manifestPath = path.resolve(required(argument('--manifest'), '--manifest'));
  const evidencePath = path.resolve(argument('--evidence', 'tmp/phase8-runtime-evidence.json'));
  const apiBaseUrl = normalizeBaseUrl(process.env.PHASE8_API_BASE_URL || 'http://localhost:8080');
  const webBaseUrl = normalizeBaseUrl(process.env.PHASE8_WEB_BASE_URL || 'http://localhost:3000');
  const workerMetricsUrl = required(process.env.PHASE8_WORKER_METRICS_URL, 'PHASE8_WORKER_METRICS_URL');
  const email = required(process.env.PHASE8_EMAIL, 'PHASE8_EMAIL');
  const password = required(process.env.PHASE8_PASSWORD, 'PHASE8_PASSWORD');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  if (!Array.isArray(manifest.archetypes) || manifest.archetypes.length !== 10) {
    throw new Error('The manifest must contain exactly ten archetypes.');
  }

  const evidence = {
    gate: 'PROPERTY_CONTEXT_PHASE8_RUNTIME_ACCEPTANCE',
    startedAt: new Date().toISOString(),
    apiBaseUrl,
    webBaseUrl,
    workerMetricsUrl,
    archetypes: [],
    worker: null,
    passed: false,
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  try {
    const loginResponse = await context.request.post(`${apiBaseUrl}/api/auth/login`, {
      data: { email, password },
    });
    const login = await responseJson(loginResponse, 'Login');
    if (login?.data?.mfaRequired) {
      throw new Error('Phase 8 runtime user requires MFA; use a non-MFA acceptance account.');
    }

    for (const archetype of manifest.archetypes) {
      const key = required(archetype.key, 'archetype.key');
      const propertyId = required(archetype.propertyId, `${key}.propertyId`);
      const apiStartedAt = Date.now();
      const contextResponse = await context.request.get(
        `${apiBaseUrl}/api/properties/${encodeURIComponent(propertyId)}/context`,
      );
      const contextPayload = await responseJson(contextResponse, `${key} context`);
      const snapshot = contextPayload.data;
      assertEqual(snapshot.propertyId, propertyId, `${key}.propertyId`);
      if (!snapshot.contextVersion) throw new Error(`${key} did not return a contextVersion.`);

      const factAssertions = [];
      for (const [factKey, expected] of Object.entries(archetype.expectedFacts || {})) {
        const actual = getFactValue(snapshot, factKey);
        assertEqual(actual, expected, `${key}.${factKey}`);
        factAssertions.push({ factKey, expected, actual, passed: true });
      }

      const page = await context.newPage();
      const uiStartedAt = Date.now();
      const uiPath = archetype.uiPath || `/dashboard/properties/${propertyId}/tools/guidance-overview`;
      const uiUrl = `${webBaseUrl}${uiPath.startsWith('/') ? uiPath : `/${uiPath}`}`;
      const navigation = await page.goto(uiUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      if (!navigation || navigation.status() >= 400) {
        throw new Error(`${key} UI returned ${navigation?.status() ?? 'no response'} for ${uiUrl}.`);
      }
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
      if (/\/login(?:\?|$)/.test(page.url())) throw new Error(`${key} UI redirected to login.`);
      const bodyText = await page.locator('body').innerText();
      if (/application error|internal server error|failed to load property/i.test(bodyText)) {
        throw new Error(`${key} UI rendered an application failure.`);
      }
      for (const expectedText of archetype.expectedUiText || []) {
        if (!bodyText.toLowerCase().includes(String(expectedText).toLowerCase())) {
          throw new Error(`${key} UI did not contain expected text: ${expectedText}`);
        }
      }
      await page.close();

      evidence.archetypes.push({
        key,
        propertyId,
        contextVersion: snapshot.contextVersion,
        apiDurationMs: Date.now() - apiStartedAt,
        uiDurationMs: Date.now() - uiStartedAt,
        uiUrl,
        factAssertions,
        passed: true,
      });
    }

    const workerStartedAt = Date.now();
    const workerResponse = await context.request.get(workerMetricsUrl);
    const workerMetrics = await workerResponse.text();
    if (!workerResponse.ok()) {
      throw new Error(`Worker metrics failed (${workerResponse.status()}).`);
    }
    for (const metric of [
      'process_start_time_seconds',
      'bullmq_jobs_processed_total',
      'cron_job_runs_total',
      'cron_job_last_success_timestamp_seconds',
    ]) {
      if (!workerMetrics.includes(metric)) throw new Error(`Worker metric missing: ${metric}`);
    }
    evidence.worker = {
      durationMs: Date.now() - workerStartedAt,
      requiredMetrics: [
        'process_start_time_seconds',
        'bullmq_jobs_processed_total',
        'cron_job_runs_total',
        'cron_job_last_success_timestamp_seconds',
      ],
      passed: true,
    };
    evidence.passed = true;
  } finally {
    evidence.finishedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    await context.close();
    await browser.close();
  }

  process.stdout.write(`Phase 8 runtime acceptance passed. Evidence: ${evidencePath}\n`);
}

main().catch((error) => {
  process.stderr.write(`Phase 8 runtime acceptance failed: ${error.stack || error.message}\n`);
  process.exitCode = 1;
});
