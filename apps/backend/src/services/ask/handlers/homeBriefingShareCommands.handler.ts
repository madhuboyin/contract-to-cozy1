// Sharing selected Home Briefing updates inside Ask (owner ruling 2026-10-13; FRD v1.331). Owner only. Reached only by the declared "Share selected
// updates" summary action and "Stop sharing" row action on the briefing answer. The write goes through createSelectedHomeBriefingShare and
// revokeHomeBriefingShare, the routes' own calls, behind a review that names exactly what becomes public and a confirmation.
//
// The rules the owner set: only explicitly selected, share-eligible updates of the latest briefing; an expiring link; the review shows each update's
// title and summary as the recipient will read them; later changes to the briefing are never included (the share is a selection of fixed updates);
// access history is the view count and last viewed time on the shares list; revocation is immediate. The conversation receipt does not repeat anyone's
// details, and Cozy stores only a hash of the link, so the link is shown once.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { createSelectedHomeBriefingShare, revokeHomeBriefingShare } from '../../../homeBriefing/homeBriefing.service';
import {
  BRIEFING_SHARE_CAPTURE_KEY, BRIEFING_SHARE_ENTITY_TYPE, BRIEFING_SHARE_EXPIRY_DAYS, BRIEFING_SHARE_MESSAGES, briefingShareKindFromMessage, parseBriefingShareAnswer,
  type BriefingShareForm, type BriefingShareKind,
} from '../support/homeBriefingCommand';

const CONFIRMATION_MINUTES = 30;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const database = prisma as any;

export interface BriefingShareLaunch { kind: BriefingShareKind; entityId: string; sourceExecutionId: string | null }

const backToBriefing = { id: 'home-briefing-back', label: 'Back to my briefing', interactionType: 'START_WORKFLOW' as const, message: 'Show my home briefing', operationId: 'HOME_BRIEFING_VIEW' as const, style: 'SECONDARY' as const };
const blocked = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'BLOCKED', reasonCode, blocks: [{ type: 'SUMMARY', id: 'home-briefing-share-blocked', title, body, tone: 'CAUTION', actions: [] }], suggestions: [],
});
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'home-briefing-share-unavailable', title, body, tone: 'DEFAULT', actions: [backToBriefing] }], suggestions: [],
});
const notRoutable = (): AskOperationResult => unavailable('ASK_HOME_BRIEFING_SHARE_NOT_DIRECTLY_ROUTABLE', 'Open your briefing first', 'A briefing is shared from your briefing. Nothing has changed.');

type EligibleItem = { id: string; title: string; summary: string; topic: string; updatedAt: Date };
async function latestDeliveryWithEligible(propertyId: string, userId: string) {
  const delivery = await database.homeBriefingDelivery.findFirst({
    where: { propertyId, userId }, orderBy: { generatedAt: 'desc' },
    select: { id: true, generatedAt: true, items: { where: { shareEligible: true }, select: { id: true, title: true, summary: true, topic: true, updatedAt: true }, orderBy: [{ materiality: 'desc' }, { createdAt: 'desc' }] } },
  });
  return delivery as { id: string; generatedAt: Date; items: EligibleItem[] } | null;
}
const createVersion = (delivery: { id: string; items: EligibleItem[] }) => sha(`briefing-share:${delivery.id}:${delivery.items.map((i) => `${i.id}${i.updatedAt.toISOString()}`).join(',')}`);
async function loadShare(propertyId: string, userId: string, shareId: string) {
  return database.homeBriefingShare.findFirst({
    where: { id: shareId, propertyId, createdByUserId: userId },
    select: { id: true, status: true, expiresAt: true, updatedAt: true, _count: { select: { items: true } } },
  }) as Promise<{ id: string; status: string; expiresAt: Date; updatedAt: Date; _count: { items: number } } | null>;
}
const revokeVersion = (share: { id: string; status: string; updatedAt: Date }) => sha(`briefing-share-revoke:${share.id}:${share.status}:${share.updatedAt.toISOString()}`);

function shareCapture(contextVersion: string, items: EligibleItem[], entered: Record<string, unknown> = {}): AskCaptureRequest {
  const clean = Object.fromEntries(Object.entries(entered).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  return {
    requirementId: 'home-briefing-share-inputs', captureKey: BRIEFING_SHARE_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: 'Share selected updates', question: 'Which updates should the link show, and for how long?',
    helpText: 'Anyone with the link can read exactly the updates you choose until it expires or you stop sharing it. Only updates marked shareable are listed. Later changes to your briefing are not added.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'itemIds', label: 'Updates to share', required: true, inputSchema: { type: 'MULTI_SELECT' as const, options: items.slice(0, 10).map((item) => ({ label: item.title, value: item.id })), maxItems: 10 } },
      { key: 'expiresInDays', label: 'Link lasts', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: BRIEFING_SHARE_EXPIRY_DAYS.map((d) => ({ label: d === 1 ? '1 day' : `${d} days`, value: String(d) })) } },
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: clean, allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this link; nothing is shared until you confirm',
    confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function briefingShareResult(userId: string, propertyId: string, launch: BriefingShareLaunch, supplied?: BriefingShareForm): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role !== HouseholdRole.OWNER) return blocked('ASK_OWNER_REQUIRED', 'Only an owner can share briefing updates', 'A shared link is readable by anyone who has it, so creating or stopping one is an owner’s decision. Nothing has changed.');
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };

  if (launch.kind === 'REVOKE') {
    const share = await loadShare(propertyId, userId, launch.entityId);
    if (!share || share.status !== 'ACTIVE') return unavailable('HOME_BRIEFING_SHARE_NOT_ACTIVE', 'That link is not active', 'It has already been stopped or has expired. Nothing has changed.');
    const contextVersion = revokeVersion(share);
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_BRIEFING_SHARE_REVOKE_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { briefingShareCommand: { kind: 'REVOKE', entityId: share.id }, briefingShareContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'home-briefing-share-revoke-review', title: 'Stop sharing this link?', body: 'Nothing changes until you confirm.', tone: 'CAUTION', actions: [] }],
      confirmation: {
        confirmationId: `home-briefing-share-revoke-${sha(share.id).slice(0, 12)}-1`, version: 1, title: 'Stop sharing this link?',
        description: 'Anyone with the link loses access immediately. Your briefing is not changed.',
        fields: [{ label: 'Updates shared', value: String(share._count.items) }, { label: 'Would have expired', value: humanDate(share.expiresAt) ?? '' }],
        editableFields: [], confirmLabel: 'Stop sharing', consentText: 'I authorize ending this shared link.', expiresAt: expiresAt.toISOString(),
      },
      suggestions: [],
    };
  }

  const delivery = await latestDeliveryWithEligible(propertyId, userId);
  if (!delivery) return unavailable('HOME_BRIEFING_NONE_YET', 'There is no briefing to share yet', 'Prepare your briefing first. Nothing has changed.');
  if (!delivery.items.length) return unavailable('HOME_BRIEFING_NOTHING_SHAREABLE', 'Nothing in your latest briefing can be shared', 'Only updates marked shareable can be shared, and none is. Nothing has changed.');
  const contextVersion = createVersion(delivery);
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'HOME_BRIEFING_SHARE_INPUT_REQUIRED', contextVersion,
      parameters: { briefingShareLaunch: { kind: 'CREATE', entityId: propertyId, sourceExecutionId: launch.sourceExecutionId } },
      blocks: [{ type: 'SUMMARY', id: 'home-briefing-share-input', title: 'Share selected updates', body: `${delivery.items.length} update${delivery.items.length === 1 ? '' : 's'} in your latest briefing can be shared. Nothing has been shared yet.`, tone: 'DEFAULT', actions: [] }],
      captureRequests: [shareCapture(contextVersion, delivery.items)], suggestions: [],
    };
  }
  const chosen = delivery.items.filter((item) => supplied.itemIds.includes(item.id));
  if (chosen.length !== supplied.itemIds.length) return unavailable('HOME_BRIEFING_SHARE_SELECTION_INVALID', 'Choose only shareable updates from your latest briefing', 'One or more of those is not shareable now. Nothing has been shared.');
  const until = new Date(Date.now() + supplied.expiresInDays * 24 * 60 * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_BRIEFING_SHARE_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { briefingShareForm: supplied, briefingShareCommand: { kind: 'CREATE', entityId: propertyId }, briefingShareContextVersion: contextVersion, ...base },
    blocks: [{
      type: 'SUMMARY', id: 'home-briefing-share-review', title: 'This is exactly what becomes public',
      body: chosen.map((item) => `• ${item.title}: ${item.summary.slice(0, 280)}`).join('\n'), tone: 'CAUTION', actions: [],
    }],
    confirmation: {
      confirmationId: `home-briefing-share-${sha(`${propertyId}:${[...supplied.itemIds].sort().join(',')}:${supplied.expiresInDays}`).slice(0, 12)}-1`, version: 1,
      title: `Create a public link to ${chosen.length} update${chosen.length === 1 ? '' : 's'}?`,
      description: `Anyone who has the link can read these updates, with the property name, city and state, until ${humanDate(until)} or until you stop sharing. Updates added or changed later are not included. Cozy keeps only a hash of the link, so it is shown once.`,
      fields: [...chosen.map((item) => ({ label: 'Update', value: item.title })), { label: 'Expires', value: humanDate(until) ?? '' }],
      editableFields: [], confirmLabel: 'Create the link', consentText: 'I authorize making these updates readable by anyone with the link.', expiresAt: expiresAt.toISOString(),
    },
    captureRequests: [shareCapture(contextVersion, delivery.items, { itemIds: supplied.itemIds, expiresInDays: String(supplied.expiresInDays) })], suggestions: [],
  };
}

registerCapabilityHandler('home-briefing.share', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = briefingShareKindFromMessage(envelope.message);
  if (!kind || launch?.operationId !== 'HOME_BRIEFING_SHARE_COMMAND' || launch.surface === 'ASK_REFRESH' || !launch.entityId || launch.entityType !== BRIEFING_SHARE_ENTITY_TYPE) return notRoutable();
  return briefingShareResult(envelope.userId, envelope.propertyId!, { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmBriefingShare(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  if (ctx.access.role !== HouseholdRole.OWNER) throw stale('Only an owner can share briefing updates.', 'ASK_PERMISSION_REQUIRED');
  const command = parameters.briefingShareCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind as BriefingShareKind | undefined;
  if (!kind || !(kind in BRIEFING_SHARE_MESSAGES) || typeof command?.entityId !== 'string') throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  let title: string; let description: string; let artifactId = command.entityId;
  const actions: Array<Record<string, unknown>> = [];
  try {
    if (kind === 'REVOKE') {
      const share = await loadShare(propertyId, userId, command.entityId);
      if (!share || share.status !== 'ACTIVE') throw stale('That link is no longer active.');
      if (parameters.briefingShareContextVersion !== revokeVersion(share)) throw stale('This link changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      await revokeHomeBriefingShare({ propertyId, userId, shareId: share.id });
      artifactId = share.id; title = 'Sharing stopped'; description = 'The link no longer opens.';
    } else {
      const delivery = await latestDeliveryWithEligible(propertyId, userId);
      if (!delivery) throw stale('There is no briefing to share.');
      if (parameters.briefingShareContextVersion !== createVersion(delivery)) throw stale('Your briefing changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      const checked = parseBriefingShareAnswer(parameters.briefingShareForm);
      if (!checked.success) throw stale('The selection to share is invalid.');
      const eligible = new Set(delivery.items.map((item) => item.id));
      if (!checked.data.itemIds.every((id) => eligible.has(id))) throw stale('One or more of those updates can no longer be shared.');
      const created: any = await createSelectedHomeBriefingShare({ propertyId, userId, deliveryId: delivery.id, itemIds: checked.data.itemIds, expiresInDays: checked.data.expiresInDays });
      artifactId = created.share?.id ?? propertyId;
      title = 'Link created';
      description = `${created.selectedItemCount} update${created.selectedItemCount === 1 ? '' : 's'} can be read by anyone with the link until ${humanDate(new Date(created.share.expiresAt)) ?? 'it expires'}. Copy it now; it cannot be shown again. You can stop sharing from your briefing.`;
      actions.push({ id: 'home-briefing-open-share', label: 'Open the shared view', href: created.shareUrl, style: 'SECONDARY' });
    }
  } catch (error) {
    if (error instanceof Error && (!(error as { code?: unknown }).code || (error as { statusCode?: unknown }).statusCode)) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `HOME_BRIEFING_SHARE_${kind}_COMPLETED`,
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `home-briefing-share-${kind.toLowerCase()}-${artifactId}`, title, status: 'COMPLETED', description, details: [], actions: [...actions as never[], { ...backToBriefing, label: 'See my briefing', style: 'PRIMARY' as const }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `home-briefing-share-refresh-failed-${artifactId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.',
    });
  }
  return { result, artifactType: 'HOME_BRIEFING_SHARE', artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('home-briefing.share', confirmBriefingShare);
