import { runCoverageOperationalDrill } from '../src/services/coverageOperationalDrill.service';

try {
  const report = runCoverageOperationalDrill();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Coverage operational drill failed: ${message}\n`);
  process.exitCode = 1;
}
