#!/usr/bin/env node
/*
 * Runs backend node:test files in fixed-size chunks, one chunk at a time, so a full suite no longer starts one test
 * process per CPU at once.
 *
 * Why: `node --test <all files>` runs up to (CPUs - 1) files in parallel, and every file loads ts-node plus most of
 * src. With ts-node's default type-checking, one tests/ask file peaks near 3.8 GB (measured on a 10-CPU, 17 GB Mac),
 * so the full suite ran nine of those at once and the OS reaped it. In transpile-only mode the same file peaks near
 * 0.9 GB and runs about 4x faster. Types are still checked, once, by `npm run typecheck` (tsc --noEmit); pass
 * --typecheck-in-tests to get the old per-file type-checking back.
 *
 * Usage (from apps/backend):
 *   node scripts/run-tests-chunked.js [paths...] [options]
 *     paths                     files or directories to search for *.test.js (default: tests/ask)
 *     --chunk-size=N            files per chunk (default 12)
 *     --concurrency=N           files run in parallel inside a chunk (default 2)
 *     --from=N                  start at chunk N (1-based), e.g. to resume after a stop
 *     --only=N                  run just chunk N
 *     --list                    print the chunks and exit
 *     --log-dir=DIR             where per-chunk logs go (default: $TMPDIR/backend-test-chunks)
 *     --typecheck-in-tests      keep ts-node type-checking inside each test process (slow, memory heavy)
 *
 * Chunks are built from the sorted file list, so chunk numbers stay stable between runs of the same paths.
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function parseArgs(argv) {
  const options = { paths: [], chunkSize: 12, concurrency: 2, from: 1, only: null, list: false, typecheck: false, logDir: path.join(os.tmpdir(), 'backend-test-chunks') };
  for (const arg of argv) {
    const [key, value] = arg.split('=');
    if (key === '--chunk-size') options.chunkSize = Number(value);
    else if (key === '--concurrency') options.concurrency = Number(value);
    else if (key === '--from') options.from = Number(value);
    else if (key === '--only') options.only = Number(value);
    else if (key === '--list') options.list = true;
    else if (key === '--typecheck-in-tests') options.typecheck = true;
    else if (key === '--log-dir') options.logDir = value;
    else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    else options.paths.push(arg);
  }
  for (const [name, value] of [['--chunk-size', options.chunkSize], ['--concurrency', options.concurrency], ['--from', options.from]]) {
    if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  }
  if (options.only !== null && (!Number.isInteger(options.only) || options.only < 1)) throw new Error('--only must be a positive integer');
  if (!options.paths.length) options.paths.push('tests/ask');
  return options;
}

function collectTestFiles(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return target.endsWith('.test.js') ? [target] : [];
  return fs.readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(target, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : collectTestFiles(child);
    return entry.name.endsWith('.test.js') ? [child] : [];
  });
}

// node:test's spec reporter ends each run with "ℹ tests N", "ℹ pass N", ... lines.
function parseSummary(output) {
  const summary = {};
  for (const key of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
    const match = output.match(new RegExp(`^ℹ ${key} (\\d+)$`, 'm'));
    summary[key] = match ? Number(match[1]) : null;
  }
  return summary;
}

// The lines under "✖ failing tests:" name each failing test and the file it is in.
function failingLines(output) {
  const start = output.indexOf('✖ failing tests:');
  if (start === -1) return [];
  return output.slice(start).split('\n').filter((line) => /^(?:test at |✖ )/.test(line) && !line.startsWith('✖ failing tests'));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const files = [...new Set(options.paths.flatMap(collectTestFiles))].sort();
  if (!files.length) throw new Error(`No *.test.js files under ${options.paths.join(', ')}`);
  const chunks = [];
  for (let index = 0; index < files.length; index += options.chunkSize) chunks.push(files.slice(index, index + options.chunkSize));

  if (options.list) {
    chunks.forEach((chunk, index) => console.log(`chunk ${index + 1}/${chunks.length}: ${chunk.join(' ')}`));
    return 0;
  }

  const selected = chunks
    .map((chunk, index) => ({ chunk, number: index + 1 }))
    .filter(({ number }) => (options.only !== null ? number === options.only : number >= options.from));
  if (!selected.length) throw new Error(`No chunk selected; there are ${chunks.length}`);

  fs.mkdirSync(options.logDir, { recursive: true });
  const env = { ...process.env };
  if (!options.typecheck) env.TS_NODE_TRANSPILE_ONLY = 'true';
  console.log(`${files.length} test files in ${chunks.length} chunks of up to ${options.chunkSize}; ${options.concurrency} at a time inside a chunk; ${options.typecheck ? 'ts-node type-checking ON' : 'transpile-only (run npm run typecheck for types)'}. Logs: ${options.logDir}`);

  const totals = { tests: 0, pass: 0, fail: 0, cancelled: 0, skipped: 0, todo: 0 };
  const failures = [];
  const started = Date.now();
  for (const { chunk, number } of selected) {
    const chunkStarted = Date.now();
    const result = spawnSync(process.execPath, ['--test', `--test-concurrency=${options.concurrency}`, '--test-reporter=spec', ...chunk], {
      env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
    });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    const logFile = path.join(options.logDir, `chunk-${String(number).padStart(3, '0')}.log`);
    fs.writeFileSync(logFile, output);
    const summary = parseSummary(output);
    const seconds = Math.round((Date.now() - chunkStarted) / 1000);
    // A chunk killed by a signal, or one that printed no summary, counts as failed even if no test reported failing.
    const broken = result.signal || summary.tests === null;
    for (const key of Object.keys(totals)) totals[key] += summary[key] ?? 0;
    const chunkFailed = broken || (summary.fail ?? 0) > 0 || (summary.cancelled ?? 0) > 0 || result.status !== 0;
    console.log(`chunk ${number}/${chunks.length}: ${broken ? `NO SUMMARY (exit ${result.status}${result.signal ? `, signal ${result.signal}` : ''})` : `${summary.pass}/${summary.tests} pass, ${summary.fail} fail, ${summary.skipped} skipped`} in ${seconds}s${chunkFailed ? `  <- see ${logFile}` : ''}`);
    if (chunkFailed) failures.push({ number, logFile, lines: failingLines(output), broken });
  }

  const minutes = ((Date.now() - started) / 60000).toFixed(1);
  console.log(`\nTOTAL: ${totals.tests} tests, ${totals.pass} pass, ${totals.fail} fail, ${totals.cancelled} cancelled, ${totals.skipped} skipped in ${minutes} min`);
  for (const failure of failures) {
    console.log(`\nchunk ${failure.number} failed (${failure.logFile}) -- rerun with --only=${failure.number}`);
    for (const line of failure.lines) console.log(`  ${line}`);
    if (failure.broken) console.log('  the chunk ended without a test summary (crash, kill or a file that failed to load)');
  }
  return failures.length ? 1 : 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
