import { prisma } from '../lib/prisma';
import { readAskOperationalControls } from '../config/askOperationalControls';
import { purgeExpiredAskFeedback, purgeExpiredAskSessions } from '../services/ask/askRetention.service';

async function main(): Promise<void> {
  let total = 0;
  while (true) {
    const deleted = await purgeExpiredAskSessions(new Date(), 500);
    total += deleted;
    if (deleted < 500) break;
  }
  const feedback = await purgeExpiredAskFeedback(readAskOperationalControls().feedbackRetentionDays);
  process.stdout.write(`Deleted ${total} expired Ask session${total === 1 ? '' : 's'} and ${feedback} expired feedback record${feedback === 1 ? '' : 's'}.\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
