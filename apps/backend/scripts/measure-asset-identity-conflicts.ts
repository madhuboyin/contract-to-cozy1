// apps/backend/scripts/measure-asset-identity-conflicts.ts
//
// READ-ONLY measurement: how many "Review asset details" identity conflicts does the Home Action feed actually raise?
// (FRD v1.177)
//
// WHY THIS EXISTS:
// The feed raises "Your Home Record names this item as X but classifies its system as Y. Confirm the correct asset
// before scheduling service." when a stored risk-report row's name and system type resolve to two DIFFERENT known
// asset labels. Reading the code shows that cannot happen for the rows current code writes (every MAJOR_APPLIANCE_*
// system type resolves to no label, and a conflict needs both), so it could only come from older stored reports or
// other odd rows. Before designing fixes (a structured appliance classification, a type selector, a conflict card),
// this script measures whether the conflict occurs at all.
//
// It reads each property's stored `risk_assessment_reports.details` (the same data the feed reads) and evaluates
// each row with the SAME functions the feed uses (`riskRowIdentity`, `isRiskActionable` in services/riskRowIdentity.ts),
// so what it counts is what the feed would raise.
//
// READ-ONLY BY DESIGN: it issues one `findMany` on risk_assessment_reports and nothing else. There is no --apply flag
// because there is nothing to apply.
//
// Usage (from apps/backend, DATABASE_URL pointing at the target environment):
//   npx ts-node scripts/measure-asset-identity-conflicts.ts
//   npx ts-node scripts/measure-asset-identity-conflicts.ts --property=<propertyId>    (one property)
//   npx ts-node scripts/measure-asset-identity-conflicts.ts --samples=50               (more example rows; default 25)
//
// Reading the result: "actionable conflicts" is the number of identity-conflict cards the feed would show today.
// If it is 0 the conflict is not occurring and the structured-classification work is not motivated by it.

import { PrismaClient } from '@prisma/client';
import { isRiskActionable, riskRowIdentity } from '../src/services/riskRowIdentity';

const prisma = new PrismaClient();

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() || null : null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function main() {
  const propertyId = argValue('property');
  const sampleSize = Math.max(1, Number(argValue('samples')) || 25);

  console.log('='.repeat(72));
  console.log('Asset identity conflict measurement — READ ONLY');
  if (propertyId) console.log(`Limited to property ${propertyId}`);
  console.log('='.repeat(72));

  const reports = await prisma.riskAssessmentReport.findMany({
    where: propertyId ? { propertyId } : {},
    select: { propertyId: true, details: true, lastCalculatedAt: true },
    orderBy: { propertyId: 'asc' },
  });

  let rows = 0;
  let actionableRows = 0;
  let inertMajorAppliance = 0;
  let conflictRows = 0;
  let actionableConflicts = 0;
  const propertiesWithActionableConflict = new Set<string>();
  const pairs = new Map<string, { count: number; actionable: number }>();
  const samples: string[] = [];
  let oldestCalculatedAt: Date | null = null;
  let reportsOlderThan30Days = 0;
  let malformedReports = 0;
  const now = Date.now();

  for (const report of reports) {
    if (!oldestCalculatedAt || report.lastCalculatedAt < oldestCalculatedAt) oldestCalculatedAt = report.lastCalculatedAt;
    if (now - report.lastCalculatedAt.getTime() > 30 * DAY_MS) reportsOlderThan30Days += 1;
    const details: unknown = report.details;
    if (!Array.isArray(details)) { malformedReports += 1; continue; }

    for (const d of details) {
      if (!d) continue;
      rows += 1;
      const actionable = isRiskActionable(d);
      if (actionable) actionableRows += 1;
      const identity = riskRowIdentity(d);
      if (identity.systemType.startsWith('MAJOR_APPLIANCE_') && identity.typedLabel === null) inertMajorAppliance += 1;
      if (!identity.conflict) continue;

      conflictRows += 1;
      if (actionable) { actionableConflicts += 1; propertiesWithActionableConflict.add(report.propertyId); }
      const key = `${identity.title} [${identity.namedLabel}]  vs  ${identity.systemType} [${identity.typedLabel}]`;
      const entry = pairs.get(key) ?? { count: 0, actionable: 0 };
      entry.count += 1;
      if (actionable) entry.actionable += 1;
      pairs.set(key, entry);
      if (samples.length < sampleSize) {
        samples.push(`  property=${report.propertyId}  calculated=${report.lastCalculatedAt.toISOString().slice(0, 10)}  actionable=${actionable}  ${key}`);
      }
    }
  }

  console.log(`\nProperties with a stored risk report : ${reports.length}${malformedReports ? `  (${malformedReports} with unreadable details)` : ''}`);
  console.log(`Oldest report calculated             : ${oldestCalculatedAt ? oldestCalculatedAt.toISOString().slice(0, 10) : 'n/a'}   (${reportsOlderThan30Days} older than 30 days)`);
  console.log(`Risk rows                            : ${rows}   (${actionableRows} actionable)`);
  console.log(`  MAJOR_APPLIANCE_* rows (inert)     : ${inertMajorAppliance}   (system type resolves to no label, so they cannot conflict)`);
  console.log(`Rows whose name and type conflict    : ${conflictRows}`);
  console.log(`ACTIONABLE CONFLICTS (cards raised)  : ${actionableConflicts}   across ${propertiesWithActionableConflict.size} properties`);

  if (pairs.size) {
    console.log('\nDistinct conflicting pairs (name [label] vs system type [label]):');
    for (const [key, entry] of [...pairs.entries()].sort((a, b) => b[1].count - a[1].count)) {
      console.log(`  ${String(entry.count).padStart(4)} rows (${entry.actionable} actionable)  ${key}`);
    }
    console.log(`\nExample rows (first ${samples.length}):`);
    for (const line of samples) console.log(line);
  }

  console.log(actionableConflicts === 0
    ? '\nVerdict: no identity-conflict cards are being raised. The conflict is not occurring in this data.'
    : `\nVerdict: ${actionableConflicts} identity-conflict card(s) would be raised today. Read the pairs above to see which name/type combinations cause them.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
