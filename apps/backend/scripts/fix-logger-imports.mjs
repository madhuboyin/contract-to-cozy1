#!/usr/bin/env node
/**
 * Fixes misplaced logger imports inserted inside multi-line import blocks.
 * Removes the broken import line and re-inserts it after the last complete import.
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

const SRC = resolve(import.meta.dirname, '../src');

// Find all files that have a logger import
const raw = execSync(`grep -rl "import { logger } from" ${SRC} --include="*.ts"`, { encoding: 'utf8' }).trim();
const files = raw.split('\n').filter(Boolean);

let fixed = 0;

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');

  // Find the logger import line index
  const loggerLineIdx = lines.findIndex(l => l.trim().startsWith("import { logger } from"));
  if (loggerLineIdx === -1) continue;

  const loggerImport = lines[loggerLineIdx].trim();

  // Check if this line is inside a multi-line import block
  // (i.e. the previous non-empty line does NOT end with ; or is not a closing brace line)
  const prevLine = lines[loggerLineIdx - 1] ?? '';
  const isInsideBlock = prevLine.trim() === 'import {' ||
    (prevLine.trim() !== '' &&
     !prevLine.trim().endsWith(';') &&
     !prevLine.trim().endsWith('*/') &&
     !prevLine.trim().startsWith('//') &&
     loggerLineIdx > 0);

  if (!isInsideBlock) continue;

  // Remove the misplaced logger import line
  lines.splice(loggerLineIdx, 1);

  // Find the last complete import statement end:
  // Either `} from '...';` or `import ... from '...';`
  let lastImportEnd = -1;
  let inMultiLine = false;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('import ')) {
      if (t.includes(' from ') && t.endsWith(';')) {
        lastImportEnd = i;
      } else if (t === 'import {' || t.match(/^import \{[^}]*$/)) {
        inMultiLine = true;
      }
    } else if (inMultiLine && t.match(/^\}.*from\s+'[^']+';$/)) {
      lastImportEnd = i;
      inMultiLine = false;
    }
  }

  if (lastImportEnd === -1) {
    // No import found, prepend
    lines.unshift(loggerImport);
  } else {
    lines.splice(lastImportEnd + 1, 0, loggerImport);
  }

  writeFileSync(file, lines.join('\n'), 'utf8');
  console.log(`  ✓ Fixed: ${file.replace(SRC + '/', '')}`);
  fixed++;
}

console.log(`\nFixed ${fixed} files.`);
