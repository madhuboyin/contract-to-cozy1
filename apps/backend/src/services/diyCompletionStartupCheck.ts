// apps/backend/src/services/diyCompletionStartupCheck.ts
//
// FATAL start-up check for the DIY completion outbox (docs/architecture/ASK_COZY_DIY_COMPLETION_OUTBOX_PLAN.md section 4). Completing a DIY project
// inserts a DomainEvent of type DIY_PROJECT_COMPLETED inside the completion transaction. If the database enum lacks that value the insert fails and every
// completion rolls back, so a backend that is allowed to start in that state is allowed to serve completions it knows will fail. This throws instead, before
// the server listens, and the message names the fix. It reads the catalog only and writes nothing.
import { prisma as defaultPrisma } from '../lib/prisma';

export const DIY_COMPLETION_ENUM_LABEL = 'DIY_PROJECT_COMPLETED';

export async function assertDiyCompletionEventTypeAvailable(db: Pick<typeof defaultPrisma, '$queryRaw'> = defaultPrisma): Promise<void> {
  let rows: unknown[];
  try {
    rows = await db.$queryRaw<unknown[]>`SELECT 1 AS present FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'DomainEventType' AND e.enumlabel = ${DIY_COMPLETION_ENUM_LABEL}`;
  } catch (error: any) {
    throw new Error(`FATAL: could not confirm that the database knows the ${DIY_COMPLETION_ENUM_LABEL} event type (${error?.message ?? error}). Not starting, because DIY project completions would fail.`);
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`FATAL: the database enum DomainEventType has no ${DIY_COMPLETION_ENUM_LABEL} value, so every DIY project completion would fail and roll back. Run \`npx prisma db push\` in apps/backend (see docs/operations/DIY_COMPLETION_OUTBOX_ROLLOUT.md), then restart.`);
  }
}
