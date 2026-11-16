#!/usr/bin/env node
/* eslint-disable no-console */
const path = require('node:path');

require('ts-node').register({
  project: path.resolve(__dirname, '../tsconfig.json'),
  transpileOnly: true,
});

const { initializeAskRuntime } = require('../src/services/ask/askRuntimeBootstrap');
const { buildPhase6CalibrationAndEvaluationSummary } = require('../src/services/ask/semantic/phase6/index');

async function main() {
  initializeAskRuntime();
  const args = new Set(process.argv.slice(2));
  const jsonMode = args.has('--json');
  const checkMode = args.has('--check');

  const summary = await buildPhase6CalibrationAndEvaluationSummary();

  if (jsonMode) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    for (const line of summary.summaryLines) {
      console.log(line);
    }
    if (!summary.passed) {
      console.error('Failed gates:');
      for (const gate of summary.report.frEval4ProductGates.filter((g) => !g.passed)) {
        console.error(` - ${gate.gateId}: observed=${gate.observed}, threshold=${gate.threshold}`);
      }
    }
  }

  if (checkMode && !summary.passed) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
