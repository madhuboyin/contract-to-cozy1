// Two property settings written inside Ask, replacing the desktop pages that used to be the only way to set them (owner decision 2026-10-10:
// Ask never sends the homeowner to a desktop page):
//   - PROPERTY_PURCHASE_DATE_SET  the purchase date on the financing profile, which a "since I bought the home" maintenance question needs;
//   - HOME_JOURNEY_SET            how the household is using the home right now (PropertyOnboarding.ownershipState), which audience-aware answers need.
// Each is reached only by its declared action (no message pattern, no fuzzy retrieval), asks for one answer in an inline form, shows a review card,
// and writes only after the homeowner confirms, through the same service the desktop page calls.
import { HouseholdRole } from '@prisma/client';
import { createHash } from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { HomeJourneyInputSchema, PurchaseDateInputSchema } from '../support/commandInputs';
import {
  HOME_JOURNEY_CAPTURE_KEY, HOME_JOURNEY_OPTIONS, HOME_JOURNEY_SET_MESSAGE, PURCHASE_DATE_CAPTURE_KEY, PURCHASE_DATE_SET_MESSAGE,
} from '../support/homeSettingsConstants';
import { humanDate } from '../askFormatting';
import { upsertProfile } from '../../financing.service';
import { updateJourneyOwnershipState } from '../../entryContext.service';

const CONFIRMATION_MINUTES = 30;

function permissionBlocked(id: string, title: string): AskOperationResult {
  return {
    status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
    blocks: [{ type: 'SUMMARY', id, title, body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }],
    suggestions: [],
  };
}

function notRoutable(id: string, title: string, body: string, reasonCode: string): AskOperationResult {
  return { status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id, title, body, tone: 'DEFAULT', actions: [] }], suggestions: [] };
}

function refreshFailedLimitation(id: string, what: string): { type: 'LIMITATION'; id: string; severity: 'CAUTION'; title: string; body: string } {
  return {
    type: 'LIMITATION', id, severity: 'CAUTION', title: 'Saved; view could not refresh',
    body: `${what} was saved. The answer you were viewing could not refresh automatically, so ask your question again to see it with this applied.`,
  };
}

// ── Purchase date ────────────────────────────────────────────────────────────────────────────────────────────────

async function recordedPurchaseDay(propertyId: string): Promise<string | null> {
  const profile = await prisma.propertyFinancingProfile.findUnique({ where: { propertyId }, select: { purchaseDate: true } });
  return profile?.purchaseDate ? profile.purchaseDate.toISOString().slice(0, 10) : null;
}

/** The version a purchase-date form is bound to: the property and the date recorded right now, so a form opened before the date changed is out of date. */
export async function purchaseDateContextVersion(propertyId: string): Promise<string> {
  return createHash('sha256').update(`purchase-date-set:${propertyId}:${(await recordedPurchaseDay(propertyId)) ?? 'none'}`).digest('hex');
}

function purchaseDateCaptureRequest(contextVersion: string, entered?: { purchaseDate: string }): AskCaptureRequest {
  return {
    requirementId: 'purchase-date-inputs', captureKey: PURCHASE_DATE_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: 'When did you buy this home?', question: 'What was the date you bought this home?',
    helpText: 'Use the closing date if you are not sure. You will review it before it is saved.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'purchaseDate', label: 'Purchase date', required: true, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: false } },
    ] },
    currentAnswer: { purchaseDate: entered ? { precision: 'EXACT_DATE', value: entered.purchaseDate } : null },
    allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Saved to this home\'s financing profile; nothing is saved until you confirm', confirmationText: null,
    expectedContextVersion: contextVersion,
  };
}

export async function purchaseDateResult(
  userId: string, propertyId: string, suppliedInput: { purchaseDate: string } | undefined, sourceExecutionId: string | null,
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return permissionBlocked('purchase-date-permission', 'A contributor or owner can record the purchase date');
  const contextVersion = await purchaseDateContextVersion(propertyId);
  const current = await recordedPurchaseDay(propertyId);
  if (!suppliedInput) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'PURCHASE_DATE_INPUT_REQUIRED', contextVersion,
      parameters: { sourceExecutionId },
      blocks: [{
        type: 'SUMMARY', id: 'purchase-date-input', title: current ? 'Change the purchase date' : 'Add the purchase date',
        body: current ? `The recorded purchase date is ${humanDate(new Date(`${current}T12:00:00.000Z`))}. Nothing changes until you confirm.` : 'No purchase date is recorded for this home yet. Nothing is saved until you confirm.',
        tone: 'DEFAULT', actions: [],
      }],
      captureRequests: [purchaseDateCaptureRequest(contextVersion, current ? { purchaseDate: current } : undefined)], suggestions: [],
    };
  }
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'PURCHASE_DATE_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { purchaseDateSet: suppliedInput, purchaseDateContextVersion: contextVersion, sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'purchase-date-review', title: 'Review the purchase date', body: 'You entered this date. Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `purchase-date-${createHash('sha256').update(`${propertyId}:${suppliedInput.purchaseDate}`).digest('hex').slice(0, 12)}-1`, version: 1,
      title: `Record ${humanDate(new Date(`${suppliedInput.purchaseDate}T12:00:00.000Z`))} as the purchase date?`,
      description: 'This saves the date on the home\'s financing profile, the same record the financing page edits. Maintenance questions about the time since you bought the home use it.',
      fields: [
        ...(current && current !== suppliedInput.purchaseDate ? [{ label: 'Currently recorded', value: humanDate(new Date(`${current}T12:00:00.000Z`)) ?? current }] : []),
        { label: 'Purchase date', value: humanDate(new Date(`${suppliedInput.purchaseDate}T12:00:00.000Z`)) ?? suppliedInput.purchaseDate },
      ],
      editableFields: [], confirmLabel: 'Save purchase date', consentText: 'I authorize recording this purchase date on the shared home record.', expiresAt: expiresAt.toISOString(),
    },
    // Kept so the entry can be changed and resubmitted before confirming.
    captureRequests: [purchaseDateCaptureRequest(contextVersion, suppliedInput)],
    suggestions: [],
  };
}

registerCapabilityHandler('property-purchase-date.set', async (envelope) => {
  const declared = envelope.launchContext?.operationId === 'PROPERTY_PURCHASE_DATE_SET'
    && envelope.launchContext.surface !== 'ASK_REFRESH'
    && envelope.message === PURCHASE_DATE_SET_MESSAGE;
  if (declared) return purchaseDateResult(envelope.userId, envelope.propertyId!, undefined, envelope.launchContext?.sourceExecutionId ?? null);
  // A refresh of an in-progress form, or a bare message: never start (or reset) a form here.
  return notRoutable('purchase-date-not-routable', 'Use the Add purchase date button',
    'The purchase date is recorded from the Add purchase date button on a maintenance answer that needs it. Nothing has changed.', 'ASK_PURCHASE_DATE_NOT_DIRECTLY_ROUTABLE');
});

async function confirmPurchaseDate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const candidate = PurchaseDateInputSchema.safeParse(parameters.purchaseDateSet);
  if (!candidate.success) throw Object.assign(new Error('The purchase date to record is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const propertyId = execution.propertyId;
  const { purchaseDate } = candidate.data;
  // Same-value upsert is a no-op, so a lease-reclaim retry of this confirmation records nothing twice.
  await upsertProfile(propertyId, { purchaseDate: new Date(`${purchaseDate}T12:00:00.000Z`).toISOString() });
  const label = humanDate(new Date(`${purchaseDate}T12:00:00.000Z`)) ?? purchaseDate;
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'PURCHASE_DATE_RECORDED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `purchase-date-recorded-${propertyId}`, title: 'Purchase date recorded', status: 'COMPLETED',
      description: 'The purchase date is now part of this home\'s financing profile. Questions about the time since you bought the home will use it.',
      details: [{ label: 'Purchase date', value: label }], actions: [],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) result.blocks.push(refreshFailedLimitation(`purchase-date-refresh-failed-${propertyId}`, 'The purchase date'));
  return { result, artifactType: 'PROPERTY_FINANCING_PROFILE', artifactId: propertyId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('property-purchase-date.set', confirmPurchaseDate);

// ── Home journey ─────────────────────────────────────────────────────────────────────────────────────────────────

async function recordedJourney(propertyId: string): Promise<string | null> {
  const onboarding = await prisma.propertyOnboarding.findUnique({ where: { propertyId }, select: { ownershipState: true } });
  return onboarding?.ownershipState ?? null;
}

/** The version a home-journey form is bound to: the property and the state recorded right now. */
export async function homeJourneyContextVersion(propertyId: string): Promise<string> {
  return createHash('sha256').update(`home-journey-set:${propertyId}:${(await recordedJourney(propertyId)) ?? 'none'}`).digest('hex');
}

const journeyLabel = (value: string | null): string | null => HOME_JOURNEY_OPTIONS.find((option) => option.value === value)?.label ?? null;

function homeJourneyCaptureRequest(contextVersion: string, entered?: { ownershipState: string }): AskCaptureRequest {
  return {
    requirementId: 'home-journey-inputs', captureKey: HOME_JOURNEY_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: 'How are you using this home right now?', question: 'Which of these describes how you are using this home right now?',
    helpText: 'Ask Cozy uses this to show relevant guidance. It does not change property ownership or household permissions. You will review it before it is saved.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'ownershipState', label: 'Home journey', required: true, inputSchema: { type: 'SINGLE_SELECT', options: HOME_JOURNEY_OPTIONS.map((option) => ({ label: option.label, value: option.value })) } },
    ] },
    currentAnswer: { ownershipState: entered?.ownershipState ?? null },
    allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Saved as this home\'s journey; nothing is saved until you confirm', confirmationText: null,
    expectedContextVersion: contextVersion,
  };
}

export async function homeJourneyResult(
  userId: string, propertyId: string, suppliedInput: { ownershipState: string } | undefined, sourceExecutionId: string | null,
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return permissionBlocked('home-journey-permission', 'A contributor or owner can confirm how the home is used');
  const contextVersion = await homeJourneyContextVersion(propertyId);
  const current = await recordedJourney(propertyId);
  if (!suppliedInput) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'HOME_JOURNEY_INPUT_REQUIRED', contextVersion,
      parameters: { sourceExecutionId },
      blocks: [{
        type: 'SUMMARY', id: 'home-journey-input', title: 'Confirm how you are using this home',
        body: journeyLabel(current) ? `The recorded journey is “${journeyLabel(current)}”. Nothing changes until you confirm.` : 'No home journey is confirmed yet. Nothing is saved until you confirm.',
        tone: 'DEFAULT', actions: [],
      }],
      captureRequests: [homeJourneyCaptureRequest(contextVersion, journeyLabel(current) && current ? { ownershipState: current } : undefined)], suggestions: [],
    };
  }
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  const chosen = journeyLabel(suppliedInput.ownershipState) ?? suppliedInput.ownershipState;
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_JOURNEY_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { homeJourneySet: suppliedInput, homeJourneyContextVersion: contextVersion, sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'home-journey-review', title: 'Review your home journey', body: 'You chose this. Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `home-journey-${createHash('sha256').update(`${propertyId}:${suppliedInput.ownershipState}`).digest('hex').slice(0, 12)}-1`, version: 1,
      title: `Set the home journey to “${chosen}”?`,
      description: 'This sets how the household is using this home right now, the same setting the onboarding page changes. It does not change property ownership or household permissions.',
      fields: [
        ...(journeyLabel(current) && current !== suppliedInput.ownershipState ? [{ label: 'Currently', value: journeyLabel(current) as string }] : []),
        { label: 'Home journey', value: chosen },
      ],
      editableFields: [], confirmLabel: 'Save home journey', consentText: 'I authorize changing how this home is used for guidance.', expiresAt: expiresAt.toISOString(),
    },
    captureRequests: [homeJourneyCaptureRequest(contextVersion, suppliedInput)],
    suggestions: [],
  };
}

registerCapabilityHandler('home-journey.set', async (envelope) => {
  const declared = envelope.launchContext?.operationId === 'HOME_JOURNEY_SET'
    && envelope.launchContext.surface !== 'ASK_REFRESH'
    && envelope.message === HOME_JOURNEY_SET_MESSAGE;
  if (declared) return homeJourneyResult(envelope.userId, envelope.propertyId!, undefined, envelope.launchContext?.sourceExecutionId ?? null);
  return notRoutable('home-journey-not-routable', 'Use the Confirm home journey button',
    'The home journey is confirmed from the Confirm home journey button on an answer that needs it. Nothing has changed.', 'ASK_HOME_JOURNEY_NOT_DIRECTLY_ROUTABLE');
});

async function confirmHomeJourney(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const candidate = HomeJourneyInputSchema.safeParse(parameters.homeJourneySet);
  if (!candidate.success) throw Object.assign(new Error('The home journey to record is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const propertyId = execution.propertyId;
  // The onboarding service enforces the contributor floor itself and the upsert is idempotent for the same state.
  await updateJourneyOwnershipState(propertyId, userId, { ownershipState: candidate.data.ownershipState });
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'HOME_JOURNEY_RECORDED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `home-journey-recorded-${propertyId}`, title: 'Home journey saved', status: 'COMPLETED',
      description: 'Ask Cozy will use this to show relevant guidance. Property ownership and household permissions are unchanged.',
      details: [{ label: 'Home journey', value: journeyLabel(candidate.data.ownershipState) ?? candidate.data.ownershipState }], actions: [],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) result.blocks.push(refreshFailedLimitation(`home-journey-refresh-failed-${propertyId}`, 'The home journey'));
  return { result, artifactType: 'PROPERTY_ONBOARDING', artifactId: propertyId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('home-journey.set', confirmHomeJourney);
