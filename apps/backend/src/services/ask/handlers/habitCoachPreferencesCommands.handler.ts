// The Home Habit Coach's property-wide settings inside Ask (register P2 "Home Habit Coach"; FRD v1.334). Reached only by the declared "Change coach
// settings" summary action on the habits answer. One form, a review of the before and after, and a confirmation; the write is the route's own
// HomeHabitCoachService.updatePreferences. The read never creates the settings row (getPreferences returns the defaults); the first save does.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { HomeHabitCoachService } from '../../homeHabitCoach/homeHabitCoachService';
import {
  HABIT_CATEGORIES, HABIT_CATEGORY_LABELS, HABIT_COACH_PREFERENCES_CAPTURE_KEY, HABIT_COACH_PREFERENCES_MESSAGE, HABIT_COACH_PROPERTY_ENTITY_TYPE,
  habitCoachPreferencesBody, parseHabitCoachPreferencesAnswer, type HabitCoachPreferencesForm,
} from '../support/habitCoachPreferencesCommand';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const service = () => new HomeHabitCoachService();
const backToHabits = { id: 'home-habits-back', label: 'Back to my habits', interactionType: 'START_WORKFLOW' as const, message: 'Show my home habits', operationId: 'HOME_HABITS' as const, style: 'SECONDARY' as const };

const blocked = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'BLOCKED', reasonCode, blocks: [{ type: 'SUMMARY', id: 'habit-coach-settings-blocked', title, body, tone: 'CAUTION', actions: [] }], suggestions: [],
});

type Prefs = { isEnabled: boolean; preferredSurfaceCount: number | null; hiddenCategoriesJson: unknown; updatedAt: Date | null };
const hidden = (prefs: Prefs): string[] => (Array.isArray(prefs.hiddenCategoriesJson) ? (prefs.hiddenCategoriesJson as string[]) : []);
const versionOf = (propertyId: string, prefs: Prefs) => sha(`habit-coach-settings:${propertyId}:${prefs.updatedAt ? prefs.updatedAt.toISOString() : 'none'}`);
const describe = (isEnabled: boolean, count: number | null, categories: readonly string[]) => ({
  coach: isEnabled ? 'On' : 'Off', count: count === null ? 'The coach’s own default' : String(count),
  hidden: categories.length ? categories.map((c) => HABIT_CATEGORY_LABELS[c] ?? c).join(', ') : 'None',
});

function formCapture(contextVersion: string, values: { isEnabled: boolean; count: number | null; categories: readonly string[] }): AskCaptureRequest {
  return {
    requirementId: 'habit-coach-settings-inputs', captureKey: HABIT_COACH_PREFERENCES_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: 'Home Habit Coach settings', question: 'How should the coach work for this home?',
    helpText: 'These settings are shared by everyone in the household. Nothing is saved until you confirm.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'isEnabled', label: 'The coach', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'On', value: 'YES' }, { label: 'Off', value: 'NO' }] } },
      { key: 'preferredSurfaceCount', label: 'How many habits to show at once (leave blank for the default)', required: false, inputSchema: { type: 'NUMBER', min: 1, max: 20 } },
      { key: 'hiddenCategories', label: 'Hide these kinds of habit', required: false, inputSchema: { type: 'MULTI_SELECT', options: HABIT_CATEGORIES.map((value) => ({ label: HABIT_CATEGORY_LABELS[value], value })), maxItems: 10 } },
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: { isEnabled: values.isEnabled ? 'YES' : 'NO', ...(values.count !== null ? { preferredSurfaceCount: values.count } : {}), hiddenCategories: [...values.categories] },
    allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function habitCoachPreferencesResult(userId: string, propertyId: string, sourceExecutionId: string | null, supplied?: HabitCoachPreferencesForm): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return blocked('ASK_PERMISSION_REQUIRED', 'A contributor or owner can change the coach settings', 'Your role can view this home but not change it. Nothing has changed.');
  const { preferences } = await service().getPreferences(propertyId);
  const prefs = preferences as unknown as Prefs;
  const contextVersion = versionOf(propertyId, prefs);
  const current = { isEnabled: prefs.isEnabled, count: prefs.preferredSurfaceCount, categories: hidden(prefs) };
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'HABIT_COACH_SETTINGS_INPUT_REQUIRED', contextVersion,
      parameters: { habitCoachSettingsLaunch: { entityId: propertyId, sourceExecutionId } },
      blocks: [{ type: 'SUMMARY', id: 'habit-coach-settings-input', title: 'Home Habit Coach settings', body: 'Change what you want, then review it before it is saved.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [formCapture(contextVersion, current)], suggestions: [],
    };
  }
  const next = habitCoachPreferencesBody(supplied);
  const before = describe(current.isEnabled, current.count, current.categories);
  const after = describe(next.isEnabled, next.preferredSurfaceCount, next.hiddenCategories);
  const rows = (['coach', 'count', 'hidden'] as const).filter((key) => before[key] !== after[key]).map((key) => ({
    label: key === 'coach' ? 'The coach' : key === 'count' ? 'Habits shown at once' : 'Hidden kinds of habit', value: `${before[key]} → ${after[key]}`,
  }));
  if (!rows.length) {
    return { status: 'NOT_APPLICABLE', reasonCode: 'HABIT_COACH_SETTINGS_NO_CHANGE', blocks: [{ type: 'SUMMARY', id: 'habit-coach-settings-same', title: 'Nothing to change', body: 'The settings already match. Nothing has changed.', tone: 'DEFAULT', actions: [backToHabits] }], suggestions: [] };
  }
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'HABIT_COACH_SETTINGS_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { habitCoachSettingsForm: supplied, habitCoachSettingsContextVersion: contextVersion, sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'habit-coach-settings-review', title: 'Review the coach settings', body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `habit-coach-settings-${sha(`${propertyId}:${JSON.stringify(next)}`).slice(0, 12)}-1`, version: 1, title: 'Save these coach settings?',
      description: 'These apply to everyone in the household. Habits already in your routine are not removed.', fields: rows, editableFields: [], confirmLabel: 'Save settings',
      consentText: 'I authorize this change to the shared home record.', expiresAt: expiresAt.toISOString(),
    },
    captureRequests: [formCapture(contextVersion, { isEnabled: next.isEnabled, count: next.preferredSurfaceCount, categories: next.hiddenCategories })], suggestions: [],
  };
}

registerCapabilityHandler('home-habit-coach.preferences', async (envelope) => {
  const launch = envelope.launchContext;
  if (envelope.message !== HABIT_COACH_PREFERENCES_MESSAGE || launch?.operationId !== 'HOME_HABIT_PREFERENCES_COMMAND' || launch.surface === 'ASK_REFRESH'
    || launch.entityType !== HABIT_COACH_PROPERTY_ENTITY_TYPE) {
    return { status: 'NOT_APPLICABLE', reasonCode: 'ASK_HABIT_COACH_SETTINGS_NOT_DIRECTLY_ROUTABLE', blocks: [{ type: 'SUMMARY', id: 'habit-coach-settings-not-routable', title: 'Open your habits first', body: 'The coach settings are changed from your habits. Nothing has changed.', tone: 'DEFAULT', actions: [backToHabits] }], suggestions: [] };
  }
  return habitCoachPreferencesResult(envelope.userId, envelope.propertyId!, launch.sourceExecutionId ?? null);
});

async function confirmHabitCoachPreferences(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const propertyId = execution.propertyId;
  const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });
  const checked = parseHabitCoachPreferencesAnswer(parameters.habitCoachSettingsForm);
  if (!checked.success) throw stale('The settings to save are invalid.');
  const { preferences } = await service().getPreferences(propertyId);
  if (parameters.habitCoachSettingsContextVersion !== versionOf(propertyId, preferences as unknown as Prefs)) {
    throw stale('The coach settings changed while the confirmation was open. Review them again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  }
  await service().updatePreferences(propertyId, habitCoachPreferencesBody(checked.data));
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'HABIT_COACH_SETTINGS_SAVED',
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `habit-coach-settings-${propertyId}`, title: 'Coach settings saved', status: 'COMPLETED', description: 'They apply to everyone in the household.', details: [], actions: [{ ...backToHabits, label: 'See my habits', style: 'PRIMARY' as const }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: `habit-coach-settings-refresh-failed-${propertyId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'PROPERTY_HABIT_PREFERENCE', artifactId: propertyId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('home-habit-coach.preferences', confirmHabitCoachPreferences);
