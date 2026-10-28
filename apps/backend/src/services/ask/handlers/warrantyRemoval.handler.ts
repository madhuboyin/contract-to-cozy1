// Delete a warranty, or keep one warranty of a conflicting group and remove the others (register "Warranties"; FRD v1.471). Reached from the row actions
// on the warranty list through the WARRANTY_UPDATE capability. Writes are home-management's own deleteWarranty / resolveWarrantyConflict, the calls
// Desktop's Warranties page makes. Both are scoped to the requester's own homeowner profile: a warranty another member added is never removed here.
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import type { CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import type { AskOperationResult } from '../askOperationRegistry';
import type { ConfirmCapabilityContext, ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { deleteWarranty, resolveWarrantyConflict } from '../../home-management.service';
import { getConflictedWarrantyGroups } from '../../coverageConflict.service';
import { warrantyContextVersion } from '../suggestedActions/domainVersions';
import { receiptFollowUpAction } from '../support/receiptFollowUps';
import { WARRANTY_DELETE_MESSAGE, WARRANTY_KEEP_MESSAGE } from '../support/warrantyRemoval';

type Launch = CreateAskExecutionRequest['launchContext'];
const stale = (message: string, code = 'ASK_CONTEXT_VERSION_CONFLICT') => Object.assign(new Error(message), { code });
const note = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'warranty-removal-unavailable', title, body, tone: 'CAUTION', actions: [] }], suggestions: [],
});

export const isWarrantyDeleteMessage = (message: string) => message.trim() === WARRANTY_DELETE_MESSAGE;
export const isWarrantyKeepMessage = (message: string) => message.trim() === WARRANTY_KEEP_MESSAGE;

const ownProfile = (userId: string) => prisma.homeownerProfile.findFirst({ where: { userId }, select: { id: true } });
const SELECT = { id: true, providerName: true, category: true, expiryDate: true, updatedAt: true } as const;

export async function warrantyRemovalResult(userId: string, propertyId: string, message: string, launch: Launch): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return note('WARRANTY_REMOVAL_PERMISSION', 'A contributor or owner is required', 'Your role cannot change warranties. Nothing changed.');
  const profile = await ownProfile(userId);
  const warranty = launch?.entityId && profile ? await prisma.warranty.findFirst({ where: { id: launch.entityId, propertyId, homeownerProfileId: profile.id }, select: SELECT }) : null;
  if (!warranty) return note('WARRANTY_REMOVAL_NOT_AVAILABLE', 'Ask can only remove warranties you added', 'This warranty is gone or belongs to another household member. Nothing changed.');
  const keep = isWarrantyKeepMessage(message);
  const contextVersion = warrantyContextVersion(warranty);
  const base = { sourceExecutionId: launch?.sourceExecutionId ?? null, confirmationVersion: 1, confirmationExpiresAt: new Date(Date.now() + 30 * 60_000).toISOString() };
  const expiry = humanDate(warranty.expiryDate) ?? 'date unavailable';
  const confirmation = (title: string, description: string, confirmLabel: string, fields: Array<{ label: string; value: string }>) => ({
    confirmationId: `warranty-${keep ? 'keep' : 'delete'}-${warranty.id}-1`, version: 1, title, description, fields, editableFields: [], confirmLabel,
    consentText: 'I authorize this change to the shared home record.', expiresAt: base.confirmationExpiresAt,
  });

  if (!keep) {
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'WARRANTY_DELETE_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { warrantyRemoval: { kind: 'DELETE', warrantyId: warranty.id }, warrantyRemovalContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'warranty-delete-review', title: `Review deleting the ${warranty.providerName} warranty`, body: 'No shared-home record has changed yet. Deleting cannot be undone.', tone: 'CAUTION', actions: [] }],
      confirmation: confirmation(`Delete the ${warranty.providerName} warranty?`, 'This permanently removes the warranty, and coverage analysis and the risk report are refreshed without it.', 'Delete warranty',
        [{ label: 'Provider', value: warranty.providerName }, { label: 'Category', value: warranty.category }, { label: 'Expires', value: expiry }]),
      suggestions: [],
    };
  }

  const groups = await getConflictedWarrantyGroups(propertyId, prisma);
  const group = groups.find((candidate) => candidate.warranties.some((row) => row.id === warranty.id));
  if (!group) return note('WARRANTY_NOT_IN_CONFLICT', 'This warranty is no longer in a conflict', 'Nothing needs resolving. Nothing changed.');
  // The service deletes only warranties on the requester's own profile; the review says which ones that is, and which stay.
  const others = group.warranties.filter((row) => row.id !== warranty.id);
  const ownIds = new Set((await prisma.warranty.findMany({ where: { id: { in: others.map((row) => row.id) }, homeownerProfileId: profile!.id }, select: { id: true } })).map((row) => row.id));
  const removed = others.filter((row) => ownIds.has(row.id));
  const stays = others.filter((row) => !ownIds.has(row.id));
  if (!removed.length) return note('WARRANTY_CONFLICT_NOTHING_TO_REMOVE', 'The conflicting warranties belong to someone else', 'The other warranties in this conflict were added by other household members, so Ask cannot remove them. Nothing changed.');
  const describe = (row: { providerName: string; expiryDate: Date }) => `${row.providerName}, expires ${humanDate(row.expiryDate) ?? 'date unavailable'}`;
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'WARRANTY_CONFLICT_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { warrantyRemoval: { kind: 'KEEP', warrantyId: warranty.id, removedIds: removed.map((row) => row.id).sort() }, warrantyRemovalContextVersion: contextVersion, ...base },
    blocks: [{ type: 'SUMMARY', id: 'warranty-keep-review', title: `Review keeping the ${warranty.providerName} warranty`, body: 'No shared-home record has changed yet. Removing cannot be undone.', tone: 'CAUTION', actions: [] }],
    confirmation: confirmation(`Keep the ${warranty.providerName} warranty and remove ${removed.length} other${removed.length === 1 ? '' : 's'}?`,
      `These ${group.category.toLowerCase().replace(/_/g, ' ')} warranties disagree, most often a duplicate or a stale record. The one you keep stays; the others are permanently removed.${stays.length ? ` ${stays.length} added by another household member stays.` : ''}`, 'Keep this one',
      [{ label: 'Keep', value: describe(warranty) }, ...removed.map((row) => ({ label: 'Remove', value: describe(row) }))]),
    suggestions: [],
  };
}

export async function confirmWarrantyRemoval(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult | null> {
  const { execution, userId, parameters, access } = ctx;
  const stored = parameters.warrantyRemoval as { kind?: string; warrantyId?: string; removedIds?: string[] } | undefined;
  if (!stored?.kind || !stored.warrantyId) return null;
  if (access.role === HouseholdRole.VIEWER) throw stale('A contributor or owner is required to change warranties.', 'ASK_PERMISSION_REQUIRED');
  const propertyId = execution.propertyId!;
  const profile = await ownProfile(userId);
  const warranty = profile ? await prisma.warranty.findFirst({ where: { id: stored.warrantyId, propertyId, homeownerProfileId: profile.id }, select: SELECT }) : null;
  if (!warranty) throw stale('This warranty is no longer available. It may have been removed.');
  if (parameters.warrantyRemovalContextVersion !== warrantyContextVersion(warranty)) throw stale('This warranty changed while confirmation was open. Review it and try again.');
  let removedCount = 1; let title = 'Warranty deleted'; let description = `The ${warranty.providerName} warranty was deleted and coverage analysis was marked for refresh.`;
  if (stored.kind === 'DELETE') {
    await deleteWarranty(warranty.id, profile!.id);
  } else if (stored.kind === 'KEEP') {
    // The conflict is re-read: if it changed since the review, nothing is removed that the homeowner did not see.
    const groups = await getConflictedWarrantyGroups(propertyId, prisma);
    const group = groups.find((candidate) => candidate.warranties.some((row) => row.id === warranty.id));
    const seen = new Set(stored.removedIds ?? []);
    if (!group) throw stale('This warranty is no longer in a conflict. Review it and try again.');
    const ownIds = new Set((await prisma.warranty.findMany({ where: { id: { in: group.warranties.map((row) => row.id) }, homeownerProfileId: profile!.id }, select: { id: true } })).map((row) => row.id));
    const wouldRemove = group.warranties.filter((row) => row.id !== warranty.id && ownIds.has(row.id)).map((row) => row.id);
    if (wouldRemove.some((id) => !seen.has(id))) throw stale('The conflicting warranties changed while confirmation was open. Review them and try again.');
    const resolved = await resolveWarrantyConflict(warranty.id, profile!.id);
    removedCount = resolved.removedWarrantyIds.length;
    title = 'Conflict resolved'; description = `The ${warranty.providerName} warranty was kept and ${removedCount} conflicting warrant${removedCount === 1 ? 'y was' : 'ies were'} removed.`;
  } else throw stale('The change to make is invalid.', 'ASK_CONFIRMATION_NOT_ACTIVE');
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: stored.kind === 'DELETE' ? 'WARRANTY_DELETED' : 'WARRANTY_CONFLICT_RESOLVED',
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `warranty-${stored.kind.toLowerCase()}-${warranty.id}`, title, status: 'COMPLETED', description, details: [{ label: 'Warranty', value: warranty.providerName }], actions: [receiptFollowUpAction('WARRANTIES')] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  return { result, artifactType: 'WARRANTY', artifactId: warranty.id, refreshedExecutions: refresh.refreshedExecutions };
}
