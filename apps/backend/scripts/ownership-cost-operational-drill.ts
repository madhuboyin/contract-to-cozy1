import { runOwnershipCostOperationalDrill } from '../src/services/ownershipCosts/ownershipCostOperationalDrill.service';

try {
  const report = runOwnershipCostOperationalDrill();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `Ownership-cost operational drill failed: ${message}\n`,
  );
  process.exitCode = 1;
}
