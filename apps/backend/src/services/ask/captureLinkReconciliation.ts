import { prisma } from '../../lib/prisma';

// Ask Cozy Stage 3, Phase 2 (implementation plan §8/§20; FRD §22, Stage 2's
// third- and fourth-round corrections). Built and tested synthetically
// ahead of any real producer -- nothing creates a linked capture pair yet
// (Phase 3's first supported types are explicitly scalar fact and simple
// retrospective home event only, not warranty; see the implementation
// plan's Phase 3 section) -- per this phase's own acceptance criterion,
// which requires the event+warranty pairing mechanism proven under
// simulated concurrent confirmation before extraction exists.
//
// The problem this closes: a homeowner statement that implies two related
// captures (e.g. a new appliance install *and* its warranty) produces two
// independently-confirmed AskExecutions. Whichever confirms first cannot
// yet set the cross-reference (the other side's canonical record doesn't
// exist yet) -- Stage 2's earlier design tried a synchronous check at
// completion time and found it race-prone (third-round correction).
// Instead: each sibling's AskExecution.linkedExecutionId points at the
// other (bidirectional -- fourth-round correction, set on both, not
// one-sided), and completing either side re-triggers reconciliation
// against durably-committed state via a DomainEvent
// (ASK_CAPTURE_LINK_RECONCILE), not an in-request check. Reconciliation is
// naturally idempotent and order-independent: it only writes once both
// sides are COMPLETED, so whichever side finishes first is a safe no-op,
// and whichever finishes second (or a duplicate/replayed trigger of either)
// converges on the same result.

/**
 * Point two sibling capture executions' linkedExecutionId at each other,
 * atomically. Call once, when both AskExecution rows already exist (i.e.
 * after whatever produces a linked pair -- Phase 3's extraction -- has
 * created both), before either is confirmed.
 */
export async function linkSiblingCaptureExecutions(
  executionAId: string,
  executionBId: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.askExecution.update({ where: { id: executionAId }, data: { linkedExecutionId: executionBId } }),
    prisma.askExecution.update({ where: { id: executionBId }, data: { linkedExecutionId: executionAId } }),
  ]);
}

/**
 * Call after a capture-confirm execution completes, for any execution that
 * might have a linkedExecutionId set (confirmCaptureFact/confirmCaptureEvent
 * do not call this directly today -- no producer sets linkedExecutionId yet
 * -- this is the reconciliation half of the mechanism, invoked by the
 * ASK_CAPTURE_LINK_RECONCILE worker consumer). A no-op, not an error, when:
 * the execution has no linked sibling; the sibling doesn't exist; or either
 * side hasn't completed yet (the side that finishes second re-triggers this
 * and it converges then). Currently the only documented pairing (FRD §22)
 * is a HomeEvent referencing the Warranty captured alongside it --
 * Warranty's own back-relation (homeEvents: HomeEvent[]) reads through
 * HomeEvent.warrantyId, so only the HomeEvent side ever needs a write.
 */
export async function reconcileCaptureLink(executionId: string): Promise<void> {
  const execution = await prisma.askExecution.findUnique({
    where: { id: executionId },
    select: { id: true, linkedExecutionId: true },
  });
  if (!execution?.linkedExecutionId) return;

  const [self, linked] = await Promise.all([
    prisma.askConfirmationReceipt.findUnique({
      where: { executionId: execution.id },
      select: { status: true, artifactType: true, artifactId: true },
    }),
    prisma.askConfirmationReceipt.findUnique({
      where: { executionId: execution.linkedExecutionId },
      select: { status: true, artifactType: true, artifactId: true },
    }),
  ]);
  if (self?.status !== 'COMPLETED' || linked?.status !== 'COMPLETED') return;

  const homeEventSide = self.artifactType === 'HOME_EVENT' ? self : linked.artifactType === 'HOME_EVENT' ? linked : null;
  const warrantySide = self.artifactType === 'WARRANTY' ? self : linked.artifactType === 'WARRANTY' ? linked : null;
  if (!homeEventSide?.artifactId || !warrantySide?.artifactId) return;

  // where: warrantyId: null makes this safely re-runnable: a duplicate or
  // out-of-order retrigger of the same pair is a genuine no-op (count: 0),
  // never a spurious overwrite of an already-reconciled or independently
  // edited HomeEvent.warrantyId.
  await prisma.homeEvent.updateMany({
    where: { id: homeEventSide.artifactId, warrantyId: null },
    data: { warrantyId: warrantySide.artifactId },
  });
}
