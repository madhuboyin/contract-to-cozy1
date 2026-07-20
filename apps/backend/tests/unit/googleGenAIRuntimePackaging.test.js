const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '../..');
const repositoryRoot = path.resolve(backendRoot, '../..');

test('backend pins and loads the CommonJS Google Gen AI runtime', () => {
  const packageJson = require('../../package.json');
  const lockfile = require('../../package-lock.json');
  const sdk = require('@google/genai');

  assert.equal(packageJson.dependencies['@google/genai'], '1.33.0');
  assert.equal(lockfile.packages[''].dependencies['@google/genai'], '1.33.0');
  assert.equal(lockfile.packages['node_modules/@google/genai'].version, '1.33.0');
  assert.equal(typeof sdk.GoogleGenAI, 'function');
});

test('backend image validates the SDK in dependency and runner stages', () => {
  const dockerfile = fs.readFileSync(
    path.join(repositoryRoot, 'infrastructure/docker/backend/Dockerfile'),
    'utf8',
  );
  const checks = dockerfile.match(/require\('@google\/genai'\)/g) || [];
  assert.equal(checks.length, 2);
  assert.match(dockerfile, /CommonJS export is invalid/);
});

test('worker packaging pins and validates the same SDK runtime', () => {
  const packageJson = require('../../../workers/package.json');
  const lockfile = require('../../../workers/package-lock.json');
  const dockerfile = fs.readFileSync(
    path.join(repositoryRoot, 'infrastructure/docker/workers/Dockerfile'),
    'utf8',
  );

  assert.equal(packageJson.dependencies['@google/genai'], '1.33.0');
  assert.equal(lockfile.packages[''].dependencies['@google/genai'], '1.33.0');
  assert.equal(lockfile.packages['node_modules/@google/genai'].version, '1.33.0');
  assert.equal((dockerfile.match(/require\('@google\/genai'\)/g) || []).length, 2);
});
