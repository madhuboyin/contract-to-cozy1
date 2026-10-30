// Explore upgrade ideas, save or set one aside, and turn one into a renovation case (register "Renovation Risk Advisor"; FRD v1.487). Reached only by the
// declared actions on the renovation readiness answer, through the RENOVATION_CASE_START capability, so its contributor floor, mutation impact and
// governance already apply. Every write is renovationExplore.service's own (createExploration, updateOptionDisposition, convertOptionToCase), the calls
// the routes make, behind a review and a confirmation bound to what the household was looking at. Nothing is applied for, bought or started.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { money } from '../askFormatting';
import { logger } from '../../../lib/logger';
import { convertOptionToCase, createExploration, updateOptionDisposition } from '../../renovationExplore.service';
import {
  exploreGoalLabels, optionEntityId, parseOptionEntityId, parseRenovationExploreAnswer, RENOVATION_EXPLORE_ACTION_IDS, RENOVATION_EXPLORE_CAPTURE_KEY, RENOVATION_EXPLORE_MESSAGES,
  RENOVATION_EXPLORE_RESPONSIBILITIES, RENOVATION_IDEAS_COMPARE_ACTION_ID, RENOVATION_IDEAS_COMPARE_MESSAGE, pickIdeasToCompare, RENOVATION_GOALS, RENOVATION_OPTION_ENTITY_TYPE, RENOVATION_OPTION_STATUS_LABELS, renovationExploreServiceInput,
  type RenovationExploreActionId, type RenovationExploreForm,
} from '../support/renovationExploreCommand';
import { RENOVATION_RESPONSIBILITY_LABELS } from '../support/renovationCaseStart';

const database = prisma as any;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });
const ideasAction = { id: 'renovation-explore-ideas', label: 'See my upgrade ideas', interactionType: 'START_WORKFLOW' as const, message: 'Is my renovation ready to start?', operationId: 'RENOVATION_PERMIT_READINESS' as const, style: 'PRIMARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'renovation-explore-unavailable', title, body, tone: 'DEFAULT', actions: [{ ...ideasAction, style: 'SECONDARY' as const }] }], suggestions: [],
});

// The advisor call can outlast the confirmation's 60-second claim, and a lapsed claim lets recovery start a second run. While it works, the claim is
// renewed every 15 seconds; a renewal stops as soon as the receipt is no longer CLAIMED.
const LEASE_RENEW_MS = 15_000;
async function withRenewedClaim<T>(executionId: string, work: () => Promise<T>): Promise<T> {
  const timer = setInterval(() => {
    Promise.resolve(database.askConfirmationReceipt.updateMany({ where: { executionId, status: 'CLAIMED' }, data: { leaseExpiresAt: new Date(Date.now() + 60_000) } })).catch(() => undefined);
  }, LEASE_RENEW_MS);
  try { return await work(); } finally { clearInterval(timer); }
}

const FACT_WORDS: Record<string, string> = { 'core.yearBuilt': 'the year the home was built' };
const factLabel = (key: string) => FACT_WORDS[key] ?? key.split('.').pop()!.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

export interface RenovationExploreLaunch { actionId: RenovationExploreActionId; entityId: string | null; sourceExecutionId: string | null }

interface OptionRow { id: string; explorationId: string; title: string; description: string; status: string; renovationCaseId: string | null; updatedAt: Date }
const OPTION_SELECT = { id: true, explorationId: true, title: true, description: true, status: true, renovationCaseId: true, updatedAt: true };
const optionVersion = (row: OptionRow) => sha(`explore-option:${row.id}:${row.status}:${row.renovationCaseId ?? ''}:${row.updatedAt.toISOString()}`);

async function exploreVersion(propertyId: string): Promise<string> {
  const latest = await database.renovationExploration.findFirst({ where: { propertyId, archivedAt: null }, orderBy: { createdAt: 'desc' }, select: { id: true } });
  return sha(`explore:${propertyId}:${latest?.id ?? 'none'}`);
}
async function loadOption(propertyId: string, entityId: string | null): Promise<OptionRow | null> {
  const ids = parseOptionEntityId(entityId);
  if (!ids) return null;
  return await database.renovationUpgradeOption.findFirst({ where: { id: ids.optionId, explorationId: ids.explorationId, exploration: { propertyId, archivedAt: null } }, select: OPTION_SELECT }) as OptionRow | null;
}

function formCapture(contextVersion: string, entered: Record<string, unknown>): AskCaptureRequest {
  const goalOptions = RENOVATION_GOALS.map((goal) => ({ label: goal.label, value: goal.id }));
  return {
    requirementId: 'renovation-explore-inputs', captureKey: RENOVATION_EXPLORE_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', sensitivity: 'FINANCIAL',
    title: 'Explore upgrade ideas', question: 'What would you like your home to do better?',
    helpText: 'Choose a main goal, and a second if you have one. Cozy suggests a short list of ideas that fit this home. Nothing becomes a renovation plan until you choose one. You will review this before anything is saved.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'goal', label: 'Main goal', required: true, inputSchema: { type: 'SINGLE_SELECT', options: goalOptions } },
      { key: 'secondGoal', label: 'A second goal (optional)', required: false, inputSchema: { type: 'SINGLE_SELECT', options: goalOptions } },
      { key: 'responsibilityContext', label: 'Who is responsible for this part of the home?', required: false, inputSchema: { type: 'SINGLE_SELECT', options: RENOVATION_EXPLORE_RESPONSIBILITIES.map((value) => ({ label: RENOVATION_RESPONSIBILITY_LABELS[value], value })) } },
      { key: 'spaces', label: 'Rooms or areas affected', required: false, helpText: 'Separate with commas, for example: kitchen, backyard', inputSchema: { type: 'SHORT_TEXT', maxLength: 400 } },
      { key: 'budgetMax', label: 'Most you would spend ($)', required: false, inputSchema: { type: 'NUMBER', min: 1, max: 100_000_000 } },
      { key: 'targetTiming', label: 'When would you like to do it?', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 240 } },
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: Object.fromEntries(Object.entries(entered).filter(([, v]) => v !== undefined && v !== null && v !== '')),
    allowNotSure: false, destinationLabel: 'Used to prepare this exploration; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function renovationExploreCommandResult(userId: string, propertyId: string, launch: RenovationExploreLaunch, supplied?: Record<string, unknown>): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'renovation-explore-permission', title: 'A contributor or owner can explore upgrade ideas', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  }
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const launchParameters = { renovationExploreLaunch: { actionId: launch.actionId, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId } };
  const confirmation = (contextVersion: string, command: Record<string, unknown>, title: string, description: string, confirmLabel: string, fields: Array<{ label: string; value: string }>, consentText: string, id: string): AskOperationResult => ({
    status: 'NEEDS_CONFIRMATION', reasonCode: 'RENOVATION_EXPLORE_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { renovationExploreCommand: command, renovationExploreContextVersion: contextVersion, ...launchParameters, sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'renovation-explore-review', title, body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: { confirmationId: `renovation-explore-${id}-1`, version: 1, title, description, fields, editableFields: [], confirmLabel, consentText, expiresAt: expiresAt.toISOString() },
    suggestions: [],
  });

  if (launch.actionId === RENOVATION_EXPLORE_ACTION_IDS.START) {
    const contextVersion = await exploreVersion(propertyId);
    if (!supplied) {
      return {
        status: 'NEEDS_CONTEXT', reasonCode: 'RENOVATION_EXPLORE_INPUT_REQUIRED', contextVersion, parameters: launchParameters,
        blocks: [{ type: 'SUMMARY', id: 'renovation-explore-input', title: 'Explore upgrade ideas', body: 'Nothing has been saved yet.', tone: 'DEFAULT', actions: [] }],
        captureRequests: [formCapture(contextVersion, { responsibilityContext: 'UNKNOWN' })], suggestions: [],
      };
    }
    const parsed = parseRenovationExploreAnswer(supplied);
    if (!parsed.success) return unavailable('RENOVATION_EXPLORE_INPUT_INVALID', 'Check your goals', 'Choose a main goal and check the budget. Nothing has changed.');
    const f = parsed.data;
    return {
      ...confirmation(contextVersion, { actionId: launch.actionId, input: f }, 'Explore upgrade ideas for this home?',
        'Cozy will suggest a short list of upgrade ideas for this home using what is recorded about it. The suggestions are generated with AI and are a starting point, not advice, a quote or an approval. Nothing becomes a renovation plan until you choose one.', 'Find ideas',
        [{ label: 'Goals', value: exploreGoalLabels(f).join('; ') },
          ...(f.responsibilityContext && f.responsibilityContext !== 'UNKNOWN' ? [{ label: 'Responsible', value: RENOVATION_RESPONSIBILITY_LABELS[f.responsibilityContext] }] : []),
          ...(f.spaces ? [{ label: 'Areas', value: f.spaces }] : []),
          ...(f.budgetMax !== undefined ? [{ label: 'Most you would spend', value: money(f.budgetMax) }] : []),
          ...(f.targetTiming ? [{ label: 'Timing', value: f.targetTiming }] : [])],
        'I authorize generating and saving these upgrade ideas.', `start-${sha(JSON.stringify(f)).slice(0, 12)}`),
      captureRequests: [formCapture(contextVersion, f as Record<string, unknown>)],
    };
  }

  const option = await loadOption(propertyId, launch.entityId);
  if (!option) return unavailable('RENOVATION_OPTION_NOT_FOUND', 'That idea is not available', 'It may have been removed. Nothing has changed.');
  const contextVersion = optionVersion(option);
  if (option.status === 'SELECTED') return unavailable('RENOVATION_OPTION_ALREADY_SELECTED', 'A plan already exists for this idea', 'It cannot be saved or set aside now. Nothing has changed.');
  if (launch.actionId === RENOVATION_EXPLORE_ACTION_IDS.CREATE_PLAN && option.status === 'REJECTED') {
    return unavailable('RENOVATION_OPTION_REJECTED', 'Save the idea first', 'This idea is set aside. Save it before creating a renovation plan. Nothing has changed.');
  }
  const verb = { [RENOVATION_EXPLORE_ACTION_IDS.SAVE]: 'Save', [RENOVATION_EXPLORE_ACTION_IDS.SET_ASIDE]: 'Set aside', [RENOVATION_EXPLORE_ACTION_IDS.CREATE_PLAN]: 'Create a plan from' }[launch.actionId as string] ?? 'Update';
  const plan = launch.actionId === RENOVATION_EXPLORE_ACTION_IDS.CREATE_PLAN;
  return confirmation(contextVersion, { actionId: launch.actionId, entityId: launch.entityId }, `${verb} “${option.title}”?`,
    plan ? 'This creates a renovation case with a first draft scope from this idea, in the shared home record. It does not apply for a permit, contact anyone or start work.'
      : launch.actionId === RENOVATION_EXPLORE_ACTION_IDS.SAVE ? 'This keeps the idea on your list. You can set it aside later.' : 'This moves the idea off your active list. You can save it again later.',
    plan ? 'Create plan' : verb, [{ label: 'Idea', value: option.title }, { label: 'Now', value: RENOVATION_OPTION_STATUS_LABELS[option.status] ?? option.status }],
    plan ? 'I authorize adding this renovation case to the shared home record.' : 'I authorize this change.', `${launch.actionId.replace('renovation-option-', '')}-${sha(`${option.id}:${contextVersion}`).slice(0, 12)}`);
}

export async function confirmRenovationExploreCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  if (ctx.access.role === HouseholdRole.VIEWER) throw stale('A contributor or owner is required to do this.', 'ASK_PERMISSION_REQUIRED');
  const propertyId = execution.propertyId;
  const stored = parameters.renovationExploreCommand as { actionId?: unknown; entityId?: unknown; input?: unknown } | undefined;
  const actionId = stored?.actionId as RenovationExploreActionId | undefined;
  let title: string; let description: string; let artifactId = propertyId; let artifactType = 'RENOVATION_EXPLORATION';
  const details: Array<{ label: string; value: string }> = [];
  let actions: any[] = [ideasAction];
  try {
    if (actionId === RENOVATION_EXPLORE_ACTION_IDS.START) {
      if (parameters.renovationExploreContextVersion !== await exploreVersion(propertyId)) throw stale('Your upgrade ideas changed while the confirmation was open. Review again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      const parsed = parseRenovationExploreAnswer(stored?.input);
      if (!parsed.success) throw stale('The goals to explore are invalid.');
      const idempotencyKey = `ask:${execution.id}:renovation-explore`;
      const startedAt = Date.now();
      const receipt = await database.askConfirmationReceipt.findUnique({ where: { executionId: execution.id }, select: { attemptCount: true } }).catch(() => null);
      const recovered = Number(receipt?.attemptCount ?? 1) > 1;
      let created: any;
      try {
        const alreadyExisted = Boolean(await database.renovationExploration.findFirst({ where: { propertyId, idempotencyKey }, select: { id: true } }));
        created = await withRenewedClaim(execution.id, () => createExploration(propertyId, userId, renovationExploreServiceInput(parsed.data as RenovationExploreForm, idempotencyKey)));
        // Only counts and timings are logged: never goals, spaces, property facts or generated text.
        logger.info({ event: 'ask.renovation_explore.generated', outcome: 'success', durationMs: Date.now() - startedAt, optionCount: Array.isArray(created.options) ? created.options.length : 0, returnedExisting: alreadyExisted, recovered: recovered }, 'Ask renovation explore generation');
      } catch (error) {
        logger.warn({ event: 'ask.renovation_explore.generated', outcome: 'failure', durationMs: Date.now() - startedAt, timedOut: /time ?out|timed out|abort/i.test(String((error as Error)?.message ?? '')), recovered: recovered }, 'Ask renovation explore generation');
        throw error;
      }
      const count = Array.isArray(created.options) ? created.options.length : 0;
      artifactId = String(created.id);
      title = count ? 'Upgrade ideas ready' : 'No ideas to suggest yet';
      description = count ? `${count} idea${count === 1 ? '' : 's'} saved on your renovation answer. Nothing is a plan until you choose one.` : 'No upgrade ideas could be suggested from what is recorded. Try different goals, or add more about your home.';
      details.push({ label: 'Goals', value: exploreGoalLabels(parsed.data).join('; ') });
    } else if (actionId === RENOVATION_EXPLORE_ACTION_IDS.SAVE || actionId === RENOVATION_EXPLORE_ACTION_IDS.SET_ASIDE || actionId === RENOVATION_EXPLORE_ACTION_IDS.CREATE_PLAN) {
      const entityId = typeof stored?.entityId === 'string' ? stored.entityId : null;
      const ids = parseOptionEntityId(entityId);
      const option = ids ? await loadOption(propertyId, entityId) : null;
      if (!ids || !option) throw stale('That idea is no longer available.', 'ASK_CONTEXT_VERSION_CONFLICT');
      if (parameters.renovationExploreContextVersion !== optionVersion(option)) throw stale('This idea changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      details.push({ label: 'Idea', value: option.title });
      if (actionId === RENOVATION_EXPLORE_ACTION_IDS.CREATE_PLAN) {
        const created: any = await convertOptionToCase(propertyId, ids.explorationId, ids.optionId, userId, { governanceTier: 'LOW_CONSEQUENCE' });
        artifactType = 'RENOVATION_CASE'; artifactId = String(created.id);
        title = 'Renovation plan created'; description = 'The case and its first draft scope are saved. Nothing has been applied for or started.';
        actions = [{ id: 'renovation-case-readiness', label: 'Check readiness', interactionType: 'START_WORKFLOW' as const, message: `Is ${String(created.name ?? option.title)} ready to start?`.slice(0, 300), operationId: 'RENOVATION_PERMIT_READINESS' as const, style: 'PRIMARY' as const }];
      } else {
        await updateOptionDisposition(propertyId, ids.explorationId, ids.optionId, { status: actionId === RENOVATION_EXPLORE_ACTION_IDS.SAVE ? 'SAVED' : 'REJECTED' });
        artifactId = option.id;
        title = actionId === RENOVATION_EXPLORE_ACTION_IDS.SAVE ? 'Idea saved' : 'Idea set aside'; description = 'Your list of upgrade ideas is updated.';
      }
    } else {
      throw stale('The change to make is invalid.');
    }
  } catch (error) {
    // The service's own refusals are written for a person; coded errors pass through.
    if (error instanceof Error && !String((error as { code?: unknown }).code ?? '').startsWith('ASK_')) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'RENOVATION_EXPLORE_UPDATED',
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `renovation-explore-${actionId}-${artifactId}`, title, status: 'COMPLETED', description, details, actions }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: `renovation-explore-refresh-failed-${artifactId}`, severity: 'CAUTION', title: 'Saved; view could not refresh', body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}

const SOURCE_LABELS: Record<string, string> = { AI_ESTIMATE: 'AI estimate', BASELINE_HEURISTIC: 'Baseline estimate' };
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** The saved (then new) ideas side by side, from what is stored (a read; nothing is generated). Desktop's comparison shows title, cost range, timeline and why it fits; Ask adds who to talk to and permits. */
export async function renovationIdeasCompareResult(propertyId: string): Promise<AskOperationResult> {
  const back = { ...ideasAction, style: 'SECONDARY' as const };
  let exploration: any = null;
  try {
    exploration = await database.renovationExploration.findFirst({
      where: { propertyId, archivedAt: null }, orderBy: { createdAt: 'desc' },
      select: { id: true, options: { orderBy: { position: 'asc' }, select: { id: true, position: true, title: true, description: true, status: true, costMinCents: true, costMaxCents: true, timeline: true, whyThisFits: true, professionalToConsult: true, permitGuidance: true, evidenceSource: true, confidence: true } } },
    });
  } catch { exploration = null; }
  const { picked, savedCount, activeCount } = pickIdeasToCompare((exploration?.options ?? []) as Array<{ status: string; position: number } & Record<string, any>>);
  if (picked.length < 2) {
    return {
      status: 'NOT_APPLICABLE', reasonCode: 'RENOVATION_IDEAS_COMPARE_NOT_ENOUGH',
      blocks: [{ type: 'SUMMARY', id: 'renovation-ideas-compare-empty', title: 'Two ideas are needed to compare', body: activeCount ? 'Only one idea is on your list. Explore more ideas, then ask to compare them.' : 'There are no upgrade ideas to compare yet. Explore some first; then save the ones you want side by side.', tone: 'DEFAULT', actions: [back] }],
      suggestions: [],
    };
  }
  const options = picked.map((option) => {
    const lowConfidence = String(option.confidence ?? '').toUpperCase() === 'LOW';
    return {
      id: option.id, label: option.title, summary: clip(String(option.description ?? ''), 200), badge: null, actions: [],
      attributes: [
        { label: 'Status', value: RENOVATION_OPTION_STATUS_LABELS[option.status] ?? option.status, tone: 'DEFAULT' as const },
        { label: 'Estimated cost', value: range(option.costMinCents, option.costMaxCents) ?? 'Not estimated', tone: 'DEFAULT' as const },
        { label: 'Timeline', value: option.timeline || 'Not estimated', tone: 'DEFAULT' as const },
        { label: 'Talk to', value: option.professionalToConsult || 'Not stated', tone: 'DEFAULT' as const },
        { label: 'Permits', value: option.permitGuidance || 'Not stated', tone: 'DEFAULT' as const },
        { label: 'Why it fits', value: clip(String(option.whyThisFits ?? ''), 220) || 'Not stated', tone: 'DEFAULT' as const },
        { label: 'Source', value: `${SOURCE_LABELS[String(option.evidenceSource)] ?? 'Estimate'}${option.confidence ? `, ${String(option.confidence).toLowerCase()} confidence` : ''}`, tone: lowConfidence ? 'CAUTION' as const : 'DEFAULT' as const },
      ],
    };
  });
  const more = activeCount - picked.length;
  return {
    status: 'ANSWERED',
    blocks: [
      { type: 'SUMMARY', id: 'renovation-ideas-compare-summary', title: `Comparing ${picked.length} upgrade ideas`,
        body: `${savedCount >= 2 ? 'These are the ideas you saved.' : 'Saved ideas come first, then new ones.'}${more > 0 ? ` ${more} more ${more === 1 ? 'idea is' : 'ideas are'} not shown: save the ones you want side by side.` : ''} Costs and timelines are estimates and starting points, not advice or quotes.`,
        tone: 'DEFAULT', actions: [back] },
      { type: 'COMPARISON', id: 'renovation-ideas-compare', title: 'Side by side', description: 'No idea is ranked: which fits depends on your goals, budget and timing.', options, actions: [] },
    ],
    suggestions: [],
  };
}

const OPTION_ACTION_LABELS = { SAVE: 'Save this idea', SET_ASIDE: 'Set aside', CREATE_PLAN: 'Create a plan' } as const;
const range = (min: number | null, max: number | null) => (min === null || max === null ? null : min === max ? money(min / 100) : `${money(min / 100)} to ${money(max / 100)}`);

/** The latest exploration's ideas beside the renovation readiness answer, read from what is stored (a read never writes). A contributor or owner can explore, save, set aside and plan. */
export async function renovationExploreBlocks(propertyId: string, canChange: boolean): Promise<Array<Record<string, any>>> {
  // The ideas are an addition to the readiness answer; if they cannot be read, the answer is still given without them.
  let exploration: any = null;
  try {
    exploration = await database.renovationExploration.findFirst({
      where: { propertyId, archivedAt: null }, orderBy: { createdAt: 'desc' },
      select: { id: true, goals: true, missingFacts: true, options: { orderBy: { position: 'asc' }, select: { id: true, title: true, description: true, status: true, costMinCents: true, costMaxCents: true, timeline: true, professionalToConsult: true, permitGuidance: true, benefits: true, renovationCaseId: true } } },
    });
  } catch { return []; }
  const exploreAction = canChange ? [{
    id: RENOVATION_EXPLORE_ACTION_IDS.START, label: exploration ? 'Explore new ideas' : 'Explore upgrade ideas', interactionType: 'START_WORKFLOW' as const, message: RENOVATION_EXPLORE_MESSAGES[RENOVATION_EXPLORE_ACTION_IDS.START],
    operationId: 'RENOVATION_CASE_START' as const, actionId: RENOVATION_EXPLORE_ACTION_IDS.START, style: 'SECONDARY' as const,
  }] : [];
  const options: any[] = exploration?.options ?? [];
  if (!options.length && !exploreAction.length) return [];
  // A read, offered to anyone who can see the ideas, once there are two to compare.
  const compareAction = pickIdeasToCompare(options).picked.length >= 2 ? [{
    id: RENOVATION_IDEAS_COMPARE_ACTION_ID, label: 'Compare ideas side by side', interactionType: 'START_WORKFLOW' as const, message: RENOVATION_IDEAS_COMPARE_MESSAGE,
    operationId: 'RENOVATION_PERMIT_READINESS' as const, style: 'SECONDARY' as const,
  }] : [];
  const missing = options.length && Array.isArray(exploration?.missingFacts)
    ? [...new Set((exploration.missingFacts as Array<{ factKey?: unknown }>).map((fact) => (typeof fact.factKey === 'string' ? factLabel(fact.factKey) : '')).filter(Boolean))].slice(0, 6)
    : [];
  const missingBlock = missing.length ? [{
    type: 'SUMMARY', id: 'renovation-ideas-missing-facts', title: 'Better ideas with a few more details', tone: 'DEFAULT',
    body: `These ideas were limited because Cozy does not have: ${missing.join('; ')}. Tell Ask these about your home and explore again for ideas that fit better.`,
  }] : [];
  return [{
    type: 'GROUPED_LIST', filters: [], id: 'renovation-ideas', title: 'Upgrade ideas',
    description: options.length
      ? `Ideas for: ${(exploration.goals as string[]).join('; ')}. They are starting points, not advice or quotes. Nothing is a plan until you create one.`
      : 'Not sure where to start? Choose what you want your home to do better and Cozy suggests ideas that fit it.',
    sections: options.length ? [{
      id: 'renovation-ideas-all', title: 'Ideas', count: options.length,
      items: options.map((option) => ({
        id: option.id, title: option.title, description: option.description, status: RENOVATION_OPTION_STATUS_LABELS[option.status] ?? option.status, href: null,
        meta: [range(option.costMinCents, option.costMaxCents), option.timeline ? `Timeline: ${option.timeline}` : null, option.professionalToConsult ? `Talk to: ${option.professionalToConsult}` : null, option.permitGuidance ? `Permits: ${option.permitGuidance}` : null,
          ...(Array.isArray(option.benefits) ? option.benefits.slice(0, 3).map((benefit: string) => `Benefit: ${benefit}`) : [])].filter(Boolean),
        entityType: RENOVATION_OPTION_ENTITY_TYPE,
        actions: !canChange || option.status === 'SELECTED' ? [] : [
          ...(option.status !== 'SAVED' ? [RENOVATION_EXPLORE_ACTION_IDS.SAVE] : []),
          ...(option.status !== 'REJECTED' ? [RENOVATION_EXPLORE_ACTION_IDS.SET_ASIDE] : []),
          ...(option.status !== 'REJECTED' ? [RENOVATION_EXPLORE_ACTION_IDS.CREATE_PLAN] : []),
        ].map((actionId) => ({
          id: actionId, label: OPTION_ACTION_LABELS[actionId === RENOVATION_EXPLORE_ACTION_IDS.SAVE ? 'SAVE' : actionId === RENOVATION_EXPLORE_ACTION_IDS.SET_ASIDE ? 'SET_ASIDE' : 'CREATE_PLAN'],
          interactionType: 'MUTATE_RECORD' as const, message: RENOVATION_EXPLORE_MESSAGES[actionId], operationId: 'RENOVATION_CASE_START' as const, actionId,
          entityType: RENOVATION_OPTION_ENTITY_TYPE, entityId: optionEntityId(exploration.id, option.id), style: actionId === RENOVATION_EXPLORE_ACTION_IDS.CREATE_PLAN ? 'PRIMARY' as const : 'SECONDARY' as const,
        })),
      })),
    }] : [],
    actions: [...compareAction, ...exploreAction],
  }, ...missingBlock];
}
