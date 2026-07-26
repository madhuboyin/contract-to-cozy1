const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const backendRoot = path.resolve(__dirname, '../..');
const scriptPath = path.join(backendRoot, 'run-schema-push-job.sh');

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
if (args[0] === 'wait') {
  if (has('--for=create')) process.exit(0);
  if (has('--for=condition=Ready')) {
    process.exit(scenario === 'container-creating' ? 1 : 0);
  }
}
if (args[0] === 'logs') {
  process.stdout.write(
    scenario === 'success'
      ? 'Applying Prisma schema from ConfigMap...\\n'
      : 'container is waiting to start: ContainerCreating\\n',
  );
  process.exit(scenario === 'success' ? 0 : 1);
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
      POD_READY_TIMEOUT: '1s',
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
