#!/usr/bin/env node
/**
 * Replaces console.log/error/warn/info/debug with pino logger calls
 * and adds the correct relative import to each affected file.
 */

import { readFileSync, writeFileSync } from 'fs';
import { relative, dirname, resolve } from 'path';
import { execSync } from 'child_process';

const SRC = resolve(import.meta.dirname, '../src');
const LOGGER_PATH = resolve(SRC, 'lib/logger.ts');

// Map console methods → logger methods
const METHOD_MAP = {
  'console.log':   'logger.info',
  'console.info':  'logger.info',
  'console.warn':  'logger.warn',
  'console.error': 'logger.error',
  'console.debug': 'logger.debug',
};

// Find all TypeScript files containing console usage
const raw = execSync(
  `grep -rl "console\\.\\(log\\|error\\|warn\\|info\\|debug\\)" ${SRC} --include="*.ts"`,
  { encoding: 'utf8' }
).trim();

const files = raw.split('\n').filter(Boolean);
console.log(`Found ${files.length} files to process`);

let totalReplacements = 0;

for (const file of files) {
  let content = readFileSync(file, 'utf8');
  const original = content;

  // Replace console.* calls
  let count = 0;
  for (const [from, to] of Object.entries(METHOD_MAP)) {
    const regex = new RegExp(from.replace('.', '\\.'), 'g');
    const matches = content.match(regex);
    if (matches) count += matches.length;
    content = content.replace(regex, to);
  }

  if (count === 0) continue;

  // Compute relative path from this file to lib/logger
  const relPath = relative(dirname(file), LOGGER_PATH)
    .replace(/\.ts$/, '')
    .replace(/\\/g, '/');
  const importPath = relPath.startsWith('.') ? relPath : `./${relPath}`;
  const importLine = `import { logger } from '${importPath}';`;

  // Add import only if logger isn't already imported
  if (!content.includes("from '../lib/logger'") &&
      !content.includes("from '../../lib/logger'") &&
      !content.includes("from '../../../lib/logger'") &&
      !content.includes("from './lib/logger'") &&
      !content.includes("{ logger }")) {
    // Insert after the last existing import block
    const lastImportMatch = [...content.matchAll(/^import .+$/gm)].pop();
    if (lastImportMatch) {
      const insertAt = lastImportMatch.index + lastImportMatch[0].length;
      content = content.slice(0, insertAt) + '\n' + importLine + content.slice(insertAt);
    } else {
      content = importLine + '\n' + content;
    }
  }

  if (content !== original) {
    writeFileSync(file, content, 'utf8');
    console.log(`  ✓ ${file.replace(SRC + '/', '')} — ${count} replacement(s)`);
    totalReplacements += count;
  }
}

console.log(`\nDone. ${totalReplacements} console calls replaced across ${files.length} files.`);
