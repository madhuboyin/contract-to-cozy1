import { prisma } from '../lib/prisma';
import { readAskOperationalControls } from '../config/askOperationalControls';
import { purgeExpiredAskExecutions, purgeExpiredAskFeedback, purgeExpiredAskSessions } from '../services/ask/askRetention.service';

async function main(): Promise<void> {
  let totalSessions = 0;
  while (true) {
    const deleted = await purgeExpiredAskSessions(new Date(), 500);
    totalSessions += deleted;
    if (deleted < 500) break;
  }
  // Runs independently of session purging: a session's own expiresAt slides
  // forward on every message, but each execution's expiresAt is fixed at
  // creation, so long-lived active sessions still need their individually
  // aged-out executions (and cascaded events/receipts) purged here.
  let totalExecutions = 0;
  while (true) {
    const deleted = await purgeExpiredAskExecutions(new Date(), 500);
    totalExecutions += deleted;
    if (deleted < 500) break;
  }
  const feedback = await purgeExpiredAskFeedback(readAskOperationalControls().feedbackRetentionDays);
  process.stdout.write(
    `Deleted ${totalSessions} expired Ask session${totalSessions === 1 ? '' : 's'}, `
    + `${totalExecutions} expired Ask execution${totalExecutions === 1 ? '' : 's'}, `
    + `and ${feedback} expired feedback record${feedback === 1 ? '' : 's'}.\n`,
  );
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
