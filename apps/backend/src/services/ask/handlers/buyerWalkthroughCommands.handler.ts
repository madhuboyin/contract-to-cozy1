// The buyer's final walkthrough inside Ask (register P2 "Buyer Closing"; FRD v1.345). Reached only by the declared actions on the walkthrough readiness
// answer. Every write is BuyerWalkthroughService's own method (the routes' calls), behind a review that names what changes and a confirmation bound to
// the record it changes. The service enforces the contributor floor and its completion rules; this handler only offers what it would accept.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { BuyerWalkthroughService } from '../../buyerWalkthrough.service';
import {
  ISSUE_CATEGORIES, ISSUE_STATUS_LABELS, OBSERVATION_CATEGORIES, OBSERVATION_STATUS_LABELS, ROUTED_ROLES, WALKTHROUGH_CAPTURE_KEYS, WALKTHROUGH_ENTITY_TYPES, WALKTHROUGH_MESSAGES,
  issueKinds, observationKinds, parseWalkthroughAnswer, walkthroughCompletionBlockers, walkthroughKindFromMessage, type WalkthroughFormKind, type WalkthroughKind,
} from '../support/buyerWalkthroughCommand';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const backAction = { id: 'buyer-walkthrough-back', label: 'Back to my walkthrough', interactionType: 'START_WORKFLOW' as const, message: 'Show my final walkthrough readiness', operationId: 'BUYER_WALKTHROUGH_READINESS' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'buyer-walkthrough-unavailable', title, body, tone: 'DEFAULT', actions: [backAction] }], suggestions: [],
});
const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });
const label = (pairs: ReadonlyArray<readonly [string, string]>, value: string) => pairs.find(([key]) => key === value)?.[1] ?? value;
const options = (pairs: ReadonlyArray<readonly [string, string]>) => pairs.map(([value, text]) => ({ label: text, value }));

interface Obs { id: string; area: string; category: string; status: string; notes: string | null; updatedAt: string }
interface Iss { id: string; title: string; category: string; status: string; blocking: boolean; sourceObservationId: string | null; routedToRole: string | null; updatedAt: string }
interface Workspace { completedAt: string | null; scheduledAt: string | null; accessConfirmedAt: string | null; utilitiesConfirmedAt: string | null; updatedAt: string; observations: Obs[]; issues: Iss[] }

async function loadWorkspace(userId: string, propertyId: string): Promise<Workspace | null> {
  const data = await BuyerWalkthroughService.get(userId, propertyId);
  return data.workspace as unknown as Workspace | null;
}
const wsVersion = (w: Workspace | null) => sha(`walkthrough:${w?.updatedAt ?? 'none'}:${w?.completedAt ?? ''}:${(w?.observations ?? []).map((o) => `${o.id}:${o.status}:${o.updatedAt}`).join('|')}:${(w?.issues ?? []).map((i) => `${i.id}:${i.status}:${i.updatedAt}`).join('|')}`);

function formCapture(kind: WalkthroughFormKind, contextVersion: string, w: Workspace | null, entered?: Record<string, unknown>): AskCaptureRequest {
  const sel = (key: string, labelText: string, pairs: ReadonlyArray<readonly [string, string]>, required = true) => ({ key, label: labelText, required, inputSchema: { type: 'SINGLE_SELECT' as const, options: options(pairs) } });
  const text = (key: string, labelText: string, max: number, required = true) => ({ key, label: labelText, required, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: max } });
  const long = (key: string, labelText: string) => ({ key, label: labelText, required: false, inputSchema: { type: 'LONG_TEXT' as const, maxLength: 2000 } });
  const yn = [['YES', 'Yes'], ['NO', 'No']] as const;
  const specs = {
    WORKSPACE: { title: 'Update your final walkthrough plan', question: 'What changed?', fields: [
      { key: 'scheduledDate', label: 'Walkthrough date', required: false, inputSchema: { type: 'APPROXIMATE_DATE' as const, allowedPrecisions: ['EXACT_DATE'], allowFuture: true } },
      sel('accessConfirmed', 'Access to the home confirmed', yn, false), sel('utilitiesConfirmed', 'Utilities on for the walkthrough', yn, false),
    ] },
    OBSERVATION_ADD: { title: 'Record an observation', question: 'What did you look at?', fields: [
      text('area', 'Where (room or area)', 160), sel('category', 'What kind of check', OBSERVATION_CATEGORIES),
      sel('status', 'What you found', [['NOT_REVIEWED', 'Not reviewed yet'], ['ACCEPTABLE', 'Looks fine'], ['ISSUE', 'A problem'], ['NOT_APPLICABLE', 'Not applicable']]), long('notes', 'Notes'),
    ] },
    OBSERVATION_REVIEW: { title: 'What did you find?', question: 'Record the result for this check.', fields: [
      sel('status', 'Result', [['ACCEPTABLE', 'Looks fine'], ['ISSUE', 'A problem'], ['NOT_APPLICABLE', 'Not applicable']]), long('notes', 'Notes'),
    ] },
    ISSUE_ADD: { title: 'Record the issue', question: 'What is the problem?', fields: [
      sel('category', 'Kind of problem', ISSUE_CATEGORIES), text('title', 'In a few words', 200), long('notes', 'Details'), sel('blocking', 'Is it serious enough to hold up closing', yn),
    ] },
    ISSUE_UPDATE: { title: 'What is being done about it?', question: 'Choose where it stands.', fields: [
      sel('status', 'Where it stands', [['ROUTED_TO_PROFESSIONAL', 'Sent to a professional'], ['RESOLVED', 'Resolved'], ['ACCEPTED_AS_IS', 'Accepted as is']]),
      sel('routedToRole', 'If sent on, to whom', ROUTED_ROLES, false), long('notes', 'Notes'),
    ] },
  } as const;
  const spec = specs[kind];
  const seed = kind === 'ISSUE_ADD' ? { blocking: 'NO' } : kind === 'OBSERVATION_ADD' ? { status: 'NOT_REVIEWED' } : {};
  void w;
  return {
    requirementId: `buyer-walkthrough-${kind.toLowerCase().replace(/_/g, '-')}-inputs`, captureKey: WALKTHROUGH_CAPTURE_KEYS[kind], classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: spec.title, question: spec.question, helpText: 'Nothing is saved until you confirm. Ask does not tell you whether to close; your professionals do.',
    inputSchema: { type: 'GROUP', fields: spec.fields } as unknown as AskCaptureRequest['inputSchema'], currentAnswer: entered ?? seed, allowNotSure: false, sensitivity: 'STANDARD',
    destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function walkthroughCommandResult(
  userId: string, propertyId: string, launch: { kind: WalkthroughKind; entityId: string | null; sourceExecutionId: string | null }, supplied?: Record<string, unknown>,
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'buyer-walkthrough-permission', title: 'A contributor or owner can change the walkthrough', body: 'Your role can view this purchase but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  }
  const kind = launch.kind;
  const w = await loadWorkspace(userId, propertyId);
  const contextVersion = wsVersion(w);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  const consent = 'I authorize this change to the shared purchase record.';
  const confirmation = (id: string, spec: { title: string; description: string; confirmLabel: string; fields: Array<{ label: string; value: string }> }) => ({
    confirmationId: `buyer-walkthrough-${id}-1`, version: 1, title: spec.title, description: spec.description, fields: spec.fields, editableFields: [] as never[],
    confirmLabel: spec.confirmLabel, consentText: consent, expiresAt: expiresAt.toISOString(),
  });
  const obs = launch.entityId ? w?.observations.find((o) => o.id === launch.entityId) ?? null : null;
  const iss = launch.entityId ? w?.issues.find((i) => i.id === launch.entityId) ?? null : null;

  if (kind === 'COMPLETE') {
    if (w?.completedAt) return unavailable('BUYER_WALKTHROUGH_ALREADY_COMPLETE', 'The walkthrough is already complete', 'Nothing has changed.');
    const blockers = walkthroughCompletionBlockers(w);
    if (blockers.length) return unavailable('BUYER_WALKTHROUGH_NOT_READY', 'It is not ready to mark complete', `${blockers.join(' ')} Nothing has changed.`);
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'BUYER_WALKTHROUGH_COMPLETE_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { walkthroughCommand: { kind, entityId: null }, walkthroughContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'buyer-walkthrough-complete-review', title: 'Mark the final walkthrough complete?', body: 'Nothing changes until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: confirmation('complete', {
        title: 'Mark the final walkthrough complete?', confirmLabel: 'Mark complete',
        description: 'This records that you finished the walkthrough and settled every issue. It does not tell you whether to close, and it contacts no one.',
        fields: [{ label: 'Observations recorded', value: String(w!.observations.length) }, { label: 'Issues recorded', value: String(w!.issues.length) }],
      }),
      suggestions: [],
    };
  }
  if (kind === 'OBSERVATION_REVIEW' && !obs) return unavailable('BUYER_WALKTHROUGH_OBSERVATION_NOT_FOUND', 'That observation is no longer available', 'Nothing has changed.');
  if (kind === 'ISSUE_ADD') {
    if (!obs) return unavailable('BUYER_WALKTHROUGH_OBSERVATION_NOT_FOUND', 'That observation is no longer available', 'Nothing has changed.');
    if (obs.status !== 'ISSUE' || w!.issues.some((i) => i.sourceObservationId === obs.id)) return unavailable('BUYER_WALKTHROUGH_ISSUE_NOT_NEEDED', 'No issue is needed for that observation', 'Nothing has changed.');
  }
  if (kind === 'ISSUE_UPDATE') {
    if (!iss) return unavailable('BUYER_WALKTHROUGH_ISSUE_NOT_FOUND', 'That issue is no longer available', 'Nothing has changed.');
    if (!issueKinds(iss).includes('ISSUE_UPDATE')) return unavailable('BUYER_WALKTHROUGH_ISSUE_SETTLED', 'That issue is already settled', 'Nothing has changed.');
  }
  const formKind = kind as WalkthroughFormKind;
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: `BUYER_WALKTHROUGH_${kind}_INPUT_REQUIRED`, contextVersion,
      parameters: { walkthroughLaunch: { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId } },
      blocks: [{ type: 'SUMMARY', id: 'buyer-walkthrough-input', title: 'Your final walkthrough', body: 'Nothing has been saved yet; you will review the change first.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [formCapture(formKind, contextVersion, w)], suggestions: [],
    };
  }
  const parsed = parseWalkthroughAnswer(formKind, supplied);
  if (!parsed.success) return unavailable('BUYER_WALKTHROUGH_INPUT_INVALID', 'Check the details', parsed.error.issues[0]?.message?.startsWith('Choose who') ? 'Choose who is receiving the issue. Nothing has changed.' : 'Fill in what the form asks for. Nothing has changed.');
  const d = parsed.data as Record<string, string | undefined>;
  const spec = (() => {
    switch (formKind) {
      case 'WORKSPACE': return {
        title: 'Update the walkthrough plan?', confirmLabel: 'Save the plan', description: 'This updates your walkthrough plan. It contacts no one.',
        fields: [
          ...(d.scheduledDate ? [{ label: 'Walkthrough date', value: `${w?.scheduledAt ? humanDate(new Date(w.scheduledAt)) : 'Not set'} → ${humanDate(new Date(`${d.scheduledDate}T12:00:00.000Z`))}` }] : []),
          ...(d.accessConfirmed ? [{ label: 'Access confirmed', value: `${w?.accessConfirmedAt ? 'Yes' : 'No'} → ${d.accessConfirmed === 'YES' ? 'Yes' : 'No'}` }] : []),
          ...(d.utilitiesConfirmed ? [{ label: 'Utilities on', value: `${w?.utilitiesConfirmedAt ? 'Yes' : 'No'} → ${d.utilitiesConfirmed === 'YES' ? 'Yes' : 'No'}` }] : []),
        ],
      };
      case 'OBSERVATION_ADD': return {
        title: 'Record this observation?', confirmLabel: 'Record it', description: 'This adds the observation to your walkthrough. If the walkthrough was marked complete it reopens.',
        fields: [{ label: 'Where', value: d.area! }, { label: 'Check', value: label(OBSERVATION_CATEGORIES, d.category!) }, { label: 'Found', value: OBSERVATION_STATUS_LABELS[d.status!] }],
      };
      case 'OBSERVATION_REVIEW': return {
        title: 'Record the result?', confirmLabel: 'Record it', description: 'This updates the observation. If the walkthrough was marked complete it reopens.',
        fields: [{ label: 'Observation', value: `${obs!.area}` }, { label: 'Result', value: `${OBSERVATION_STATUS_LABELS[obs!.status]} → ${OBSERVATION_STATUS_LABELS[d.status!]}` }],
      };
      case 'ISSUE_ADD': return {
        title: 'Record this issue?', confirmLabel: 'Record the issue', description: 'This adds the issue to your walkthrough. Route it to your professional, since Ask does not tell you whether to close.',
        fields: [{ label: 'Issue', value: d.title! }, { label: 'Kind', value: label(ISSUE_CATEGORIES, d.category!) }, { label: 'Holds up closing', value: d.blocking === 'YES' ? 'Yes' : 'No' }],
      };
      case 'ISSUE_UPDATE': return {
        title: 'Record where it stands?', confirmLabel: 'Record it', description: 'This updates the issue. Routing it records who has it; it contacts no one.',
        fields: [{ label: 'Issue', value: iss!.title }, { label: 'Where it stands', value: `${ISSUE_STATUS_LABELS[iss!.status]} → ${ISSUE_STATUS_LABELS[d.status!]}${d.routedToRole ? ` (${label(ROUTED_ROLES, d.routedToRole)})` : ''}` }],
      };
    }
  })();
  if (formKind === 'WORKSPACE' && spec.fields.length === 0) return unavailable('BUYER_WALKTHROUGH_NOTHING_TO_CHANGE', 'Nothing to change', 'Fill in at least one thing. Nothing has changed.');
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: `BUYER_WALKTHROUGH_${kind}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: { walkthroughCommand: { kind, entityId: launch.entityId }, walkthroughForm: supplied, walkthroughContextVersion: contextVersion, ...base },
    blocks: [{ type: 'SUMMARY', id: 'buyer-walkthrough-review', title: spec.title, body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: confirmation(`${kind.toLowerCase()}-${sha(JSON.stringify(supplied)).slice(0, 12)}`, spec),
    captureRequests: [formCapture(formKind, contextVersion, w, supplied)], suggestions: [],
  };
}

registerCapabilityHandler('buyer-walkthrough.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = walkthroughKindFromMessage(envelope.message);
  const needsEntity = kind === 'OBSERVATION_REVIEW' || kind === 'ISSUE_ADD' || kind === 'ISSUE_UPDATE';
  const expectedType = kind === 'ISSUE_UPDATE' ? WALKTHROUGH_ENTITY_TYPES.ISSUE : WALKTHROUGH_ENTITY_TYPES.OBSERVATION;
  if (!kind || launch?.operationId !== 'BUYER_WALKTHROUGH_COMMAND' || launch.surface === 'ASK_REFRESH' || (needsEntity && (launch.entityType !== expectedType || !launch.entityId))) {
    return unavailable('ASK_BUYER_WALKTHROUGH_NOT_DIRECTLY_ROUTABLE', 'Open your walkthrough first', 'The walkthrough is changed from your final walkthrough readiness. Nothing has changed.');
  }
  return walkthroughCommandResult(envelope.userId, envelope.propertyId!, { kind, entityId: needsEntity ? launch.entityId! : null, sourceExecutionId: launch.sourceExecutionId ?? null });
});

async function confirmWalkthrough(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.walkthroughCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind as WalkthroughKind | undefined;
  if (!kind || !(kind in WALKTHROUGH_MESSAGES)) throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  const entityId = typeof command?.entityId === 'string' ? command.entityId : null;
  let title: string;
  try {
    const w = await loadWorkspace(userId, propertyId);
    if (parameters.walkthroughContextVersion !== wsVersion(w)) throw stale('Your walkthrough changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    if (kind === 'COMPLETE') {
      if (walkthroughCompletionBlockers(w).length) throw stale('The walkthrough is not ready to mark complete.');
      await BuyerWalkthroughService.complete(userId, propertyId);
      title = 'Final walkthrough complete';
    } else {
      const parsed = parseWalkthroughAnswer(kind as WalkthroughFormKind, parameters.walkthroughForm);
      if (!parsed.success) throw stale('The details to save are invalid.');
      const d = parsed.data as Record<string, string | undefined>;
      if (kind === 'WORKSPACE') {
        await BuyerWalkthroughService.update(userId, propertyId, {
          ...(d.scheduledDate ? { scheduledAt: new Date(`${d.scheduledDate}T12:00:00.000Z`).toISOString() } : {}),
          ...(d.accessConfirmed ? { accessConfirmed: d.accessConfirmed === 'YES' } : {}),
          ...(d.utilitiesConfirmed ? { utilitiesConfirmed: d.utilitiesConfirmed === 'YES' } : {}),
        } as never);
        title = 'Walkthrough plan saved';
      } else if (kind === 'OBSERVATION_ADD') {
        await BuyerWalkthroughService.createObservation(userId, propertyId, { area: d.area, category: d.category, status: d.status, ...(d.notes ? { notes: d.notes } : {}) } as never);
        title = 'Observation recorded';
      } else if (kind === 'OBSERVATION_REVIEW') {
        if (!entityId || !w?.observations.some((o) => o.id === entityId)) throw stale('That observation is no longer available.');
        await BuyerWalkthroughService.updateObservation(userId, propertyId, entityId, { status: d.status, ...(d.notes ? { notes: d.notes } : {}) } as never);
        title = 'Result recorded';
      } else if (kind === 'ISSUE_ADD') {
        const obs = w?.observations.find((o) => o.id === entityId);
        if (!obs || obs.status !== 'ISSUE' || w!.issues.some((i) => i.sourceObservationId === obs.id)) throw stale('An issue is no longer needed for that observation.');
        await BuyerWalkthroughService.createIssue(userId, propertyId, {
          sourceObservationId: obs.id, category: d.category, title: d.title, blocking: d.blocking === 'YES', ...(d.notes ? { notes: d.notes } : {}),
        } as never);
        title = 'Issue recorded';
      } else {
        const issue = w?.issues.find((i) => i.id === entityId);
        if (!issue || issue.status !== 'OPEN') throw stale('That issue is already settled.');
        await BuyerWalkthroughService.updateIssue(userId, propertyId, issue.id, {
          status: d.status, ...(d.routedToRole ? { routedToRole: d.routedToRole } : {}), ...(d.notes ? { notes: d.notes } : {}),
        } as never);
        title = 'Issue updated';
      }
    }
  } catch (error) {
    if (error instanceof Error && (!(error as { code?: unknown }).code || (error as { statusCode?: unknown }).statusCode)) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `BUYER_WALKTHROUGH_${kind}_COMPLETED`,
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `buyer-walkthrough-${kind.toLowerCase()}-${entityId ?? propertyId}`, title, status: 'COMPLETED', description: 'It is on your final walkthrough record. Nobody was contacted.', details: [], actions: [{ ...backAction, label: 'See my walkthrough', style: 'PRIMARY' as const }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: 'buyer-walkthrough-refresh-failed', severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'BUYER_WALKTHROUGH', artifactId: entityId ?? propertyId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('buyer-walkthrough.command', confirmWalkthrough);
