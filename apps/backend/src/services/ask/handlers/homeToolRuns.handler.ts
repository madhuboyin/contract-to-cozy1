// Three tool starts inside Ask (FRD v1.254), built from the empty-state sweep (docs/architecture/ASK_EMPTY_STATE_ADD_PATH_AUDIT.md) in place of the
// desktop pages that were the only way to start them (owner decision 2026-10-10):
//   - HOME_HABITS_GENERATE        Home Habit Coach: suggest habits from what is recorded about the home;
//   - DO_NOTHING_SIMULATION_RUN   Do-Nothing Simulator: run the simulation for a horizon, optionally on a saved scenario;
//   - SERVICE_PRICE_CHECK_RUN     Service Price Radar: compare one contractor quote with typical local prices.
// Each is reached only by its declared action (no message pattern, no fuzzy retrieval) and writes only after the homeowner confirms, through the service the
// desktop page calls, repeating the checks and effects its controller adds. The last two are limited to the home's primary account holder, exactly as the
// services are, and the service re-checks that at execution.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { DoNothingRunInputSchema, SERVICE_PRICE_CATEGORY_CHOICES, ServicePriceCheckInputSchema } from '../support/commandInputs';
import {
  DO_NOTHING_HORIZONS, DO_NOTHING_RUN_CAPTURE_KEY, DO_NOTHING_RUN_MESSAGE, HOME_HABITS_GENERATE_MESSAGE, NO_SAVED_SCENARIO_VALUE,
  SERVICE_PRICE_CHECK_CAPTURE_KEY, SERVICE_PRICE_CHECK_MESSAGE, SERVICE_PRICE_MAX_QUOTE,
} from '../support/homeToolRunConstants';
import { receiptFollowUpAction } from '../support/receiptFollowUps';
import { enumLabel, readableCode } from '../askFormatting';
import { HomeHabitCoachService } from '../../homeHabitCoach/homeHabitCoachService';
import { DoNothingSimulatorService } from '../../doNothingSimulator.service';
import { reportDoNothingRun, reportServicePriceCheck } from '../../guidanceEngine/guidanceToolReporting';
import { resolveGuidanceStepBinding } from '../support/guidanceStepBinding';
import { ServicePriceRadarService } from '../../servicePriceRadar.service';
import { assertProjectComplianceApplicable } from '../../projectCompliance/context';
import { analyticsEmitter, AnalyticsEvent, AnalyticsFeature, AnalyticsModule } from '../../analytics';

const CONFIRMATION_MINUTES = 30;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const habitCoach = new HomeHabitCoachService();
const doNothing = new DoNothingSimulatorService();
const priceRadar = new ServicePriceRadarService();

const blocked = (id: string, reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'BLOCKED', reasonCode, blocks: [{ type: 'SUMMARY', id, title, body, tone: 'CAUTION', actions: [] }], suggestions: [],
});
const notRoutable = (id: string, title: string, body: string, reasonCode: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id, title, body, tone: 'DEFAULT', actions: [] }], suggestions: [],
});
const refreshFailed = (id: string, what: string) => ({
  type: 'LIMITATION' as const, id, severity: 'CAUTION' as const, title: 'Saved; view could not refresh',
  body: `${what} was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.`,
});
const usd = (value: number) => `$${Math.round(value).toLocaleString('en-US')}`;
const usdFromCents = (cents: number | null | undefined) => (cents == null ? null : usd(cents / 100));

/** The home's primary account holder: the same test both services make (`homeownerProfile: { userId }`), narrower than the owner role. */
async function isPrimaryAccountHolder(userId: string, propertyId: string): Promise<boolean> {
  return Boolean(await prisma.property.findFirst({ where: { id: propertyId, homeownerProfile: { userId } }, select: { id: true } }));
}
const primaryHolderOnly = (id: string, reasonCode: string, what: string) => blocked(id, reasonCode, `Only the home's primary account holder can ${what}`, 'This tool is kept for the home\'s primary account holder. Nothing has changed.');

// ── Home Habit Coach: suggest habits ─────────────────────────────────────────────────────────────────────────────

/** The version a suggestion run is bound to: the coach's on/off setting and the templates that already have an active or snoozed habit. */
export async function habitsGenerateContextVersion(propertyId: string): Promise<string> {
  const [prefs, alive] = await Promise.all([
    prisma.propertyHabitPreference.findUnique({ where: { propertyId }, select: { isEnabled: true } }),
    prisma.propertyHabit.findMany({ where: { propertyId, status: { in: ['ACTIVE', 'SNOOZED'] } }, select: { habitTemplateId: true }, orderBy: { habitTemplateId: 'asc' } }),
  ]);
  return sha(`habits-generate:${propertyId}:${prefs ? String(prefs.isEnabled) : 'default'}:${alive.map((habit) => habit.habitTemplateId).join(',')}`);
}

export async function homeHabitsGenerateResult(userId: string, propertyId: string, sourceExecutionId: string | null): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return blocked('habits-generate-permission', 'ASK_PERMISSION_REQUIRED', 'A contributor or owner can suggest habits', 'Your role can view this home but not change it. Nothing has changed.');
  const prefs = await prisma.propertyHabitPreference.findUnique({ where: { propertyId }, select: { isEnabled: true } });
  if (prefs && !prefs.isEnabled) {
    return {
      status: 'NOT_APPLICABLE', reasonCode: 'HOME_HABITS_COACH_OFF',
      blocks: [{ type: 'SUMMARY', id: 'habits-generate-off', title: 'The Home Habit Coach is switched off for this home', body: 'No habits are suggested while it is off, so there is nothing to run. Nothing has changed.', tone: 'CAUTION', actions: [] }],
      suggestions: [],
    };
  }
  const contextVersion = await habitsGenerateContextVersion(propertyId);
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_HABITS_GENERATE_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { homeHabitsGenerateContextVersion: contextVersion, sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'habits-generate-review', title: 'Review before suggesting habits', body: 'Nothing is suggested until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `habits-generate-${sha(propertyId).slice(0, 12)}-1`, version: 1,
      title: 'Suggest home habits for this home?',
      description: 'This reads what is recorded about the home (its systems, age, climate and season) and adds small routine suggestions you can adopt, snooze or skip. A habit already suggested is not repeated, and nothing is added to your maintenance routine until you adopt it.',
      fields: [{ label: 'Adds', value: 'Habit suggestions only' }],
      editableFields: [], confirmLabel: 'Suggest habits', consentText: 'I authorize adding habit suggestions to this home.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

registerCapabilityHandler('home-habits.generate', async (envelope) => {
  const declared = envelope.launchContext?.operationId === 'HOME_HABITS_GENERATE' && envelope.launchContext.surface !== 'ASK_REFRESH' && envelope.message === HOME_HABITS_GENERATE_MESSAGE;
  if (declared) return homeHabitsGenerateResult(envelope.userId, envelope.propertyId!, envelope.launchContext?.sourceExecutionId ?? null);
  return notRoutable('habits-generate-not-routable', 'Use the Suggest habits button', 'Habits are suggested from the Suggest habits button on the home habits answer. Nothing has changed.', 'ASK_HOME_HABITS_GENERATE_NOT_DIRECTLY_ROUTABLE');
});

async function confirmHomeHabitsGenerate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const propertyId = execution.propertyId;
  if (parameters.homeHabitsGenerateContextVersion !== await habitsGenerateContextVersion(propertyId)) {
    throw Object.assign(new Error('The home\'s habits or the coach\'s setting changed while this was open. Ask again to review the current state.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  }
  const generated = await habitCoach.generateHabits(propertyId, userId);
  analyticsEmitter.track({
    eventType: AnalyticsEvent.ACTION_COMPLETED, userId, propertyId, moduleKey: AnalyticsModule.MAINTENANCE, featureKey: AnalyticsFeature.HOME_HABIT_COACH,
    metadataJson: { actionType: 'generate_habits', via: 'ask' },
  });
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: generated.created > 0 ? 'HOME_HABITS_GENERATED' : 'HOME_HABITS_NOTHING_NEW',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `habits-generated-${propertyId}`, title: generated.created > 0 ? `${generated.created} habit${generated.created === 1 ? '' : 's'} suggested` : 'No new habits to suggest', status: 'COMPLETED',
      description: generated.created > 0
        ? 'They are listed with why each was suggested. Nothing is in your maintenance routine until you adopt it.'
        : 'Every habit that fits this home is already suggested, snoozed or in your routine, or none fits what is recorded. This does not mean nothing needs care.',
      details: [{ label: 'New suggestions', value: String(generated.created) }, { label: 'Already suggested', value: String(generated.skipped) }],
      actions: [receiptFollowUpAction('HOME_HABITS')],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) result.blocks.push(refreshFailed(`habits-generate-refresh-failed-${propertyId}`, 'The suggestions'));
  return { result, artifactType: 'HOME_HABIT', artifactId: propertyId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('home-habits.generate', confirmHomeHabitsGenerate);

// ── Do-Nothing Simulator: run ────────────────────────────────────────────────────────────────────────────────────

type SavedScenario = { id: string; name: string; horizonMonths: number };
type DoNothingInput = ReturnType<typeof DoNothingRunInputSchema.parse>;
type RunSummary = { horizonMonths: number; confidence: string; riskScoreDelta: number | null; expectedCostDeltaCentsMin: number | null; expectedCostDeltaCentsMax: number | null };

async function savedScenarios(userId: string, propertyId: string): Promise<SavedScenario[]> {
  const { scenarios } = await doNothing.listScenarios(propertyId, userId);
  return (scenarios as unknown as SavedScenario[]).map((scenario) => ({ id: scenario.id, name: scenario.name, horizonMonths: scenario.horizonMonths }));
}
const doNothingVersion = (propertyId: string, scenarios: SavedScenario[]) => sha(`do-nothing-run:${propertyId}:${scenarios.map((scenario) => scenario.id).join(',')}`);
const scenarioName = (scenarios: SavedScenario[], id: string | null) => (id ? scenarios.find((scenario) => scenario.id === id)?.name ?? 'A saved scenario' : 'Current records, no saved scenario');

function doNothingCaptureRequest(contextVersion: string, scenarios: SavedScenario[], entered?: Partial<DoNothingInput>): AskCaptureRequest {
  return {
    requirementId: 'do-nothing-run-inputs', captureKey: DO_NOTHING_RUN_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: 'Run the do-nothing simulation', question: 'How far ahead should the simulation look?',
    helpText: 'It estimates what putting off home upkeep could cost, from what is recorded about the home. You will review it before it runs.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'horizonMonths', label: 'How far ahead', required: true, inputSchema: { type: 'SINGLE_SELECT', options: DO_NOTHING_HORIZONS.map((months) => ({ label: `${months} months`, value: String(months) })) } },
      { key: 'scenarioId', label: 'Saved scenario', helpText: 'Optional: run one of your saved scenarios instead of the current records alone.', required: false,
        inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'None, use the current records', value: NO_SAVED_SCENARIO_VALUE }, ...scenarios.map((scenario) => ({ label: `${scenario.name} (${scenario.horizonMonths} months)`, value: scenario.id }))] } },
    ] },
    currentAnswer: { horizonMonths: entered?.horizonMonths ? String(entered.horizonMonths) : '12', scenarioId: entered?.scenarioId ?? NO_SAVED_SCENARIO_VALUE },
    allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this run; nothing runs until you confirm', confirmationText: null,
    expectedContextVersion: contextVersion,
  };
}

export async function doNothingRunContextVersion(userId: string, propertyId: string): Promise<string> {
  return doNothingVersion(propertyId, await savedScenarios(userId, propertyId));
}

export async function doNothingRunResult(userId: string, propertyId: string, supplied: DoNothingInput | undefined, sourceExecutionId: string | null, guidanceStepId: string | null = null): Promise<AskOperationResult> {
  // A run started from a guided journey's current step carries that step through the capture and the confirmation; nothing here trusts it
  // beyond naming the step, and the confirmation re-checks the step belongs to this home and is still open before it reports anything.
  const launch = { sourceExecutionId, ...(guidanceStepId ? { guidanceStepId } : {}) };
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return blocked('do-nothing-run-permission', 'ASK_PERMISSION_REQUIRED', 'A contributor or owner can run the simulation', 'Your role can view this home but not change it. Nothing has changed.');
  if (!(await isPrimaryAccountHolder(userId, propertyId))) return primaryHolderOnly('do-nothing-run-primary-only', 'DO_NOTHING_PRIMARY_OWNER_ONLY', 'run the simulation');
  let scenarios: SavedScenario[];
  try {
    scenarios = await savedScenarios(userId, propertyId);
  } catch (error) {
    if ((error as { code?: string })?.code === 'COVERAGE_CONFLICT_REVIEW_REQUIRED') {
      return blocked('do-nothing-run-coverage-conflict', 'DO_NOTHING_COVERAGE_CONFLICT', 'Resolve conflicting coverage records first', 'Some insurance records for this home disagree with each other, and the simulation depends on them. Nothing has been run.');
    }
    throw error;
  }
  const contextVersion = doNothingVersion(propertyId, scenarios);
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'DO_NOTHING_RUN_INPUT_REQUIRED', contextVersion, parameters: launch,
      blocks: [{ type: 'SUMMARY', id: 'do-nothing-run-input', title: 'Run the do-nothing simulation', body: 'Nothing has run yet. Choose how far ahead to look, then review it before it runs.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [doNothingCaptureRequest(contextVersion, scenarios)], suggestions: [],
    };
  }
  if (supplied.scenarioId && !scenarios.some((scenario) => scenario.id === supplied.scenarioId)) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'DO_NOTHING_RUN_SCENARIO_UNAVAILABLE', contextVersion, parameters: launch,
      blocks: [{ type: 'SUMMARY', id: 'do-nothing-run-scenario-missing', title: 'That saved scenario is no longer available', body: 'Choose another scenario or none. Nothing has run.', tone: 'CAUTION', actions: [] }],
      captureRequests: [doNothingCaptureRequest(contextVersion, scenarios, { ...supplied, scenarioId: null })], suggestions: [],
    };
  }
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'DO_NOTHING_RUN_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { doNothingRun: supplied, doNothingRunContextVersion: contextVersion, ...launch, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'do-nothing-run-review', title: 'Review this simulation', body: 'You chose these settings. Nothing runs until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `do-nothing-run-${sha(`${propertyId}:${supplied.horizonMonths}:${supplied.scenarioId ?? 'none'}`).slice(0, 12)}-1`, version: 1,
      title: `Run the do-nothing simulation for ${supplied.horizonMonths} months?`,
      description: 'This runs the simulator on what is recorded about the home and stores the result as the latest run. It changes nothing else, and it is an estimate, not a prediction.',
      fields: [{ label: 'Looks ahead', value: `${supplied.horizonMonths} months` }, { label: 'Based on', value: scenarioName(scenarios, supplied.scenarioId) }],
      editableFields: [], confirmLabel: 'Run simulation', consentText: 'I authorize running this simulation and storing its result for this home.', expiresAt: expiresAt.toISOString(),
    },
    captureRequests: [doNothingCaptureRequest(contextVersion, scenarios, supplied)],
    suggestions: [],
  };
}

registerCapabilityHandler('do-nothing-simulator.run', async (envelope) => {
  const declared = envelope.launchContext?.operationId === 'DO_NOTHING_SIMULATION_RUN' && envelope.launchContext.surface !== 'ASK_REFRESH' && envelope.message === DO_NOTHING_RUN_MESSAGE;
  if (declared) return doNothingRunResult(envelope.userId, envelope.propertyId!, undefined, envelope.launchContext?.sourceExecutionId ?? null, envelope.launchContext?.entityType === 'GUIDANCE_STEP' ? envelope.launchContext.entityId ?? null : null);
  return notRoutable('do-nothing-run-not-routable', 'Use the Run simulation button', 'The simulation is run from the Run simulation button on the do-nothing answer. Nothing has changed.', 'ASK_DO_NOTHING_RUN_NOT_DIRECTLY_ROUTABLE');
});

// Reports a finished run to the journey step it was launched from, exactly as the Desktop page does. The write is already saved, so a step that cannot
// be reported never fails it: the receipt says which of the two happened. Returns the receipt line, or null when the step is not this tool's open step.
async function reportToJourneyStep(
  userId: string, propertyId: string, stepId: string, toolKey: string, stepKeys: readonly string[],
  report: (target: { journeyId: string; stepKey: string; signalIntentFamily: string | null }) => Promise<boolean>,
): Promise<string | null> {
  const bound = await resolveGuidanceStepBinding(propertyId, stepId, { toolKey, stepKeys });
  if (!bound.ok) return bound.reason === 'STEP_DONE' ? 'This step was already done' : null;
  const recorded = await report({ journeyId: bound.binding.journeyId, stepKey: bound.binding.stepKey, signalIntentFamily: bound.binding.signalIntentFamily });
  return recorded ? 'This step is recorded as done' : 'This is saved, but the journey step could not be updated. Open the journey to check it';
}
const reportRunToJourneyStep = (userId: string, propertyId: string, stepId: string, runId: string, run: RunSummary | null) =>
  reportToJourneyStep(userId, propertyId, stepId, 'do-nothing-simulator', ['compare_action_options', 'model_cost_of_delay'], (target) => reportDoNothingRun(propertyId, { id: runId, ...run }, target, userId));
const reportCheckToJourneyStep = (userId: string, propertyId: string, stepId: string, checkId: string, check: CheckSummary | null, input: { serviceCategory: string; quoteAmount: number }) =>
  reportToJourneyStep(userId, propertyId, stepId, 'service-price-radar', ['validate_price', 'get_cleaning_quotes'], (target) => reportServicePriceCheck(propertyId, { id: checkId, serviceCategory: input.serviceCategory, quoteAmount: input.quoteAmount, quoteCurrency: 'USD', verdict: check?.verdict ?? null, expectedLow: check?.expectedLow ?? null, expectedHigh: check?.expectedHigh ?? null }, target, userId));

async function confirmDoNothingRun(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const candidate = DoNothingRunInputSchema.safeParse(parameters.doNothingRun);
  if (!candidate.success) throw Object.assign(new Error('The simulation settings are invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const input = candidate.data;
  const propertyId = execution.propertyId;
  let runId: string;
  let run = null as RunSummary | null;
  let alreadyRun = false;
  // The simulator has no idempotency key: a run of this horizon created since this execution began is this execution's own earlier write (a lease-reclaim retry).
  const earlier = await prisma.doNothingSimulationRun.findFirst({ where: { propertyId, horizonMonths: input.horizonMonths, createdAt: { gte: execution.createdAt } }, select: { id: true, horizonMonths: true, confidence: true, riskScoreDelta: true, expectedCostDeltaCentsMin: true, expectedCostDeltaCentsMax: true } });
  if (earlier) {
    runId = earlier.id; run = earlier as unknown as RunSummary; alreadyRun = true;
  } else {
    try {
      // The service re-checks that the person is the home's primary account holder and that coverage records agree.
      if (parameters.doNothingRunContextVersion !== await doNothingRunContextVersion(userId, propertyId)) {
        throw Object.assign(new Error('Your saved scenarios changed while this was open. Ask again to review the current ones.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
      }
      const output = await doNothing.run(propertyId, userId, { horizonMonths: input.horizonMonths, ...(input.scenarioId ? { scenarioId: input.scenarioId } : {}) } as never);
      runId = output.run.id; run = output.run as unknown as RunSummary;
    } catch (error) {
      if ((error as { code?: string })?.code === 'COVERAGE_CONFLICT_REVIEW_REQUIRED') {
        throw Object.assign(new Error('Some insurance records for this home disagree with each other, and the simulation depends on them. Resolve the conflict first; nothing was run.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
      }
      if (error instanceof Error && error.message === 'Property not found or access denied.') {
        throw Object.assign(new Error('Only the home\'s primary account holder can run the simulation. Nothing was run.'), { code: 'ASK_PERMISSION_REQUIRED' });
      }
      throw error;
    }
    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED, userId, propertyId, moduleKey: AnalyticsModule.FINANCIAL, featureKey: AnalyticsFeature.DO_NOTHING_SIMULATOR,
      metadataJson: { actionType: 'run_simulation', horizonMonths: input.horizonMonths, riskScoreDelta: run?.riskScoreDelta ?? null, via: 'ask' },
    });
  }
  const journeyOutcome = typeof parameters.guidanceStepId === 'string' ? await reportRunToJourneyStep(userId, propertyId, parameters.guidanceStepId, runId, run) : null;
  const min = usdFromCents(run?.expectedCostDeltaCentsMin);
  const max = usdFromCents(run?.expectedCostDeltaCentsMax);
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'DO_NOTHING_RUN_COMPLETED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `do-nothing-run-${runId}`, title: alreadyRun ? 'Simulation already run' : 'Simulation run', status: 'COMPLETED',
      description: 'The result is stored as the latest run. It is an estimate from what is recorded, not a prediction.',
      details: [
        { label: 'Looked ahead', value: `${run?.horizonMonths ?? input.horizonMonths} months` },
        { label: 'Added cost if nothing is done', value: min && max ? (min === max ? min : `${min} to ${max}`) : 'Not enough recorded history to estimate' },
        ...(run?.confidence ? [{ label: 'Confidence', value: readableCode(run.confidence).replace(/^\w/, (letter) => letter.toUpperCase()) }] : []),
        ...(journeyOutcome ? [{ label: 'Guided journey', value: journeyOutcome }] : []),
      ],
      actions: [receiptFollowUpAction('DO_NOTHING')],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) result.blocks.push(refreshFailed(`do-nothing-run-refresh-failed-${runId}`, 'The simulation'));
  return { result, artifactType: 'DO_NOTHING_SIMULATION_RUN', artifactId: runId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('do-nothing-simulator.run', confirmDoNothingRun);

// ── Service Price Radar: check a quote ───────────────────────────────────────────────────────────────────────────

type PriceCheckInput = ReturnType<typeof ServicePriceCheckInputSchema.parse>;
type CheckSummary = { id: string; verdict: string | null; expectedLow: number | null; expectedHigh: number | null; explanationShort: string | null };
const VERDICT_LABELS: Record<string, string> = { FAIR: 'Within the expected range', HIGH: 'Above the expected range', VERY_HIGH: 'Well above the expected range', UNDERPRICED: 'Below the expected range' };
const SERVICE_CATEGORY_LABELS: Record<string, string> = {
  HVAC: 'HVAC',
  WINDOWS_DOORS: 'Windows & doors',
  LANDSCAPING_DRAINAGE: 'Landscaping & drainage',
  SECURITY_SAFETY: 'Security & safety',
};
const categoryLabel = (value: string) => SERVICE_CATEGORY_LABELS[value] ?? enumLabel(value);
export const priceCheckVersion = (propertyId: string) => sha(`service-price-check:${propertyId}`);

function priceCheckCaptureRequest(contextVersion: string, entered?: Partial<PriceCheckInput>): AskCaptureRequest {
  return {
    requirementId: 'service-price-check-inputs', captureKey: SERVICE_PRICE_CHECK_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: 'Check a contractor quote', question: 'Which service is the quote for, and what is the amount?',
    helpText: 'The check compares the amount with typical local prices for the service. You will review it before it is checked.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'serviceCategory', label: 'Service', required: true, inputSchema: { type: 'SINGLE_SELECT', options: SERVICE_PRICE_CATEGORY_CHOICES.map((value) => ({ label: categoryLabel(value), value })) } },
      { key: 'quoteAmount', label: 'Quote amount', helpText: `In dollars, up to ${usd(SERVICE_PRICE_MAX_QUOTE)}.`, required: true, inputSchema: { type: 'DECIMAL', min: 1, max: SERVICE_PRICE_MAX_QUOTE, unit: 'USD' } },
      { key: 'quoteVendorName', label: 'Contractor', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 120 } },
      { key: 'serviceLabelRaw', label: 'What the quote covers', helpText: 'Optional: for example, replace the water heater.', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 200 } },
    ] },
    currentAnswer: Object.fromEntries(Object.entries({ serviceCategory: entered?.serviceCategory, quoteAmount: entered?.quoteAmount, quoteVendorName: entered?.quoteVendorName, serviceLabelRaw: entered?.serviceLabelRaw }).filter(([, value]) => value !== undefined && value !== null)),
    allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this check; nothing is checked until you confirm', confirmationText: null,
    expectedContextVersion: contextVersion,
  };
}

export async function servicePriceCheckResult(userId: string, propertyId: string, supplied: PriceCheckInput | undefined, sourceExecutionId: string | null, guidanceStepId: string | null = null): Promise<AskOperationResult> {
  // A check started from a guided journey's step carries that step through the form and the review; the confirmation re-checks it before reporting.
  const launch = { sourceExecutionId, ...(guidanceStepId ? { guidanceStepId } : {}) };
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return blocked('price-check-permission', 'ASK_PERMISSION_REQUIRED', 'A contributor or owner can check a quote', 'Your role can view this home but not change it. Nothing has changed.');
  if (!(await isPrimaryAccountHolder(userId, propertyId))) return primaryHolderOnly('price-check-primary-only', 'SERVICE_PRICE_RADAR_PRIMARY_OWNER_ONLY', 'check a quote');
  const contextVersion = priceCheckVersion(propertyId);
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'SERVICE_PRICE_CHECK_INPUT_REQUIRED', contextVersion, parameters: launch,
      blocks: [{ type: 'SUMMARY', id: 'price-check-input', title: 'Check a contractor quote', body: 'Nothing has been checked yet. Enter the service and the amount, then review it before it is checked.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [priceCheckCaptureRequest(contextVersion)], suggestions: [],
    };
  }
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'SERVICE_PRICE_CHECK_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { servicePriceCheck: supplied, servicePriceCheckContextVersion: contextVersion, ...launch, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'price-check-review', title: 'Review this quote check', body: 'You entered these details. Nothing is checked until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `price-check-${sha(`${propertyId}:${supplied.serviceCategory}:${supplied.quoteAmount}`).slice(0, 12)}-1`, version: 1,
      title: `Check a ${usd(supplied.quoteAmount)} ${categoryLabel(supplied.serviceCategory)} quote?`,
      description: 'This compares the amount with typical local prices for the service and stores the check, the same record Service Price Radar keeps. It is a price check, not a review of the contractor or the scope.',
      fields: [
        { label: 'Service', value: categoryLabel(supplied.serviceCategory) }, { label: 'Quote', value: usd(supplied.quoteAmount) },
        ...(supplied.quoteVendorName ? [{ label: 'Contractor', value: supplied.quoteVendorName }] : []), ...(supplied.serviceLabelRaw ? [{ label: 'Covers', value: supplied.serviceLabelRaw }] : []),
      ],
      editableFields: [], confirmLabel: 'Check quote', consentText: 'I authorize checking this quote and storing the result for this home.', expiresAt: expiresAt.toISOString(),
    },
    captureRequests: [priceCheckCaptureRequest(contextVersion, supplied)],
    suggestions: [],
  };
}

registerCapabilityHandler('service-price-radar.check', async (envelope) => {
  const declared = envelope.launchContext?.operationId === 'SERVICE_PRICE_CHECK_RUN' && envelope.launchContext.surface !== 'ASK_REFRESH' && envelope.message === SERVICE_PRICE_CHECK_MESSAGE;
  if (declared) return servicePriceCheckResult(envelope.userId, envelope.propertyId!, undefined, envelope.launchContext?.sourceExecutionId ?? null, envelope.launchContext?.entityType === 'GUIDANCE_STEP' ? envelope.launchContext.entityId ?? null : null);
  return notRoutable('price-check-not-routable', 'Use the Check a quote button', 'A quote is checked from the Check a quote button on the quote checks answer. Nothing has changed.', 'ASK_SERVICE_PRICE_CHECK_NOT_DIRECTLY_ROUTABLE');
});

async function confirmServicePriceCheck(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const candidate = ServicePriceCheckInputSchema.safeParse(parameters.servicePriceCheck);
  if (!candidate.success) throw Object.assign(new Error('The quote details are invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const input = candidate.data;
  const propertyId = execution.propertyId;
  // createCheck has no idempotency key: a check of the same service and amount created since this execution began is this execution's own earlier write.
  const earlier = await prisma.serviceRadarCheck.findFirst({ where: { propertyId, serviceCategory: input.serviceCategory as never, quoteAmount: input.quoteAmount, createdAt: { gte: execution.createdAt } }, select: { id: true } });
  let check = null as CheckSummary | null;
  if (!earlier) {
    try {
      // The same applicability check the traditional POST controller makes; its context version is stored with the check.
      const context = await assertProjectComplianceApplicable(propertyId, userId, 'SERVICE_PRICE_RADAR', { serviceCategory: input.serviceCategory } as never, 'localPriceBenchmarking');
      const created = await priceRadar.createCheck(propertyId, userId, {
        serviceCategory: input.serviceCategory, quoteAmount: input.quoteAmount, quoteCurrency: 'USD', quoteSource: 'MANUAL', linkedEntities: [],
        ...(input.quoteVendorName ? { quoteVendorName: input.quoteVendorName } : {}), ...(input.serviceLabelRaw ? { serviceLabelRaw: input.serviceLabelRaw } : {}),
      } as never, (context as { contextVersion?: string | null }).contextVersion ?? null);
      check = created.check as unknown as CheckSummary;
    } catch (error) {
      if ((error as { code?: string })?.code === 'PROPERTY_ACCESS_DENIED') {
        throw Object.assign(new Error('Only the home\'s primary account holder can check a quote. Nothing was checked.'), { code: 'ASK_PERMISSION_REQUIRED' });
      }
      throw error;
    }
    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED, userId, propertyId, moduleKey: AnalyticsModule.MARKETPLACE, featureKey: AnalyticsFeature.SERVICE_PRICE_RADAR,
      metadataJson: { actionType: 'check_generated', outcomeCompleted: false, verdict: check?.verdict ?? null, via: 'ask' },
    });
  }
  const checkId = earlier?.id ?? check!.id;
  const journeyOutcome = typeof parameters.guidanceStepId === 'string' ? await reportCheckToJourneyStep(userId, propertyId, parameters.guidanceStepId, checkId, check, input) : null;
  const range = check && check.expectedLow != null && check.expectedHigh != null ? `${usd(check.expectedLow)} to ${usd(check.expectedHigh)}` : null;
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'SERVICE_PRICE_CHECK_COMPLETED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `price-check-${checkId}`, title: earlier ? 'Quote already checked' : 'Quote checked', status: 'COMPLETED',
      description: check?.explanationShort ?? 'The check is stored with your other quote checks. It compares the amount with typical local prices; it does not review the contractor or the scope.',
      details: [
        { label: 'Service', value: categoryLabel(input.serviceCategory) }, { label: 'Quote', value: usd(input.quoteAmount) },
        { label: 'Expected range', value: range ?? 'No local benchmark qualified for this service' },
        ...(check?.verdict ? [{ label: 'Result', value: VERDICT_LABELS[check.verdict] ?? readableCode(check.verdict) }] : []),
        ...(journeyOutcome ? [{ label: 'Guided journey', value: journeyOutcome }] : []),
      ],
      actions: [receiptFollowUpAction('PRICE_CHECKS')],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) result.blocks.push(refreshFailed(`price-check-refresh-failed-${checkId}`, 'The check'));
  return { result, artifactType: 'SERVICE_RADAR_CHECK', artifactId: checkId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('service-price-radar.check', confirmServicePriceCheck);
