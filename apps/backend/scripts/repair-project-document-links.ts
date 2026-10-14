// apps/backend/scripts/repair-project-document-links.ts
//
// The repair check for project document links (owner ruling D-P1). DRY RUN unless --apply is given. It makes each PropertyRecordLink match the Home
// Record id (and bound version) stored on the project's own row; it never changes a stored reference, and a legacy id (no Home Record) is left alone.
//
//   npx ts-node scripts/repair-project-document-links.ts                      list what drifted (read only)
//   npx ts-node scripts/repair-project-document-links.ts --property=<id>      one property
//   npx ts-node scripts/repair-project-document-links.ts --project=<id>       one project
//   npx ts-node scripts/repair-project-document-links.ts --apply              create, correct and remove links; re-checks and exits non-zero if any remain
//
// If the list is empty there is nothing to do.
import { findProjectDocumentLinkProblems, repairProjectDocumentLinks } from '../src/services/projectDocumentLinkAudit.service';

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() || undefined : undefined;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const filter = { propertyId: argValue('property'), projectId: argValue('project') };
  const result = await repairProjectDocumentLinks({ apply, ...filter });
  console.log(`Link problems found: ${result.problems.length}`);
  const byKind = new Map<string, number>();
  for (const problem of result.problems) byKind.set(problem.kind, (byKind.get(problem.kind) ?? 0) + 1);
  for (const [kind, count] of byKind) console.log(`  ${kind}: ${count}`);
  for (const problem of result.problems.slice(0, 50)) console.log(JSON.stringify(problem));
  if (!result.problems.length) { console.log('Nothing to repair.'); return; }
  if (!apply) { console.log('Dry run: nothing was changed. Re-run with --apply to repair.'); return; }
  console.log(JSON.stringify(result.summary));
  const remaining = await findProjectDocumentLinkProblems(filter);
  console.log(`Verification: ${remaining.length} link problem(s) remain.`);
  if (remaining.length) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => process.exit());
