import { runCapabilityKillSwitchDrill } from '../src/services/capabilityKillSwitchDrill';

try {
  const report = runCapabilityKillSwitchDrill();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Capability kill-switch drill failed: ${message}\n`);
  process.exitCode = 1;
}
