// apps/backend/src/services/diyCompletionStartupCheck.ts
//
// FATAL start-up check for the DIY outbox event types (docs/architecture/ASK_COZY_DIY_COMPLETION_OUTBOX_PLAN.md section 4 and
// ASK_COZY_DIY_TASK_RECONCILIATION_PLAN.md section 5). Two code paths insert a DomainEvent inside a transaction that matters:
//   DIY_PROJECT_COMPLETED         - completing a DIY project;
//   DIY_TASK_COMPLETED_RECONCILE  - completing a maintenance task that has an open DIY project linked to it (so a missing value would fail ordinary task
//                                   completions, not just DIY ones).
// If the database enum lacks either value the insert fails and the surrounding completion rolls back, so a backend that is allowed to start in that state
// is allowed to serve completions it knows will fail. This throws instead, before the server listens, and the message names the fix. It reads the catalog
// only and writes nothing.
import { prisma as defaultPrisma } from '../lib/prisma';

export const DIY_COMPLETION_ENUM_LABEL = 'DIY_PROJECT_COMPLETED';
export const DIY_RECONCILE_ENUM_LABEL = 'DIY_TASK_COMPLETED_RECONCILE';
export const REQUIRED_DIY_EVENT_LABELS = [DIY_COMPLETION_ENUM_LABEL, DIY_RECONCILE_ENUM_LABEL] as const;

export async function assertDiyCompletionEventTypeAvailable(db: Pick<typeof defaultPrisma, '$queryRaw'> = defaultPrisma): Promise<void> {
  let rows: Array<{ label?: string }>;
  try {
    rows = await db.$queryRaw<Array<{ label: string }>>`SELECT e.enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'DomainEventType' AND e.enumlabel IN (${DIY_COMPLETION_ENUM_LABEL}, ${DIY_RECONCILE_ENUM_LABEL})`;
  } catch (error: any) {
    throw new Error(`FATAL: could not confirm that the database knows the DIY event types (${REQUIRED_DIY_EVENT_LABELS.join(', ')}): ${error?.message ?? error}. Not starting, because DIY completions and task completions linked to DIY projects would fail.`);
  }
  const present = new Set((Array.isArray(rows) ? rows : []).map((row) => row.label));
  const missing = REQUIRED_DIY_EVENT_LABELS.filter((label) => !present.has(label));
  if (missing.length > 0) {
    throw new Error(`FATAL: the database enum DomainEventType is missing ${missing.join(', ')}, so DIY project completions (and completions of tasks linked to open DIY projects) would fail and roll back. Run \`npx prisma db push\` in apps/backend (see docs/operations/DIY_COMPLETION_OUTBOX_ROLLOUT.md and DIY_TASK_RECONCILIATION_ROLLOUT.md), then restart.`);
  }
}
