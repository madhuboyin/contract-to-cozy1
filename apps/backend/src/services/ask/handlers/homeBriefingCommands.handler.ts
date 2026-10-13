// Home Briefing controls inside Ask (register P1 "Home Briefing / Home Gazette"; FRD v1.327). Reached only by declared actions on the briefing answer:
// "Prepare my briefing" and "Change settings" (summary actions) and Mark seen / Dismiss / Not useful (row actions). Every write goes through
// homeBriefing.service, the same functions the routes call (generateHomeBriefing, updateHomeBriefingPreference, recordHomeBriefingItemOutcome), behind a
// review card and a confirmation. A briefing is the caller's own (preferences, deliveries and item readings are stored per user), so none of this
// changes anything for another member. Sharing selected items creates a public link and is not offered here.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { generateHomeBriefing, recordHomeBriefingItemOutcome, updateHomeBriefingPreference } from '../../../homeBriefing/homeBriefing.service';
import {
  BRIEFING_CADENCES, BRIEFING_CADENCE_LABELS, BRIEFING_CHANNELS, BRIEFING_CHANNEL_LABELS, BRIEFING_COMMAND_MESSAGES, BRIEFING_ITEM_OUTCOME, BRIEFING_PREFERENCES_CAPTURE_KEY,
  BRIEFING_TOPICS, BRIEFING_TOPIC_LABELS, briefingCommandEntityType, briefingCommandKindFromMessage, briefingPreferencesInput, parseBriefingPreferencesAnswer,
  type BriefingCommandKind, type BriefingPreferencesForm,
} from '../support/homeBriefingCommand';

const CONFIRMATION_MINUTES = 30;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const database = prisma as any;

export interface BriefingCommandLaunch { kind: BriefingCommandKind; entityId: string; sourceExecutionId: string | null }

const backToBriefing = { id: 'home-briefing-back', label: 'Back to my briefing', interactionType: 'START_WORKFLOW' as const, message: 'Show my home briefing', operationId: 'HOME_BRIEFING_VIEW' as const, style: 'SECONDARY' as const };
const blocked = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'BLOCKED', reasonCode, blocks: [{ type: 'SUMMARY', id: 'home-briefing-command-blocked', title, body, tone: 'CAUTION', actions: [] }], suggestions: [],
});
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'home-briefing-command-unavailable', title, body, tone: 'DEFAULT', actions: [backToBriefing] }], suggestions: [],
});
const notRoutable = (): AskOperationResult => unavailable('ASK_HOME_BRIEFING_COMMAND_NOT_DIRECTLY_ROUTABLE', 'Open your briefing first', 'A briefing is prepared or changed from your briefing. Nothing has changed.');

async function loadPreference(propertyId: string, userId: string) {
  return database.homeBriefingPreference.findUnique({ where: { propertyId_userId: { propertyId, userId } } }) as Promise<
    { cadence: string; topics: string[]; channels: string[]; enabled: boolean; updatedAt: Date } | null>;
}
const preferenceVersion = (preference: { updatedAt: Date; enabled: boolean; cadence: string } | null) =>
  sha(`briefing-preferences:${preference ? `${preference.enabled}:${preference.cadence}:${preference.updatedAt.toISOString()}` : 'none'}`);
async function latestDelivery(propertyId: string, userId: string) {
  return database.homeBriefingDelivery.findFirst({ where: { propertyId, userId }, orderBy: { generatedAt: 'desc' }, select: { id: true, generatedAt: true } }) as Promise<{ id: string; generatedAt: Date } | null>;
}
async function loadItem(propertyId: string, userId: string, itemId: string) {
  return database.homeBriefingItem.findFirst({
    where: { id: itemId, delivery: { propertyId, userId } },
    select: { id: true, title: true, seenAt: true, actedAt: true, dismissedAt: true, notUsefulAt: true, updatedAt: true },
  }) as Promise<{ id: string; title: string; seenAt: Date | null; actedAt: Date | null; dismissedAt: Date | null; notUsefulAt: Date | null; updatedAt: Date } | null>;
}
const itemVersion = (kind: BriefingCommandKind, item: { id: string; updatedAt: Date }) => sha(`briefing-item:${kind}:${item.id}:${item.updatedAt.toISOString()}`);

function preferencesCapture(contextVersion: string, entered: Record<string, unknown>): AskCaptureRequest {
  const clean = Object.fromEntries(Object.entries(entered).filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)));
  return {
    requirementId: 'home-briefing-preferences-inputs', captureKey: BRIEFING_PREFERENCES_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: 'Your home briefing settings', question: 'How should your briefing work?',
    helpText: 'These are your own settings; they do not change anyone else’s. Leave topics empty to hear about everything. Nothing is saved until you confirm.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'enabled', label: 'Briefing', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: [{ label: 'On', value: 'YES' }, { label: 'Off', value: 'NO' }] } },
      { key: 'cadence', label: 'How often', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: BRIEFING_CADENCES.map((value) => ({ label: BRIEFING_CADENCE_LABELS[value], value })) } },
      { key: 'topics', label: 'Topics', required: false, inputSchema: { type: 'MULTI_SELECT' as const, options: BRIEFING_TOPICS.map((value) => ({ label: BRIEFING_TOPIC_LABELS[value], value })), maxItems: 7 } },
      { key: 'channels', label: 'Where to send it', required: true, inputSchema: { type: 'MULTI_SELECT' as const, options: BRIEFING_CHANNELS.map((value) => ({ label: BRIEFING_CHANNEL_LABELS[value], value })), maxItems: 3 } },
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: clean, allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this change; nothing is saved until you confirm',
    confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function briefingCommandResult(userId: string, propertyId: string, launch: BriefingCommandLaunch, supplied?: BriefingPreferencesForm): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return blocked('ASK_PERMISSION_REQUIRED', 'A contributor or owner can change the briefing in Ask', 'Your role can view this home but not change it from Ask. Nothing has changed.');
  const kind = launch.kind;
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  const confirmation = (id: string, spec: { title: string; description: string; confirmLabel: string; fields: Array<{ label: string; value: string }> }) => ({
    confirmationId: `home-briefing-${id}-1`, version: 1, title: spec.title, description: spec.description, fields: spec.fields, editableFields: [] as never[],
    confirmLabel: spec.confirmLabel, consentText: 'I authorize this change to my own briefing.', expiresAt: expiresAt.toISOString(),
  });

  if (kind === 'GENERATE') {
    const [preference, delivery] = await Promise.all([loadPreference(propertyId, userId), latestDelivery(propertyId, userId)]);
    if (preference && !preference.enabled) return unavailable('HOME_BRIEFING_DISABLED', 'Your briefing is turned off', 'Turn it on in your briefing settings first. Nothing has changed.');
    const contextVersion = sha(`briefing-generate:${propertyId}:${userId}:${delivery?.generatedAt.toISOString() ?? ''}:${preferenceVersion(preference)}`);
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_BRIEFING_GENERATE_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { briefingCommand: { kind, entityId: propertyId }, briefingContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'home-briefing-generate-review', title: 'Prepare your briefing now?', body: 'Nothing changes until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: confirmation(`generate-${sha(propertyId).slice(0, 12)}`, {
        title: 'Prepare your briefing now?', confirmLabel: 'Prepare it',
        description: 'This gathers the changes to your home since your last briefing. If there is something new it may notify you through the channels you chose; if nothing changed it is a quiet briefing. It is yours alone.',
        fields: [{ label: 'For', value: 'You' }, { label: 'Settings', value: `${BRIEFING_CADENCE_LABELS[preference?.cadence ?? 'WEEKLY'] ?? 'Weekly'}` }],
      }),
      suggestions: [],
    };
  }

  if (kind === 'PREFERENCES') {
    const preference = await loadPreference(propertyId, userId);
    const contextVersion = preferenceVersion(preference);
    if (!supplied) {
      return {
        status: 'NEEDS_CONTEXT', reasonCode: 'HOME_BRIEFING_PREFERENCES_INPUT_REQUIRED', contextVersion,
        parameters: { briefingCommandLaunch: { kind, entityId: propertyId, sourceExecutionId: launch.sourceExecutionId } },
        blocks: [{ type: 'SUMMARY', id: 'home-briefing-preferences-input', title: 'Your home briefing settings', body: 'Change what you want, then review it before it is saved.', tone: 'DEFAULT', actions: [] }],
        captureRequests: [preferencesCapture(contextVersion, {
          enabled: preference ? (preference.enabled ? 'YES' : 'NO') : 'YES', cadence: preference?.cadence ?? 'WEEKLY', topics: preference?.topics ?? [], channels: preference?.channels ?? ['IN_APP'],
        })],
        suggestions: [],
      };
    }
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_BRIEFING_PREFERENCES_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { briefingForm: supplied, briefingCommand: { kind, entityId: propertyId }, briefingContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'home-briefing-preferences-review', title: 'Review your briefing settings', body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: confirmation(`preferences-${sha(JSON.stringify(supplied)).slice(0, 12)}`, {
        title: 'Save these briefing settings?', confirmLabel: 'Save settings',
        description: 'These are your own settings. They do not change anyone else’s briefing.',
        fields: [
          { label: 'Briefing', value: supplied.enabled === 'YES' ? 'On' : 'Off' }, { label: 'How often', value: BRIEFING_CADENCE_LABELS[supplied.cadence] ?? supplied.cadence },
          { label: 'Topics', value: supplied.topics.length ? supplied.topics.map((t) => BRIEFING_TOPIC_LABELS[t] ?? t).join(', ') : 'Everything' },
          { label: 'Where', value: supplied.channels.map((c) => BRIEFING_CHANNEL_LABELS[c] ?? c).join(', ') },
        ],
      }),
      captureRequests: [preferencesCapture(contextVersion, supplied as unknown as Record<string, unknown>)], suggestions: [],
    };
  }

  const item = await loadItem(propertyId, userId, launch.entityId);
  if (!item) return unavailable('HOME_BRIEFING_ITEM_NOT_FOUND', 'That update is no longer in your briefing', 'Ask could not find that item. Nothing has changed.');
  const contextVersion = itemVersion(kind, item);
  const verb = kind === 'SEEN' ? 'Mark this seen' : kind === 'DISMISS' ? 'Dismiss this' : 'Mark this not useful';
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: `HOME_BRIEFING_${kind}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: { briefingCommand: { kind, entityId: item.id }, briefingContextVersion: contextVersion, ...base },
    blocks: [{ type: 'SUMMARY', id: 'home-briefing-item-review', title: item.title, body: 'Nothing changes until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: confirmation(`${kind.toLowerCase()}-${sha(item.id).slice(0, 12)}`, {
      title: `${verb}?`, confirmLabel: kind === 'SEEN' ? 'Mark seen' : kind === 'DISMISS' ? 'Dismiss' : 'Not useful',
      description: kind === 'NOT_USEFUL'
        ? 'It is set aside and your feedback helps the briefing show fewer updates like it. This is only your own briefing.'
        : 'It is recorded for your briefing only; it changes nothing for anyone else and nothing in the home record.',
      fields: [{ label: 'Update', value: item.title }],
    }),
    suggestions: [],
  };
}

registerCapabilityHandler('home-briefing.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = briefingCommandKindFromMessage(envelope.message);
  if (!kind || launch?.operationId !== 'HOME_BRIEFING_COMMAND' || launch.surface === 'ASK_REFRESH' || !launch.entityId || launch.entityType !== briefingCommandEntityType(kind)) return notRoutable();
  return briefingCommandResult(envelope.userId, envelope.propertyId!, { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmBriefingCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.briefingCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind as BriefingCommandKind | undefined;
  if (!kind || !(kind in BRIEFING_COMMAND_MESSAGES) || typeof command?.entityId !== 'string') throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  let title: string; let description: string; let artifactId = command.entityId;
  try {
    if (kind === 'GENERATE') {
      const [preference, delivery] = await Promise.all([loadPreference(propertyId, userId), latestDelivery(propertyId, userId)]);
      const version = sha(`briefing-generate:${propertyId}:${userId}:${delivery?.generatedAt.toISOString() ?? ''}:${preferenceVersion(preference)}`);
      if (parameters.briefingContextVersion !== version) throw stale('Your briefing changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      const generated: any = await generateHomeBriefing({ propertyId, userId });
      artifactId = generated?.id ?? propertyId;
      title = 'Briefing prepared'; description = 'Ask for your briefing to see what it found.';
    } else if (kind === 'PREFERENCES') {
      const preference = await loadPreference(propertyId, userId);
      if (parameters.briefingContextVersion !== preferenceVersion(preference)) throw stale('Your settings changed while the confirmation was open. Review them again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      const checked = parseBriefingPreferencesAnswer(parameters.briefingForm);
      if (!checked.success) throw stale('The settings to save are invalid.');
      await updateHomeBriefingPreference({ propertyId, userId, ...briefingPreferencesInput(checked.data) } as never);
      title = 'Settings saved'; description = 'They are your own and apply from your next briefing.';
    } else {
      const item = await loadItem(propertyId, userId, command.entityId);
      if (!item) throw stale('That update is no longer in your briefing.');
      if (parameters.briefingContextVersion !== itemVersion(kind, item)) throw stale('This update changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      await recordHomeBriefingItemOutcome({ propertyId, userId, itemId: item.id, outcome: BRIEFING_ITEM_OUTCOME[kind as 'SEEN' | 'DISMISS' | 'NOT_USEFUL'] });
      artifactId = item.id;
      title = kind === 'SEEN' ? 'Marked seen' : kind === 'DISMISS' ? 'Dismissed' : 'Marked not useful'; description = 'It is recorded for your briefing.';
    }
  } catch (error) {
    if (error instanceof Error && (!(error as { code?: unknown }).code || (error as { statusCode?: unknown }).statusCode)) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `HOME_BRIEFING_${kind}_COMPLETED`,
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `home-briefing-command-${kind.toLowerCase()}-${artifactId}`, title, status: 'COMPLETED', description, details: [], actions: [{ ...backToBriefing, label: 'See my briefing', style: 'PRIMARY' as const }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `home-briefing-refresh-failed-${artifactId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.',
    });
  }
  return { result, artifactType: 'HOME_BRIEFING', artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('home-briefing.command', confirmBriefingCommand);
