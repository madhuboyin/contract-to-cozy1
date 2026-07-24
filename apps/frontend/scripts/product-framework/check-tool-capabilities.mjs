#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, '../..');
const backendRoot = path.resolve(frontendRoot, '../backend');
const inventoryScript = path.join(scriptDir, 'inventory-tool-capabilities.mjs');
const frontendSourceRoot = path.join(frontendRoot, 'src');
const retiredSelectors = [
  'selectUnifiedHomeTools',
  'selectSmartContextTools',
];

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [absolute] : [];
  });
}

for (const selector of retiredSelectors) {
  const retiredPath = path.join(
    frontendSourceRoot,
    'features/tools',
    `${selector}.ts`,
  );
  if (fs.existsSync(retiredPath)) {
    throw new Error(`Retired capability selector was restored: ${selector}`);
  }
  const consumer = sourceFiles(frontendSourceRoot).find((filePath) =>
    fs.readFileSync(filePath, 'utf8').includes(selector));
  if (consumer) {
    throw new Error(
      `Frontend source still references retired selector ${selector}: `
      + path.relative(frontendRoot, consumer),
    );
  }
}

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

console.log('Canonical capability completeness and selector-retirement checks passed.');
