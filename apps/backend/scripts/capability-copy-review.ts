import { canonicalCapabilityRegistry } from '../src/productFramework/capabilities';
import { reviewCapabilityCopy } from '../src/productFramework/capabilities/capabilityCopyReview';

const report = reviewCapabilityCopy(canonicalCapabilityRegistry);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) process.exitCode = 1;
