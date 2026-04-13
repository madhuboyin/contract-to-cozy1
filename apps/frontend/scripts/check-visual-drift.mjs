#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const rootDir = process.cwd();
const baselineDir = path.join(rootDir, 'qa', 'baselines');
const fileListPath = path.join(baselineDir, 'visual-governance-files.json');
const baselinePath = path.join(baselineDir, 'visual-governance-baseline.json');
const writeBaseline = process.argv.includes('--write-baseline');

if (!fs.existsSync(fileListPath)) {
  console.error(`[visual-drift] Missing file list: ${fileListPath}`);
  process.exit(1);
}

const fileList = JSON.parse(fs.readFileSync(fileListPath, 'utf8'));
const files = Array.isArray(fileList.files) ? fileList.files : [];

if (files.length === 0) {
  console.error('[visual-drift] No files configured.');
  process.exit(1);
}

function extractVisualSignature(source) {
  const stringMatches = source.match(/(["'`])(?:(?=(\\?))\2[\s\S])*?\1/g) || [];
  const visualLiterals = stringMatches
    .map((literal) => literal.slice(1, -1))
    .filter((literal) =>
      /(?:\b(?:bg|text|border|rounded|shadow|tracking|leading|font|space|gap|min-h|max-w|items|justify|grid|flex|sticky|fixed|absolute|relative|overflow|p|m)-|safe-area|calc\()/.test(
        literal
      )
    )
    .map((literal) => literal.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  return Array.from(new Set(visualLiterals)).sort().join('\n');
}

function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

const current = {};
for (const relativeFile of files) {
  const absoluteFile = path.join(rootDir, relativeFile);
  if (!fs.existsSync(absoluteFile)) {
    console.error(`[visual-drift] Configured file not found: ${relativeFile}`);
    process.exit(1);
  }
  const source = fs.readFileSync(absoluteFile, 'utf8');
  const signature = extractVisualSignature(source);
  current[relativeFile] = {
    hash: hashContent(signature),
    signatureLength: signature.length,
  };
}

if (writeBaseline) {
  fs.writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`[visual-drift] Baseline written: ${path.relative(rootDir, baselinePath)}`);
  process.exit(0);
}

if (!fs.existsSync(baselinePath)) {
  console.error(`[visual-drift] Baseline missing: ${baselinePath}`);
  console.error('[visual-drift] Run: npm run qa:visual-drift:update');
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const failures = [];

for (const relativeFile of files) {
  if (!baseline[relativeFile]) {
    failures.push(`${relativeFile}: missing baseline entry`);
    continue;
  }
  if (baseline[relativeFile].hash !== current[relativeFile].hash) {
    failures.push(`${relativeFile}: visual signature changed`);
  }
}

for (const baselineFile of Object.keys(baseline)) {
  if (!files.includes(baselineFile)) {
    failures.push(`${baselineFile}: remove stale baseline entry`);
  }
}

if (failures.length > 0) {
  console.error('\n[visual-drift] FAILED');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error('\nIf intended, update baseline with: npm run qa:visual-drift:update');
  process.exit(1);
}

console.log('[visual-drift] PASSED');
console.log(`Validated visual signatures for ${files.length} governed files.`);

