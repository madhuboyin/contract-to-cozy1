#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, '../..');
const backendRoot = path.resolve(frontendRoot, '../backend');
const inventoryScript = path.join(scriptDir, 'inventory-tool-capabilities.mjs');

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, [inventoryScript], frontendRoot);
run('npm', ['run', 'test:capability-registry'], backendRoot);

console.log('Canonical capability completeness and legacy parity checks passed.');
