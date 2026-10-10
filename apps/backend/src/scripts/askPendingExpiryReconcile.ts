import { prisma } from '../lib/prisma';
import { reconcileExpiredDiscoveryProposals } from '../services/ask/askPendingExpiryReconciliation';

// Run by the ask-pending-expiry CronJob. Idempotent: a rerun finds nothing new, and a crash midway loses nothing because every transition and every
// lifecycle event is individually idempotent.
async function main(): Promise<void> {
  let expired = 0;
  let backfilled = 0;
  for (let pass = 0; pass < 10; pass += 1) {
    const result = await reconcileExpiredDiscoveryProposals({ batchSize: 200 });
    expired += result.expired;
    backfilled += result.backfilled;
    if (result.expired < 200 && result.backfilled < 200) break;
  }
  process.stdout.write(`Expired ${expired} pending Ask interaction${expired === 1 ? '' : 's'} and recorded ${backfilled} missing abandonment${backfilled === 1 ? '' : 's'}.\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
