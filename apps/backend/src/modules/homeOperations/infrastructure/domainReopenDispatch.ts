// Home Intelligence Functional Completeness FRD Phase 4 review finding 6 —
// transitionWorkItem's REOPENED branch only reactivated OperationalWorkSource
// rows and emitted a PropertyChange; it never told the authoritative domain
// record (maintenance task, guidance journey, project) that the obligation
// is open again, so a homeowner could reopen VERIFIED work while the
// maintenance page, guidance journey, or project tracker kept showing it
// completed underneath.
import type { OperationalWorkExecutionType, Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

/**
 * Transactional domain-record reopen, dispatched by executionType. A domain
 * failure rolls back the OperationalWorkItem transition as well, preventing
 * Home, Fix, and the source domain from committing contradictory states.
 *
 * Deliberately bypasses each domain's own service layer (e.g.
 * PropertyMaintenanceTaskService.updateTaskStatus) with a direct, minimal
 * Prisma write instead: those services call back into this same Home
 * Operations sync pipeline (syncTaskWorkItem and siblings), and calling
 * them from inside a Home-Operations-triggered reopen would recreate the
 * exact circular sync this module exists to avoid. Scope is intentionally
 * narrow -- only the field that actually claims "this is done" flips back;
 * recurrence scheduling, cost/evidence history, and other domain-specific
 * bookkeeping are untouched, matching how little a generic reopen can
 * honestly know about any one domain's own rules.
 */
export async function reopenLinkedDomainRecords(workItemId: string, db: Prisma.TransactionClient | typeof prisma = prisma): Promise<void> {
  const executions = await db.operationalWorkExecution.findMany({
    where: { workItemId },
    select: { executionType: true, executionEntityId: true },
  });
  for (const execution of executions) {
    await reopenOneDomainRecord(db, workItemId, execution.executionType, execution.executionEntityId);
  }
}

async function reopenOneDomainRecord(db: Prisma.TransactionClient | typeof prisma, workItemId: string, executionType: OperationalWorkExecutionType, executionEntityId: string): Promise<void> {
  switch (executionType) {
    case 'MAINTENANCE_TASK':
      await db.propertyMaintenanceTask.updateMany({
        where: { id: executionEntityId, status: 'COMPLETED' },
        data: { status: 'IN_PROGRESS' },
      });
      return;
    case 'GUIDANCE':
      await db.guidanceJourney.updateMany({
        where: { id: executionEntityId, status: 'COMPLETED' },
        data: { status: 'ACTIVE', completedAt: null },
      });
      return;
    case 'PROJECT':
      await db.projectRecord.updateMany({
        where: { id: executionEntityId, status: 'COMPLETED' },
        data: { status: 'IN_PROGRESS' },
      });
      return;
    case 'BOOKING':
    case 'CLAIM':
      // Completed bookings and decided claims are immutable historical
      // executions. On work reopen they stop being the PRIMARY execution,
      // so the reopened obligation can acquire a new primary execution
      // without pretending the prior booking/claim itself was undone.
      await db.operationalWorkExecution.updateMany({
        where: { workItemId, executionType, executionEntityId, role: 'PRIMARY' },
        data: { role: 'SUPPORTING' },
      });
      return;
    default: {
      const exhaustiveCheck: never = executionType;
      throw new Error(`reopenOneDomainRecord: unhandled executionType ${String(exhaustiveCheck)}`);
    }
  }
}
