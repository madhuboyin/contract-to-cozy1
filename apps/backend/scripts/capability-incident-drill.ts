import { runCapabilityIncidentDrill } from '../src/services/capabilityIncidentDrill';

const report = runCapabilityIncidentDrill();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) process.exitCode = 1;
