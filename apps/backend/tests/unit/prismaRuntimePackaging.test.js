const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '../..');
const repositoryRoot = path.resolve(backendRoot, '../..');

test('backend pins matching Prisma CLI and client versions', () => {
  const packageJson = require('../../package.json');
  const lockfile = require('../../package-lock.json');

  assert.equal(packageJson.dependencies.prisma, '5.22.0');
  assert.equal(packageJson.dependencies['@prisma/client'], '5.22.0');
  assert.equal(lockfile.packages[''].dependencies.prisma, '5.22.0');
  assert.equal(lockfile.packages[''].dependencies['@prisma/client'], '5.22.0');
  assert.equal(lockfile.packages['node_modules/prisma'].version, '5.22.0');
  assert.equal(lockfile.packages['node_modules/@prisma/client'].version, '5.22.0');
});

test('backend image rejects a damaged Prisma schema runtime', () => {
  const dockerfile = fs.readFileSync(
    path.join(repositoryRoot, 'infrastructure/docker/backend/Dockerfile'),
    'utf8',
  );

  assert.match(dockerfile, /new WebAssembly\.Module\(wasm\)/);
  assert.match(dockerfile, /prisma-schema-wasm\.sha256/);
  assert.match(dockerfile, /sha256sum --check/);
  assert.match(dockerfile, /\.\/node_modules\/\.bin\/prisma --version/);
  assert.match(
    dockerfile,
    /\.\/node_modules\/\.bin\/prisma validate --schema=\.\/prisma\/schema\.prisma/,
  );
});

test('backend quality gates build the production runner image', () => {
  const workflow = fs.readFileSync(
    path.join(repositoryRoot, '.github/workflows/backend-quality-gates.yml'),
    'utf8',
  );

  assert.match(
    workflow,
    /docker build --target runner -f \.\.\/\.\.\/infrastructure\/docker\/backend\/Dockerfile \./,
  );
  assert.match(workflow, /needs: integration-smoke/);
  assert.match(workflow, /group: backend-quality-\$\{\{ github\.ref \}\}/);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.match(workflow, /packages: write/);
  assert.match(workflow, /uses: docker\/setup-qemu-action@v4/);
  assert.match(workflow, /uses: docker\/build-push-action@v7/);
  assert.match(workflow, /platforms: linux\/arm64/);
  assert.match(workflow, /\$\{\{ env\.BACKEND_IMAGE \}\}:latest/);
  assert.match(workflow, /\$\{\{ env\.BACKEND_IMAGE \}\}:\$\{\{ github\.sha \}\}/);
});
