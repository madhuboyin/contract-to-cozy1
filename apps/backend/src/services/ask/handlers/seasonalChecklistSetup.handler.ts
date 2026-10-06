// "Add these to my tasks" on the seasonal home-care answer (SEASONAL_CHECKLIST_SETUP). It does not add the handful of general tasks the
// answer lists: it sets up the home's real checklist for that season through the same generator the Seasonal Checklist page and the
// worker use, which evaluates every template against what is recorded about the home and links each applicable task to Maintenance.
// So the confirmation previews exactly what the generator will add (read-only, same applicability code) and says plainly that this can
// differ from the general list. Non-routable and reached only from the declared action on that answer; owner-only, like the generator.
import { createHash } from 'node:crypto';
import { HouseholdRole, type Season } from '@prisma/client';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { analyticsEmitter, AnalyticsEvent, AnalyticsFeature, AnalyticsModule } from '../../analytics';
import { SeasonalChecklistService } from '../../seasonalChecklist.service';
import { resolveCurrentSeasonWindow, resolveUpcomingSeasonWindow } from '../../seasonal/seasonWindow';
import { parseSeasonalPlanEntityId, SEASONAL_PLAN_ENTITY_TYPE, seasonalFromSetupMessage } from '../support/seasonalHomeCare';

const SEASON_WORDS: Record<Season, string> = { SPRING: 'spring', SUMMER: 'summer', FALL: 'fall', WINTER: 'winter' };
const PRIORITY_LABELS: Record<string, string> = { CRITICAL: 'High priority', RECOMMENDED: 'Recommended', OPTIONAL: 'Optional' };
const MAX_LISTED = 8;

const showChecklistAction = (season: Season) => ({
  id: 'seasonal-show-checklist', label: `Show my ${SEASON_WORDS[season]} checklist`, interactionType: 'START_WORKFLOW' as const,
  message: `What seasonal maintenance tasks are on my ${SEASON_WORDS[season]} checklist?`, operationId: 'MAINTENANCE_STATUS', style: 'PRIMARY' as const,
});

const updateHomeDetailsAction = () => ({
  id: 'seasonal-update-home-details', label: 'Update home details', interactionType: 'START_WORKFLOW' as const,
  message: 'How complete is my home record?', operationId: 'PROPERTY_SUMMARY', style: 'PRIMARY' as const,
});

const boundary = (title: string, body: string, status: AskOperationResult['status'], reasonCode: string): AskOperationResult => ({
  status, reasonCode,
  blocks: [{ type: 'BOUNDARY', id: 'seasonal-setup-boundary', title, body, severity: 'INFO', suggestions: [] }],
  suggestions: [],
});

// Only the season in progress and the next one: those are the two the answer is ever about, and the generator is keyed by season + year.
function isOfferedWindow(plan: { season: Season; year: number }, now: Date): boolean {
  return [resolveCurrentSeasonWindow(now), resolveUpcomingSeasonWindow(now)].some((window) => window.season === plan.season && window.year === plan.year);
}

const setupContextVersion = (plan: { season: Season; year: number }, preview: { existingChecklistId: string | null; toAdd: Array<{ taskKey: string }> }) =>
  createHash('sha256').update([plan.season, plan.year, preview.existingChecklistId ?? '', ...preview.toAdd.map((template) => template.taskKey).sort()].join(':')).digest('hex');

async function previewFor(propertyId: string, plan: { season: Season; year: number }, userId: string) {
  try {
    return await SeasonalChecklistService.previewSeasonalChecklist(propertyId, plan.season, plan.year, userId);
  } catch (error) {
    // The generator only runs for the home's own owner; a missing property is its way of saying "not yours".
    if ((error as Error).message === 'Property not found') return null;
    throw error;
  }
}

async function seasonalSetupResult(userId: string, propertyId: string, message: string, launchContext: CreateAskExecutionRequest['launchContext'] | undefined, now: Date): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const season = seasonalFromSetupMessage(message);
  const plan = launchContext?.entityType === SEASONAL_PLAN_ENTITY_TYPE ? parseSeasonalPlanEntityId(launchContext.entityId) : null;
  const declared = launchContext?.operationId === 'SEASONAL_CHECKLIST_SETUP' && launchContext.surface !== 'ASK_REFRESH' && season && plan && plan.season === season;
  // A refresh, a free-text message, or a plan outside this and the next season must never start a confirmation.
  if (!declared || !plan || !isOfferedWindow(plan, now)) {
    return boundary('Use the Add these to my tasks button', 'Ask a seasonal question, then choose Add these to my tasks on its answer. Nothing has changed.', 'NOT_APPLICABLE', 'ASK_SEASONAL_SETUP_NOT_DIRECTLY_ROUTABLE');
  }
  if (access.role !== HouseholdRole.OWNER) {
    return boundary('The home owner sets up the checklist', 'Your role can view seasonal care but not set up the checklist. Nothing has changed.', 'BLOCKED', 'ASK_PERMISSION_REQUIRED');
  }
  const preview = await previewFor(propertyId, plan, userId);
  const label = `${SEASON_WORDS[plan.season]} ${plan.year}`;
  if (!preview) return boundary('This checklist cannot be set up from here', 'Only the home\'s owner can set up its seasonal checklist. Nothing has changed.', 'BLOCKED', 'SEASONAL_SETUP_NOT_OWNER');
  if (!preview.eligible) {
    return preview.reason === 'AUTO_GENERATE_OFF'
      ? boundary('Automatic checklists are turned off', 'Seasonal checklists are switched off for this home in its seasonal settings, so none was created. Nothing has changed.', 'BLOCKED', 'SEASONAL_SETUP_AUTO_GENERATE_OFF')
      : boundary('Seasonal checklists are for homes you own', 'This home is not set up as one you own and maintain, so no checklist was created. Nothing has changed.', 'BLOCKED', 'SEASONAL_SETUP_NOT_OWNERSHIP_CARE');
  }
  const heldBack = preview.decisions.filter(({ decision }) => decision.status === 'UNKNOWN').length;
  if (preview.toAdd.length === 0) {
    if (preview.alreadyOnChecklist.length > 0) {
      return {
        status: 'COMPLETED', reasonCode: 'SEASONAL_SETUP_ALREADY_DONE',
        blocks: [{ type: 'WORKFLOW_PROGRESS', id: `seasonal-setup-${plan.season}-${plan.year}`, title: `Your ${label} checklist is already set up`, status: 'COMPLETED', description: 'Every task that applies to this home is already on it. Nothing was changed.', details: [{ label: 'Tasks on the checklist', value: String(preview.alreadyOnChecklist.length) }], actions: [showChecklistAction(plan.season)] }],
        suggestions: [],
      };
    }
    return {
      status: 'BLOCKED', reasonCode: 'SEASONAL_SETUP_NEEDS_HOME_DETAILS',
      blocks: [{ type: 'SUMMARY', id: 'seasonal-setup-needs-details', title: `No ${SEASON_WORDS[plan.season]} tasks can be added yet`, body: `${heldBack ? `${heldBack} ${heldBack === 1 ? 'task is' : 'tasks are'} waiting on` : 'The checklist needs'} details about your home that are not recorded yet, so nothing was added. Add those details and I can set it up. Nothing has changed.`, tone: 'DEFAULT', actions: [updateHomeDetailsAction()] }],
      suggestions: [],
    };
  }
  const contextVersion = setupContextVersion(plan, preview);
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const listed = preview.toAdd.slice(0, MAX_LISTED);
  const more = preview.toAdd.length - listed.length;
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'SEASONAL_SETUP_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { seasonalSetupSeason: plan.season, seasonalSetupYear: plan.year, seasonalSetupContextVersion: contextVersion, sourceExecutionId: launchContext?.sourceExecutionId ?? null, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'seasonal-setup-review', title: `Review your ${label} checklist`, body: `Nothing has changed yet. This sets up the ${label} checklist for this home and adds ${preview.toAdd.length === 1 ? 'its task' : `its ${preview.toAdd.length} tasks`} to Maintenance. It uses what is recorded about your home, so it can differ from the general list.${heldBack ? ` ${heldBack} more ${heldBack === 1 ? 'task is' : 'tasks are'} held back until more home details are known.` : ''}`, tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `seasonal-setup-${plan.season}-${plan.year}-1`, version: 1, title: `Set up your ${label} checklist?`,
      description: 'This adds the tasks below to your Maintenance list, linked to the seasonal checklist. You can dismiss optional ones later; high-priority safety tasks stay.',
      fields: [
        { label: 'Checklist', value: capitalize(label) },
        { label: 'Tasks to add', value: String(preview.toAdd.length) },
        ...listed.map((template, index) => ({ label: `${index + 1}. ${PRIORITY_LABELS[template.priority] ?? 'Optional'}`, value: template.title })),
        ...(more > 0 ? [{ label: 'And', value: `${more} more` }] : []),
        ...(preview.alreadyOnChecklist.length ? [{ label: 'Already on your checklist', value: String(preview.alreadyOnChecklist.length) }] : []),
        ...(heldBack ? [{ label: 'Held back until more home details are known', value: String(heldBack) }] : []),
      ],
      editableFields: [], confirmLabel: 'Set up checklist', consentText: 'I authorize creating this seasonal checklist and adding its tasks to my maintenance list.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

const capitalize = (value: string) => `${value[0].toUpperCase()}${value.slice(1)}`;

registerCapabilityHandler('seasonal.checklist-setup', async (envelope) => seasonalSetupResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.launchContext, new Date()));

const confirmError = (message: string, code: string) => Object.assign(new Error(message), { code });

async function confirmSeasonalSetup(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access } = ctx;
  if (access.role !== HouseholdRole.OWNER) throw confirmError('Only the home owner can set up the seasonal checklist.', 'ASK_PERMISSION_REQUIRED');
  const plan = parseSeasonalPlanEntityId(`${String(parameters.seasonalSetupSeason)}:${String(parameters.seasonalSetupYear)}`);
  if (!plan || !isOfferedWindow(plan, new Date())) throw confirmError('The seasonal setup command is invalid.', 'ASK_CONFIRMATION_NOT_ACTIVE');
  const preview = await previewFor(execution.propertyId, plan, userId);
  if (!preview || !preview.eligible) throw confirmError('This checklist can no longer be set up from here.', 'ASK_CONFIRMATION_NOT_ACTIVE');
  // Nothing left to add means an earlier confirmation (or the worker) already did it: report it, never write twice.
  const alreadyApplied = preview.toAdd.length === 0 && preview.alreadyOnChecklist.length > 0;
  if (!alreadyApplied && parameters.seasonalSetupContextVersion !== setupContextVersion(plan, preview)) {
    throw confirmError('Your home record or checklist changed while this confirmation was open. Review it and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  }
  let checklist = null as { id: string; totalTasks: number; tasksAdded: number } | null;
  if (!alreadyApplied) {
    checklist = await SeasonalChecklistService.generateSeasonalChecklist(execution.propertyId, plan.season, plan.year, userId);
    if (!checklist) throw confirmError('The seasonal checklist could not be set up for this home.', 'ASK_CONFIRMATION_NOT_ACTIVE');
    // The page's controller emits this event after generating; Ask is the same product action.
    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED, userId, propertyId: execution.propertyId, moduleKey: AnalyticsModule.MAINTENANCE,
      featureKey: AnalyticsFeature.SEASONAL_CHECKLIST, metadataJson: { actionType: 'generate_checklist', season: plan.season, year: plan.year, source: 'ask' },
    });
  } else {
    checklist = { id: preview.existingChecklistId ?? `${plan.season}:${plan.year}`, totalTasks: preview.alreadyOnChecklist.length, tasksAdded: preview.alreadyOnChecklist.length };
  }
  const label = `${SEASON_WORDS[plan.season]} ${plan.year}`;
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: alreadyApplied ? 'SEASONAL_SETUP_ALREADY_DONE' : 'SEASONAL_SETUP_COMPLETED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `seasonal-setup-${plan.season}-${plan.year}`, title: `Your ${label} checklist is set up`, status: 'COMPLETED',
      description: 'Its tasks are on your Maintenance list. Ask what is on the checklist to review them.',
      details: [{ label: 'Tasks on the checklist', value: String(checklist.totalTasks) }, { label: 'Added to Maintenance', value: String(checklist.tasksAdded) }],
      actions: [showChecklistAction(plan.season)],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'BOUNDARY', id: `seasonal-setup-refresh-failed-${plan.season}-${plan.year}`, severity: 'CAUTION', title: 'Saved; the answer could not refresh',
      body: 'The checklist was set up. The seasonal answer you were viewing could not refresh automatically; ask again to see its current state.', suggestions: [],
    });
  }
  return { result, artifactType: 'SEASONAL_CHECKLIST', artifactId: checklist.id, refreshedExecutions: refresh.refreshedExecutions };
}

registerConfirmCapabilityHandler('seasonal.checklist-setup', confirmSeasonalSetup);
