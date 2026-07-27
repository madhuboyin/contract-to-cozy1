const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const backendRoot = path.resolve(__dirname, '../..');
const scriptPath = path.join(backendRoot, 'run-schema-push-job.sh');
const scriptSource = fs.readFileSync(scriptPath, 'utf8');

function runScript(scenario) {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'schema-push-job-test-'),
  );
  const binDir = path.join(tempRoot, 'bin');
  fs.mkdirSync(binDir);
  const kubectlPath = path.join(binDir, 'kubectl');
  fs.writeFileSync(
    kubectlPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
const scenario = process.env.KUBECTL_TEST_SCENARIO;
const has = (value) => args.includes(value);
const jsonpath = args.find((value) => value.startsWith('jsonpath=') || value.startsWith('{.'));

if (args[0] === 'create' && args[1] === 'configmap') {
  process.stdout.write('apiVersion: v1\\nkind: ConfigMap\\n');
  process.exit(0);
}
if (args[0] === 'apply') {
  process.stdin.resume();
  process.stdin.on('end', () => process.exit(0));
  return;
}
if (args[0] === 'get' && args[1] === 'secret') {
  if (has('-o')) process.stdout.write('ZGF0YWJhc2UtdXJs');
  process.exit(0);
}
if (args[0] === 'get' && args[1] === 'namespace') process.exit(0);
if (args[0] === 'get' && args[1] === 'pods') {
  if (has('-o') && args.some((value) => value.includes('jsonpath='))) {
    process.stdout.write('migration-pod-1');
  }
  process.exit(0);
}
if (args[0] === 'get' && args[1] === 'job') {
  if (
    scenario === 'success' &&
    args.some((value) => value.includes('.status.succeeded'))
  ) {
    process.stdout.write('1');
  }
  process.exit(0);
}
if (args[0] === 'get' && args[1] === 'pod') {
  if (
    args.some((value) => value.includes('.status.phase')) &&
    args.some((value) => value.includes('Ready'))
  ) {
    process.stdout.write(
      scenario === 'early-failure'
        ? 'Failed|False'
        : scenario === 'fast-success'
          ? 'Succeeded|False'
          : scenario === 'success'
            ? 'Running|True'
            : 'Pending|False',
    );
  }
  process.exit(0);
}
if (args[0] === 'wait') {
  if (has('--for=create')) process.exit(0);
}
if (args[0] === 'logs') {
  process.stdout.write(
    scenario === 'success' || scenario === 'fast-success'
      ? 'Applying Prisma schema from ConfigMap...\\n'
      : 'container is waiting to start: ContainerCreating\\n',
  );
  process.exit(
    scenario === 'success' || scenario === 'fast-success' ? 0 : 1,
  );
}
if (args[0] === 'describe' && args[1] === 'pod') {
  process.stderr.write('MOCK POD EVENT: FailedMount prisma-schema\\n');
  process.exit(0);
}
if (args[0] === 'get' && args[1] === 'events') {
  process.stderr.write('MOCK EVENT: pod remained ContainerCreating\\n');
  process.exit(0);
}
process.exit(0);
`,
  );
  fs.chmodSync(kubectlPath, 0o755);

  const result = spawnSync('bash', [scriptPath], {
    cwd: backendRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      KUBECTL_TEST_SCENARIO: scenario,
      JOB_NAME: 'schema-push-test',
      POD_CREATION_TIMEOUT: '1s',
      POD_READY_TIMEOUT: scenario === 'early-failure' ? '10s' : '1s',
      POD_STATUS_POLL_INTERVAL_SECONDS: '1',
      JOB_WAIT_TIMEOUT_SECONDS: '2',
      JOB_POLL_INTERVAL_SECONDS: '1',
    },
  });
  fs.rmSync(tempRoot, { recursive: true, force: true });
  return result;
}

test('ContainerCreating exits with pod and event diagnostics instead of hanging', () => {
  const result = runScript('container-creating');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /did not become ready/);
  assert.match(result.stderr, /FailedMount prisma-schema/);
  assert.match(result.stderr, /pod remained ContainerCreating/);
  assert.doesNotMatch(result.stdout, /Streaming logs/);
});

test('ready pod streams logs and exits after Job success', () => {
  const result = runScript('success');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Streaming logs for migration-pod-1/);
  assert.match(result.stdout, /Schema push completed successfully/);
});

test('failed pod exits immediately with diagnostics', () => {
  const startedAt = Date.now();
  const result = runScript('early-failure');
  const elapsedMs = Date.now() - startedAt;

  assert.equal(result.status, 1);
  assert.ok(
    elapsedMs < 9000,
    `expected failure before the 10s readiness timeout, took ${elapsedMs}ms`,
  );
  assert.match(result.stderr, /terminated with failure before becoming ready/);
  assert.match(result.stderr, /FailedMount prisma-schema/);
});

test('pod that completes before readiness is treated as success', () => {
  const result = runScript('fast-success');

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Schema push completed successfully/);
  assert.doesNotMatch(result.stdout, /Streaming logs for migration-pod-1/);
});

test('migration job uses an isolated pinned Prisma runtime', () => {
  assert.match(
    scriptSource,
    /MIGRATION_IMAGE=.*node:22-bookworm@sha256:[a-f0-9]{64}/,
  );
  assert.match(scriptSource, /PRISMA_CLI_VERSION=.*5\.22\.0/);
  assert.match(
    scriptSource,
    /npx --yes --package=prisma@\$\{PRISMA_CLI_VERSION\} prisma db push/,
  );
  assert.match(
    scriptSource,
    /CREATE EXTENSION IF NOT EXISTS postgis/,
  );
  assert.match(
    scriptSource,
    /prisma db execute[\s\S]*--stdin[\s\S]*--schema=\/config\/schema\.prisma/,
  );
  assert.match(scriptSource, /name: NPM_CONFIG_CACHE/);
  assert.match(scriptSource, /runAsNonRoot: true/);
  assert.match(scriptSource, /allowPrivilegeEscalation: false/);
  assert.doesNotMatch(scriptSource, /image: \$\{BACKEND_IMAGE\}/);
  assert.doesNotMatch(scriptSource, /cd \/app/);
});

test('missing Radar notification decision table is bootstrapped before the full schema push', () => {
  assert.match(
    scriptSource,
    /SELECT 1 FROM "property_radar_notification_decisions" LIMIT 0;/,
  );
  assert.match(
    scriptSource,
    /CREATE TABLE IF NOT EXISTS "property_radar_notification_decisions" \("id" TEXT NOT NULL, CONSTRAINT "property_radar_notification_decisions_pkey" PRIMARY KEY \("id"\)\);/,
  );
  assert.match(
    scriptSource,
    /SELECT 1 FROM "property_radar_notification_decisions"[\s\S]*CREATE TABLE IF NOT EXISTS "property_radar_notification_decisions"[\s\S]*prisma db push[\s\S]*schema=\/config\/schema\.prisma/,
  );
});

test('legacy Radar channel enum is reconciled only after the new usage column exists', () => {
  assert.doesNotMatch(scriptSource, /DO \\\$\\\$/);
  assert.match(
    scriptSource,
    /ADD COLUMN IF NOT EXISTS "eligibleChannels" "RadarNotificationChannel"\[\] NOT NULL DEFAULT ARRAY\[\]::"RadarNotificationChannel"\[\]/,
  );
  assert.match(
    scriptSource,
    /CREATE TABLE IF NOT EXISTS "property_radar_notification_decisions"[\s\S]*SELECT NULL::"RadarNotificationChannel"[\s\S]*ADD COLUMN IF NOT EXISTS "eligibleChannels"[\s\S]*prisma db push/,
  );
});
