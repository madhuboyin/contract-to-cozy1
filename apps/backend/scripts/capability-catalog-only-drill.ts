import { runCapabilityCatalogOnlyDrill } from '../src/services/capabilityCatalogOnlyDrill';

const report = runCapabilityCatalogOnlyDrill();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) process.exitCode = 1;
