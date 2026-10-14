// apps/backend/scripts/repair-renovation-handoffs.ts
//
// Governed repair of renovation project handoffs that were left partial before the handoff became one transaction (FRD v1.371; owner ruling D-H6).
// It is a DRY RUN unless --apply is given, and it applies nothing without --intake-mode, because how the work was meant to start was never stored.
//
//   1. Detect (read only):   npx ts-node scripts/repair-renovation-handoffs.ts
//                            npx ts-node scripts/repair-renovation-handoffs.ts --property=<propertyId>
//   2. Review the list. If it is empty there is nothing to do and nothing to run.
//   3. Dry run with a mode:  npx ts-node scripts/repair-renovation-handoffs.ts --intake-mode=PLANNED
//   4. Apply:                npx ts-node scripts/repair-renovation-handoffs.ts --intake-mode=PLANNED --apply
//                            (ALREADY_STARTED and HISTORICAL also need --reason="at least 20 characters")
//   5. Verify:               the apply run re-runs detection and exits non-zero if any partial handoff remains.
//
// Idempotent: every step checks what already exists. Use --project=<projectId> to repair one Project.
import { detectIncompleteHandoffs, planHandoffRepair, repairIncompleteHandoff } from '../src/services/renovationHandoffRepair.service';
import type { HandoffIntakeMode } from '../src/services/renovationReadiness.service';

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() || null : null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const propertyId = argValue('property') ?? undefined;
  const projectId = argValue('project') ?? undefined;
  const intakeMode = argValue('intake-mode') as HandoffIntakeMode | null;
  const reason = argValue('reason');
  if (intakeMode && !['PLANNED', 'ALREADY_STARTED', 'HISTORICAL'].includes(intakeMode)) throw new Error('--intake-mode must be PLANNED, ALREADY_STARTED or HISTORICAL');
  if (apply && !intakeMode) throw new Error('--apply needs --intake-mode: how the work was meant to start was never stored and is not guessed');

  const candidates = await detectIncompleteHandoffs({ propertyId, projectId });
  console.log(`Partial renovation handoffs found: ${candidates.length}`);
  for (const candidate of candidates) {
    const plan = planHandoffRepair(candidate, intakeMode);
    console.log(JSON.stringify({
      project: candidate.projectId, name: candidate.projectName, case: candidate.renovationCaseId, currentStatus: candidate.projectStatus,
      currentLifecycle: candidate.caseLifecycle, missing: candidate.missing, openConditions: candidate.openConditionCount,
      wouldSetStatus: plan.projectStatusAfter, wouldSetLifecycle: plan.caseLifecycleAfter,
    }));
  }
  if (!candidates.length) { console.log('Nothing to repair.'); return; }
  if (!apply) { console.log('Dry run: nothing was changed. Re-run with --intake-mode and --apply to complete them.'); return; }

  for (const candidate of candidates) {
    const result = await repairIncompleteHandoff({ projectId: candidate.projectId, intakeMode: intakeMode as HandoffIntakeMode, historicalReason: reason });
    console.log(JSON.stringify(result));
  }
  const remaining = await detectIncompleteHandoffs({ propertyId, projectId });
  console.log(`Verification: ${remaining.length} partial handoff(s) remain.`);
  if (remaining.length) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => process.exit());
