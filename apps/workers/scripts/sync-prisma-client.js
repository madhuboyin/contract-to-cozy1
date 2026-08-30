const { cpSync, mkdirSync, rmSync } = require('node:fs');
const { resolve } = require('node:path');

const workersRoot = resolve(__dirname, '..');
const backendRoot = resolve(workersRoot, '../backend');
const copies = [
  [resolve(backendRoot, 'node_modules/@prisma/client'), resolve(workersRoot, 'node_modules/@prisma/client')],
  [resolve(backendRoot, 'node_modules/.prisma/client'), resolve(workersRoot, 'node_modules/.prisma/client')],
];

for (const [source, destination] of copies) {
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(resolve(destination, '..'), { recursive: true });
  cpSync(source, destination, { recursive: true });
}

process.stdout.write('Synchronized generated Prisma client into workers/node_modules.\n');
