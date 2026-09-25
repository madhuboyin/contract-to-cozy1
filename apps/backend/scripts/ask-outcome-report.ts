// apps/backend/scripts/ask-outcome-report.ts
//
// How often Ask answers, asks for clarification or does not understand, and the top questions in the last two groups.
// Read-only. Run against the real database to choose the next operations (FRD v1.101).
//
// Usage: npx ts-node scripts/ask-outcome-report.ts [days=28] [minCount=2]

import { PrismaClient } from '@prisma/client';
import { loadAskOutcomeReport } from '../src/services/ask/askOutcomeReport';

const prisma = new PrismaClient();
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

async function main() {
  const days = Number(process.argv[2]) || 28;
  const minCount = Number(process.argv[3]) || 2;
  const { since, report } = await loadAskOutcomeReport(prisma as any, { days, minCount });
  console.log(`Ask outcomes since ${since.toISOString().slice(0, 10)} (${report.total} questions)`);
  console.log(`  answered ${pct(report.answeredRate)} | clarification ${pct(report.clarificationRate)} | unmatched ${pct(report.unmatchedRate)}`);
  for (const row of report.byStatus) console.log(`  ${row.status.padEnd(24)} ${String(row.count).padStart(6)}  ${pct(row.rate)}`);
  const print = (title: string, rows: typeof report.topUnmatched) => {
    console.log(`\n${title} (wordings asked at least ${minCount} times)`);
    for (const row of rows) console.log(`  ${String(row.count).padStart(4)}  ${row.question}${row.reasonCodes.length ? `  [${row.reasonCodes.join(', ')}]` : ''}`);
    if (!rows.length) console.log('  none');
  };
  print('Top unmatched questions', report.topUnmatched);
  print('Top clarification questions', report.topClarifications);
  console.log(`\n${report.suppressedSingletons} rarer wording(s) not shown.`);
  await prisma.$disconnect();
}

main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
