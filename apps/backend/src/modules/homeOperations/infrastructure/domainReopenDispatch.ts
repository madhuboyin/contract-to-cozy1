// Home Intelligence Functional Completeness FRD Phase 4 review finding 6 —
// transitionWorkItem's REOPENED branch only reactivated OperationalWorkSource
// rows and emitted a PropertyChange; it never told the authoritative domain
// record (maintenance task, guidance journey, project) that the obligation
// is open again, so a homeowner could reopen VERIFIED work while the
// maintenance page, guidance journey, or project tracker kept showing it
// completed underneath.
import type { OperationalWorkExecutionType } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { logger } from '../../../lib/logger';

/**
 * Best-effort domain-record reopen, dispatched by executionType. Called
 * after the OperationalWorkItem has already transitioned to REOPENED --
 * never blocks that transition on a domain-side failure. A homeowner being
 * unable to reopen their own mistakenly-verified work at all would be a
 * worse regression than one domain record staying briefly out of sync.
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
export async function reopenLinkedDomainRecords(workItemId: string): Promise<void> {
  const executions = await prisma.operationalWorkExecution.findMany({
    where: { workItemId },
    select: { executionType: true, executionEntityId: true },
  });
  for (const execution of executions) {
    try {
      await reopenOneDomainRecord(execution.executionType, execution.executionEntityId);
    } catch (err) {
      logger.warn(
        { err, workItemId, executionType: execution.executionType, executionEntityId: execution.executionEntityId },
        '[domainReopenDispatch] failed to reopen a linked domain record; the OperationalWorkItem is REOPENED but this domain record may still show complete',
      );
    }
  }
}

async function reopenOneDomainRecord(executionType: OperationalWorkExecutionType, executionEntityId: string): Promise<void> {
  switch (executionType) {
    case 'MAINTENANCE_TASK':
      await prisma.propertyMaintenanceTask.updateMany({
        where: { id: executionEntityId, status: 'COMPLETED' },
        data: { status: 'IN_PROGRESS' },
      });
      return;
    case 'GUIDANCE':
      await prisma.guidanceJourney.updateMany({
        where: { id: executionEntityId, status: 'COMPLETED' },
        data: { status: 'ACTIVE', completedAt: null },
      });
      return;
    case 'PROJECT':
      await prisma.projectRecord.updateMany({
        where: { id: executionEntityId, status: 'COMPLETED' },
        data: { status: 'IN_PROGRESS' },
      });
      return;
    case 'BOOKING':
    case 'CLAIM':
      // Neither domain has a reopen primitive of its own to call: Booking
      // has no "uncomplete" concept, and ClaimStatus's APPROVED/DENIED both
      // only legally transition to CLOSED (claims.transitions.ts --
      // terminal by that domain's own design). Leaving the domain record
      // as-is is the honest behavior here, not a gap this dispatch can
      // close on its own -- there is nothing for it to call.
      return;
    default: {
      const exhaustiveCheck: never = executionType;
      throw new Error(`reopenOneDomainRecord: unhandled executionType ${String(exhaustiveCheck)}`);
    }
  }
}
