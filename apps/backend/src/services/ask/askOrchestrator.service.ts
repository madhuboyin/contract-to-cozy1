import { AskExecution, AskExecutionStatus, HouseholdRole, MaintenanceTaskPriority, MaintenanceTaskStatus, NotificationCadence, Prisma, RecurrenceFrequency, RefinanceRateMonitorProduct, ServiceCategory } from '@prisma/client';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import {
  ASK_RESPONSE_SCHEMA_VERSION,
  AskExecutionResponseSchema,
  type AskCaptureRequest,
  type AskExecutionResponse,
  type AskPendingWorkItem,
  type AskPresentationBlock,
  type CreateAskExecutionRequest,
  type ContinueAskExecution,
  type RecordAskCaptureEvent,
  type RequestAskCorrection,
  type SubmitAskCaptureRequest,
  type SubmitAskClarification,
  type SubmitAskConfirmation,
  type SubmitAskFeedback,
} from '../../productFramework/ask/ask.contract';
import { readAskOperationalControls } from '../../config/askOperationalControls';
import { askExecutionDurationSeconds, askExecutionsTotal, askFeedbackTotal, askInlineCapturesTotal, askRemoteGenerationCharactersTotal, askRemoteGenerationTotal, askResultSynthesisTotal, askRoutingDecisionsTotal } from '../../lib/metrics';
import { resolvePropertyAccess } from '../propertyAccess.service';
import { PropertyMaintenanceTaskService } from '../PropertyMaintenanceTask.service';
import { getCoverageReviewItems, type CoverageReviewGroup } from '../coverageGap.service';
import { answerGroundedAsk } from '../groundedAsk.service';
import {
  buildCapabilityCatalog,
  canonicalCapabilityRegistry,
  matchCapabilityGoal,
  type CapabilityCatalogItem,
} from '../../productFramework/capabilities';
import { createToolDiscoveryCapabilityAvailabilityAdapter } from '../toolDiscoveryAvailability.service';
import { getCapabilityDiscoveryReadiness, getRelatedCapabilities } from '../capabilityRelated.service';
import {
  getAskOperationDefinition,
  resolveAskOperation,
  type AskOperationId,
  type AskOperationResolution,
  type AskOperationResult,
} from './askOperationRegistry';
import { evaluateFeatureContext } from '../../modules/propertyContext/application/evaluateFeatureContext';
import { captureFeatureContext } from '../../modules/propertyContext/application/captureFeatureContext';
import { getFinancialContextDecisions } from '../financialContext/context';
import { getProfile, upsertProfile } from '../financing.service';
import { RefinanceRadarService } from '../../refinanceRadar/refinanceRadar.service';
import { MortgageRateService } from '../../refinanceRadar/engine/mortgageRate.service';
import { getRefinanceAlertPreference } from '../../refinanceRadar/refinanceAlertPreference.service';
import { createOrUpdateRefinanceRateMonitor } from '../../refinanceRadar/refinanceRateMonitor.service';
import { HouseholdService } from '../household.service';
import { HomeSavingsService } from '../homeSavings.service';
import { HiddenAssetService } from '../hiddenAssets.service';
import { savingsBenefitsUnifiedService } from '../savingsBenefitsUnified.service';
import { SellHoldRentService } from '../sellHoldRent.service';
import { ownershipCostReadModelService, type OwnershipCostCurrentLens } from '../ownershipCosts/ownershipCostReadModel.service';
import { InventoryService } from '../inventory.service';
import { getPropertyRecordOverview } from '../propertyRecordOverview.service';
import { getHomeActionFeed, type HomeActionEmptyStateReason } from '../homeActions.service';
import { guidanceJourneyService } from '../guidanceEngine/guidanceJourney.service';
import { getOrCreateQuoteComparisonWorkspace, getQuoteComparisonWorkspace, getWorkspaceComparability } from '../quoteComparison.service';
import { upsertNotificationPreference } from '../notificationPreference.service';
import { updateInsurancePolicy } from '../home-management.service';
import { ReplaceRepairService } from '../replaceRepairAnalysis.service';
import { homeReserveFundService } from '../homeReserveFund.service';
import { HomeCapitalTimelineService } from '../homeCapitalTimeline.service';
import { propertyTaxAppealReadinessService } from '../propertyTax/propertyTaxAppealReadiness.service';
import { listRenovationCases } from '../renovationCase.service';
import { getReadiness as getRenovationReadiness } from '../renovationReadiness.service';
import { PermitTrackerService } from '../permitTracker.service';
import { getAskDomainCommandByOperation } from './askDomainCommandRegistry';
import { resolveAskRoutingCascade, type AskRoutingDecision } from './askRoutingCascade';
import { synthesizeAskResult } from './askResultSynthesis.service';

const MAX_RESULT_ITEMS = 50;
const refinanceRadarService = new RefinanceRadarService();
const mortgageRateService = new MortgageRateService();
const householdService = new HouseholdService();
const homeSavingsService = new HomeSavingsService();
const hiddenAssetService = new HiddenAssetService();
const sellHoldRentService = new SellHoldRentService();
const inventoryService = new InventoryService();
const replaceRepairService = new ReplaceRepairService();
const homeCapitalTimelineService = new HomeCapitalTimelineService();
const permitTrackerService = new PermitTrackerService();

const RefinanceProfileCaptureSchema = z.object({
  currentMortgageBalanceUsd: z.number().min(1_000).max(100_000_000),
  interestRatePct: z.number().positive().max(30),
  remainingTermYears: z.number().positive().max(50),
  monthlyPaymentUsd: z.number().positive().max(1_000_000).optional(),
}).strict();

const HouseholdInvitationInputSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  role: z.enum([HouseholdRole.CONTRIBUTOR, HouseholdRole.VIEWER]),
}).strict();
type InvitableHouseholdRole = z.infer<typeof HouseholdInvitationInputSchema>['role'];

const MaintenanceTaskWorkflowInputSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(1000).optional(),
  priority: z.nativeEnum(MaintenanceTaskPriority).default(MaintenanceTaskPriority.MEDIUM),
  nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  estimatedCostUsd: z.number().min(0).max(10_000_000).optional(),
  isRecurring: z.boolean().default(false),
  frequency: z.nativeEnum(RecurrenceFrequency).optional(),
}).strict().superRefine((value, context) => {
  if (value.isRecurring && !value.frequency) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['frequency'], message: 'Choose how often this task repeats.' });
  }
  if (value.nextDueDate) {
    const due = new Date(`${value.nextDueDate}T00:00:00.000Z`);
    if (Number.isNaN(due.getTime()) || due.toISOString().slice(0, 10) !== value.nextDueDate) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['nextDueDate'], message: 'Enter a valid due date.' });
    }
  }
});

type MaintenanceTaskWorkflowInput = z.infer<typeof MaintenanceTaskWorkflowInputSchema>;

const MaintenanceCompletionWorkflowInputSchema = z.object({
  taskId: z.string().trim().min(1).max(160),
  actualCostUsd: z.number().min(0).max(10_000_000).optional(),
  outcomeHealth: z.enum(['CONFIRMED_HEALTHY', 'NEEDS_ATTENTION', 'FAILED']).optional(),
}).strict();

type MaintenanceCompletionWorkflowInput = z.infer<typeof MaintenanceCompletionWorkflowInputSchema>;

const MaintenanceTaskUpdateInputSchema = z.object({
  taskId: z.string().trim().min(1).max(160),
  action: z.enum(['EDIT', 'RESCHEDULE', 'ASSIGN', 'UNASSIGN', 'ARCHIVE', 'REOPEN']),
  title: z.string().trim().min(3).max(160).optional(),
  priority: z.nativeEnum(MaintenanceTaskPriority).optional(),
  nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  assigneeUserId: z.string().trim().min(1).max(160).nullable().optional(),
}).strict();

const QuoteWorkspaceCommandInputSchema = z.object({
  serviceCategory: z.nativeEnum(ServiceCategory),
  scopeSummary: z.string().trim().min(3).max(1000),
}).strict();

const GuidanceJourneyCommandInputSchema = z.object({
  scopeCategory: z.enum(['ITEM', 'SERVICE']),
  scopeId: z.string().trim().min(1).max(160),
  issueType: z.string().trim().min(1).max(160),
  inventoryItemId: z.string().trim().min(1).max(160).nullable(),
  serviceKey: z.string().trim().min(1).max(160).nullable(),
  label: z.string().trim().min(1).max(240),
}).strict();

const HomeDeadlineMonitorInputSchema = z.object({
  sourceType: z.enum(['WARRANTY', 'INSURANCE_POLICY', 'MAINTENANCE']),
  sourceId: z.string().trim().min(1).max(160),
  title: z.string().trim().min(3).max(160),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  leadDays: z.number().int().min(1).max(90),
}).strict();

const HomeDeadlineExpirationCaptureSchema = z.object({
  policyId: z.string().trim().min(1).max(160),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict().superRefine((value, context) => {
  const expiry = new Date(`${value.expiryDate}T00:00:00.000Z`);
  if (Number.isNaN(expiry.getTime()) || expiry.toISOString().slice(0, 10) !== value.expiryDate || expiry <= new Date()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['expiryDate'], message: 'Enter a valid future expiration date.' });
  }
});

const HomeDeadlineTaskDueCaptureSchema = z.object({
  taskId: z.string().trim().min(1).max(160),
  nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict().superRefine((value, context) => {
  const due = new Date(`${value.nextDueDate}T00:00:00.000Z`);
  if (Number.isNaN(due.getTime()) || due.toISOString().slice(0, 10) !== value.nextDueDate || due <= new Date()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['nextDueDate'], message: 'Enter a valid future due date.' });
  }
});

function asInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function humanDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(value);
}

function askCaptureRequest(requirement: any, contextVersion: string, destinationLabel: string, fallbackHref: string): AskCaptureRequest {
  return {
    requirementId: requirement.requirementId,
    captureKey: requirement.capture.captureKey,
    classification: requirement.classification,
    state: requirement.state,
    title: requirement.capture.title,
    question: requirement.capture.question,
    helpText: requirement.capture.helpText ?? null,
    inputSchema: requirement.capture.inputSchema,
    ...(requirement.currentAnswer === undefined ? {} : { currentAnswer: requirement.currentAnswer }),
    allowNotSure: requirement.capture.allowNotSure,
    sensitivity: requirement.capture.sensitivity,
    destinationLabel,
    fallbackHref,
    confirmationText: null,
    expectedContextVersion: contextVersion,
  };
}

function propertyLabel(property: { name: string | null; address: string; city: string; state: string }): string {
  return property.name?.trim() || `${property.address}, ${property.city}, ${property.state}`;
}

function terminalStatus(status: AskOperationResult['status']): boolean {
  return ['ANSWERED', 'COMPLETED', 'NOT_APPLICABLE', 'UNAVAILABLE', 'OUT_OF_SCOPE', 'BLOCKED', 'FAILED_TERMINAL', 'CANCELLED', 'EXPIRED'].includes(status);
}

function askFailureStatus(error: unknown): Extract<AskExecutionStatus, 'FAILED_RETRYABLE' | 'FAILED_TERMINAL'> {
  const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
  if (error instanceof z.ZodError || code === 'ASK_PERMISSION_REQUIRED' || code === 'ASK_PROPERTY_NOT_FOUND'
    || (error instanceof Error && /undeclared block type|invalid configuration|invariant/i.test(error.message))) return 'FAILED_TERMINAL';
  return 'FAILED_RETRYABLE';
}

function askContextFingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);
}

function durableFreeTextClarification(operationId: AskOperationId, question: string): Pick<AskOperationResult, 'clarification' | 'parameters'> {
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  return {
    clarification: { version: 1, question, options: [], allowFreeText: true, expiresAt },
    parameters: { clarification: { version: 1, candidateOperationIds: [operationId], expiresAt } },
  };
}

async function quoteWorkspaceContextVersion(propertyId: string): Promise<string> {
  const workspaces = await prisma.quoteComparisonWorkspace.findMany({ where: { propertyId }, select: { id: true, status: true, updatedAt: true }, orderBy: { id: 'asc' } });
  return askContextFingerprint(workspaces.map((workspace) => [workspace.id, workspace.status, workspace.updatedAt.toISOString()]));
}

async function guidanceJourneyContextVersion(propertyId: string, input: z.infer<typeof GuidanceJourneyCommandInputSchema>): Promise<string> {
  if (input.inventoryItemId) {
    const item = await prisma.inventoryItem.findFirst({ where: { id: input.inventoryItemId, propertyId }, select: { id: true, updatedAt: true } });
    return askContextFingerprint(item ? [item.id, item.updatedAt.toISOString()] : ['missing', input.inventoryItemId]);
  }
  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true, updatedAt: true } });
  return askContextFingerprint([property?.id ?? propertyId, property?.updatedAt?.toISOString() ?? 'missing', input.serviceKey]);
}

async function refinanceMonitorContextVersion(userId: string, propertyId: string): Promise<string> {
  const [preference, snapshot] = await Promise.all([getRefinanceAlertPreference(userId, propertyId), mortgageRateService.getLatestSnapshot()]);
  return askContextFingerprint({ preference, snapshotId: snapshot?.id ?? null, snapshotDate: snapshot?.date ?? null });
}

async function ensurePropertyAccess(userId: string, propertyId: string) {
  const access = await resolvePropertyAccess(userId, propertyId);
  if (!access) {
    const error = new Error('Property not found or access denied.');
    (error as Error & { code?: string }).code = 'ASK_PROPERTY_NOT_FOUND';
    throw error;
  }
  return access;
}

async function propertySummary(propertyId: string | null | undefined) {
  if (!propertyId) return null;
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, name: true, address: true, city: true, state: true },
  });
  return property ? { id: property.id, label: propertyLabel(property) } : null;
}

async function householdWorkflowVersion(propertyId: string): Promise<string> {
  const [members, invites] = await Promise.all([
    prisma.householdMember.findMany({
      where: { propertyId }, orderBy: { id: 'asc' },
      select: { id: true, role: true, isPrimaryOwner: true, updatedAt: true },
    }),
    prisma.householdInvite.findMany({
      where: { propertyId }, orderBy: { id: 'asc' },
      select: { id: true, role: true, status: true, createdAt: true, acceptedAt: true, revokedAt: true, expiresAt: true },
    }),
  ]);
  return createHash('sha256').update(JSON.stringify({
    propertyId,
    members,
    invites,
  })).digest('hex');
}

function invitationRoleCopy(role: InvitableHouseholdRole): string {
  return role === HouseholdRole.CONTRIBUTOR
    ? 'Contributor — can view records, complete tasks, log events, and add inventory'
    : 'Viewer — read-only access; cannot create or modify home records';
}

function extractHouseholdInvitationInput(message: string): Partial<z.input<typeof HouseholdInvitationInputSchema>> {
  const email = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const role = /\b(viewer|read[ -]?only)\b/i.test(message)
    ? HouseholdRole.VIEWER
    : /\b(contributor|edit(?:or)?|help (?:manage|maintain)|complete tasks?)\b/i.test(message)
      ? HouseholdRole.CONTRIBUTOR
      : undefined;
  return { ...(email ? { email } : {}), ...(role ? { role } : {}) };
}

async function householdInvitationResult(
  userId: string,
  propertyId: string,
  message: string,
  suppliedInput?: z.infer<typeof HouseholdInvitationInputSchema>,
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const householdHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/household`;
  if (access.role !== HouseholdRole.OWNER) {
    return {
      status: 'BLOCKED',
      reasonCode: 'ASK_PERMISSION_REQUIRED',
      blocks: [{
        type: 'SUMMARY', id: 'household-invite-owner-required', title: 'A household owner needs to send this invitation',
        body: 'Inviting someone changes access to this home’s records. Contributors and viewers can review their current access, but only an owner can choose a role and send an invitation.',
        tone: 'CAUTION', actions: [{ id: 'open-household', label: 'Review household access', href: householdHref, style: 'SECONDARY' }],
      }],
      suggestions: ['What can my current household role do?'],
    };
  }

  const contextVersion = await householdWorkflowVersion(propertyId);
  const extracted = suppliedInput ?? extractHouseholdInvitationInput(message);
  const parsed = HouseholdInvitationInputSchema.safeParse(extracted);
  if (!parsed.success) {
    const currentAnswer = {
      ...(typeof extracted.email === 'string' ? { email: extracted.email } : {}),
      ...(extracted.role ? { role: extracted.role } : {}),
    };
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'HOUSEHOLD_INVITATION_INPUT_REQUIRED', contextVersion,
      parameters: { householdContextVersion: contextVersion },
      blocks: [{
        type: 'SUMMARY', id: 'household-invite-input', title: 'Choose who to invite and what they can do',
        body: 'Use Contributor for someone who helps maintain the home record. Use Viewer for read-only access. An invitation does not establish a legal ownership interest or imply a family relationship.',
        tone: 'DEFAULT', actions: [],
      }],
      captureRequests: [{
        requirementId: `household-invite-${contextVersion.slice(0, 20)}`,
        captureKey: 'HOUSEHOLD_INVITATION_INPUTS', classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
        title: 'Household invitation details', question: 'Who should receive access, and which role should they have?',
        helpText: 'The email and role are used only for this invitation workflow. They are not saved as inferred household facts.',
        inputSchema: { type: 'GROUP', fields: [
          { key: 'email', label: 'Email address', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 254 } },
          { key: 'role', label: 'Access role', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [
            { label: 'Contributor — can help manage the home', value: HouseholdRole.CONTRIBUTOR },
            { label: 'Viewer — read-only access', value: HouseholdRole.VIEWER },
          ] } },
        ] },
        currentAnswer, allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used for this household invitation',
        confirmationText: null, expectedContextVersion: contextVersion,
      }],
      suggestions: ['Open household settings instead'],
    };
  }

  const property = await propertySummary(propertyId);
  const confirmationVersion = 1;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'HOUSEHOLD_INVITATION_CONFIRMATION_REQUIRED', contextVersion,
    parameters: {
      inviteEmail: parsed.data.email,
      inviteRole: parsed.data.role,
      householdContextVersion: contextVersion,
      confirmationVersion,
      confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{
      type: 'SUMMARY', id: 'household-invite-review', title: 'Review the household invitation',
      body: 'No invitation has been created yet. Confirm the recipient and role below. The recipient must accept before access becomes active.',
      tone: 'DEFAULT', actions: [{ id: 'manage-household', label: 'Open household settings', href: householdHref, style: 'SECONDARY' }],
    }],
    confirmation: {
      confirmationId: `household-invite-${propertyId}-${confirmationVersion}`,
      version: confirmationVersion,
      title: 'Send this household invitation?',
      description: 'This creates a seven-day invitation for the selected home. Access begins only after the recipient accepts it.',
      fields: [
        { label: 'Home', value: property?.label ?? 'Selected home' },
        { label: 'Recipient', value: parsed.data.email },
        { label: 'Role', value: invitationRoleCopy(parsed.data.role) },
        { label: 'Legal ownership', value: 'Not changed by this invitation' },
      ],
      confirmLabel: 'Send invitation',
      consentText: 'I confirm this recipient and access role are correct and authorize ContractToCozy to create the invitation.',
      expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

function needsPropertyResult(): AskOperationResult {
  return {
    status: 'NEEDS_PROPERTY',
    reasonCode: 'ASK_PROPERTY_REQUIRED',
    blocks: [{
      type: 'SUMMARY',
      id: 'property-required',
      title: 'Select a home to continue',
      body: 'This question needs a specific Living Home Record. Select a home, then Ask will continue with the same question.',
      tone: 'CAUTION',
      actions: [{ id: 'select-property', label: 'Select a home', href: '/dashboard/properties', style: 'PRIMARY' }],
    }],
    suggestions: ['You can also ask a general home-care question without selecting a property.'],
  };
}

type MaintenanceTimeframe = {
  label: string;
  matches: (date: Date) => boolean;
};

function safeTimezone(value: string | null | undefined): string {
  if (!value) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return value;
  } catch {
    return 'UTC';
  }
}

function dateParts(value: Date, timeZone: string): { year: number; month: number; day: number; serial: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const number = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const year = number('year');
  const month = number('month');
  const day = number('day');
  return { year, month, day, serial: Date.UTC(year, month - 1, day) };
}

function localDateKey(value: Date, timeZone: string): string {
  const { year, month, day } = dateParts(value, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function maintenanceDate(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone,
  }).format(value);
}

function resolveMaintenanceTimeframe(message: string, now: Date, timeZone: string, purchaseDate: Date | null): { timeframe: MaintenanceTimeframe | null; missingPurchaseDate: boolean } {
  const explicitDates = [...message.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)].map((match) => match[1]);
  if (explicitDates.length >= 2) {
    const [start, end] = explicitDates[0] <= explicitDates[1] ? explicitDates : [explicitDates[1], explicitDates[0]];
    return { timeframe: { label: `${start} through ${end}`, matches: (date) => {
      const key = localDateKey(date, timeZone);
      return key >= start && key <= end;
    } }, missingPurchaseDate: false };
  }
  if (/\bsince (?:i|we) (?:bought|purchased)|since (?:buying|purchasing)|since closing\b/i.test(message)) {
    return purchaseDate
      ? { timeframe: { label: `since ${maintenanceDate(purchaseDate, timeZone)}`, matches: (date) => date >= purchaseDate }, missingPurchaseDate: false }
      : { timeframe: null, missingPurchaseDate: true };
  }
  const current = dateParts(now, timeZone);
  if (/\btoday\b/i.test(message)) return {
    timeframe: { label: 'today', matches: (date) => localDateKey(date, timeZone) === localDateKey(now, timeZone) }, missingPurchaseDate: false,
  };
  if (/\bthis week\b/i.test(message)) {
    const weekdayName = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now);
    const weekday = Math.max(0, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayName));
    const start = current.serial - weekday * 86_400_000;
    return { timeframe: { label: 'this week', matches: (date) => {
      const serial = dateParts(date, timeZone).serial;
      return serial >= start && serial < start + 7 * 86_400_000;
    } }, missingPurchaseDate: false };
  }
  if (/\bthis month\b/i.test(message)) return {
    timeframe: { label: 'this month', matches: (date) => {
      const part = dateParts(date, timeZone);
      return part.year === current.year && part.month === current.month;
    } }, missingPurchaseDate: false,
  };
  if (/\blast year\b/i.test(message)) return {
    timeframe: { label: 'last year', matches: (date) => dateParts(date, timeZone).year === current.year - 1 }, missingPurchaseDate: false,
  };
  if (/\bthis year\b/i.test(message)) return {
    timeframe: { label: 'this year', matches: (date) => dateParts(date, timeZone).year === current.year }, missingPurchaseDate: false,
  };
  const rollingDays = message.match(/\blast\s+(30|90)\s+days?\b/i)?.[1];
  if (rollingDays) {
    const days = Number(rollingDays);
    const cutoff = new Date(now.getTime() - days * 86_400_000);
    return { timeframe: { label: `last ${days} days`, matches: (date) => date >= cutoff && date <= now }, missingPurchaseDate: false };
  }
  return { timeframe: null, missingPurchaseDate: false };
}

function maintenanceScopeTerms(message: string): string[] {
  const aliases: Array<[RegExp, string[]]> = [
    [/\b(?:hvac|furnace|air conditioner|heat pump|boiler)\b/i, ['hvac', 'furnace', 'air conditioner', 'heat pump', 'boiler']],
    [/\b(?:roof|gutter|exterior)\b/i, ['roof', 'gutter', 'exterior']],
    [/\b(?:plumbing|water heater|pipe|drain)\b/i, ['plumbing', 'water heater', 'pipe', 'drain']],
    [/\b(?:electrical|breaker|panel|outlet)\b/i, ['electrical', 'breaker', 'panel', 'outlet']],
    [/\b(?:refrigerator|fridge)\b/i, ['refrigerator', 'fridge']],
    [/\b(?:seasonal|winter|spring|summer|fall|autumn)\b/i, ['seasonal', 'winter', 'spring', 'summer', 'fall', 'autumn']],
    [/\b(?:safety|smoke detector|carbon monoxide|co detector)\b/i, ['safety', 'smoke detector', 'carbon monoxide', 'co detector']],
  ];
  return aliases.find(([pattern]) => pattern.test(message))?.[1] ?? [];
}

function maintenanceTaskText(task: Awaited<ReturnType<typeof PropertyMaintenanceTaskService.getTasksForProperty>>[number]): string {
  return [task.title, task.description, task.category, task.assetType, task.serviceCategory, task.inventoryItem?.name, task.room?.name, task.season]
    .filter(Boolean).join(' ').toLowerCase();
}

function maintenanceMoney(value: { toString(): string } | number | null | undefined): string | null {
  if (value == null) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value));
}

async function maintenanceWorkflowVersion(propertyId: string): Promise<string> {
  const tasks = await prisma.propertyMaintenanceTask.findMany({
    where: { propertyId }, orderBy: { id: 'asc' },
    select: { id: true, status: true, updatedAt: true },
  });
  return createHash('sha256').update(JSON.stringify({ propertyId, tasks })).digest('hex');
}

function shiftedDateOnly(now: Date, timeZone: string, input: { days?: number; weeks?: number; months?: number }): string {
  const current = dateParts(now, timeZone);
  const date = new Date(Date.UTC(current.year, current.month - 1, current.day));
  if (input.days) date.setUTCDate(date.getUTCDate() + input.days);
  if (input.weeks) date.setUTCDate(date.getUTCDate() + input.weeks * 7);
  if (input.months) {
    const originalDay = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + input.months);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(originalDay, lastDay));
  }
  return date.toISOString().slice(0, 10);
}

function extractMaintenanceDueDate(message: string, now: Date, timeZone: string): string | undefined {
  const explicit = message.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  if (explicit) return explicit;
  if (/\btoday\b/i.test(message)) return shiftedDateOnly(now, timeZone, {});
  if (/\btomorrow\b/i.test(message)) return shiftedDateOnly(now, timeZone, { days: 1 });
  if (/\bnext week\b/i.test(message)) return shiftedDateOnly(now, timeZone, { weeks: 1 });
  if (/\bnext month\b/i.test(message)) return shiftedDateOnly(now, timeZone, { months: 1 });
  const relative = message.match(/\bin\s+(\d{1,3})\s+(days?|weeks?|months?)\b/i);
  if (!relative) return undefined;
  const amount = Number(relative[1]);
  const unit = relative[2].toLowerCase();
  return shiftedDateOnly(now, timeZone, unit.startsWith('day') ? { days: amount } : unit.startsWith('week') ? { weeks: amount } : { months: amount });
}

function extractMaintenanceFrequency(message: string): RecurrenceFrequency | undefined {
  if (/\b(?:every day|daily)\b/i.test(message)) return RecurrenceFrequency.DAILY;
  if (/\b(?:every week|weekly)\b/i.test(message)) return RecurrenceFrequency.WEEKLY;
  if (/\b(?:every (?:three|3) months|quarterly)\b/i.test(message)) return RecurrenceFrequency.QUARTERLY;
  if (/\b(?:twice a year|twice yearly|semi[ -]?annually)\b/i.test(message)) return RecurrenceFrequency.SEMI_ANNUALLY;
  if (/\b(?:every year|yearly|annually|annual)\b/i.test(message)) return RecurrenceFrequency.ANNUALLY;
  if (/\b(?:every month|monthly)\b/i.test(message)) return RecurrenceFrequency.MONTHLY;
  return undefined;
}

function extractMaintenanceTitle(message: string): string | undefined {
  let title = message.trim()
    .replace(/^(?:please\s+)?(?:create|add|schedule|set up)\s+(?:(?:a|the)\s+)?(?:(?:maintenance\s+)?task\s+(?:to|for)\s+|maintenance\s+(?:to\s+)?)/i, '')
    .replace(/^(?:please\s+)?(?:create|add|schedule|set up)\s+(?:(?:a|the)\s+)?/i, '')
    .replace(/^(?:please\s+)?(?:remind me to|put on my maintenance list)\s+/i, '')
    .replace(/\s+(?:to|on)\s+my maintenance list\s*$/i, '');
  title = title.split(/\b(?:today|tomorrow|next week|next month|in \d{1,3} (?:days?|weeks?|months?)|on \d{4}-\d{2}-\d{2}|by \d{4}-\d{2}-\d{2}|daily|weekly|monthly|quarterly|annually|annual|every (?:day|week|month|year|three months|3 months)|twice a year|semi[ -]?annually|urgent|high priority|low priority|estimated cost|for \$)\b/i)[0]
    .replace(/[.,;:!?\s]+$/g, '')
    .trim();
  if (!title || /^(?:maintenance|task|(?:another )?maintenance task)$/i.test(title)) return undefined;
  return `${title.charAt(0).toUpperCase()}${title.slice(1)}`.slice(0, 160);
}

function extractMaintenanceTaskInput(message: string, now: Date, timeZone: string): Partial<MaintenanceTaskWorkflowInput> {
  const frequency = extractMaintenanceFrequency(message);
  const cost = message.match(/(?:estimated cost(?:s| is| of)?|budget(?: of)?|for)\s*\$\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1];
  return {
    title: extractMaintenanceTitle(message),
    priority: /\b(?:urgent|critical)\b/i.test(message)
      ? MaintenanceTaskPriority.URGENT
      : /\bhigh priority\b/i.test(message) ? MaintenanceTaskPriority.HIGH
        : /\blow priority\b/i.test(message) ? MaintenanceTaskPriority.LOW : MaintenanceTaskPriority.MEDIUM,
    nextDueDate: extractMaintenanceDueDate(message, now, timeZone),
    estimatedCostUsd: cost ? Number(cost.replace(/,/g, '')) : undefined,
    isRecurring: Boolean(frequency),
    frequency,
  };
}

async function maintenanceTaskCreateResult(
  userId: string,
  propertyId: string,
  message: string,
  suppliedInput?: MaintenanceTaskWorkflowInput,
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const maintenanceHref = `/dashboard/maintenance?propertyId=${encodeURIComponent(propertyId)}`;
  if (access.role === HouseholdRole.VIEWER) {
    return {
      status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
      blocks: [{
        type: 'SUMMARY', id: 'maintenance-create-permission', title: 'A contributor or owner needs to create this task',
        body: 'Creating a maintenance task changes the shared home record. Viewers can review tasks but cannot add or modify them.',
        tone: 'CAUTION', actions: [{ id: 'open-maintenance', label: 'Review maintenance', href: maintenanceHref, style: 'SECONDARY' }],
      }],
      suggestions: ['What maintenance is pending?'],
    };
  }

  const [property, workflowVersion] = await Promise.all([
    prisma.property.findUnique({ where: { id: propertyId }, select: { timezone: true } }),
    maintenanceWorkflowVersion(propertyId),
  ]);
  const candidate = suppliedInput ?? extractMaintenanceTaskInput(message, new Date(), safeTimezone(property?.timezone));
  const parsed = MaintenanceTaskWorkflowInputSchema.safeParse(candidate);
  if (!parsed.success) {
    const currentAnswer = Object.fromEntries(Object.entries(candidate).filter(([, value]) => value !== undefined));
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'MAINTENANCE_TASK_INPUT_REQUIRED', contextVersion: workflowVersion,
      parameters: { maintenanceWorkflowVersion: workflowVersion },
      blocks: [{
        type: 'SUMMARY', id: 'maintenance-create-input', title: 'Add the task details',
        body: 'Nothing has been created yet. Add the minimum useful details, then review the task before it is saved.',
        tone: 'DEFAULT', actions: [{ id: 'open-maintenance', label: 'Open Maintenance instead', href: maintenanceHref, style: 'SECONDARY' }],
      }],
      captureRequests: [{
        requirementId: `maintenance-task-${workflowVersion.slice(0, 20)}`,
        captureKey: 'MAINTENANCE_TASK_INPUTS', classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
        title: 'Maintenance task details', question: 'What task should be added, and when should it be due?',
        helpText: 'A due date, estimate, and recurrence are optional. You will review everything before the task is created.',
        inputSchema: { type: 'GROUP', fields: [
          { key: 'title', label: 'Task', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 160 } },
          { key: 'description', label: 'Notes', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 1000 } },
          { key: 'priority', label: 'Priority', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [
            { label: 'Low', value: MaintenanceTaskPriority.LOW }, { label: 'Medium', value: MaintenanceTaskPriority.MEDIUM },
            { label: 'High', value: MaintenanceTaskPriority.HIGH }, { label: 'Urgent', value: MaintenanceTaskPriority.URGENT },
          ] } },
          { key: 'nextDueDate', label: 'Due date', helpText: 'Optional', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 10 } },
          { key: 'estimatedCostUsd', label: 'Estimated cost', helpText: 'Optional', required: false, inputSchema: { type: 'DECIMAL', min: 0, max: 10_000_000, unit: 'USD' } },
          { key: 'isRecurring', label: 'Does this repeat?', required: true, inputSchema: { type: 'BOOLEAN', trueLabel: 'Recurring', falseLabel: 'One-time' } },
          { key: 'frequency', label: 'Repeat', required: true, when: { fieldKey: 'isRecurring', operator: 'EQUALS', value: true }, inputSchema: { type: 'SINGLE_SELECT', options: [
            { label: 'Daily', value: RecurrenceFrequency.DAILY }, { label: 'Weekly', value: RecurrenceFrequency.WEEKLY },
            { label: 'Monthly', value: RecurrenceFrequency.MONTHLY }, { label: 'Quarterly', value: RecurrenceFrequency.QUARTERLY },
            { label: 'Twice a year', value: RecurrenceFrequency.SEMI_ANNUALLY }, { label: 'Annually', value: RecurrenceFrequency.ANNUALLY },
          ] } },
        ] },
        currentAnswer, allowNotSure: false, sensitivity: 'STANDARD',
        destinationLabel: 'Used to prepare this task; nothing is saved until you confirm', confirmationText: null,
        expectedContextVersion: workflowVersion,
      }],
      suggestions: ['Open Maintenance instead'],
    };
  }

  const confirmationVersion = 1;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'MAINTENANCE_TASK_CONFIRMATION_REQUIRED', contextVersion: workflowVersion,
    parameters: {
      maintenanceTitle: parsed.data.title,
      maintenanceDescription: parsed.data.description ?? null,
      maintenancePriority: parsed.data.priority,
      maintenanceNextDueDate: parsed.data.nextDueDate ?? null,
      maintenanceEstimatedCostUsd: parsed.data.estimatedCostUsd ?? null,
      maintenanceIsRecurring: parsed.data.isRecurring,
      maintenanceFrequency: parsed.data.frequency ?? null,
      maintenanceWorkflowVersion: workflowVersion,
      confirmationVersion,
      confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{
      type: 'SUMMARY', id: 'maintenance-create-review', title: 'Review this maintenance task',
      body: 'No task has been created yet. Confirm the shared-home record below or cancel without saving.',
      tone: 'DEFAULT', actions: [{ id: 'open-maintenance', label: 'Open Maintenance', href: maintenanceHref, style: 'SECONDARY' }],
    }],
    confirmation: {
      confirmationId: `maintenance-task-${propertyId}-${confirmationVersion}`,
      version: confirmationVersion,
      title: 'Create this maintenance task?',
      description: 'This adds one pending task to the selected home’s canonical Maintenance record.',
      fields: [
        { label: 'Task', value: parsed.data.title },
        { label: 'Priority', value: parsed.data.priority.toLowerCase().replace(/_/g, ' ') },
        { label: 'Due', value: parsed.data.nextDueDate ?? 'Not scheduled' },
        { label: 'Estimated cost', value: parsed.data.estimatedCostUsd == null ? 'Not recorded' : maintenanceMoney(parsed.data.estimatedCostUsd) ?? 'Not recorded' },
        { label: 'Recurrence', value: parsed.data.isRecurring && parsed.data.frequency ? parsed.data.frequency.toLowerCase().replace(/_/g, ' ') : 'One-time' },
      ],
      confirmLabel: 'Create task',
      consentText: 'I confirm these task details are correct and authorize adding them to this home’s shared Maintenance record.',
      expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

function maintenanceTaskVersion(task: { id: string; status: MaintenanceTaskStatus; updatedAt: Date }): string {
  return createHash('sha256').update(JSON.stringify({ id: task.id, status: task.status, updatedAt: task.updatedAt })).digest('hex');
}

function maintenanceCompletionSubject(message: string): string {
  return message.toLowerCase()
    .replace(/^\s*(?:please\s+)?(?:mark|set|complete|finish)\s+/i, '')
    .replace(/^\s*(?:i|we)\s+(?:completed|finished)\s+/i, '')
    .replace(/\b(?:as\s+)?(?:complete|completed|done)\b/gi, ' ')
    .replace(/(?:actual cost(?: was| is)?|cost(?: me| us)?|for)\s*\$\s*[\d,]+(?:\.\d{1,2})?/gi, ' ')
    .replace(/\b(?:and )?(?:it is |it was )?(?:working (?:as expected|fine)|needs attention|failed again)\b/gi, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(?:the|my|our|a|an|task|maintenance)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function maintenanceCompletionMatch<T extends { title: string; inventoryItem?: { name: string } | null; room?: { name: string } | null }>(message: string, tasks: T[]): T | null {
  if (tasks.length === 1) return tasks[0];
  const subject = maintenanceCompletionSubject(message);
  if (!subject) return null;
  const subjectTokens = new Set(subject.split(' ').filter((token) => token.length > 2));
  const ranked = tasks.map((task) => {
    const text = [task.title, task.inventoryItem?.name, task.room?.name].filter(Boolean).join(' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const tokens = new Set(text.split(' ').filter((token) => token.length > 2));
    const overlap = [...subjectTokens].filter((token) => tokens.has(token)).length;
    const score = text === subject ? 100 : text.includes(subject) || subject.includes(text) ? 80 : subjectTokens.size ? overlap / subjectTokens.size * 60 : 0;
    return { task, score };
  }).sort((left, right) => right.score - left.score);
  return ranked[0]?.score >= 35 && ranked[0].score > (ranked[1]?.score ?? -1) ? ranked[0].task : null;
}

function extractMaintenanceCompletionInput(message: string, taskId: string | undefined): Partial<MaintenanceCompletionWorkflowInput> {
  const cost = message.match(/(?:actual cost(?: was| is)?|cost(?: me| us)?|for)\s*\$\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1];
  const outcomeHealth = /\b(?:failed again|failed|not working)\b/i.test(message)
    ? 'FAILED' as const
    : /\b(?:needs attention|still has|still needs|issue remains|problem remains)\b/i.test(message)
      ? 'NEEDS_ATTENTION' as const
      : /\b(?:working as expected|working fine|looks good|resolved)\b/i.test(message)
        ? 'CONFIRMED_HEALTHY' as const
        : undefined;
  return {
    taskId,
    actualCostUsd: cost ? Number(cost.replace(/,/g, '')) : undefined,
    outcomeHealth,
  };
}

async function maintenanceTaskCompleteResult(
  userId: string,
  propertyId: string,
  message: string,
  suppliedInput?: MaintenanceCompletionWorkflowInput,
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const maintenanceHref = `/dashboard/maintenance?propertyId=${encodeURIComponent(propertyId)}`;
  if (access.role === HouseholdRole.VIEWER) {
    return {
      status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
      blocks: [{
        type: 'SUMMARY', id: 'maintenance-complete-permission', title: 'A contributor or owner needs to complete this task',
        body: 'Completing a task changes the shared Maintenance record and may update recurring schedules and Home Actions. Viewers remain read-only.',
        tone: 'CAUTION', actions: [{ id: 'open-maintenance', label: 'Review maintenance', href: maintenanceHref, style: 'SECONDARY' }],
      }],
      suggestions: ['What maintenance is pending?'],
    };
  }

  const [allTasks, workflowVersion] = await Promise.all([
    PropertyMaintenanceTaskService.getTasksForProperty(userId, propertyId, { includeCompleted: true }),
    maintenanceWorkflowVersion(propertyId),
  ]);
  const openTasks = allTasks.filter((task) => task.status !== MaintenanceTaskStatus.COMPLETED && task.status !== MaintenanceTaskStatus.CANCELLED);
  if (!openTasks.length) {
    return {
      status: 'NOT_APPLICABLE', reasonCode: 'NO_OPEN_MAINTENANCE_TASKS', contextVersion: workflowVersion,
      blocks: [{
        type: 'SUMMARY', id: 'maintenance-complete-empty', title: 'No open maintenance task is available to complete',
        body: 'No pending, in-progress, or needs-review task is recorded for this home. Ask will not create a completion without a canonical task.',
        tone: 'DEFAULT', actions: [{ id: 'open-maintenance', label: 'Open maintenance', href: maintenanceHref, style: 'PRIMARY' }],
      }],
      suggestions: ['Create a maintenance task'],
    };
  }

  const matched = suppliedInput
    ? openTasks.find((task) => task.id === suppliedInput.taskId) ?? null
    : maintenanceCompletionMatch(message, openTasks);
  const extracted = suppliedInput ?? extractMaintenanceCompletionInput(message, matched?.id);
  const projectOutcomeRequired = Boolean(matched?.actionKey?.match(/^project:[^:]+:follow-up$/));
  const parsed = MaintenanceCompletionWorkflowInputSchema.safeParse(extracted);
  if (!matched || !parsed.success || (projectOutcomeRequired && !parsed.data.outcomeHealth)) {
    const currentAnswer = Object.fromEntries(Object.entries(extracted).filter(([, value]) => value !== undefined));
    return {
      status: matched ? 'NEEDS_CONTEXT' : 'NEEDS_ENTITY',
      reasonCode: matched ? 'MAINTENANCE_COMPLETION_OUTCOME_REQUIRED' : 'MAINTENANCE_TASK_SELECTION_REQUIRED',
      contextVersion: workflowVersion,
      parameters: { maintenanceWorkflowVersion: workflowVersion },
      blocks: [{
        type: 'SUMMARY', id: 'maintenance-complete-select',
        title: matched ? `Record the outcome for ${matched.title}` : 'Choose the task to complete',
        body: matched
          ? 'This project follow-up requires an outcome before completion. Nothing has been changed yet.'
          : 'Ask could not identify one open task with enough confidence. Select the exact canonical task; nothing will change until you confirm.',
        tone: 'DEFAULT', actions: [{ id: 'open-maintenance', label: 'Open Maintenance instead', href: maintenanceHref, style: 'SECONDARY' }],
      }],
      captureRequests: [{
        requirementId: `maintenance-complete-${workflowVersion.slice(0, 20)}`,
        captureKey: 'MAINTENANCE_COMPLETION_INPUTS', classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
        title: 'Maintenance completion details', question: 'Which task was completed, and was there an actual cost or follow-up outcome?',
        helpText: 'Actual cost is optional. Project outcome is used only when the selected task is a project follow-up. You will review before saving.',
        inputSchema: { type: 'GROUP', fields: [
          { key: 'taskId', label: 'Open task', required: true, inputSchema: { type: 'SINGLE_SELECT', options: openTasks.slice(0, 50).map((task) => ({
            label: `${task.title}${task.nextDueDate ? ` · due ${humanDate(task.nextDueDate)}` : ''}`, value: task.id,
          })) } },
          { key: 'actualCostUsd', label: 'Actual cost', helpText: 'Optional', required: false, inputSchema: { type: 'DECIMAL', min: 0, max: 10_000_000, unit: 'USD' } },
          { key: 'outcomeHealth', label: 'Project follow-up outcome', helpText: 'Required only for a project follow-up task', required: projectOutcomeRequired, inputSchema: { type: 'SINGLE_SELECT', options: [
            { label: 'Working as expected', value: 'CONFIRMED_HEALTHY' }, { label: 'Needs attention', value: 'NEEDS_ATTENTION' }, { label: 'Failed again', value: 'FAILED' },
          ] } },
        ] },
        currentAnswer, allowNotSure: false, sensitivity: 'STANDARD',
        destinationLabel: 'Used to prepare this completion; nothing is saved until you confirm', confirmationText: null,
        expectedContextVersion: workflowVersion,
      }],
      suggestions: ['Open Maintenance instead'],
    };
  }

  const selected = matched;
  const confirmationVersion = 1;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'MAINTENANCE_COMPLETION_CONFIRMATION_REQUIRED', contextVersion: maintenanceTaskVersion(selected),
    parameters: {
      maintenanceTaskId: selected.id,
      maintenanceTaskTitle: selected.title,
      maintenanceTaskVersion: maintenanceTaskVersion(selected),
      maintenanceActualCostUsd: parsed.data.actualCostUsd ?? null,
      maintenanceOutcomeHealth: parsed.data.outcomeHealth ?? null,
      confirmationVersion,
      confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{
      type: 'SUMMARY', id: 'maintenance-complete-review', title: `Review completion for ${selected.title}`,
      body: `No status has changed yet.${selected.isRecurring && selected.frequency ? ' Confirming will complete this occurrence and calculate the next due date.' : ''}`,
      tone: 'DEFAULT', actions: [{ id: 'open-task', label: 'Open task', href: `${maintenanceHref}&taskId=${encodeURIComponent(selected.id)}&from=ask`, style: 'SECONDARY' }],
    }],
    confirmation: {
      confirmationId: `maintenance-complete-${selected.id}-${confirmationVersion}`,
      version: confirmationVersion,
      title: 'Mark this maintenance task complete?',
      description: 'This records completion in the canonical Maintenance record and runs its registered downstream reconciliation.',
      fields: [
        { label: 'Task', value: selected.title },
        { label: 'Current status', value: selected.status.toLowerCase().replace(/_/g, ' ') },
        { label: 'Actual cost', value: parsed.data.actualCostUsd == null ? 'Not recorded' : maintenanceMoney(parsed.data.actualCostUsd) ?? 'Not recorded' },
        { label: 'Recurrence', value: selected.isRecurring && selected.frequency ? `${selected.frequency.toLowerCase().replace(/_/g, ' ')} · next date recalculated` : 'One-time' },
        ...(projectOutcomeRequired ? [{ label: 'Project outcome', value: String(parsed.data.outcomeHealth).toLowerCase().replace(/_/g, ' ') }] : []),
      ],
      confirmLabel: 'Mark complete',
      consentText: 'I confirm this task was completed and authorize updating the shared Maintenance record and its related home workflows.',
      expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

function maintenanceUpdateAction(message: string): z.infer<typeof MaintenanceTaskUpdateInputSchema>['action'] {
  if (/\bunassign\b/i.test(message)) return 'UNASSIGN';
  if (/\bassign\b/i.test(message)) return 'ASSIGN';
  if (/\b(?:archive|cancel)\b/i.test(message)) return 'ARCHIVE';
  if (/\b(?:reopen|restore)\b/i.test(message)) return 'REOPEN';
  if (/\b(?:reschedule|due date|move .{0,30}(?:to|until))\b/i.test(message)) return 'RESCHEDULE';
  return 'EDIT';
}

function maintenanceUpdateSubject(message: string): string {
  return message.toLowerCase()
    .replace(/\b(?:reschedule|move|change|update|edit|assign|unassign|archive|cancel|reopen|restore|maintenance|task|priority|due date)\b/g, ' ')
    .replace(/\b(?:to|on|until|for|as)\s+\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, ' ')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

async function maintenanceTaskUpdateResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const [tasks, members] = await Promise.all([
    PropertyMaintenanceTaskService.getTasksForProperty(userId, propertyId, { includeCompleted: true }),
    prisma.householdMember.findMany({ where: { propertyId }, include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } }),
  ]);
  const subject = maintenanceUpdateSubject(message);
  const match = maintenanceCompletionMatch(subject, tasks);
  const maintenanceHref = `/dashboard/maintenance?propertyId=${encodeURIComponent(propertyId)}`;
  if (!match) {
    return {
      status: 'NEEDS_ENTITY', reasonCode: 'MAINTENANCE_TASK_SELECTION_REQUIRED',
      ...durableFreeTextClarification('MAINTENANCE_TASK_UPDATE', 'Which maintenance task should Ask update? Use its exact title.'),
      blocks: [{
        type: 'GROUPED_LIST', id: 'maintenance-update-options', title: 'Choose the task to change',
        description: 'Ask found more than one possible task. Use its exact title in your next message; nothing has changed.',
        sections: [{ id: 'tasks', title: 'Maintenance tasks', count: tasks.length, items: tasks.slice(0, 20).map((task) => ({
          id: task.id, title: task.title, description: task.nextDueDate ? `Due ${humanDate(task.nextDueDate)}` : 'No due date',
          meta: [task.priority, task.status], status: task.status, href: `${maintenanceHref}&taskId=${encodeURIComponent(task.id)}`,
        })) }], actions: [{ id: 'open-maintenance', label: 'Open Maintenance', href: maintenanceHref, style: 'SECONDARY' }],
      }], suggestions: tasks.slice(0, 3).map((task) => `Update ${task.title}`),
    };
  }
  const action = maintenanceUpdateAction(message);
  const dueDate = extractMaintenanceDueDate(message, new Date(), 'UTC');
  const priority = /\burgent\b/i.test(message) ? MaintenanceTaskPriority.URGENT
    : /\bhigh(?: priority)?\b/i.test(message) ? MaintenanceTaskPriority.HIGH
      : /\blow(?: priority)?\b/i.test(message) ? MaintenanceTaskPriority.LOW
        : /\bmedium(?: priority)?\b/i.test(message) ? MaintenanceTaskPriority.MEDIUM : undefined;
  const assigneeText = message.match(/\bassign\b.{0,20}\bto\s+([^,.;]+)/i)?.[1]?.trim().toLowerCase();
  const assignee = action === 'ASSIGN' && assigneeText
    ? members.find((member) => [member.user.email, member.user.firstName, `${member.user.firstName ?? ''} ${member.user.lastName ?? ''}`.trim()]
      .some((value) => value?.toLowerCase() === assigneeText || value?.toLowerCase().includes(assigneeText)))
    : null;
  if ((action === 'RESCHEDULE' && !dueDate) || (action === 'ASSIGN' && !assignee) || (action === 'EDIT' && !priority)) {
    return {
      status: 'NEEDS_CLARIFICATION', reasonCode: 'MAINTENANCE_UPDATE_VALUE_REQUIRED',
      ...durableFreeTextClarification('MAINTENANCE_TASK_UPDATE', `What should change for ${match.title}?`),
      blocks: [{ type: 'SUMMARY', id: 'maintenance-update-value', title: `What should change for ${match.title}?`, body: action === 'RESCHEDULE'
        ? 'Include a date such as 2026-10-15.'
        : action === 'ASSIGN' ? 'Name an active household member or use their email address.' : 'Specify the new priority: low, medium, high, or urgent.', tone: 'CAUTION', actions: [] }],
      suggestions: action === 'ASSIGN' ? members.slice(0, 3).map((member) => `Assign ${match.title} to ${member.user.email}`) : [],
    };
  }
  const parsed = MaintenanceTaskUpdateInputSchema.parse({
    taskId: match.id, action,
    ...(dueDate ? { nextDueDate: dueDate } : {}), ...(priority ? { priority } : {}),
    ...(action === 'ASSIGN' ? { assigneeUserId: assignee!.userId } : {}),
    ...(action === 'UNASSIGN' ? { assigneeUserId: null } : {}),
  });
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const actionLabel = { EDIT: 'update', RESCHEDULE: 'reschedule', ASSIGN: 'assign', UNASSIGN: 'unassign', ARCHIVE: 'archive', REOPEN: 'reopen' }[action];
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'MAINTENANCE_UPDATE_CONFIRMATION_REQUIRED', contextVersion: maintenanceTaskVersion(match),
    parameters: { maintenanceUpdate: parsed, maintenanceTaskVersion: maintenanceTaskVersion(match), confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'maintenance-update-review', title: `Review this ${actionLabel}`, body: 'No shared-home record has changed yet.', tone: 'DEFAULT', actions: [{ id: 'open-task', label: 'Open task', href: `${maintenanceHref}&taskId=${encodeURIComponent(match.id)}`, style: 'SECONDARY' }] }],
    confirmation: {
      confirmationId: `maintenance-update-${match.id}-1`, version: 1, title: `${actionLabel.charAt(0).toUpperCase()}${actionLabel.slice(1)} ${match.title}?`,
      description: 'This command writes through the canonical Maintenance service and preserves downstream reconciliation.',
      fields: [{ label: 'Task', value: match.title }, { label: 'Action', value: actionLabel },
        ...(dueDate ? [{ label: 'New due date', value: dueDate }] : []), ...(priority ? [{ label: 'New priority', value: priority }] : []),
        ...(assignee ? [{ label: 'Assignee', value: assignee.user.email }] : [])],
      confirmLabel: `Confirm ${actionLabel}`, consentText: `I authorize this ${actionLabel} of the shared Maintenance record.`, expiresAt: expiresAt.toISOString(),
    }, suggestions: [],
  };
}

function serviceCategoryFromMessage(message: string): ServiceCategory | null {
  const categories: Array<[RegExp, ServiceCategory]> = [
    [/\b(?:roof|roofing)\b/i, ServiceCategory.ROOFING], [/\bplumb/i, ServiceCategory.PLUMBING],
    [/\belectric/i, ServiceCategory.ELECTRICAL], [/\b(?:hvac|heating|cooling|furnace|air conditioner)\b/i, ServiceCategory.HVAC],
    [/\b(?:clean|cleaning)\b/i, ServiceCategory.CLEANING], [/\b(?:paint|painting)\b/i, ServiceCategory.PAINTING],
    [/\b(?:landscap|yard)\b/i, ServiceCategory.LANDSCAPING], [/\b(?:appliance)\b/i, ServiceCategory.APPLIANCE_REPAIR],
    [/\b(?:inspect|inspection)\b/i, ServiceCategory.INSPECTION], [/\b(?:warranty)\b/i, ServiceCategory.WARRANTY],
    [/\b(?:insurance|coverage)\b/i, ServiceCategory.INSURANCE],
  ];
  return categories.find(([pattern]) => pattern.test(message))?.[1] ?? null;
}

function maintenanceMonitorSubject(message: string): string {
  return message.toLowerCase()
    .replace(/\b(?:notify|alert|remind|monitor|tell)\s+(?:me|us)?\b/g, ' ')
    .replace(/\b(?:when|before|about|for|my|our|the|is|are|comes?)\b/g, ' ')
    .replace(/\b(?:maintenance|task|due|upcoming|deadline|reminder)\b/g, ' ')
    .replace(/\b\d{1,2}\s*days?\s*(?:before|ahead)?\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

async function quoteComparisonCreateResult(propertyId: string, message: string): Promise<AskOperationResult> {
  const serviceCategory = serviceCategoryFromMessage(message);
  if (!serviceCategory) return {
    status: 'NEEDS_CLARIFICATION', reasonCode: 'QUOTE_COMPARISON_SCOPE_REQUIRED',
    ...durableFreeTextClarification('QUOTE_COMPARISON_CREATE', 'What service are the quotes for?'),
    blocks: [{ type: 'SUMMARY', id: 'quote-workspace-scope', title: 'What service are the quotes for?', body: 'Name the service—such as roofing, plumbing, HVAC, electrical, cleaning, or painting—before creating the comparison workspace.', tone: 'CAUTION', actions: [] }],
    suggestions: ['Create a quote comparison for roofing', 'Create a quote comparison for plumbing'],
  };
  const input = QuoteWorkspaceCommandInputSchema.parse({ serviceCategory, scopeSummary: message.slice(0, 1000) });
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const contextVersion = await quoteWorkspaceContextVersion(propertyId);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'QUOTE_COMPARISON_CONFIRMATION_REQUIRED', contextVersion, parameters: { quoteWorkspace: input, quoteWorkspaceContextVersion: contextVersion, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'quote-workspace-review', title: 'Review this comparison workspace', body: 'No workspace or quote has been created yet.', tone: 'DEFAULT', actions: [] }],
    confirmation: { confirmationId: `quote-workspace-${propertyId}-1`, version: 1, title: 'Create this quote comparison?', description: 'This creates one canonical draft workspace; it does not select a provider or accept a quote.', fields: [{ label: 'Service', value: serviceCategory.toLowerCase().replace(/_/g, ' ') }, { label: 'Scope', value: input.scopeSummary }], confirmLabel: 'Create workspace', consentText: 'I authorize creating this draft comparison workspace for the selected home.', expiresAt: expiresAt.toISOString() }, suggestions: [],
  };
}

async function quoteComparisonReviewResult(propertyId: string): Promise<AskOperationResult> {
  const latest = await prisma.quoteComparisonWorkspace.findFirst({ where: { propertyId }, orderBy: { updatedAt: 'desc' }, select: { id: true } });
  const href = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/quote-comparison`;
  if (!latest) return {
    status: 'READY_WITH_LIMITATIONS', reasonCode: 'QUOTE_COMPARISON_NOT_STARTED',
    blocks: [{ type: 'SUMMARY', id: 'quote-review-empty', title: 'No quote comparison is recorded yet', body: 'Create a workspace and add at least two proposals. Ask will not compare unrecorded prices or infer missing scope and terms.', tone: 'CAUTION', actions: [{ id: 'create-comparison', label: 'Create comparison workspace', href, style: 'PRIMARY' }] }],
    suggestions: ['Create a quote comparison workspace for roofing bids'],
  };
  const [workspace, comparability] = await Promise.all([
    getQuoteComparisonWorkspace(propertyId, latest.id), getWorkspaceComparability(propertyId, latest.id),
  ]);
  if (!workspace) throw new Error('Quote comparison workspace is unavailable.');
  const quotes = (workspace.quotes ?? []) as Array<any>;
  const comparisonReady = new Set(comparability.eligibleQuoteIds);
  const amounts = quotes.map((quote) => Number(quote.quoteAmount)).filter(Number.isFinite);
  const lowest = amounts.length ? Math.min(...amounts) : null;
  const highest = amounts.length ? Math.max(...amounts) : null;
  const workspaceHref = `${href}?workspaceId=${encodeURIComponent(workspace.id)}`;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'quote-review-summary', title: quotes.length < 2 ? 'Add another proposal before comparing' : comparability.status === 'COMPARABLE' ? `${quotes.length} proposals are ready for a scope-aligned review` : 'The recorded proposals are not safely comparable yet',
    body: `${comparability.reasons.join(' ')}${lowest != null && highest != null ? ` Recorded prices range from ${money(lowest)} to ${money(highest)}.` : ''} A lower total is not automatically a better fit; scope, exclusions, warranty, licensing, insurance, payment terms, and homeowner-confirmed facts remain material.`,
    tone: comparability.status === 'COMPARABLE' ? 'DEFAULT' : 'CAUTION', actions: [{ id: 'open-comparison', label: 'Open quote comparison', href: workspaceHref, style: 'PRIMARY' }],
  }];
  if (quotes.length) blocks.push({
    type: 'TABLE', id: 'quote-review-table', title: 'Recorded proposals', description: 'Ask preserves the canonical readiness state and does not select a provider.',
    columns: [{ key: 'vendor', label: 'Provider' }, { key: 'amount', label: 'Price' }, { key: 'readiness', label: 'Readiness' }, { key: 'scope', label: 'Scope' }],
    rows: quotes.map((quote) => ({ id: quote.id, values: { vendor: quote.vendorName, amount: `${quote.currency ?? 'USD'} ${Number(quote.quoteAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })}`, readiness: comparisonReady.has(quote.id) ? 'Comparison ready' : String(quote.readinessStage ?? 'Needs review').toLowerCase().replace(/_/g, ' '), scope: quote.scopeSummary ?? quote.serviceLabelRaw ?? 'Scope not confirmed' } })), actions: [],
  });
  blocks.push({ type: 'GROUPED_LIST', id: 'quote-review-gaps', title: 'Comparison controls', description: 'Resolve scope or fact gaps in the canonical workspace before making a decision.', sections: [{ id: 'controls', title: comparability.status === 'COMPARABLE' ? 'Aligned comparison' : 'What still needs attention', count: Math.max(1, comparability.reasons.length), items: comparability.reasons.map((reason, index) => ({ id: `quote-reason-${index}`, title: reason, description: null, meta: [], status: comparability.status, href: workspaceHref })) }], actions: [] });
  blocks.push({ type: 'EVIDENCE', id: 'quote-review-evidence', title: 'Proposal freshness', items: quotes.slice(0, 20).map((quote) => ({ label: quote.vendorName, source: quote.sourceType ? `Quote · ${String(quote.sourceType).toLowerCase()}` : 'Recorded quote', observedAt: quote.updatedAt?.toISOString?.() ?? quote.createdAt?.toISOString?.() ?? null })) });
  blocks.push({ type: 'BOUNDARY', id: 'quote-review-boundary', title: 'Comparison support—not provider endorsement', body: 'Verify scope, credentials, insurance, references, permits, warranties, payment milestones, and final terms. Ask does not accept a quote, rank provider trust, or guarantee workmanship.', severity: 'INFO', suggestions: [] });
  return { status: comparability.status === 'COMPARABLE' ? 'ANSWERED' : 'READY_WITH_LIMITATIONS', reasonCode: comparability.status === 'COMPARABLE' ? undefined : `QUOTE_${comparability.status}`, contextVersion: workspace.updatedAt?.toISOString?.() ?? null, blocks, suggestions: ['What makes these quotes incomparable?', 'Open quote comparison'] };
}

async function guidanceJourneyCreateResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const inventory = await prisma.inventoryItem.findMany({ where: { propertyId }, select: { id: true, name: true }, take: 100 });
  const lower = message.toLowerCase();
  const item = inventory.find((candidate) => lower.includes(candidate.name.toLowerCase()));
  let input: z.infer<typeof GuidanceJourneyCommandInputSchema> | null = null;
  if (item) input = GuidanceJourneyCommandInputSchema.parse({ scopeCategory: 'ITEM', scopeId: item.id, issueType: /replace|end of life|aging/i.test(message) ? 'near_end_of_life' : /leak/i.test(message) ? 'leak' : 'maintenance_needed', inventoryItemId: item.id, serviceKey: null, label: item.name });
  else if (/warranty/i.test(message)) input = GuidanceJourneyCommandInputSchema.parse({ scopeCategory: 'SERVICE', scopeId: 'warranty_purchase', issueType: /renew/i.test(message) ? 'warranty_renewal' : 'purchase_warranty', inventoryItemId: null, serviceKey: 'warranty_purchase', label: 'Home warranty' });
  else if (/insurance|coverage/i.test(message)) input = GuidanceJourneyCommandInputSchema.parse({ scopeCategory: 'SERVICE', scopeId: 'insurance_purchase', issueType: /renew/i.test(message) ? 'policy_renewal' : /compare|quote/i.test(message) ? 'compare_rates' : 'purchase_insurance', inventoryItemId: null, serviceKey: 'insurance_purchase', label: 'Home insurance' });
  else if (/clean/i.test(message)) input = GuidanceJourneyCommandInputSchema.parse({ scopeCategory: 'SERVICE', scopeId: 'cleaning_service', issueType: 'arrange_cleaning', inventoryItemId: null, serviceKey: 'cleaning_service', label: 'Cleaning service' });
  else if (/inspect/i.test(message)) input = GuidanceJourneyCommandInputSchema.parse({ scopeCategory: 'SERVICE', scopeId: 'general_inspection', issueType: 'schedule_inspection', inventoryItemId: null, serviceKey: 'general_inspection', label: 'Home inspection' });
  if (!input) return {
    status: 'NEEDS_ENTITY', reasonCode: 'GUIDANCE_JOURNEY_SCOPE_REQUIRED',
    ...durableFreeTextClarification('GUIDANCE_JOURNEY_CREATE', 'What recorded item or approved home service should the guided plan cover?'),
    blocks: [{ type: 'SUMMARY', id: 'journey-scope', title: 'What should the guided plan cover?', body: 'Name a recorded appliance/system, warranty, insurance decision, inspection, or cleaning need. Ask will not start an ungrounded workflow.', tone: 'CAUTION', actions: [] }],
    suggestions: inventory.slice(0, 3).map((candidate) => `Start a guided plan for ${candidate.name}`),
  };
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const contextVersion = await guidanceJourneyContextVersion(propertyId, input);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'GUIDANCE_JOURNEY_CONFIRMATION_REQUIRED', contextVersion, parameters: { guidanceJourney: input, guidanceJourneyContextVersion: contextVersion, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'journey-review', title: 'Review this guided plan', body: 'No journey has been started yet.', tone: 'DEFAULT', actions: [] }],
    confirmation: { confirmationId: `guidance-journey-${propertyId}-1`, version: 1, title: `Start a guided plan for ${input.label}?`, description: 'This creates a canonical, resumable guidance journey for the selected home.', fields: [{ label: 'Scope', value: input.label }, { label: 'Plan type', value: input.issueType.replace(/_/g, ' ') }], confirmLabel: 'Start guided plan', consentText: 'I authorize creating this guided plan in the shared home record.', expiresAt: expiresAt.toISOString() }, suggestions: [],
  };
}

async function homeDeadlineMonitorResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const leadDays = Math.min(90, Math.max(1, Number(message.match(/(\d{1,2})\s*days?\s*(?:before|ahead)/i)?.[1] ?? 30)));
  const warrantyFocus = /warrant/i.test(message);
  const insuranceFocus = /insurance|policy|coverage/i.test(message);
  const maintenanceFocus = /maintenance|task/i.test(message) && !warrantyFocus && !insuranceFocus;
  if (maintenanceFocus) {
    const openTasks = (await PropertyMaintenanceTaskService.getTasksForProperty(userId, propertyId, { includeCompleted: false }))
      .filter((task) => task.status !== MaintenanceTaskStatus.CANCELLED);
    const matchedTask = maintenanceCompletionMatch(maintenanceMonitorSubject(message), openTasks);
    const tasks = openTasks.filter((task) => task.nextDueDate);
    const selected = matchedTask?.nextDueDate ? matchedTask : null;
    const maintenanceHref = `/dashboard/maintenance?propertyId=${encodeURIComponent(propertyId)}`;
    if (matchedTask && !matchedTask.nextDueDate) {
      const contextVersion = await maintenanceWorkflowVersion(propertyId);
      return {
        status: 'NEEDS_CONTEXT', reasonCode: 'MAINTENANCE_MONITOR_DUE_DATE_REQUIRED', contextVersion,
        parameters: { maintenanceWorkflowVersion: contextVersion },
        blocks: [{ type: 'SUMMARY', id: 'maintenance-monitor-date', title: `Add a due date for ${matchedTask.title}`, body: 'The task is recorded but cannot drive a real reminder until it has a future due date. Add it here and Ask will continue to reminder confirmation.', tone: 'DEFAULT', actions: [{ id: 'open-task', label: 'Open task', href: `${maintenanceHref}&taskId=${encodeURIComponent(matchedTask.id)}`, style: 'SECONDARY' }] }],
        captureRequests: [{ requirementId: `maintenance-monitor-date-${contextVersion.slice(0, 20)}`, captureKey: 'HOME_DEADLINE_MAINTENANCE_DUE_DATE', classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', title: 'Maintenance due date', question: `When is ${matchedTask.title} due?`, helpText: 'The date is saved to the canonical Maintenance task and reused by Home Actions and reminder workflows.', inputSchema: { type: 'GROUP', fields: [{ key: 'taskId', label: 'Task', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: matchedTask.title, value: matchedTask.id }] } }, { key: 'nextDueDate', label: 'Due date', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 10 } }] }, currentAnswer: { taskId: matchedTask.id }, allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Saved to the selected Maintenance task', confirmationText: null, expectedContextVersion: contextVersion }],
        suggestions: [],
      };
    }
    if (!selected) return {
      status: 'NEEDS_ENTITY', reasonCode: 'MAINTENANCE_MONITOR_TASK_REQUIRED',
      ...durableFreeTextClarification('HOME_DEADLINE_MONITOR', 'Which dated maintenance task should Ask monitor?'),
      blocks: [{ type: 'GROUPED_LIST', id: 'maintenance-monitor-options', title: 'Choose a dated maintenance task', description: tasks.length ? 'Use the exact task title in your next message. No notification preference has changed.' : 'No open maintenance task with a due date is recorded yet. Add or schedule the task first.', sections: [{ id: 'tasks', title: 'Dated maintenance tasks', count: tasks.length, items: tasks.slice(0, 20).map((task) => ({ id: task.id, title: task.title, description: `Due ${humanDate(task.nextDueDate)}`, meta: [task.priority], status: task.status, href: `${maintenanceHref}&taskId=${encodeURIComponent(task.id)}` })) }], actions: [{ id: 'open-maintenance', label: 'Open Maintenance', href: maintenanceHref, style: 'PRIMARY' }] }],
      suggestions: tasks.slice(0, 3).map((task) => `Remind me when ${task.title} is due`),
    };
    const input = HomeDeadlineMonitorInputSchema.parse({ sourceType: 'MAINTENANCE', sourceId: selected.id, title: selected.title, dueDate: selected.nextDueDate!.toISOString().slice(0, 10), leadDays: 7 });
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'MAINTENANCE_MONITOR_CONFIRMATION_REQUIRED', contextVersion: maintenanceTaskVersion(selected),
      parameters: { homeDeadlineMonitor: input, maintenanceTaskVersion: maintenanceTaskVersion(selected), confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
      blocks: [{ type: 'SUMMARY', id: 'maintenance-monitor-review', title: 'Review maintenance reminders', body: 'The existing dated task already drives in-app reminders. Confirming enables scoped email delivery; it does not create a duplicate task.', tone: 'DEFAULT', actions: [{ id: 'open-task', label: 'Open task', href: `${maintenanceHref}&taskId=${encodeURIComponent(selected.id)}`, style: 'SECONDARY' }] }],
      confirmation: { confirmationId: `maintenance-monitor-${selected.id}-1`, version: 1, title: `Enable reminders for ${selected.title}?`, description: 'The governed reminder worker checks dated maintenance tasks inside its seven-day horizon.', fields: [{ label: 'Task', value: selected.title }, { label: 'Due', value: humanDate(selected.nextDueDate) ?? input.dueDate }, { label: 'Delivery', value: 'In-app plus email' }, { label: 'Reminder window', value: 'Within 7 days of the due date' }], confirmLabel: 'Enable reminders', consentText: 'I consent to receive maintenance deadline reminders by email and in the app.', expiresAt: expiresAt.toISOString() }, suggestions: [],
    };
  }
  const [warranty, policy, policiesMissingExpiry] = await Promise.all([
    warrantyFocus ? prisma.warranty.findFirst({ where: { propertyId, expiryDate: { gt: new Date() } }, orderBy: { expiryDate: 'asc' } }) : null,
    insuranceFocus ? prisma.insurancePolicy.findFirst({ where: { propertyId, expiryDate: { gt: new Date() } }, orderBy: { expiryDate: 'asc' } }) : null,
    insuranceFocus ? prisma.insurancePolicy.findMany({ where: { propertyId, expiryDate: null }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], select: { id: true, carrierName: true, coverageType: true, updatedAt: true } }) : [],
  ]);
  const source = warranty ?? policy;
  if (!source) {
    const contextVersion = createHash('sha256').update(JSON.stringify(policiesMissingExpiry)).digest('hex');
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'EXPIRATION_DATE_REQUIRED', contextVersion,
      parameters: { homeDeadlineCaptureVersion: contextVersion },
      blocks: [{ type: 'SUMMARY', id: 'deadline-source-missing', title: 'Add the expiration date first', body: policiesMissingExpiry.length
        ? 'The policy is recorded, but its expiration date is missing. Add it here and Ask will immediately continue to the reminder review.'
        : 'No future expiration or editable undated policy is recorded. Add the coverage record first, then return to activate a real reminder.', tone: 'CAUTION', actions: [{ id: 'open-coverage', label: 'Review coverage records', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory`, style: 'SECONDARY' }] }],
      captureRequests: policiesMissingExpiry.length ? [{
        requirementId: `home-deadline-expiry-${contextVersion.slice(0, 20)}`,
        captureKey: 'HOME_DEADLINE_EXPIRATION_DATE', classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
        title: 'Policy expiration date', question: 'Which policy should be monitored, and when does it expire?',
        helpText: 'This date is saved to the canonical insurance policy, then reused by Coverage and reminder workflows.',
        inputSchema: { type: 'GROUP', fields: [
          { key: 'policyId', label: 'Policy', required: true, inputSchema: { type: 'SINGLE_SELECT', options: policiesMissingExpiry.map((candidate) => ({ label: `${candidate.carrierName}${candidate.coverageType ? ` — ${candidate.coverageType}` : ''}`, value: candidate.id })) } },
          { key: 'expiryDate', label: 'Expiration date', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 10 } },
        ] },
        currentAnswer: policiesMissingExpiry.length === 1 ? { policyId: policiesMissingExpiry[0].id } : {},
        allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Saved to the selected insurance policy', confirmationText: null,
        expectedContextVersion: contextVersion,
      }] : [], suggestions: [],
    };
  }
  const expiry = source.expiryDate!;
  const due = new Date(expiry.getTime() - leadDays * 86_400_000);
  const sourceType = warranty ? 'WARRANTY' as const : 'INSURANCE_POLICY' as const;
  const provider = warranty ? warranty.providerName : policy!.carrierName;
  const input = HomeDeadlineMonitorInputSchema.parse({ sourceType, sourceId: source.id, title: `Review ${provider} ${warranty ? 'warranty' : 'insurance policy'} before expiration`, dueDate: due.toISOString().slice(0, 10), leadDays });
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_DEADLINE_MONITOR_CONFIRMATION_REQUIRED', parameters: { homeDeadlineMonitor: input, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'deadline-monitor-review', title: 'Review this expiration reminder', body: 'Ask will create a dated canonical Maintenance obligation so the existing governed reminder worker can notify you.', tone: 'DEFAULT', actions: [] }],
    confirmation: { confirmationId: `home-deadline-${source.id}-1`, version: 1, title: `Monitor this ${warranty ? 'warranty' : 'policy'} expiration?`, description: 'This creates one deduplicated reminder task and enables maintenance deadline email preferences for this home.', fields: [{ label: 'Provider', value: provider }, { label: 'Expires', value: expiry.toISOString().slice(0, 10) }, { label: 'Reminder date', value: input.dueDate }, { label: 'Channel', value: 'In-app plus email' }], confirmLabel: 'Activate reminder', consentText: 'I consent to receive this home-deadline reminder by email and in the app.', expiresAt: expiresAt.toISOString() }, suggestions: [],
  };
}

async function maintenanceResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const now = new Date();
  const [tasks, property, financing] = await Promise.all([
    PropertyMaintenanceTaskService.getTasksForProperty(userId, propertyId, { includeCompleted: true }),
    prisma.property.findUnique({ where: { id: propertyId }, select: { timezone: true } }),
    prisma.propertyFinancingProfile.findUnique({ where: { propertyId }, select: { purchaseDate: true } }),
  ]);
  const timeZone = safeTimezone(property?.timezone);
  const { timeframe, missingPurchaseDate } = resolveMaintenanceTimeframe(message, now, timeZone, financing?.purchaseDate ?? null);
  const wantsCompleted = /\b(?:completed|finished|done|completion|service history|what did (?:i|we) complete)\b/i.test(message);
  const wantsOpen = /\b(?:pending|remaining|still|open|overdue|due|upcoming|coming up|needs review|in progress|high priority|highest priority|priority tasks?|before (?:winter|spring|summer|fall|autumn))\b/i.test(message);
  const includeCancelled = /\b(?:cancelled|canceled|archived|dismissed|all records|including cancelled|including canceled)\b/i.test(message);
  const cancelledOnly = /\b(?:cancelled|canceled|archived|dismissed)\b/i.test(message)
    && !/\b(?:including cancelled|including canceled|all records)\b/i.test(message);
  const overdueOnly = /\boverdue|past due\b/i.test(message);
  const dueSoonOnly = /\bdue soon|coming up|upcoming|what(?:'s| is) due\b/i.test(message);
  const highPriorityOnly = /\b(?:urgent|high priority|highest priority|priority tasks?)\b/i.test(message);
  const creationFocus = /\b(?:create|add|schedule|set up)\b.{0,30}\b(?:maintenance(?: task)?|tasks?)\b/i.test(message);
  const scopeTerms = maintenanceScopeTerms(message);
  const normalizedMessage = message.toLowerCase();
  const roomScope = [...new Set(tasks.map((task) => task.room?.name?.trim()).filter((value): value is string => Boolean(value)))]
    .sort((left, right) => right.length - left.length)
    .find((roomName) => normalizedMessage.includes(roomName.toLowerCase())) ?? null;
  const scoped = tasks.filter((task) =>
    (!scopeTerms.length || scopeTerms.some((term) => maintenanceTaskText(task).includes(term)))
    && (!roomScope || task.room?.name === roomScope));

  const active = scoped.filter((task) => task.status !== MaintenanceTaskStatus.COMPLETED && task.status !== MaintenanceTaskStatus.CANCELLED);
  const completed = scoped.filter((task) => task.status === MaintenanceTaskStatus.COMPLETED);
  const cancelled = scoped.filter((task) => task.status === MaintenanceTaskStatus.CANCELLED);
  const dueSoonBoundary = new Date(now.getTime() + 30 * 86_400_000);
  // In a mixed query such as “completed this year and everything still
  // pending,” the time phrase qualifies completion history only.
  const openTimeframe = wantsCompleted && wantsOpen ? null : timeframe;
  const matchesPendingDate = (task: typeof active[number]) => {
    if (overdueOnly) return Boolean(task.nextDueDate && task.nextDueDate < now);
    if (openTimeframe) return Boolean(task.nextDueDate && openTimeframe.matches(task.nextDueDate));
    if (dueSoonOnly) return Boolean(task.nextDueDate && task.nextDueDate >= now && task.nextDueDate <= dueSoonBoundary);
    return true;
  };
  const filteredActive = active.filter(matchesPendingDate).filter((task) => !highPriorityOnly || ['URGENT', 'HIGH'].includes(task.priority));
  const filteredCompleted = completed.filter((task) => !timeframe || Boolean(task.lastCompletedDate && timeframe.matches(task.lastCompletedDate)))
    .filter((task) => !highPriorityOnly || ['URGENT', 'HIGH'].includes(task.priority));
  const showCompleted = !cancelledOnly && (wantsCompleted || (!wantsOpen && !creationFocus));
  const showOpen = !cancelledOnly && (wantsOpen || (!wantsCompleted && !creationFocus) || (wantsCompleted && wantsOpen));
  const maintenanceHref = `/dashboard/maintenance?propertyId=${encodeURIComponent(propertyId)}`;
  const canManage = access.role !== HouseholdRole.VIEWER;

  const recordItem = (task: typeof tasks[number], kind: 'OPEN' | 'COMPLETED' | 'CANCELLED') => {
    const overdue = kind === 'OPEN' && task.nextDueDate && task.nextDueDate < now;
    const cost = kind === 'COMPLETED' ? maintenanceMoney(task.actualCost) : maintenanceMoney(task.estimatedCost);
    return {
      id: task.id,
      title: task.title,
      description: task.description ?? null,
      status: overdue ? 'OVERDUE' : task.status,
      meta: [
        task.inventoryItem?.name ?? task.room?.name ?? task.category ?? task.assetType ?? 'Whole home',
        kind === 'COMPLETED'
          ? task.lastCompletedDate ? `Completed ${maintenanceDate(task.lastCompletedDate, timeZone)}` : 'Completion date not recorded'
          : kind === 'CANCELLED' ? `Cancelled · updated ${maintenanceDate(task.updatedAt, timeZone)}`
            : task.nextDueDate ? `${overdue ? 'Was due' : 'Due'} ${maintenanceDate(task.nextDueDate, timeZone)}` : 'Due date not recorded',
        `${task.priority.toLowerCase()} priority`,
        task.source.toLowerCase().replace(/_/g, ' '),
        cost ? `${kind === 'COMPLETED' ? 'Actual' : 'Estimated'} cost ${cost}` : null,
        task.isRecurring && task.frequency ? `Repeats ${task.frequency.toLowerCase().replace(/_/g, ' ')}` : null,
      ].filter((value): value is string => Boolean(value)),
      href: `${maintenanceHref}&taskId=${encodeURIComponent(task.id)}&from=ask`,
    };
  };

  const sections = [
    ...(showOpen ? [{
      id: overdueOnly ? 'overdue' : dueSoonOnly || openTimeframe ? 'due' : 'open',
      title: overdueOnly ? 'Overdue' : dueSoonOnly || openTimeframe ? `Due ${openTimeframe?.label ?? 'within 30 days'}` : 'Pending and in progress',
      records: filteredActive, kind: 'OPEN' as const,
    }] : []),
    ...(showCompleted ? [{ id: 'completed', title: `Completed${timeframe ? ` ${timeframe.label}` : ''}`, records: filteredCompleted, kind: 'COMPLETED' as const }] : []),
    ...(includeCancelled ? [{ id: 'cancelled', title: 'Cancelled', records: cancelled, kind: 'CANCELLED' as const }] : []),
  ].map((section) => ({
    id: section.id, title: section.title, count: section.records.length,
    items: section.records.slice(0, MAX_RESULT_ITEMS).map((task) => recordItem(task, section.kind)),
  }));
  const displayed = sections.reduce((sum, section) => sum + section.count, 0);
  const overdueCount = active.filter((task) => task.nextDueDate && task.nextDueDate < now).length;
  const unscheduledCount = active.filter((task) => !task.nextDueDate).length;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'maintenance-summary',
    title: creationFocus
      ? canManage ? 'Create the task in Maintenance' : 'A contributor or owner can create this task'
      : displayed ? `${displayed} maintenance record${displayed === 1 ? '' : 's'} match this request` : 'No matching maintenance records were found',
    body: creationFocus
      ? 'Ask has not created anything. The Maintenance workflow collects the schedule, recurrence, priority, and any system link before saving.'
      : `${active.length} open, ${completed.length} completed, and ${overdueCount} overdue task${overdueCount === 1 ? '' : 's'} are recorded in the selected scope. ${unscheduledCount ? `${unscheduledCount} open task${unscheduledCount === 1 ? ' has' : 's have'} no due date. ` : ''}${includeCancelled ? 'Cancelled records are included.' : 'Cancelled records are excluded by default.'}`,
    tone: overdueCount ? 'CAUTION' : 'DEFAULT',
    actions: creationFocus && canManage
      ? [{ id: 'create-maintenance', label: 'Create maintenance task', href: `/dashboard/maintenance-setup?propertyId=${encodeURIComponent(propertyId)}&from=ask`, style: 'PRIMARY' }]
      : [
        { id: 'open-maintenance', label: 'Open maintenance', href: maintenanceHref, style: 'PRIMARY' },
        ...(missingPurchaseDate ? [{ id: 'add-purchase-date', label: 'Add purchase date', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/financing/profile`, style: 'SECONDARY' as const }] : []),
      ],
  }];
  if (!creationFocus) blocks.push({
    type: 'GROUPED_LIST', id: 'maintenance-groups', title: 'Maintenance record',
    description: `${timeframe ? `Date filter: ${timeframe.label} in ${timeZone}. ` : ''}${scopeTerms.length ? `System/category filter: ${scopeTerms[0]}. ` : ''}${roomScope ? `Room filter: ${roomScope}. ` : ''}Showing up to ${MAX_RESULT_ITEMS} items per section.`,
    sections, actions: canManage ? [{ id: 'create-maintenance', label: 'Create a task', href: `/dashboard/maintenance-setup?propertyId=${encodeURIComponent(propertyId)}&from=ask`, style: 'SECONDARY' }] : [],
  });
  const evidenceTasks = [...new Map([...filteredActive, ...filteredCompleted, ...(includeCancelled ? cancelled : [])].map((task) => [task.id, task])).values()];
  if (evidenceTasks.length) blocks.push({
    type: 'EVIDENCE', id: 'maintenance-evidence', title: 'Task sources and freshness',
    items: evidenceTasks.slice(0, 30).map((task) => ({
      label: task.title, source: `Maintenance · ${task.source.toLowerCase().replace(/_/g, ' ')}`, observedAt: task.updatedAt.toISOString(),
    })),
  });
  if (missingPurchaseDate) blocks.push({
    type: 'BOUNDARY', id: 'maintenance-purchase-date-missing', title: 'Purchase date is not recorded',
    body: 'Ask could not apply “since I bought the home,” so the list is unbounded by purchase date. Add the property purchase date in the financing profile, then run this question again.',
    severity: 'CAUTION', suggestions: [],
  });
  blocks.push({
    type: 'BOUNDARY', id: 'maintenance-record-boundary', title: 'Based on recorded tasks',
    body: 'An empty or completed task list is not a professional inspection or proof that no maintenance is needed. Unrecorded work and systems without tasks are outside this result.',
    severity: 'INFO', suggestions: [],
  });

  return {
    status: missingPurchaseDate ? 'READY_WITH_LIMITATIONS' : creationFocus ? (canManage ? 'READY_WITH_LIMITATIONS' : 'BLOCKED') : 'ANSWERED',
    reasonCode: missingPurchaseDate ? 'MAINTENANCE_PURCHASE_DATE_MISSING' : creationFocus ? (canManage ? 'MAINTENANCE_WORKFLOW_REQUIRED' : 'ASK_PERMISSION_REQUIRED') : undefined,
    contextVersion: createHash('sha256').update(JSON.stringify(tasks.map((task) => ({ id: task.id, status: task.status, updatedAt: task.updatedAt })))).digest('hex'),
    blocks,
    suggestions: ['Show overdue tasks only', 'What maintenance is due soon?', 'Create a maintenance task'],
  };
}

const COVERAGE_GROUP_LABELS: Record<CoverageReviewGroup, string> = {
  NO_COVERAGE: 'No coverage confirmed',
  COVERAGE_UNCLEAR: 'Coverage unclear',
  EXPIRED: 'Expired coverage',
  EXPIRING_SOON: 'Expiring within 90 days',
  EVIDENCE_MISSING: 'Evidence missing',
};

function coverageContextLabel(value: string): string {
  const labels: Record<string, string> = {
    ITEM_CONFIRMATION: 'item confirmation', RESPONSIBILITY: 'responsibility', INSTALLATION_YEAR: 'installation year',
    CONDITION: 'condition', REPLACEMENT_VALUE: 'replacement value', COVERAGE_EVIDENCE: 'coverage evidence',
  };
  return labels[value] ?? value.toLowerCase().replace(/_/g, ' ');
}

async function coverageResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const reviewHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory?tab=items&smart=gaps`;
  const allItems = await getCoverageReviewItems(propertyId);
  const expiryFocus = /\b(?:expire|expiring|expiry|renewal)\b/i.test(message);
  const evidenceFocus = /\b(?:evidence|document|proof)\b/i.test(message);
  const largestFocus = /\b(?:largest|highest|biggest|most exposure|expensive|high[ -]?value)\b/i.test(message);
  const focused = (expiryFocus
    ? allItems.filter((item) => item.group === 'EXPIRED' || item.group === 'EXPIRING_SOON')
    : evidenceFocus
      ? allItems.filter((item) => item.group === 'EVIDENCE_MISSING' || item.group === 'COVERAGE_UNCLEAR')
      : allItems)
    .sort((a, b) => largestFocus
      ? (b.exposureCents ?? -1) - (a.exposureCents ?? -1)
      : (a.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER));

  const captureCandidate = focused.find((item) => item.group === 'COVERAGE_UNCLEAR');
  const evaluation = captureCandidate
    ? await evaluateFeatureContext(propertyId, userId, {
      featureKey: 'COVERAGE_INTELLIGENCE', operationKey: 'ASSESS_ITEM_COVERAGE',
      operationInput: {
        inventoryItemId: captureCandidate.inventoryItemId,
        responsibilityScope: captureCandidate.responsibilityScope,
        hasDisclosedEstimate: captureCandidate.replacementValueSource === 'ESTIMATED',
      },
    })
    : null;
  const activeRequirement = evaluation?.requirements[0];
  const canCapture = access.role !== HouseholdRole.VIEWER
    && activeRequirement
    && activeRequirement.capture.actionKey !== 'PERMISSION_REQUIRED';
  const captureRequests: AskCaptureRequest[] = canCapture ? [{
    requirementId: activeRequirement.requirementId,
    captureKey: activeRequirement.capture.captureKey,
    classification: activeRequirement.classification,
    state: activeRequirement.state,
    title: activeRequirement.capture.title,
    question: activeRequirement.capture.question,
    helpText: activeRequirement.capture.helpText ?? null,
    inputSchema: activeRequirement.capture.inputSchema,
    ...(activeRequirement.currentAnswer === undefined ? {} : { currentAnswer: activeRequirement.currentAnswer }),
    allowNotSure: activeRequirement.capture.allowNotSure,
    sensitivity: activeRequirement.capture.sensitivity,
    destinationLabel: 'Saved to this item’s Home Inventory coverage record',
    confirmationText: 'Save this coverage information and rerun the review.',
    expectedContextVersion: evaluation.contextVersion,
  }] : [];

  const grouped = new Map<CoverageReviewGroup, typeof focused>();
  for (const item of focused) grouped.set(item.group, [...(grouped.get(item.group) ?? []), item]);
  const groupOrder: CoverageReviewGroup[] = ['NO_COVERAGE', 'COVERAGE_UNCLEAR', 'EXPIRED', 'EXPIRING_SOON', 'EVIDENCE_MISSING'];
  const sections = groupOrder.flatMap((group) => {
    const records = grouped.get(group) ?? [];
    if (!records.length) return [];
    return [{
      id: group.toLowerCase(), title: COVERAGE_GROUP_LABELS[group], count: records.length,
      items: records.slice(0, MAX_RESULT_ITEMS).map((item) => ({
        id: item.inventoryItemId, title: item.itemName, description: item.detail, status: group,
        meta: [
          item.roomName ?? item.itemCategory?.toLowerCase().replace(/_/g, ' ') ?? 'Home inventory',
          item.exposureCents == null
            ? 'Replacement value not recorded'
            : `${new Intl.NumberFormat('en-US', { style: 'currency', currency: item.currency, maximumFractionDigits: 0 }).format(item.exposureCents / 100)} ${item.replacementValueSource === 'ESTIMATED' ? 'estimated' : 'recorded'} exposure`,
          item.expiryDate ? `${group === 'EXPIRED' ? 'Expired' : 'Expires'} ${humanDate(item.expiryDate)}` : null,
          item.coverageSources.length ? item.coverageSources.join(' + ') : 'No linked policy or warranty',
          item.missingContext.length ? `Needs: ${item.missingContext.map(coverageContextLabel).join(', ')}` : null,
        ].filter((value): value is string => Boolean(value)),
        href: `${reviewHref}&openItemId=${encodeURIComponent(item.inventoryItemId)}`,
      })),
    }];
  });

  const unclearCount = allItems.filter((item) => item.group === 'COVERAGE_UNCLEAR').length;
  const focusedUnclearCount = focused.filter((item) => item.group === 'COVERAGE_UNCLEAR').length;
  const confirmedGapCount = allItems.filter((item) => item.group === 'NO_COVERAGE' || item.group === 'EXPIRED').length;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'coverage-summary',
    title: focused.length ? `${focused.length} item${focused.length === 1 ? '' : 's'} match this coverage review` : 'No matching coverage issue was found',
    body: allItems.length
      ? `${confirmedGapCount} confirmed missing or expired, ${unclearCount} unclear, and ${allItems.filter((item) => item.group === 'EVIDENCE_MISSING').length} missing supporting evidence. Unknown records remain separate from confirmed gaps.`
      : 'No material item-level issue is surfaced from the recorded inventory, policies, warranties, responsibilities, and evidence. This is a record review—not a guarantee that every loss is covered.',
    tone: confirmedGapCount || unclearCount ? 'CAUTION' : focused.length ? 'DEFAULT' : 'POSITIVE',
    actions: [{ id: 'open-coverage', label: 'Review or correct coverage', href: reviewHref, style: 'PRIMARY' }],
  }];
  if (sections.length) blocks.push({
    type: 'GROUPED_LIST', id: 'coverage-groups', title: 'Coverage review',
    description: `${expiryFocus ? 'Showing expired and soon-to-expire records. ' : evidenceFocus ? 'Showing unclear records and missing evidence. ' : ''}Managed-elsewhere and coverage-not-required items are excluded.`,
    sections, actions: [],
  });
  if (focused.length) blocks.push({
    type: 'EVIDENCE', id: 'coverage-evidence', title: 'Sources and freshness',
    items: focused.slice(0, 30).map((item) => ({
      label: item.itemName,
      source: item.coverageSources.length ? `Home Inventory + ${item.coverageSources.join(' + ')}` : 'Home Inventory coverage record',
      observedAt: item.updatedAt.toISOString(),
    })),
  });
  blocks.push({
    type: 'BOUNDARY', id: 'coverage-boundary', title: 'Record review—not a coverage determination',
    body: 'A linked policy or warranty does not prove a particular loss is covered. Review current terms, exclusions, limits, deductibles, and authoritative documents with the provider before relying on protection.',
    severity: 'INFO', suggestions: [],
  });

  return {
    status: captureRequests.length || focusedUnclearCount ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: captureRequests.length
      ? 'COVERAGE_CONTEXT_OPTIONAL'
      : access.role === HouseholdRole.VIEWER && focusedUnclearCount
        ? 'COVERAGE_CONTEXT_WRITE_PERMISSION_REQUIRED'
        : focusedUnclearCount ? 'COVERAGE_STATUS_UNCLEAR' : undefined,
    contextVersion: evaluation?.contextVersion ?? createHash('sha256').update(JSON.stringify(allItems.map((item) => ({ id: item.inventoryItemId, group: item.group, updatedAt: item.updatedAt })))).digest('hex'),
    parameters: captureCandidate ? {
      inventoryItemId: captureCandidate.inventoryItemId,
      responsibilityScope: captureCandidate.responsibilityScope,
      hasDisclosedEstimate: captureCandidate.replacementValueSource === 'ESTIMATED',
    } : undefined,
    captureRequests,
    blocks,
    suggestions: ['Which gaps have the largest exposure?', 'Show warranties expiring soon', 'Which items are missing coverage evidence?'],
  };
}

function yearsSince(value: Date | null): number | null {
  if (!value) return null;
  return Math.max(0, Math.floor((Date.now() - value.getTime()) / (365.25 * 24 * 60 * 60 * 1000)));
}

async function replacementGuidanceResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const allItems = await prisma.inventoryItem.findMany({
    where: { propertyId }, orderBy: [{ isVerified: 'desc' }, { updatedAt: 'desc' }], take: 200,
    select: { id: true, name: true, category: true, assetType: true, brand: true, model: true, condition: true, installedOn: true, purchasedOn: true, expectedExpiryDate: true, updatedAt: true },
  });
  const query = message.toLowerCase().replace(/\b(?:when|should|i|we|repair|replace|replacement|versus|vs|my|our|the|is|it|time|good|to|do)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const aliases = /\b(?:hvac|furnace|air conditioner|heat pump)\b/i.test(message) ? ['hvac', 'furnace', 'air conditioner', 'heat pump']
    : /\b(?:refrigerator|fridge)\b/i.test(message) ? ['refrigerator', 'fridge']
      : /\bwater heater\b/i.test(message) ? ['water heater']
        : /\b(?:roof|roofing)\b/i.test(message) ? ['roof']
          : /\b(?:washer|washing machine)\b/i.test(message) ? ['washer', 'washing machine']
            : /\bdryer\b/i.test(message) ? ['dryer']
              : /\bdishwasher\b/i.test(message) ? ['dishwasher'] : query ? [query] : [];
  const itemText = (item: typeof allItems[number]) => [item.name, item.category, item.assetType, item.brand, item.model].filter(Boolean).join(' ').toLowerCase();
  const items = aliases.length ? allItems.filter((item) => aliases.some((alias) => itemText(item).includes(alias) || alias.includes(item.name.toLowerCase()))) : [];
  if (!items.length) {
    return {
      status: 'READY_WITH_LIMITATIONS',
      reasonCode: 'REPAIR_REPLACE_ITEM_NOT_IN_HOME_RECORD',
      blocks: [{
        type: 'SUMMARY', id: 'repair-replace-no-item', title: 'Choose a recorded appliance or home system first',
        body: `I could not resolve this request to one canonical inventory item. Ask will not manufacture a repair/replace calculation without the item’s condition, lifecycle, cost, and repair history.${allItems.length ? ` This home has ${allItems.length} recorded item${allItems.length === 1 ? '' : 's'}.` : ''}`,
        tone: 'CAUTION',
        actions: [{ id: 'open-inventory', label: allItems.length ? 'Choose from inventory' : 'Add an inventory item', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory`, style: 'PRIMARY' }],
      }],
      suggestions: allItems.slice(0, 3).map((item) => `Should I repair or replace ${item.name}?`),
    };
  }
  if (items.length > 1) {
    return {
      status: 'NEEDS_ENTITY',
      reasonCode: 'MULTIPLE_REPAIR_REPLACE_ITEMS',
      ...durableFreeTextClarification('REPLACEMENT_GUIDANCE', 'Which recorded appliance or home system should Ask analyze?'),
      blocks: [{
        type: 'GROUPED_LIST', id: 'repair-replace-selection', title: 'Which item should I analyze?',
        description: 'Use the item’s exact name, room, brand, or model. Ask will not combine separate systems into one verdict.',
        sections: [{ id: 'matches', title: 'Possible matches', count: items.length, items: items.map((item) => ({
          id: item.id, title: item.name, description: [item.brand, item.model].filter(Boolean).join(' ') || null, status: item.condition, meta: [item.category.toLowerCase().replace(/_/g, ' ')],
          href: `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory?openItemId=${encodeURIComponent(item.id)}`,
        })) }], actions: [],
      }],
      suggestions: items.slice(0, 3).map((item) => `Should I repair or replace ${item.name}?`),
    };
  }

  const item = items[0];
  const evaluation = await evaluateFeatureContext(propertyId, userId, {
    featureKey: 'REPAIR_REPLACE', operationKey: 'RUN_ANALYSIS', operationInput: { inventoryItemId: item.id },
  });
  const captureRequests: AskCaptureRequest[] = access.role === HouseholdRole.VIEWER ? [] : evaluation.requirements.slice(0, 1).map((requirement) => ({
    requirementId: requirement.requirementId,
    captureKey: requirement.capture.captureKey,
    classification: requirement.classification,
    state: requirement.state,
    title: requirement.capture.title,
    question: requirement.capture.question,
    helpText: requirement.capture.helpText ?? null,
    inputSchema: requirement.capture.inputSchema,
    ...(requirement.currentAnswer === undefined ? {} : { currentAnswer: requirement.currentAnswer }),
    allowNotSure: requirement.capture.allowNotSure,
    sensitivity: requirement.capture.sensitivity,
    destinationLabel: 'Saved to this item’s Home Record',
    confirmationText: null,
    expectedContextVersion: evaluation.contextVersion,
  }));
  const analysis = await replaceRepairService.runItemAnalysis(propertyId, item.id, userId, undefined, evaluation.contextVersion);
  const verdict = analysis.verdict.toLowerCase().replace(/_/g, ' ');
  const rows = [
    { id: 'repair', values: { path: 'Estimated next repair', amount: analysis.estimatedNextRepairCostCents == null ? 'Not available' : money(analysis.estimatedNextRepairCostCents / 100), meaning: 'Modeled from category defaults, condition, and recorded repair history' } },
    { id: 'replace', values: { path: 'Estimated replacement', amount: analysis.estimatedReplacementCostCents == null ? 'Not available' : money(analysis.estimatedReplacementCostCents / 100), meaning: 'Planning estimate—not a contractor or retailer quote' } },
    { id: 'risk', values: { path: 'Annual repair risk', amount: analysis.expectedAnnualRepairRiskCents == null ? 'Not available' : money(analysis.expectedAnnualRepairRiskCents / 100), meaning: 'Probability-weighted planning exposure' } },
  ];
  return {
    status: captureRequests.length || analysis.confidence !== 'HIGH' ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: captureRequests.length ? 'LIFECYCLE_CONTEXT_OPTIONAL' : analysis.confidence !== 'HIGH' ? 'REPAIR_REPLACE_CONFIDENCE_LIMITED' : undefined,
    contextVersion: evaluation.contextVersion,
    parameters: { inventoryItemId: item.id },
    captureRequests,
    blocks: [{
      type: 'SUMMARY', id: 'repair-replace-guidance', title: `${item.name}: ${verdict}`,
      body: `${analysis.summary ?? `The canonical model currently indicates ${verdict}.`} Confidence is ${analysis.confidence.toLowerCase()}.${analysis.breakEvenMonths == null ? '' : ` Modeled break-even is about ${analysis.breakEvenMonths} months.`}`,
      tone: ['REPLACE_NOW', 'REPLACE_SOON'].includes(analysis.verdict) ? 'CAUTION' : 'DEFAULT',
      actions: [{ id: 'open-repair-replace', label: 'Open Repair vs Replace', href: `/dashboard/replace-repair?propertyId=${encodeURIComponent(propertyId)}&inventoryItemId=${encodeURIComponent(item.id)}`, style: 'PRIMARY' }],
    }, { type: 'TABLE', id: 'repair-replace-costs', title: 'Modeled decision inputs', description: 'Amounts are planning estimates from the canonical Repair vs Replace engine.', columns: [{ key: 'path', label: 'Measure' }, { key: 'amount', label: 'Amount' }, { key: 'meaning', label: 'How to interpret it' }], rows, actions: [] },
    { type: 'GROUPED_LIST', id: 'repair-replace-trace', title: 'Why the model reached this result', description: 'Decision factors are bounded to the item and its recorded history.', sections: [{ id: 'factors', title: 'Decision factors', count: analysis.decisionTrace.length, items: analysis.decisionTrace.slice(0, 12).map((factor, index) => ({ id: `factor-${index}`, title: factor.label, description: factor.detail, meta: [factor.impact], status: null, href: null })) }], actions: [] },
    { type: 'EVIDENCE', id: 'repair-replace-evidence', title: 'Record and model freshness', items: [{ label: item.name, source: 'Living Home Record and Repair vs Replace engine', observedAt: analysis.computedAt }] },
    { type: 'BOUNDARY', id: 'repair-replace-boundary', title: 'Planning guidance—not a diagnosis or quote', body: 'A qualified technician should diagnose safety, performance, and repairability. Actual repair and replacement prices, efficiency gains, warranties, and code requirements may differ.', severity: 'INFO', suggestions: [] }],
    suggestions: ['How much should I reserve for this item?', 'Show my capital timeline'],
  };
}

function money(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function savingsValue(value: number | null, currency: string, basis: string): string | null {
  if (value == null) return null;
  const amount = currency === 'USD'
    ? money(value)
    : `${currency} ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)}`;
  const suffix = basis === 'MONTHLY' ? '/month' : basis === 'ANNUAL' ? '/year' : basis === 'ONE_TIME' ? ' one-time' : '';
  return `${amount}${suffix}`;
}

async function savingsOpportunitiesResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const workspaceHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/savings-benefits`;
  const realizedFocus = /\b(realized|received|already saved)\b/i.test(message);
  const paybackFocus = /\b(?:fastest|shortest|best) payback\b/i.test(message);
  const [access, homeSavings, benefits, unified, context] = await Promise.all([
    ensurePropertyAccess(userId, propertyId),
    homeSavingsService.getSummary(propertyId, userId),
    hiddenAssetService.getMatchesForProperty(propertyId, userId, {}, { trackView: false }),
    savingsBenefitsUnifiedService.getUnified(propertyId, userId),
    evaluateFeatureContext(propertyId, userId, { featureKey: 'HOME_SAVINGS', operationKey: 'RUN_ANALYSIS' }),
  ]);

  const activeRequirement = context.requirements[0];
  const canImproveContext = access.role !== HouseholdRole.VIEWER;
  const captureSupported = activeRequirement
    && canImproveContext
    && activeRequirement.capture.actionKey !== 'PERMISSION_REQUIRED'
    && activeRequirement.capture.inputSchema.type !== 'RELATIONAL_SELECT_CREATE';
  const captureRequests: AskCaptureRequest[] = captureSupported ? [{
    requirementId: activeRequirement.requirementId,
    captureKey: activeRequirement.capture.captureKey,
    classification: activeRequirement.classification,
    state: activeRequirement.state,
    title: activeRequirement.capture.title,
    question: activeRequirement.capture.question,
    helpText: activeRequirement.capture.helpText ?? null,
    inputSchema: activeRequirement.capture.inputSchema,
    ...(activeRequirement.currentAnswer === undefined ? {} : { currentAnswer: activeRequirement.currentAnswer }),
    allowNotSure: activeRequirement.capture.allowNotSure,
    sensitivity: activeRequirement.capture.sensitivity,
    destinationLabel: 'Saved to this home’s Property Context',
    confirmationText: null,
    expectedContextVersion: context.contextVersion,
  }] : [];

  const recurring = homeSavings.categories
    .filter((category) => category.topOpportunity && category.status === 'FOUND_SAVINGS')
    .map(({ category, topOpportunity }) => {
      const opportunity = topOpportunity!;
      const annual = opportunity.netAnnualSavings ?? opportunity.estimatedAnnualSavings;
      return {
        id: `recurring-${opportunity.id}`,
        title: opportunity.headline,
        description: opportunity.detail,
        meta: [
          category.label,
          annual == null ? null : `Estimated ${money(annual)}/year after modeled switching cost`,
          opportunity.confidence === 'HIGH' ? 'High confidence' : `${opportunity.confidence.toLowerCase()} confidence`,
          opportunity.offerSourceKind === 'ADDRESS_QUALIFIED' ? 'Address-qualified source' : 'Benchmark estimate',
          opportunity.estimatedPaybackMonths == null ? null : `Estimated payback ${opportunity.estimatedPaybackMonths} months`,
        ].filter((value): value is string => Boolean(value)),
        status: opportunity.status,
        href: `${workspaceHref}?family=RECURRING_COST&opportunityId=${encodeURIComponent(opportunity.id)}`,
        paybackMonths: opportunity.estimatedPaybackMonths,
      };
    })
    .sort((left, right) => (left.paybackMonths ?? Number.POSITIVE_INFINITY) - (right.paybackMonths ?? Number.POSITIVE_INFINITY))
    .slice(0, 8)
    .map(({ paybackMonths: _paybackMonths, ...item }) => item);

  const reviewedBenefits = benefits.matches.slice(0, 8).map((match) => {
    const value = match.estimatedValue != null
      ? savingsValue(match.estimatedValue, match.currency, match.benefitPeriod)
      : match.estimatedValueMin != null || match.estimatedValueMax != null
        ? `${match.currency} ${match.estimatedValueMin ?? 0}–${match.estimatedValueMax ?? 'unknown'}`
        : null;
    return {
      id: `benefit-${match.id}`,
      title: match.programName,
      description: match.description,
      meta: [value ? `Estimated ${value}` : 'Value not quantified', match.eligibilityLabel, match.sourceLabel, match.freshnessNote].filter((value): value is string => Boolean(value)),
      status: match.status,
      href: `${workspaceHref}?family=BENEFIT&opportunityId=${encodeURIComponent(match.id)}`,
    };
  });

  const inProgress = unified.inProgress.slice(0, 8).map((item) => ({
    id: `progress-${item.family}-${item.id}`,
    title: item.title,
    description: item.explanation,
    meta: [
      item.family === 'BENEFIT' ? 'Benefit or rebate' : 'Recurring-cost savings',
      savingsValue(item.estimatedValue, item.currency, item.estimatedValueBasis),
      item.deadline ? `Deadline ${humanDate(new Date(item.deadline))}` : null,
    ].filter((value): value is string => Boolean(value)),
    status: item.statusLabel,
    href: item.detailHref,
  }));

  const realized = unified.realized.slice(0, 8).map((item) => ({
    id: `realized-${item.family}-${item.id}`,
    title: item.title,
    description: item.explanation,
    meta: [
      savingsValue(item.realizedValue, item.currency, item.estimatedValueBasis) ?? 'Recorded value not quantified',
      item.verificationState ? `${item.verificationState.toLowerCase()} outcome` : 'Homeowner-recorded outcome',
    ],
    status: 'REALIZED',
    href: item.detailHref,
  }));

  const related = unified.relatedOpportunities.slice(0, 5).map((item) => ({
    id: `related-${item.domain}`,
    title: item.domain === 'PROPERTY_TAX' ? 'Property tax opportunity' : item.domain === 'COVERAGE' ? 'Coverage and premium review' : 'Mortgage refinance review',
    description: item.summary,
    meta: ['Owned by its dedicated ContractToCozy analysis'],
    status: 'RELATED',
    href: item.detailHref,
  }));

  const availableCount = recurring.length + reviewedBenefits.length;
  const hasAnyResult = availableCount + inProgress.length + realized.length + related.length > 0;
  const neverAnalyzed = !homeSavings.propertyContextVersion && benefits.summary.lastScanAt === null;
  const realizedTotal = unified.totals.realizedValueTotal;
  const realizedCurrency = unified.totals.realizedValueCurrency;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'savings-summary',
    title: realizedFocus
      ? unified.totals.realizedCount === 0
        ? 'No realized savings outcome is recorded yet'
        : realizedTotal != null && realizedCurrency
          ? `${unified.totals.realizedCount} realized outcome${unified.totals.realizedCount === 1 ? '' : 's'} totaling ${savingsValue(realizedTotal, realizedCurrency, 'UNKNOWN')}`
          : `${unified.totals.realizedCount} realized savings outcome${unified.totals.realizedCount === 1 ? ' is' : 's are'} recorded across one or more currencies`
      : paybackFocus && recurring[0]
        ? `${recurring[0].title} has the shortest recorded payback estimate`
      : homeSavings.potentialAnnualSavings > 0
      ? `The strongest recorded recurring-cost opportunity is about ${money(homeSavings.potentialAnnualSavings)} per year`
      : availableCount > 0
        ? `${availableCount} savings ${availableCount === 1 ? 'opportunity is' : 'opportunities are'} ready to review`
        : neverAnalyzed
          ? 'Savings analysis has not been completed for this home yet'
          : hasAnyResult
            ? 'Here is the current savings picture for this home'
            : 'No current savings opportunity is recorded—not the same as zero savings',
    body: realizedFocus
      ? unified.totals.realizedCount === 0
        ? 'Realized value is counted only from a recorded RECEIVED outcome; estimates and actions in progress are kept separate.'
        : 'These are recorded RECEIVED outcomes. Verification labels remain visible so homeowner-reported and independently verified values are not conflated.'
      : paybackFocus && recurring[0]
        ? `Its ${recurring[0].meta.find((item) => item.startsWith('Estimated payback'))?.toLowerCase() ?? 'payback estimate is available in Savings and Benefits'}. Payback uses modeled switching friction and is not a provider guarantee.`
      : homeSavings.potentialAnnualSavings > 0
      ? `This is the highest single net annual estimate, not a sum across categories. Ask also found ${reviewedBenefits.length} reviewed benefit or rebate match${reviewedBenefits.length === 1 ? '' : 'es'}, ${inProgress.length} item${inProgress.length === 1 ? '' : 's'} in progress, and ${realized.length} recorded realized outcome${realized.length === 1 ? '' : 's'}. Estimates are not provider quotes or eligibility guarantees.`
      : neverAnalyzed
        ? 'Open Savings and Benefits to run the governed analysis. Ask will not infer that no savings exist from an empty record.'
        : 'The sections below separate available estimates, actions already in progress, verified or homeowner-recorded outcomes, and opportunities owned by other domain tools.',
    tone: homeSavings.potentialAnnualSavings > 0 || availableCount > 0 ? 'POSITIVE' : 'DEFAULT',
    actions: [{ id: 'open-savings', label: neverAnalyzed ? 'Run Savings and Benefits' : 'Open Savings and Benefits', href: workspaceHref, style: 'PRIMARY' }],
  }];

  if (hasAnyResult) {
    blocks.push({
      type: 'GROUPED_LIST', id: 'savings-opportunity-groups', title: 'Savings and benefits',
      description: 'Available estimates are planning signals. Realized value appears only from recorded RECEIVED outcomes.',
      sections: [
        { id: 'recurring', title: 'Recurring-cost opportunities', count: recurring.length, items: recurring },
        { id: 'benefits', title: 'Benefits and rebates to review', count: reviewedBenefits.length, items: reviewedBenefits },
        { id: 'in-progress', title: 'Already in progress', count: unified.totals.inProgressCount, items: inProgress },
        { id: 'realized', title: 'Recorded realized savings', count: unified.totals.realizedCount, items: realized },
        { id: 'related', title: 'Related savings decisions', count: related.length, items: related },
      ].filter((section) => section.count > 0),
      actions: [{ id: 'review-all-savings', label: 'Review all opportunities', href: workspaceHref, style: 'PRIMARY' }],
    });
  }

  const evidenceItems = [
    ...reviewedBenefits.slice(0, 5).map((item, index) => ({
      label: item.title,
      source: benefits.matches[index]?.sourceLabel ?? 'Reviewed Savings and Benefits registry',
      observedAt: benefits.matches[index]?.lastVerifiedAt ?? benefits.matches[index]?.lastEvaluatedAt ?? null,
    })),
    ...(homeSavings.propertyContextVersion ? [{ label: 'Recurring-cost comparison', source: 'Home Savings analysis', observedAt: homeSavings.updatedAt }] : []),
  ];
  if (evidenceItems.length) blocks.push({ type: 'EVIDENCE', id: 'savings-evidence', title: 'Sources and freshness', items: evidenceItems });

  const unsupportedInventoryCapture = canImproveContext && activeRequirement?.capture.inputSchema.type === 'RELATIONAL_SELECT_CREATE';
  const permissionLimited = Boolean(activeRequirement && !canImproveContext);
  return {
    status: captureRequests.length || unsupportedInventoryCapture || permissionLimited ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: captureRequests.length
      ? 'SAVINGS_CONTEXT_OPTIONAL'
      : unsupportedInventoryCapture
        ? 'SAVINGS_INVENTORY_SETUP_AVAILABLE'
        : permissionLimited
          ? 'SAVINGS_CONTEXT_WRITE_PERMISSION_REQUIRED'
          : undefined,
    contextVersion: context.contextVersion,
    captureRequests,
    blocks,
    suggestions: permissionLimited
      ? ['Ask a household owner or contributor to improve the savings context', 'Which opportunity has the fastest payback?']
      : unsupportedInventoryCapture
      ? ['Open Savings and Benefits to add installed systems', 'Which opportunity has the fastest payback?']
      : realizedFocus
        ? ['Which opportunity has the fastest payback?', 'Where else could I save money?']
        : paybackFocus
          ? ['What savings have I already realized?', 'Where else could I save money?']
          : ['Which opportunity has the fastest payback?', 'What savings have I already realized?'],
  };
}

function ownershipCostLens(message: string): OwnershipCostCurrentLens {
  return /\b(?:cash outflow|out[ -]of[ -]pocket|including (?:the )?mortgage principal|total (?:cash|paid|payment)|monthly payment)\b/i.test(message)
    ? 'CASH_OUTFLOW'
    : 'OPERATING_EXPENSE';
}

async function ownershipCostsResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const lens = ownershipCostLens(message);
  const workspaceHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/ownership-costs?view=current&lens=${lens}`;
  const [access, context] = await Promise.all([
    ensurePropertyAccess(userId, propertyId),
    evaluateFeatureContext(propertyId, userId, { featureKey: 'OWNERSHIP_COSTS', operationKey: 'VIEW_ANALYSIS' }),
  ]);
  const activeRequirement = context.requirements[0];
  const canImproveContext = access.role !== HouseholdRole.VIEWER;
  const captureSupported = activeRequirement
    && canImproveContext
    && activeRequirement.capture.actionKey !== 'PERMISSION_REQUIRED'
    && activeRequirement.capture.inputSchema.type !== 'RELATIONAL_SELECT_CREATE';
  const captureRequests: AskCaptureRequest[] = captureSupported ? [{
    requirementId: activeRequirement.requirementId,
    captureKey: activeRequirement.capture.captureKey,
    classification: activeRequirement.classification,
    state: activeRequirement.state,
    title: activeRequirement.capture.title,
    question: activeRequirement.capture.question,
    helpText: activeRequirement.capture.helpText ?? null,
    inputSchema: activeRequirement.capture.inputSchema,
    ...(activeRequirement.currentAnswer === undefined ? {} : { currentAnswer: activeRequirement.currentAnswer }),
    allowNotSure: activeRequirement.capture.allowNotSure,
    sensitivity: activeRequirement.capture.sensitivity,
    destinationLabel: 'Saved to this home’s Property Context',
    confirmationText: null,
    expectedContextVersion: context.contextVersion,
  }] : [];

  let costs: Awaited<ReturnType<typeof ownershipCostReadModelService.getCurrent>>;
  try {
    costs = await ownershipCostReadModelService.getCurrent(propertyId, userId, lens, { refresh: true });
  } catch {
    return {
      status: captureRequests.length ? 'NEEDS_CONTEXT' : 'UNAVAILABLE',
      reasonCode: captureRequests.length ? 'OWNERSHIP_COST_CONTEXT_REQUIRED' : 'OWNERSHIP_COST_SNAPSHOT_UNAVAILABLE',
      contextVersion: context.contextVersion,
      captureRequests,
      blocks: [{
        type: 'SUMMARY', id: 'ownership-costs-unavailable', title: 'A current ownership-cost total is not ready yet',
        body: 'Ask could not load a canonical ownership-cost snapshot. Missing categories are not treated as zero. Improve the home context below or open Ownership Costs to review and refresh its source records.',
        tone: 'CAUTION',
        actions: [{ id: 'open-ownership-costs', label: 'Open Ownership Costs', href: workspaceHref, style: 'PRIMARY' }],
      }],
      suggestions: captureRequests.length ? ['Add this detail and retry automatically'] : ['Open Ownership Costs'],
    };
  }

  const included = costs.categories
    .filter((category) => category.includedInSelectedLens && category.amountCents != null)
    .sort((left, right) => (right.amountCents ?? 0) - (left.amountCents ?? 0));
  const missing = costs.categories.filter((category) =>
    category.includedInSelectedLens
    && category.applicability !== 'NOT_APPLICABLE'
    && category.amountCents == null);
  const categoryFocus = /\b(?:largest|biggest|highest|most expensive|which (?:cost |expense )?categor(?:y|ies))\b/i.test(message);
  const largestCategory = included[0];
  const lensLabel = lens === 'CASH_OUTFLOW' ? 'cash outflow' : 'operating expense';
  const monthly = money(costs.snapshot.monthlyTotalCents / 100);
  const annual = money(costs.snapshot.annualTotalCents / 100);
  const coverageLimited = costs.snapshot.coverageStatus !== 'CREDIBLE'
    || costs.snapshot.lastKnownGood
    || costs.stale.isStale
    || missing.length > 0;
  const permissionLimited = Boolean(activeRequirement && !canImproveContext);

  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'ownership-costs-summary',
    title: categoryFocus && largestCategory?.monthlyAmountCents != null
      ? `${largestCategory.label} is the largest recorded category at about ${money(largestCategory.monthlyAmountCents / 100)} per month`
      : `This home’s recorded ${lensLabel} is about ${monthly} per month`,
    body: `${annual} per year is included in the ${lensLabel} lens.${categoryFocus && largestCategory ? ` ${largestCategory.label} represents ${costs.snapshot.annualTotalCents > 0 ? Math.round(((largestCategory.amountCents ?? 0) / costs.snapshot.annualTotalCents) * 100) : 0}% of that recorded total.` : ''} ${money(costs.evidenceSummary.confirmedAnnualCents / 100)} is supported by confirmed or observed records and ${money(costs.evidenceSummary.estimatedAnnualCents / 100)} is estimated. ${missing.length ? `${missing.length} included categor${missing.length === 1 ? 'y is' : 'ies are'} still missing and not counted as zero.` : 'No included category is currently marked missing.'}`,
    tone: coverageLimited ? 'CAUTION' : 'DEFAULT',
    actions: [{ id: 'open-ownership-costs', label: 'Review Ownership Costs', href: workspaceHref, style: 'PRIMARY' }],
  }, {
    type: 'TABLE', id: 'ownership-cost-categories', title: 'Cost by category',
    description: `Categories included in the ${lensLabel} lens, ordered by annual amount.`,
    columns: [{ key: 'category', label: 'Category' }, { key: 'monthly', label: 'Monthly' }, { key: 'annual', label: 'Annual' }, { key: 'evidence', label: 'Evidence' }],
    rows: included.map((category) => ({
      id: category.category,
      values: {
        category: category.label,
        monthly: category.monthlyAmountCents == null ? 'Unknown' : money(category.monthlyAmountCents / 100),
        annual: category.amountCents == null ? 'Unknown' : money(category.amountCents / 100),
        evidence: `${category.amountKind.toLowerCase().replace(/_/g, ' ')}${category.freshnessStatus === 'CURRENT' ? '' : ` · ${category.freshnessStatus.toLowerCase()}`}`,
      },
    })),
    actions: [],
  }];

  if (missing.length) {
    blocks.push({
      type: 'GROUPED_LIST', id: 'ownership-cost-missing', title: 'Information that could improve this total',
      description: 'These categories are applicable or unresolved, but no amount is currently included.',
      sections: [{
        id: 'missing', title: 'Missing from the selected lens', count: missing.length,
        items: missing.map((category) => ({
          id: category.category,
          title: category.label,
          description: category.missingDependencies.length ? category.missingDependencies.join(' · ') : 'No usable current amount is recorded.',
          meta: [category.correction.label],
          status: 'MISSING',
          href: category.correction.href,
        })),
      }],
      actions: [],
    });
  }

  const evidence = included.slice(0, 10).map((category) => ({
    label: category.label,
    source: category.sourceDomain
      ? `${category.sourceDomain.toLowerCase().replace(/_/g, ' ')} · ${category.evidenceStatus?.toLowerCase().replace(/_/g, ' ') ?? 'evidence status unknown'}`
      : 'Ownership Cost Intelligence',
    observedAt: category.periodEnd ?? costs.snapshot.calculatedAt,
  }));
  if (evidence.length) blocks.push({ type: 'EVIDENCE', id: 'ownership-cost-evidence', title: 'Sources and periods', items: evidence });
  blocks.push({
    type: 'BOUNDARY', id: 'ownership-cost-lens-boundary', title: `${lens === 'CASH_OUTFLOW' ? 'Cash outflow' : 'Operating expense'} lens`,
    body: lens === 'CASH_OUTFLOW'
      ? 'Cash outflow includes recorded mortgage principal, repairs, projects, and reserve contributions when available. Principal builds equity and should not be interpreted as an economic expense.'
      : 'Operating expense excludes mortgage principal, known repairs, capital projects, and reserve contributions. Switch to cash outflow to see those recorded payments when available.',
    severity: 'INFO', suggestions: [],
  });

  return {
    status: captureRequests.length || coverageLimited || permissionLimited ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: captureRequests.length
      ? 'OWNERSHIP_COST_CONTEXT_OPTIONAL'
      : permissionLimited
        ? 'OWNERSHIP_COST_CONTEXT_WRITE_PERMISSION_REQUIRED'
        : coverageLimited
          ? 'OWNERSHIP_COST_COVERAGE_LIMITED'
          : undefined,
    contextVersion: context.contextVersion,
    captureRequests,
    blocks,
    suggestions: lens === 'CASH_OUTFLOW'
      ? ['Show operating expenses only', 'Which category costs the most?', 'Where could I save money?']
      : ['Show cash outflow including mortgage principal', 'Which category costs the most?', 'Where could I save money?'],
  };
}

async function capitalReservePlanResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  const href = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/capital-timeline`;
  const reserveHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/reserve-fund`;
  const [access, capitalContext, reserveContext, property, inventoryCount] = await Promise.all([
    ensurePropertyAccess(userId, propertyId),
    evaluateFeatureContext(propertyId, userId, { featureKey: 'CAPITAL_TIMELINE', operationKey: 'RUN_TIMELINE' }),
    evaluateFeatureContext(propertyId, userId, { featureKey: 'RESERVE_FUND', operationKey: 'RECALCULATE' }),
    prisma.property.findUnique({ where: { id: propertyId }, select: { homeownerProfileId: true } }),
    prisma.inventoryItem.count({ where: { propertyId } }),
  ]);
  const activeRequirement = reserveContext.requirements[0] ?? capitalContext.requirements[0];
  const captureFeature = reserveContext.requirements[0] ? 'RESERVE_FUND' as const : 'CAPITAL_TIMELINE' as const;
  const captureRequests = access.role !== HouseholdRole.VIEWER && activeRequirement
    ? [askCaptureRequest(activeRequirement, activeRequirement === reserveContext.requirements[0] ? reserveContext.contextVersion : capitalContext.contextVersion, 'Saved to the Living Home Record and reused by capital planning', `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory`)]
    : [];
  let analysis: any = await homeCapitalTimelineService.getLatestTimeline(propertyId);
  if (!analysis && property && inventoryCount > 0) {
    analysis = await homeCapitalTimelineService.runTimeline(propertyId, property.homeownerProfileId, 10, { createdByUserId: userId, propertyContextVersion: capitalContext.contextVersion, awaitReserveFundSync: true });
  }
  const fund: any = await homeReserveFundService.getSummary(propertyId);
  const lineItems: any[] = await homeReserveFundService.listLineItems(propertyId, { status: 'ACTIVE' });
  if (!analysis || !Array.isArray(analysis.items) || analysis.items.length === 0) return {
    status: 'NEEDS_CONTEXT', reasonCode: 'CAPITAL_PLAN_INVENTORY_REQUIRED', contextVersion: capitalContext.contextVersion, parameters: { phase5CaptureFeature: captureFeature }, captureRequests,
    blocks: [{ type: 'SUMMARY', id: 'capital-plan-empty', title: 'Add at least one major appliance or system to build a capital plan', body: 'A reserve target without recorded systems would be a generic guess. Add the roof, HVAC, water heater, appliances, or other capital items and Ask will calculate a property-specific timeline.', tone: 'CAUTION', actions: [{ id: 'open-inventory', label: 'Add home systems', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory`, style: 'PRIMARY' }] }],
    suggestions: ['Show my home inventory'],
  };
  const items: any[] = analysis.items;
  const upcoming = items.slice().sort((a, b) => new Date(a.windowStart).getTime() - new Date(b.windowStart).getTime()).slice(0, 12);
  const totalLow = upcoming.reduce((sum, item) => sum + (item.estimatedCostMinCents ?? 0), 0);
  const totalHigh = upcoming.reduce((sum, item) => sum + (item.estimatedCostMaxCents ?? 0), 0);
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'capital-reserve-summary', title: `${upcoming.length} upcoming capital event${upcoming.length === 1 ? '' : 's'} are in the current plan`,
    body: `The modeled cost range for the displayed ${analysis.horizonYears ?? 10}-year horizon is ${money(totalLow / 100)}–${money(totalHigh / 100)}. The canonical reserve plan currently suggests ${money((fund.recommendedMonthlyContributionCents ?? 0) / 100)} per month and records a ${money((fund.currentShortfallCents ?? 0) / 100)} shortfall.`,
    tone: (fund.currentShortfallCents ?? 0) > 0 ? 'CAUTION' : 'DEFAULT', actions: [{ id: 'open-timeline', label: 'Open capital timeline', href, style: 'PRIMARY' }, { id: 'open-reserve', label: 'Open reserve fund', href: reserveHref, style: 'SECONDARY' }],
  }, { type: 'TABLE', id: 'capital-timeline-table', title: 'Upcoming capital windows', description: 'Windows and ranges come from the canonical Home Capital Timeline; they are not failure dates or vendor quotes.', columns: [{ key: 'item', label: 'Item' }, { key: 'window', label: 'Planning window' }, { key: 'cost', label: 'Estimated range' }, { key: 'confidence', label: 'Confidence' }], rows: upcoming.map((item) => ({ id: item.id, values: { item: item.inventoryItem?.name ?? String(item.category).toLowerCase().replace(/_/g, ' '), window: `${humanDate(new Date(item.windowStart))}–${humanDate(new Date(item.windowEnd))}`, cost: item.estimatedCostMinCents == null || item.estimatedCostMaxCents == null ? 'Not available' : `${money(item.estimatedCostMinCents / 100)}–${money(item.estimatedCostMaxCents / 100)}`, confidence: String(item.confidence).toLowerCase() } })), actions: [] },
  { type: 'GROUPED_LIST', id: 'reserve-allocations', title: 'Active reserve allocations', description: 'Allocated amounts are derived from timeline items and the homeowner’s reserve posture.', sections: [{ id: 'allocations', title: 'Funding plan', count: lineItems.length, items: lineItems.slice(0, 20).map((line) => ({ id: line.id, title: line.timelineItem?.inventoryItem?.name ?? String(line.timelineItem?.category ?? 'Capital item').toLowerCase().replace(/_/g, ' '), description: `${money(line.allocatedMonthlyCents / 100)}/month toward ${money(line.targetCostCents / 100)}`, meta: [String(line.status).toLowerCase()], status: line.status, href: reserveHref })) }], actions: [] },
  { type: 'EVIDENCE', id: 'capital-plan-evidence', title: 'Planning sources and freshness', items: upcoming.map((item) => ({ label: item.inventoryItem?.name ?? String(item.category), source: `Home Capital Timeline · ${String(item.confidence).toLowerCase()} confidence`, observedAt: analysis.computedAt?.toISOString?.() ?? String(analysis.computedAt) })) },
  { type: 'BOUNDARY', id: 'capital-plan-boundary', title: 'Planning range—not a guaranteed expense schedule', body: 'Actual condition, inspections, maintenance, local labor and material prices, financing, insurance, and homeowner choices can move timing and cost. Keep emergency savings and capital reserves conceptually separate.', severity: 'INFO', suggestions: [] }];
  return { status: captureRequests.length || analysis.confidence === 'LOW' ? 'READY_WITH_LIMITATIONS' : 'ANSWERED', reasonCode: captureRequests.length ? 'CAPITAL_PLAN_CONTEXT_OPTIONAL' : analysis.confidence === 'LOW' ? 'CAPITAL_PLAN_LOW_CONFIDENCE' : undefined, contextVersion: capitalContext.contextVersion, parameters: { phase5CaptureFeature: captureFeature }, captureRequests, blocks, suggestions: ['Which expense is coming first?', 'Should I repair or replace my oldest system?'] };
}

async function propertyTaxAppealReadinessResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const ground = /\b(?:tax class|classification)\b/i.test(message) ? 'TAX_CLASS' as const : /\bexemption\b/i.test(message) ? 'EXEMPTION' as const : 'ASSESSED_VALUE' as const;
  const context = await evaluateFeatureContext(propertyId, userId, { featureKey: 'TAX_APPEAL', operationKey: 'RUN_ANALYSIS' });
  const requirement = context.requirements[0];
  const href = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/property-tax`;
  const captureRequests = access.role !== HouseholdRole.VIEWER && requirement
    ? [askCaptureRequest(requirement, context.contextVersion, 'Saved to the canonical property-tax and Property Context records', href)] : [];
  const readiness: any = await propertyTaxAppealReadinessService.evaluate(propertyId, userId, ground);
  if (readiness.status === 'NOT_COVERED') return {
    status: 'READY_WITH_LIMITATIONS', reasonCode: 'PROPERTY_TAX_RULE_COVERAGE_UNAVAILABLE', contextVersion: context.contextVersion, captureRequests,
    blocks: [{ type: 'SUMMARY', id: 'tax-readiness-not-covered', title: 'Reviewed appeal rules are not available for this property', body: readiness.reason ?? 'Ask cannot determine filing readiness without an active reviewed jurisdiction rule.', tone: 'CAUTION', actions: [{ id: 'open-property-tax', label: 'Open Property Tax Center', href, style: 'PRIMARY' }] }, { type: 'BOUNDARY', id: 'tax-coverage-boundary', title: 'Verify with the official authority', body: readiness.professionalBoundary, severity: 'INFO', suggestions: [] }], suggestions: ['Show my recorded property-tax facts'],
  };
  const atStake = readiness.taxAtStake;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'tax-readiness-summary', title: readiness.status === 'READY' ? `${readiness.ground?.label ?? ground}: preparation requirements are present` : readiness.status === 'NO_SUPPORTED_GROUND' ? 'The current evidence does not support this reviewed ground' : `${readiness.gaps.length} readiness gap${readiness.gaps.length === 1 ? '' : 's'} remain`,
    body: `${readiness.reason ?? ''}${atStake ? ` The sourced planning range for annual tax at stake is ${money(atStake.low)}–${money(atStake.high)}.` : ''} Readiness does not predict appeal success.`,
    tone: readiness.status === 'READY' ? 'DEFAULT' : 'CAUTION', actions: [{ id: 'open-property-tax', label: 'Open appeal readiness', href: `${href}?section=appeal-readiness&ground=${ground}`, style: 'PRIMARY' }],
  }];
  if (readiness.canonical) blocks.push({ type: 'TABLE', id: 'tax-canonical-facts', title: 'Canonical tax facts used', description: 'Unknown facts remain unknown and are never treated as zero.', columns: [{ key: 'fact', label: 'Fact' }, { key: 'value', label: 'Recorded value' }], rows: [
    ['Tax year', readiness.canonical.taxYear], ['Classification', readiness.canonical.classification], ['Assessed value', readiness.canonical.totalAssessedValue == null ? null : money(readiness.canonical.totalAssessedValue)], ['Taxable value', readiness.canonical.taxableValue == null ? null : money(readiness.canonical.taxableValue)], ['Effective tax rate', readiness.canonical.effectiveTaxRate == null ? null : `${(readiness.canonical.effectiveTaxRate * 100).toFixed(3)}%`],
  ].map(([fact, value], index) => ({ id: `tax-fact-${index}`, values: { fact: String(fact), value: value == null ? 'Not confirmed' : String(value) } })), actions: [] });
  blocks.push({ type: 'GROUPED_LIST', id: 'tax-readiness-gaps', title: readiness.gaps.length ? 'What is still needed' : 'Evidence package', description: `Estimated preparation effort: ${String(readiness.effort).toLowerCase()}.`, sections: [{ id: 'gaps', title: readiness.gaps.length ? 'Readiness gaps' : 'Confirmed evidence', count: readiness.gaps.length || readiness.evidence.length, items: readiness.gaps.length ? readiness.gaps.map((gap: string, index: number) => ({ id: `tax-gap-${index}`, title: gap, description: null, meta: [], status: 'OPEN', href })) : readiness.evidence.map((evidence: any) => ({ id: evidence.id, title: evidence.title, description: evidence.description ?? null, meta: [String(evidence.type).toLowerCase().replace(/_/g, ' ')], status: 'CONFIRMED', href })) }], actions: [] });
  if (readiness.evidence.length || readiness.ruleProfile) blocks.push({ type: 'EVIDENCE', id: 'tax-readiness-evidence', title: 'Rule and evidence provenance', items: [{ label: readiness.ruleProfile?.title ?? 'Reviewed appeal rule', source: readiness.ruleProfile ? `Rule ${readiness.ruleProfile.version}` : 'Property Tax Center', observedAt: readiness.ruleProfile?.reviewedAt?.toISOString?.() ?? readiness.ruleProfile?.reviewedAt ?? readiness.evaluatedAt }, ...readiness.evidence.slice(0, 15).map((evidence: any) => ({ label: evidence.title, source: evidence.sourceUrl ? 'Sourced appeal evidence' : 'Vault-supported appeal evidence', observedAt: evidence.confirmedAt }))] });
  blocks.push({ type: 'BOUNDARY', id: 'tax-readiness-boundary', title: 'Preparation support—not tax, appraisal, or legal advice', body: readiness.professionalBoundary, severity: 'INFO', suggestions: [] });
  return { status: readiness.status === 'READY' && !captureRequests.length ? 'ANSWERED' : 'READY_WITH_LIMITATIONS', reasonCode: readiness.status === 'READY' ? (captureRequests.length ? 'PROPERTY_TAX_CONTEXT_OPTIONAL' : undefined) : `PROPERTY_TAX_${readiness.status}`, contextVersion: context.contextVersion, captureRequests, blocks, suggestions: ['Which tax facts are missing?', 'Open Property Tax Center'] };
}

async function renovationPermitReadinessResult(propertyId: string, message: string): Promise<AskOperationResult> {
  const [cases, permitSummary] = await Promise.all([listRenovationCases(propertyId), permitTrackerService.getPermitSummary(propertyId)]);
  const href = `/dashboard/properties/${encodeURIComponent(propertyId)}/projects`;
  const permitsHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/permits`;
  if (!cases.length) return {
    status: 'NEEDS_CONTEXT', reasonCode: 'RENOVATION_CASE_REQUIRED',
    blocks: [{ type: 'SUMMARY', id: 'renovation-readiness-empty', title: 'Start a governed renovation case before checking readiness', body: `No active renovation case is recorded. The Permit Tracker currently shows ${permitSummary.totalPermits} permit record${permitSummary.totalPermits === 1 ? '' : 's'} and ${permitSummary.openFlags} unresolved flag${permitSummary.openFlags === 1 ? '' : 's'}, but those records cannot establish the scope of new work.`, tone: 'CAUTION', actions: [{ id: 'start-renovation', label: 'Start renovation planning', href, style: 'PRIMARY' }, { id: 'open-permits', label: 'Review permits', href: permitsHref, style: 'SECONDARY' }] }, { type: 'BOUNDARY', id: 'renovation-empty-boundary', title: 'Scope and jurisdiction still control', body: 'Permit, zoning, HOA, licensing, inspection, and safety requirements depend on the exact scope and current authority rules. Absence of a record is not proof that approval is unnecessary.', severity: 'INFO', suggestions: [] }], suggestions: ['What permits are already recorded?'],
  };
  const lower = message.toLowerCase();
  const selected = cases.find((candidate) => lower.includes(candidate.name.toLowerCase())) ?? cases[0];
  let readiness: any;
  try { readiness = await getRenovationReadiness(propertyId, selected.id); } catch { readiness = { summary: { state: 'NOT_EVALUATED', disclaimer: 'Readiness has not been evaluated for the current scope.' }, items: [], project: null }; }
  const summary = readiness.summary ?? {};
  const items: any[] = readiness.items ?? [];
  const blockers = items.filter((item) => item.isBlocking && item.status !== 'SATISFIED');
  const open = items.filter((item) => item.status !== 'SATISFIED');
  const caseHref = `${href}?renovationCaseId=${encodeURIComponent(selected.id)}`;
  const blocks: AskPresentationBlock[] = [{ type: 'SUMMARY', id: 'renovation-readiness-summary', title: summary.state === 'READY' ? `${selected.name} is recorded as ready to start` : summary.state === 'NOT_EVALUATED' ? `${selected.name} needs a current readiness evaluation` : `${blockers.length} blocking item${blockers.length === 1 ? '' : 's'} remain for ${selected.name}`, body: `${summary.disclaimer ?? 'This organizes canonical project records and does not establish legal compliance.'} Permit Tracker: ${permitSummary.activePermits} active permit${permitSummary.activePermits === 1 ? '' : 's'}, ${permitSummary.finaledPermits} finaled, and ${permitSummary.openFlags} unresolved flag${permitSummary.openFlags === 1 ? '' : 's'}.`, tone: summary.state === 'READY' && permitSummary.openFlags === 0 ? 'DEFAULT' : 'CAUTION', actions: [{ id: 'open-case', label: 'Open renovation case', href: caseHref, style: 'PRIMARY' }, { id: 'open-permits', label: 'Open Permit Tracker', href: permitsHref, style: 'SECONDARY' }] }];
  if (items.length) blocks.push({ type: 'GROUPED_LIST', id: 'renovation-readiness-items', title: 'Readiness checklist', description: 'Blocking state is owned by the canonical renovation scope, requirement, compliance, quote, schedule, and evidence records.', sections: [{ id: 'blocking', title: 'Blocking', count: blockers.length, items: blockers.slice(0, 20).map((item) => ({ id: item.id, title: item.title, description: item.reason, meta: [item.exactNextAction, item.evidenceRequired].filter(Boolean), status: item.status, href: caseHref })) }, { id: 'other-open', title: 'Other open items', count: Math.max(0, open.length - blockers.length), items: open.filter((item) => !item.isBlocking).slice(0, 20).map((item) => ({ id: item.id, title: item.title, description: item.reason, meta: [item.exactNextAction].filter(Boolean), status: item.status, href: caseHref })) }].filter((section) => section.count > 0), actions: [] });
  blocks.push({ type: 'EVIDENCE', id: 'renovation-readiness-evidence', title: 'Readiness sources', items: items.slice(0, 25).map((item) => ({ label: item.title, source: String(item.sourceType ?? 'Renovation readiness').toLowerCase().replace(/_/g, ' '), observedAt: item.sourceObservedAt?.toISOString?.() ?? item.derivedAt?.toISOString?.() ?? null })) });
  blocks.push({ type: 'BOUNDARY', id: 'renovation-readiness-boundary', title: 'Project organization—not legal compliance approval', body: 'Confirm current requirements with the permit authority, HOA, licensed professionals, and inspectors. A “ready” app state cannot authorize unsafe work or replace official approval.', severity: 'INFO', suggestions: [] });
  return { status: summary.state === 'READY' && permitSummary.openFlags === 0 ? 'ANSWERED' : 'READY_WITH_LIMITATIONS', reasonCode: summary.state === 'READY' ? (permitSummary.openFlags ? 'PERMIT_FLAGS_OPEN' : undefined) : `RENOVATION_${summary.state ?? 'NOT_READY'}`, contextVersion: selected.updatedAt.toISOString(), blocks, suggestions: cases.length > 1 ? cases.slice(1, 4).map((candidate) => `Is ${candidate.name} ready to start?`) : ['What is blocking this renovation?'] };
}

async function majorEventEntryResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const event = /\b(?:sell|selling|home sale)\b/i.test(message) ? 'SELLING'
    : /\b(?:renovation|remodel)\b/i.test(message) ? 'RENOVATION'
      : /\b(?:claim|storm damage)\b/i.test(message) ? 'CLAIM'
        : /\b(?:aging in place)\b/i.test(message) ? 'AGING_IN_PLACE' : 'MOVING';
  const goal = event === 'SELLING' ? 'prepare my home to sell and organize seller records'
    : event === 'RENOVATION' ? 'plan a renovation, permits, and project tracking'
      : event === 'CLAIM' ? 'review insurance coverage and organize claim evidence'
        : event === 'AGING_IN_PLACE' ? 'plan home improvements and maintenance for aging in place'
          : 'organize home records and prepare for moving';
  const result = await capabilityResult(userId, propertyId, goal);
  result.blocks.unshift({ type: 'SUMMARY', id: 'major-event-entry', title: `${event.toLowerCase().replace(/_/g, ' ')} plan for this home`, body: 'Start with the governed tools below. They reuse the selected home’s verified records and keep material decisions in their owning workflows; nothing has been started or shared automatically.', tone: 'DEFAULT', actions: [] });
  result.blocks.push({ type: 'BOUNDARY', id: 'major-event-boundary', title: 'A guided entry point—not a complete professional checklist', body: 'Legal, tax, insurance, accessibility, safety, transaction, permit, and disclosure requirements can vary. Verify material obligations with the appropriate authority or qualified professional.', severity: 'INFO', suggestions: [] });
  return { ...result, reasonCode: `MAJOR_EVENT_${event}`, suggestions: event === 'SELLING' ? ['Should I sell, hold, or rent?', 'Check sale readiness'] : event === 'RENOVATION' ? ['Is my renovation ready to start?', 'Do I need a permit?'] : ['Summarize my home record', 'What should I do next?'] };
}

const INVENTORY_QUERY_STOP_WORDS = new Set([
  'about', 'appliance', 'appliances', 'details', 'equipment', 'find', 'have', 'home', 'house',
  'information', 'inventory', 'item', 'items', 'know', 'list', 'property', 'record', 'records',
  'show', 'system', 'systems', 'tell', 'that', 'the', 'this', 'what', 'which', 'with', 'your', 'my',
]);

function inventorySearchTokens(message: string): string[] {
  return [...new Set(message.toLowerCase().match(/[a-z0-9]+/g) ?? [])]
    .filter((token) => token.length > 2 && !INVENTORY_QUERY_STOP_WORDS.has(token));
}

function inventoryItemSearchText(item: Awaited<ReturnType<InventoryService['listItems']>>[number]): string {
  return [
    item.name, item.category, item.assetType, item.brand, item.model, item.manufacturer, item.modelNumber,
    item.room?.name, ...(item.tags ?? []),
  ].filter(Boolean).join(' ').toLowerCase();
}

function inventoryMissingFacts(item: Awaited<ReturnType<InventoryService['listItems']>>[number]): string[] {
  return [
    item.brand || item.manufacturer ? null : 'Brand or manufacturer',
    item.model || item.modelNumber ? null : 'Model',
    item.serialNo || item.serialNumber ? null : 'Serial number',
    item.installedOn || item.purchasedOn ? null : 'Install or purchase date',
    item.documents.length ? null : 'Documents',
    item.warrantyId || item.insurancePolicyId || item.coverageEvidenceStatus !== 'UNKNOWN' ? null : 'Coverage evidence',
  ].filter((value): value is string => Boolean(value));
}

function inventoryItemHref(propertyId: string, itemId: string): string {
  return `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory?tab=items&openItemId=${encodeURIComponent(itemId)}`;
}

async function inventoryLookupResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const inventoryHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory?tab=items`;
  const allItems = await inventoryService.listItems(propertyId, {});
  const recordVersion = createHash('sha256').update(JSON.stringify(allItems.map((item) => ({ id: item.id, updatedAt: item.updatedAt })))).digest('hex');
  if (!allItems.length) {
    return {
      status: 'READY_WITH_LIMITATIONS', reasonCode: 'INVENTORY_NOT_RECORDED', contextVersion: recordVersion,
      blocks: [{
        type: 'SUMMARY', id: 'inventory-empty', title: 'No inventory items are recorded for this home yet',
        body: 'An empty Living Home Record does not mean the home has no appliances or systems. Add or scan items before Ask can provide item-specific details or history.',
        tone: 'CAUTION',
        actions: [{ id: 'add-inventory', label: 'Add inventory items', href: `${inventoryHref}&action=add-item&source=ask`, style: 'PRIMARY' }],
      }],
      suggestions: ['Open home inventory'],
    };
  }

  const historyFocus = /\b(?:history|timeline|what happened|repairs?|service(?:d| history)?|maintenance history)\b/i.test(message);
  const incompleteFocus = /\b(?:incomplete|missing (?:details|information|records?)|needs? (?:details|information|completion))\b/i.test(message);
  const lifecycleFocus = /\b(?:end of life|nearing (?:replacement|expiry)|expir(?:e|y|ing)|oldest systems?)\b/i.test(message);
  const categoryFilter = /\bhvac|furnace|air conditioner|heat pump|boiler\b/i.test(message)
    ? 'HVAC'
    : /\bappliances?\b/i.test(message)
      ? 'APPLIANCE'
      : /\broof\b/i.test(message)
        ? 'ROOF_EXTERIOR'
        : null;
  const specificAliases: Array<{ test: RegExp; terms: string[] }> = [
    { test: /\b(?:refrigerator|fridge)\b/i, terms: ['refrigerator', 'fridge'] },
    { test: /\bwater heater\b/i, terms: ['water heater'] },
    { test: /\bwasher\b/i, terms: ['washer', 'washing machine'] },
    { test: /\bdryer\b/i, terms: ['dryer'] },
    { test: /\bdishwasher\b/i, terms: ['dishwasher'] },
  ];
  const specific = specificAliases.find((candidate) => candidate.test.test(message));
  const genericList = /\b(?:inventory|systems?|equipment|appliances?)\b/i.test(message) && !specific && !categoryFilter;
  const tokens = inventorySearchTokens(message);

  let matches = allItems;
  if (categoryFilter === 'HVAC') {
    matches = allItems.filter((item) => item.category === 'HVAC' || /\b(?:hvac|furnace|air conditioner|heat pump|boiler)\b/i.test(inventoryItemSearchText(item)));
  } else if (categoryFilter) {
    matches = allItems.filter((item) => item.category === categoryFilter);
  } else if (specific) {
    matches = allItems.filter((item) => specific.terms.some((term) => inventoryItemSearchText(item).includes(term)));
  } else if (!genericList && tokens.length) {
    const scored = allItems.map((item) => ({
      item,
      score: tokens.reduce((score, token) => score + (inventoryItemSearchText(item).includes(token) ? 1 : 0), 0),
    })).filter((candidate) => candidate.score > 0).sort((left, right) => right.score - left.score || right.item.updatedAt.getTime() - left.item.updatedAt.getTime());
    const topScore = scored[0]?.score ?? 0;
    matches = scored.filter((candidate) => candidate.score === topScore).map((candidate) => candidate.item);
  }

  if (incompleteFocus) {
    matches = matches.filter((item) => inventoryMissingFacts(item).length > 0)
      .sort((left, right) => inventoryMissingFacts(right).length - inventoryMissingFacts(left).length);
  } else if (lifecycleFocus) {
    const horizon = new Date();
    horizon.setUTCFullYear(horizon.getUTCFullYear() + 3);
    matches = matches.filter((item) => item.expectedExpiryDate && item.expectedExpiryDate <= horizon)
      .sort((left, right) => (left.expectedExpiryDate?.getTime() ?? Number.POSITIVE_INFINITY) - (right.expectedExpiryDate?.getTime() ?? Number.POSITIVE_INFINITY));
  }

  if (!matches.length) {
    const focus = incompleteFocus ? 'incomplete inventory records' : lifecycleFocus ? 'items with a recorded end-of-life date in the next three years' : 'a matching inventory record';
    return {
      status: 'ANSWERED', reasonCode: 'INVENTORY_MATCH_NOT_FOUND', contextVersion: recordVersion,
      blocks: [{
        type: 'SUMMARY', id: 'inventory-no-match', title: `I could not find ${focus}`,
        body: `This home has ${allItems.length} visible inventory item${allItems.length === 1 ? '' : 's'}, but none match this request. Ask will not infer an unrecorded appliance or system from general property data.`,
        tone: 'DEFAULT',
        actions: [{ id: 'search-inventory', label: 'Search home inventory', href: inventoryHref, style: 'PRIMARY' }],
      }],
      suggestions: ['List all inventory items', 'Show incomplete inventory records'],
    };
  }

  const needsEntity = matches.length > 1 && (historyFocus || Boolean(specific));
  if (needsEntity) {
    return {
      status: 'NEEDS_ENTITY', reasonCode: 'MULTIPLE_INVENTORY_MATCHES', contextVersion: recordVersion,
      ...durableFreeTextClarification('INVENTORY_LOOKUP', 'Which inventory item do you mean? Add its room, brand, model, or exact name.'),
      blocks: [{
        type: 'GROUPED_LIST', id: 'inventory-entity-selection', title: 'Which inventory item do you mean?',
        description: 'More than one Living Home Record matches this question. Open the intended item, or ask again using its room, brand, or model.',
        sections: [{
          id: 'matches', title: 'Matching records', count: matches.length,
          items: matches.slice(0, MAX_RESULT_ITEMS).map((item) => ({
            id: item.id, title: item.name, description: [item.brand ?? item.manufacturer, item.model ?? item.modelNumber].filter(Boolean).join(' ') || null,
            meta: [item.room?.name, item.category.toLowerCase().replace(/_/g, ' '), `Updated ${humanDate(item.updatedAt) ?? 'date unavailable'}`].filter((value): value is string => Boolean(value)),
            status: item.condition, href: inventoryItemHref(propertyId, item.id),
          })),
        }],
        actions: [],
      }],
      suggestions: ['Open home inventory'],
    };
  }

  const selectedItem = matches.length === 1 ? matches[0] : null;
  const lifecycleEvaluation = selectedItem
    ? await evaluateFeatureContext(propertyId, userId, {
      featureKey: 'REPAIR_REPLACE', operationKey: 'RUN_ANALYSIS', operationInput: { inventoryItemId: selectedItem.id },
    })
    : null;
  const activeRequirement = lifecycleEvaluation?.requirements[0];
  const captureSupported = activeRequirement
    && access.role !== HouseholdRole.VIEWER
    && activeRequirement.capture.actionKey !== 'PERMISSION_REQUIRED'
    && activeRequirement.capture.inputSchema.type !== 'RELATIONAL_SELECT_CREATE';
  const captureRequests: AskCaptureRequest[] = captureSupported && lifecycleEvaluation ? [{
    requirementId: activeRequirement.requirementId,
    captureKey: activeRequirement.capture.captureKey,
    classification: activeRequirement.classification,
    state: activeRequirement.state,
    title: activeRequirement.capture.title,
    question: activeRequirement.capture.question,
    helpText: activeRequirement.capture.helpText ?? null,
    inputSchema: activeRequirement.capture.inputSchema,
    ...(activeRequirement.currentAnswer === undefined ? {} : { currentAnswer: activeRequirement.currentAnswer }),
    allowNotSure: activeRequirement.capture.allowNotSure,
    sensitivity: activeRequirement.capture.sensitivity,
    destinationLabel: 'Saved to this item’s Home Record',
    confirmationText: null,
    expectedContextVersion: lifecycleEvaluation.contextVersion,
  }] : [];

  const shown = matches.slice(0, MAX_RESULT_ITEMS);
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'inventory-summary',
    title: selectedItem ? `Here is what the Home Record contains for ${selectedItem.name}` : `${matches.length} inventory records match this request`,
    body: selectedItem
      ? `${inventoryMissingFacts(selectedItem).length ? `${inventoryMissingFacts(selectedItem).length} important detail${inventoryMissingFacts(selectedItem).length === 1 ? ' is' : 's are'} still missing.` : 'The core identity, lifecycle, document, and coverage fields checked by Ask are present.'} Unknown fields remain unknown and are not inferred by a model.`
      : `${shown.length === matches.length ? 'All matching records are shown.' : `Showing the first ${shown.length}.`} Each row reflects the canonical inventory record.`,
    tone: selectedItem && inventoryMissingFacts(selectedItem).length ? 'CAUTION' : 'DEFAULT',
    actions: [{ id: 'open-inventory', label: 'Open home inventory', href: inventoryHref, style: 'PRIMARY' }],
  }, {
    type: 'GROUPED_LIST', id: 'inventory-results', title: incompleteFocus ? 'Incomplete inventory records' : lifecycleFocus ? 'Recorded lifecycle dates approaching' : 'Inventory details',
    description: lifecycleFocus ? 'Only items with a recorded expected-expiry date within the next three years are included.' : null,
    sections: [{
      id: 'items', title: 'Living Home Record', count: matches.length,
      items: shown.map((item) => {
        const missingFacts = inventoryMissingFacts(item);
        const identity = [item.brand ?? item.manufacturer, item.model ?? item.modelNumber].filter(Boolean).join(' ');
        const lifecycleDate = item.installedOn ?? item.purchasedOn;
        return {
          id: item.id, title: item.name,
          description: incompleteFocus && missingFacts.length ? `Missing: ${missingFacts.join(', ')}` : item.notes,
          meta: [
            item.room?.name ?? item.category.toLowerCase().replace(/_/g, ' '),
            identity || 'Brand/model not recorded',
            lifecycleDate ? `${item.installedOn ? 'Installed' : 'Purchased'} ${humanDate(lifecycleDate)}` : 'Install/purchase date not recorded',
            item.expectedExpiryDate ? `Expected lifecycle date ${humanDate(item.expectedExpiryDate)}` : null,
            `${item.documents.length} document${item.documents.length === 1 ? '' : 's'}`,
            item.isVerified ? 'Verified record' : 'Not verified',
          ].filter((value): value is string => Boolean(value)),
          status: item.condition, href: inventoryItemHref(propertyId, item.id),
        };
      }),
    }],
    actions: [],
  }];

  if (historyFocus && selectedItem) {
    const events = await prisma.homeEvent.findMany({
      where: {
        propertyId, inventoryItemId: selectedItem.id, isCurrent: true, deletedAt: null,
        OR: [{ visibility: { not: 'PRIVATE' } }, { createdById: userId }],
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: MAX_RESULT_ITEMS,
      select: { id: true, type: true, title: true, summary: true, occurredAt: true, datePrecision: true, verificationStatus: true, sourceBadge: true },
    });
    blocks.push({
      type: 'GROUPED_LIST', id: 'inventory-history', title: `${selectedItem.name} history`,
      description: events.length ? 'Current, non-deleted Home Timeline events visible to you.' : 'No visible Home Timeline events are linked to this item yet.',
      sections: [{
        id: 'events', title: 'Timeline', count: events.length,
        items: events.map((event) => ({
          id: event.id, title: event.title, description: event.summary,
          meta: [humanDate(event.occurredAt) ?? 'Date unavailable', event.type.toLowerCase().replace(/_/g, ' '), event.verificationStatus.toLowerCase().replace(/_/g, ' '), event.sourceBadge.toLowerCase().replace(/_/g, ' ')],
          status: event.datePrecision, href: inventoryItemHref(propertyId, selectedItem.id),
        })),
      }],
      actions: [],
    });
  }

  blocks.push({
    type: 'EVIDENCE', id: 'inventory-evidence', title: 'Record freshness',
    items: shown.slice(0, 15).map((item) => ({
      label: item.name,
      source: `Home Inventory · ${item.sourceType.toLowerCase().replace(/_/g, ' ')}${item.verificationSource ? ` · ${item.verificationSource.toLowerCase().replace(/_/g, ' ')}` : ''}`,
      observedAt: item.updatedAt.toISOString(),
    })),
  });

  return {
    status: captureRequests.length || (selectedItem ? inventoryMissingFacts(selectedItem).length > 0 : false) ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: captureRequests.length ? 'INVENTORY_LIFECYCLE_CONTEXT_OPTIONAL' : selectedItem && inventoryMissingFacts(selectedItem).length ? 'INVENTORY_RECORD_INCOMPLETE' : undefined,
    contextVersion: lifecycleEvaluation?.contextVersion ?? recordVersion,
    parameters: selectedItem ? { inventoryItemId: selectedItem.id } : undefined,
    captureRequests,
    blocks,
    suggestions: selectedItem
      ? ['Show missing inventory details', 'Which systems are nearing end of life?', 'List all appliances']
      : ['Show incomplete inventory records', 'Which systems are nearing end of life?', 'List all appliances'],
  };
}

function readablePropertyValue(value: unknown): string {
  if (value === null || value === undefined || value === '' || value === 'UNKNOWN') return 'Not recorded';
  if (typeof value === 'number') return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
  return String(value).toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const PROPERTY_SCOPE_LABELS: Record<string, string> = {
  CORE: 'Core property details', LOCATION: 'Location', STRUCTURE: 'Structure', EXTERIOR: 'Exterior and utilities',
  RESPONSIBILITY: 'Maintenance responsibility', SYSTEMS: 'Home systems', SAFETY: 'Safety', ROOMS: 'Rooms',
  INVENTORY: 'Inventory', OPTIONAL_HOUSEHOLD: 'Optional household context',
};

async function propertySummaryResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const propertyHref = `/dashboard/properties/${encodeURIComponent(propertyId)}`;
  const completenessFocus = /\b(?:complete|completeness|missing from|profile quality)\b/i.test(message);
  const [access, overview, evaluation, property] = await Promise.all([
    ensurePropertyAccess(userId, propertyId),
    getPropertyRecordOverview(propertyId, userId),
    evaluateFeatureContext(propertyId, userId, { featureKey: 'PROPERTY_RECORD_SUMMARY', operationKey: 'VIEW_SUMMARY' }),
    prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true, name: true, address: true, city: true, state: true, zipCode: true, dwellingType: true,
        propertyUse: true, occupancyStatus: true, propertySize: true, yearBuilt: true, bedrooms: true,
        bathrooms: true, heatingType: true, coolingType: true, roofType: true, updatedAt: true,
      },
    }),
  ]);
  if (!property) throw new Error('Property not found.');

  const activeRequirement = evaluation.requirements[0];
  const canImproveContext = access.role !== HouseholdRole.VIEWER;
  const captureSupported = activeRequirement
    && canImproveContext
    && activeRequirement.capture.actionKey !== 'PERMISSION_REQUIRED'
    && activeRequirement.capture.inputSchema.type !== 'RELATIONAL_SELECT_CREATE';
  const captureRequests: AskCaptureRequest[] = captureSupported ? [{
    requirementId: activeRequirement.requirementId,
    captureKey: activeRequirement.capture.captureKey,
    classification: activeRequirement.classification,
    state: activeRequirement.state,
    title: activeRequirement.capture.title,
    question: activeRequirement.capture.question,
    helpText: activeRequirement.capture.helpText ?? null,
    inputSchema: activeRequirement.capture.inputSchema,
    ...(activeRequirement.currentAnswer === undefined ? {} : { currentAnswer: activeRequirement.currentAnswer }),
    allowNotSure: activeRequirement.capture.allowNotSure,
    sensitivity: activeRequirement.capture.sensitivity,
    destinationLabel: 'Saved to this home’s Property Context',
    confirmationText: null,
    expectedContextVersion: evaluation.contextVersion,
  }] : [];

  const context = overview.context.status === 'AVAILABLE' ? overview.context : null;
  const completeness = context?.completeness;
  const percent = completeness?.completenessPercent ?? null;
  const rooms = overview.sections.rooms.status === 'AVAILABLE' ? overview.sections.rooms.data : null;
  const inventory = overview.sections.inventory.status === 'AVAILABLE' ? overview.sections.inventory.data : null;
  const documents = overview.sections.documents.status === 'AVAILABLE' ? overview.sections.documents.data : null;
  const household = overview.sections.household.status === 'AVAILABLE' ? overview.sections.household.data : null;
  const timeline = overview.tools.homeTimeline.status === 'AVAILABLE' ? overview.tools.homeTimeline.data : null;
  const incompleteScopes = (completeness?.scopes ?? [])
    .filter((scope) => scope.completenessPercent < 100)
    .sort((left, right) => left.completenessPercent - right.completenessPercent || left.scope.localeCompare(right.scope));
  const degradedSections = [
    rooms ? null : 'Rooms', inventory ? null : 'Inventory', documents ? null : 'Documents', household ? null : 'Household', context ? null : 'Property Context',
  ].filter((value): value is string => Boolean(value));
  const propertyName = property.name?.trim() || `${property.address}, ${property.city}`;

  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'property-summary',
    title: completenessFocus && percent != null
      ? `${propertyName}’s Property Context is ${percent}% complete`
      : `Here is the current Living Home Record for ${propertyName}`,
    body: `${context ? `${context.knownFactCount} governed property facts are currently known.` : 'Property Context details are temporarily unavailable.'} The record contains ${rooms?.count ?? 'an unknown number of'} room${rooms?.count === 1 ? '' : 's'}, ${inventory?.totalCount ?? 'an unknown number of'} inventory item${inventory?.totalCount === 1 ? '' : 's'}, and ${documents?.totalCount ?? 'an unknown number of'} document${documents?.totalCount === 1 ? '' : 's'}. ${degradedSections.length ? `${degradedSections.join(', ')} could not be fully loaded, so this is a partial summary.` : 'All summary sections loaded successfully.'}`,
    tone: degradedSections.length || (percent != null && percent < 100) ? 'CAUTION' : 'DEFAULT',
    actions: [{ id: 'open-property-record', label: 'Open property record', href: propertyHref, style: 'PRIMARY' }],
  }, {
    type: 'TABLE', id: 'property-core-facts', title: 'Core property facts',
    description: 'Values come from the canonical property record. “Not recorded” is not inferred from other fields.',
    columns: [{ key: 'fact', label: 'Fact' }, { key: 'value', label: 'Recorded value' }],
    rows: [
      { id: 'address', values: { fact: 'Address', value: `${property.address}, ${property.city}, ${property.state} ${property.zipCode}` } },
      { id: 'dwelling', values: { fact: 'Dwelling type', value: readablePropertyValue(property.dwellingType) } },
      { id: 'use', values: { fact: 'Property use', value: readablePropertyValue(property.propertyUse) } },
      { id: 'occupancy', values: { fact: 'Occupancy', value: readablePropertyValue(property.occupancyStatus) } },
      { id: 'year-built', values: { fact: 'Year built', value: readablePropertyValue(property.yearBuilt) } },
      { id: 'size', values: { fact: 'Living area', value: property.propertySize == null ? 'Not recorded' : `${new Intl.NumberFormat('en-US').format(property.propertySize)} sq ft` } },
      { id: 'beds-baths', values: { fact: 'Bedrooms / bathrooms', value: `${property.bedrooms == null ? 'Not recorded' : property.bedrooms} / ${property.bathrooms == null ? 'Not recorded' : property.bathrooms}` } },
      { id: 'heating-cooling', values: { fact: 'Heating / cooling', value: `${readablePropertyValue(property.heatingType)} / ${readablePropertyValue(property.coolingType)}` } },
      { id: 'roof', values: { fact: 'Roof type', value: readablePropertyValue(property.roofType) } },
    ],
    actions: [],
  }, {
    type: 'GROUPED_LIST', id: 'property-record-sections', title: 'What the record contains',
    description: 'Counts describe canonical records available to this household member.',
    sections: [{
      id: 'record-sections', title: 'Living Home Record', count: 4,
      items: [
        { id: 'rooms', title: 'Rooms', description: rooms ? `${rooms.count} room record${rooms.count === 1 ? '' : 's'}` : 'Temporarily unavailable', meta: [], status: rooms ? 'AVAILABLE' : 'UNAVAILABLE', href: `${propertyHref}/rooms` },
        { id: 'inventory', title: 'Systems and inventory', description: inventory ? `${inventory.totalCount} items · ${inventory.majorSystemCount} major systems · ${inventory.verifiedCount} verified` : 'Temporarily unavailable', meta: inventory ? [`${inventory.withDocumentCount} with documents`] : [], status: inventory ? 'AVAILABLE' : 'UNAVAILABLE', href: `${propertyHref}/inventory` },
        { id: 'documents', title: 'Documents', description: documents ? `${documents.totalCount} documents · ${documents.verifiedCount} verified · ${documents.needsReviewCount} need review` : 'Temporarily unavailable', meta: documents ? [`${documents.linkedCount} linked to the home or an item`] : [], status: documents ? 'AVAILABLE' : 'UNAVAILABLE', href: `/dashboard/documents?propertyId=${encodeURIComponent(propertyId)}` },
        { id: 'household', title: 'Household access', description: household ? `${household.totalCount} household member${household.totalCount === 1 ? '' : 's'}` : 'Temporarily unavailable', meta: household?.roles.map((role) => `${role.count} ${role.role.toLowerCase()}`) ?? [], status: household ? 'AVAILABLE' : 'UNAVAILABLE', href: `${propertyHref}/household` },
      ],
    }],
    actions: [],
  }];

  if (incompleteScopes.length) {
    blocks.push({
      type: 'GROUPED_LIST', id: 'property-completeness', title: 'Areas that can improve',
      description: 'Internal fact keys are intentionally hidden. Open the property record or answer the inline prompt to add canonical information.',
      sections: [{
        id: 'incomplete-scopes', title: 'Property Context completeness', count: incompleteScopes.length,
        items: incompleteScopes.map((scope) => ({
          id: scope.scope, title: PROPERTY_SCOPE_LABELS[scope.scope] ?? readablePropertyValue(scope.scope),
          description: `${scope.knownFacts} of ${scope.totalFacts} facts known`,
          meta: [`${scope.missingFactKeys.length} missing`, `${scope.conflictedFactKeys.length} conflicted`, `${scope.staleFactKeys.length} stale`],
          status: `${scope.completenessPercent}% COMPLETE`, href: propertyHref,
        })),
      }],
      actions: [],
    });
  }

  if (timeline?.recent.length) {
    blocks.push({
      type: 'GROUPED_LIST', id: 'property-recent-events', title: 'Recent verified home activity',
      description: `${timeline.confirmedCount} current confirmed or evidence-verified event${timeline.confirmedCount === 1 ? '' : 's'} are visible to you. Showing the most recent records.`,
      sections: [{
        id: 'recent-events', title: 'Home Timeline', count: timeline.recent.length,
        items: timeline.recent.map((event) => ({
          id: event.id, title: event.title, description: null,
          meta: [humanDate(event.occurredAt) ?? 'Date unavailable', event.type.toLowerCase().replace(/_/g, ' '), event.verificationStatus.toLowerCase().replace(/_/g, ' '), event.sourceBadge.toLowerCase().replace(/_/g, ' ')],
          status: event.verificationStatus, href: `${propertyHref}/timeline`,
        })),
      }],
      actions: [],
    });
  }

  const freshness = [
    { label: 'Core property record', source: 'Property', observedAt: property.updatedAt.toISOString() },
    ...(documents?.latest ? [{ label: 'Latest document', source: `Documents · ${documents.latest.name}`, observedAt: documents.latest.createdAt.toISOString() }] : []),
    ...(overview.tools.statusBoard.status === 'AVAILABLE' && overview.tools.statusBoard.data.updatedAt
      ? [{ label: 'Systems and inventory', source: 'Home Inventory', observedAt: overview.tools.statusBoard.data.updatedAt.toISOString() }]
      : []),
  ];
  blocks.push({ type: 'EVIDENCE', id: 'property-summary-evidence', title: 'Record freshness', items: freshness });

  const permissionLimited = Boolean(activeRequirement && !canImproveContext);
  const limited = captureRequests.length > 0 || degradedSections.length > 0 || permissionLimited || (percent != null && percent < 100);
  return {
    status: limited ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: captureRequests.length
      ? 'PROPERTY_SUMMARY_CONTEXT_OPTIONAL'
      : permissionLimited
        ? 'PROPERTY_SUMMARY_CONTEXT_WRITE_PERMISSION_REQUIRED'
        : degradedSections.length
          ? 'PROPERTY_SUMMARY_PARTIAL'
          : percent != null && percent < 100
            ? 'PROPERTY_SUMMARY_INCOMPLETE'
            : undefined,
    contextVersion: evaluation.contextVersion,
    captureRequests,
    blocks,
    suggestions: completenessFocus
      ? ['Summarize my home record', 'Show missing inventory details', 'List pending maintenance tasks']
      : ['How complete is my property profile?', 'Show missing inventory details', 'What maintenance is pending?'],
  };
}

function homeActionEmptyCopy(reason: HomeActionEmptyStateReason | null): { title: string; body: string; tone: 'DEFAULT' | 'POSITIVE' | 'CAUTION' } {
  switch (reason) {
    case 'DATA_UNAVAILABLE': return { title: 'Home Actions could not confirm what needs attention', body: 'One or more governed action sources are unavailable. An empty feed is not treated as an all-clear.', tone: 'CAUTION' };
    case 'RECOMMENDATIONS_PAUSED': return { title: 'Personalized Home Actions are paused', body: 'No eligible action is currently surfaced while personalization is paused. Existing home records remain available in their domain workspaces.', tone: 'DEFAULT' };
    case 'SOURCE_EVALUATION_PENDING': return { title: 'Home Action sources are still being evaluated', body: 'No eligible action is ready yet. Ask will not turn pending source evaluation into a recommendation.', tone: 'DEFAULT' };
    case 'MISSING_FACTS': return { title: 'The home record needs more context before actions can be prioritized', body: 'Foundational property facts are incomplete. Add the next detail below and Ask will reevaluate the governed feed.', tone: 'CAUTION' };
    case 'NO_ACCEPTED_WORK': return { title: 'No action is currently ready to surface', body: 'No eligible action or previously accepted operational work is available. This does not guarantee that the home needs nothing.', tone: 'DEFAULT' };
    case 'ALL_CAUGHT_UP': return { title: 'No active Home Action is currently surfaced', body: 'The governed feed found no eligible active action. This is a feed state, not a guarantee that every possible home issue has been ruled out.', tone: 'POSITIVE' };
    default: return { title: 'No Home Action is currently surfaced', body: 'The governed feed is empty. Ask will not interpret system silence as proof that the home needs nothing.', tone: 'DEFAULT' };
  }
}

async function homeActionsResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const homeHref = `/dashboard?propertyId=${encodeURIComponent(propertyId)}`;
  const [access, evaluation] = await Promise.all([
    ensurePropertyAccess(userId, propertyId),
    evaluateFeatureContext(propertyId, userId, { featureKey: 'HOME_ACTIONS', operationKey: 'VIEW_FEED' }),
  ]);
  const activeRequirement = evaluation.requirements[0];
  const canImproveContext = access.role !== HouseholdRole.VIEWER;
  const captureSupported = activeRequirement
    && canImproveContext
    && activeRequirement.capture.actionKey !== 'PERMISSION_REQUIRED'
    && activeRequirement.capture.inputSchema.type !== 'RELATIONAL_SELECT_CREATE';
  const captureRequests: AskCaptureRequest[] = captureSupported ? [{
    requirementId: activeRequirement.requirementId,
    captureKey: activeRequirement.capture.captureKey,
    classification: activeRequirement.classification,
    state: activeRequirement.state,
    title: activeRequirement.capture.title,
    question: activeRequirement.capture.question,
    helpText: activeRequirement.capture.helpText ?? null,
    inputSchema: activeRequirement.capture.inputSchema,
    ...(activeRequirement.currentAnswer === undefined ? {} : { currentAnswer: activeRequirement.currentAnswer }),
    allowNotSure: activeRequirement.capture.allowNotSure,
    sensitivity: activeRequirement.capture.sensitivity,
    destinationLabel: 'Saved to this home’s Property Context',
    confirmationText: null,
    expectedContextVersion: evaluation.contextVersion,
  }] : [];

  let feed: Awaited<ReturnType<typeof getHomeActionFeed>>;
  try {
    feed = await getHomeActionFeed(propertyId, userId);
  } catch {
    return {
      status: 'UNAVAILABLE', reasonCode: 'HOME_ACTION_FEED_UNAVAILABLE', contextVersion: evaluation.contextVersion,
      captureRequests,
      blocks: [{
        type: 'SUMMARY', id: 'home-actions-unavailable', title: 'Home Actions are temporarily unavailable',
        body: 'Ask could not load the final governed action feed. It will not substitute raw signals, model memory, or an unfiltered recommendation.',
        tone: 'CAUTION', actions: [{ id: 'open-home', label: 'Open Home', href: homeHref, style: 'PRIMARY' }],
      }],
      suggestions: ['Summarize my home record', 'What maintenance is pending?'],
    };
  }

  const urgentFocus = /\b(?:urgent|right now|immediately|priority now)\b/i.test(message);
  const soonFocus = /\bsoon\b/i.test(message);
  const planFocus = /\b(?:should i plan|planning|plan for|later)\b/i.test(message);
  const waitFocus = /\b(?:can wait|consider)\b/i.test(message);
  const topFocus = /\b(?:what should i do next|next best action|highest priority|top priorit(?:y|ies)|where should i start)\b/i.test(message);
  const priorityFilter = urgentFocus ? ['NOW'] : soonFocus ? ['SOON'] : planFocus ? ['PLAN'] : waitFocus ? ['PLAN', 'CONSIDER'] : null;
  const selectedActions = (priorityFilter
    ? feed.actions.filter((action) => priorityFilter.includes(action.priority))
    : feed.actions).slice(0, topFocus ? 5 : MAX_RESULT_ITEMS);
  const empty = feed.actions.length === 0 ? homeActionEmptyCopy(feed.diagnostics.emptyStateReason) : null;
  const filteredEmpty = feed.actions.length > 0 && selectedActions.length === 0;
  const lowConfidence = selectedActions.some((action) => action.confidence.label === 'LOW');
  const permissionLimited = Boolean(activeRequirement && !canImproveContext);
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'home-actions-summary',
    title: empty?.title
      ?? (filteredEmpty
        ? `No ${priorityFilter?.map((value) => value.toLowerCase()).join(' or ')} Home Action is currently surfaced`
        : selectedActions.length === 1
          ? selectedActions[0].presentation?.headline ?? selectedActions[0].recommendedAction
          : `${selectedActions.length} governed Home Actions are ready to review`),
    body: empty?.body
      ?? (filteredEmpty
        ? `The full governed feed contains ${feed.actions.length} active action${feed.actions.length === 1 ? '' : 's'}, but none match this timing filter.`
        : `These are the final grounded, deduplicated, lifecycle-eligible actions from Unified Home. ${feed.buckets.NOW.length} need attention now, ${feed.buckets.SOON.length} are due soon, ${feed.buckets.PLAN.length} are for planning, and ${feed.buckets.CONSIDER.length} are optional considerations.`),
    tone: empty?.tone ?? (selectedActions.some((action) => action.priority === 'NOW') ? 'CAUTION' : 'DEFAULT'),
    actions: [{ id: 'open-home-actions', label: 'Open Home Actions', href: homeHref, style: 'PRIMARY' }],
  }];

  if (selectedActions.length) {
    const priorities = ['NOW', 'SOON', 'PLAN', 'CONSIDER'] as const;
    blocks.push({
      type: 'GROUPED_LIST', id: 'home-actions-list', title: 'Prioritized actions',
      description: 'Priority and order come from the canonical Home Action feed. Ask does not independently rerank them.',
      sections: priorities.map((priority) => {
        const actions = selectedActions.filter((action) => action.priority === priority);
        return {
          id: priority.toLowerCase(), title: priority === 'NOW' ? 'Now' : priority === 'SOON' ? 'Soon' : priority === 'PLAN' ? 'Plan' : 'Consider', count: actions.length,
          items: actions.map((action) => ({
            id: action.id,
            title: action.presentation?.headline ?? action.recommendedAction,
            description: action.presentation?.summary ?? action.whyItMatters,
            meta: [
              action.presentation?.eyebrow,
              action.timing.dueAt ? `Due ${humanDate(new Date(action.timing.dueAt))}` : action.timing.rationale,
              `${action.confidence.label.toLowerCase()} confidence`,
              action.source.kind.toLowerCase().replace(/_/g, ' '),
              action.workItem ? `Work ${action.workItem.state.toLowerCase().replace(/_/g, ' ')}` : null,
              action.ranking.explanation,
            ].filter((value): value is string => Boolean(value)),
            status: action.state,
            href: action.primaryCta.href,
          })),
        };
      }).filter((section) => section.count > 0),
      actions: [],
    });

    const evidenceById = new Map<string, { label: string; source: string | null; observedAt: string | null }>();
    for (const action of selectedActions) {
      for (const evidence of action.evidence) {
        if (!evidenceById.has(evidence.id)) evidenceById.set(evidence.id, { label: evidence.label, source: evidence.source, observedAt: evidence.observedAt });
        if (evidenceById.size >= 30) break;
      }
      if (evidenceById.size >= 30) break;
    }
    blocks.push({ type: 'EVIDENCE', id: 'home-actions-evidence', title: 'Evidence used by these actions', items: [...evidenceById.values()] });
    blocks.push({
      type: 'BOUNDARY', id: 'home-actions-boundary', title: 'Review before acting',
      body: 'Ask is showing governed recommendations, not performing the underlying work. Financial, coverage, provider, purchase, scheduling, and other material actions continue in their dedicated workflows with their required review and confirmation controls.',
      severity: 'INFO', suggestions: [],
    });
  }

  const limited = captureRequests.length > 0 || permissionLimited || lowConfidence || feed.diagnostics.emptyStateReason === 'DATA_UNAVAILABLE' || feed.diagnostics.emptyStateReason === 'MISSING_FACTS';
  return {
    status: limited ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: captureRequests.length
      ? 'HOME_ACTION_CONTEXT_OPTIONAL'
      : permissionLimited
        ? 'HOME_ACTION_CONTEXT_WRITE_PERMISSION_REQUIRED'
        : lowConfidence
          ? 'HOME_ACTION_LOW_CONFIDENCE'
          : feed.diagnostics.emptyStateReason ? `HOME_ACTION_${feed.diagnostics.emptyStateReason}` : undefined,
    contextVersion: evaluation.contextVersion,
    captureRequests,
    blocks,
    suggestions: ['Anything urgent?', 'What should I plan?', 'What can wait?'],
  };
}

async function sellHoldRentAnalysisResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  const workspaceHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/sell-hold-rent`;
  const [access, context, analysis] = await Promise.all([
    ensurePropertyAccess(userId, propertyId),
    evaluateFeatureContext(propertyId, userId, { featureKey: 'SELL_HOLD_RENT', operationKey: 'VIEW_ANALYSIS' }),
    sellHoldRentService.estimate(propertyId, { years: 5 }, userId),
  ]);

  const activeRequirement = context.requirements[0];
  const canImproveContext = access.role !== HouseholdRole.VIEWER;
  const captureSupported = activeRequirement
    && canImproveContext
    && activeRequirement.capture.actionKey !== 'PERMISSION_REQUIRED'
    && activeRequirement.capture.inputSchema.type !== 'RELATIONAL_SELECT_CREATE';
  const captureRequests: AskCaptureRequest[] = captureSupported ? [{
    requirementId: activeRequirement.requirementId,
    captureKey: activeRequirement.capture.captureKey,
    classification: activeRequirement.classification,
    state: activeRequirement.state,
    title: activeRequirement.capture.title,
    question: activeRequirement.capture.question,
    helpText: activeRequirement.capture.helpText ?? null,
    inputSchema: activeRequirement.capture.inputSchema,
    ...(activeRequirement.currentAnswer === undefined ? {} : { currentAnswer: activeRequirement.currentAnswer }),
    allowNotSure: activeRequirement.capture.allowNotSure,
    sensitivity: activeRequirement.capture.sensitivity,
    destinationLabel: 'Saved to this home’s Property Context',
    confirmationText: null,
    expectedContextVersion: context.contextVersion,
  }] : [];

  const years = analysis.input.years;
  const winnerLabel = analysis.recommendation.winner === 'SELL'
    ? 'selling'
    : analysis.recommendation.winner === 'HOLD'
      ? 'holding'
      : 'renting the home out';
  const debtKnown = analysis.current.mortgageBalanceNow != null
    && analysis.current.mortgageAnnualRate != null
    && analysis.current.remainingTermMonths != null;
  const lowConfidence = analysis.recommendation.confidence !== 'HIGH';
  const permissionLimited = Boolean(activeRequirement && !canImproveContext);
  const contextLimited = captureRequests.length > 0 || permissionLimited;

  const rows = [{
    id: 'sell',
    values: {
      path: 'Sell at the end of the horizon',
      primary: `${money(analysis.scenarios.sell.netProceeds)} modeled net proceeds`,
      details: `${money(analysis.scenarios.sell.projectedSalePrice)} projected price · ${money(analysis.scenarios.sell.sellingCosts)} selling costs`,
    },
  }, {
    id: 'hold',
    values: {
      path: 'Continue holding',
      primary: `${money(analysis.scenarios.hold.net)} modeled net change`,
      details: `${money(analysis.scenarios.hold.appreciationGain)} appreciation · ${money(analysis.scenarios.hold.totalOwnershipCosts)} ownership and modeled interest costs`,
    },
  }, {
    id: 'rent',
    values: {
      path: 'Rent the home out',
      primary: `${money(analysis.scenarios.rent.net)} modeled net change`,
      details: `${money(analysis.scenarios.rent.totalRentalIncome)} gross rent · ${money(analysis.scenarios.rent.rentalOverheads.vacancyLoss + analysis.scenarios.rent.rentalOverheads.managementFees)} vacancy and management overhead`,
    },
  }];

  const limitations = [
    `Home value ${money(analysis.current.homeValueNow)}`,
    `Rent ${money(analysis.current.monthlyRentNow)}/month`,
    `Appreciation ${(analysis.current.appreciationRate * 100).toFixed(1)}%/year`,
    `Selling costs ${(analysis.current.sellingCostRate * 100).toFixed(1)}%`,
    debtKnown ? 'Mortgage modeled from the home record' : 'Mortgage effects are not fully modeled',
  ];
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY',
    id: 'sell-hold-rent-summary',
    title: `Here is the current ${years}-year sell, hold, and rent comparison`,
    body: `The model’s directional indicator currently points to ${winnerLabel}, but this is not a conclusion that now is the right time to sell. The sell figure is projected liquidity after selling costs and a mortgage payoff when known; hold and rent figures are modeled changes over the horizon, so the totals should not be treated as directly interchangeable investment returns. Confidence is ${analysis.recommendation.confidence.toLowerCase()}.`,
    tone: lowConfidence || contextLimited ? 'CAUTION' : 'DEFAULT',
    actions: [{ id: 'open-sell-hold-rent', label: 'Explore and adjust scenarios', href: workspaceHref, style: 'PRIMARY' }],
  }, {
    type: 'TABLE',
    id: 'sell-hold-rent-comparison',
    title: `${years}-year scenario snapshot`,
    description: 'All amounts are planning estimates. Different scenario rows describe different economic outcomes and should be reviewed with the assumptions below.',
    columns: [{ key: 'path', label: 'Path' }, { key: 'primary', label: 'Modeled outcome' }, { key: 'details', label: 'Key components' }],
    rows,
    actions: [],
  }, {
    type: 'GROUPED_LIST',
    id: 'sell-hold-rent-assumptions',
    title: 'Assumptions that materially affect the answer',
    description: 'Adjust these in Sell / Hold / Rent before relying on the comparison for a major decision.',
    sections: [{
      id: 'assumptions', title: 'Current planning inputs', count: limitations.length,
      items: limitations.map((title, index) => ({ id: `assumption-${index + 1}`, title, description: null, meta: [], status: null, href: workspaceHref })),
    }],
    actions: [],
  }, {
    type: 'EVIDENCE',
    id: 'sell-hold-rent-evidence',
    title: 'Sources used',
    items: analysis.meta.dataSources.map((source, index) => ({
      label: index === 0 ? 'Ownership costs and forecast' : `Planning input source ${index + 1}`,
      source,
      observedAt: analysis.meta.generatedAt,
    })),
  }, {
    type: 'BOUNDARY',
    id: 'sell-hold-rent-boundary',
    title: 'Planning comparison—not financial, tax, legal, or valuation advice',
    body: 'A sale decision can depend on current local demand, a professional valuation, transaction costs, taxes, financing, rental rules, landlord workload, replacement housing, and personal timing. Validate those inputs with qualified professionals before committing.',
    severity: 'INFO',
    suggestions: [],
  }];

  return {
    status: contextLimited || lowConfidence || !debtKnown ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: captureRequests.length
      ? 'SELL_HOLD_RENT_CONTEXT_OPTIONAL'
      : permissionLimited
        ? 'SELL_HOLD_RENT_CONTEXT_WRITE_PERMISSION_REQUIRED'
        : lowConfidence || !debtKnown
          ? 'SELL_HOLD_RENT_ESTIMATED_INPUTS'
          : undefined,
    contextVersion: context.contextVersion,
    captureRequests,
    blocks,
    suggestions: permissionLimited
      ? ['Ask a household owner or contributor to improve the property context', 'Open Sell / Hold / Rent']
      : ['What assumptions matter most?', 'Open Sell / Hold / Rent', 'How much does this home cost each month?'],
  };
}

async function refinanceAnalysisResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  const [profile, financialContext, marketSnapshot] = await Promise.all([
    getProfile(propertyId),
    getFinancialContextDecisions(propertyId, userId, 'REFINANCE_RADAR'),
    mortgageRateService.getLatestSnapshot(),
  ]);
  if (profile?.mortgageStatus === 'NO_MORTGAGE') {
    return {
      status: 'NOT_APPLICABLE', reasonCode: 'NO_MORTGAGE',
      blocks: [{ type: 'SUMMARY', id: 'refinance-not-applicable', title: 'No mortgage is recorded for this home', body: 'A mortgage refinance analysis does not apply unless the financing profile is corrected to show an active mortgage.', tone: 'DEFAULT', actions: [{ id: 'review-financing', label: 'Review financing profile', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/financing/profile`, style: 'SECONDARY' }] }],
      suggestions: ['Show other home savings opportunities'],
    };
  }

  const missing = [
    profile?.currentMortgageBalanceCents == null ? 'currentMortgageBalanceUsd' : null,
    profile?.interestRateBps == null ? 'interestRatePct' : null,
    profile?.remainingTermMonths == null ? 'remainingTermYears' : null,
  ].filter((value): value is string => Boolean(value));
  if (missing.length) {
    const fields = [
      ...(missing.includes('currentMortgageBalanceUsd') ? [{ key: 'currentMortgageBalanceUsd', label: 'Current mortgage balance', helpText: 'An approximate current principal balance is acceptable.', required: true, inputSchema: { type: 'DECIMAL' as const, min: 1_000, max: 100_000_000, unit: 'USD' } }] : []),
      ...(missing.includes('interestRatePct') ? [{ key: 'interestRatePct', label: 'Current interest rate', helpText: 'Enter the note rate on your existing mortgage, not a market quote.', required: true, inputSchema: { type: 'DECIMAL' as const, min: 0.01, max: 30, unit: '%' } }] : []),
      ...(missing.includes('remainingTermYears') ? [{ key: 'remainingTermYears', label: 'Remaining loan term', helpText: 'An estimate in years is fine.', required: true, inputSchema: { type: 'DECIMAL' as const, min: 0.1, max: 50, unit: 'years' } }] : []),
      ...(profile?.monthlyPaymentCents == null ? [{ key: 'monthlyPaymentUsd', label: 'Monthly principal and interest payment', helpText: 'Optional. Leave blank and the analysis will calculate an amortized estimate.', required: false, inputSchema: { type: 'DECIMAL' as const, min: 1, max: 1_000_000, unit: 'USD/month' } }] : []),
    ];
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'MORTGAGE_PROFILE_INCOMPLETE', contextVersion: financialContext.contextVersion,
      parameters: { captureOwner: 'PropertyFinancingProfile' },
      blocks: [{
        type: 'SUMMARY', id: 'refinance-needs-context', title: 'A few mortgage details are needed for a meaningful comparison',
        body: marketSnapshot
          ? `The latest governed 30-year benchmark is ${marketSnapshot.rate30yr.toFixed(3)}% as of ${marketSnapshot.date}. I won’t compare it with an assumed current loan rate or treat missing balances as zero.`
          : 'Your mortgage profile is incomplete, and no governed market-rate snapshot is currently available. Save the loan details now and Ask can use them when a benchmark becomes available.',
        tone: 'CAUTION', actions: [],
      }],
      captureRequests: [{
        requirementId: `refinance-profile-${financialContext.contextVersion.slice(0, 20)}`,
        captureKey: 'FINANCING_PROFILE_REFINANCE_INPUTS', classification: 'REQUIRED_CALCULATION', state: 'UNKNOWN',
        title: 'Complete mortgage details', question: 'Add only the current-loan details needed to compare refinancing options.',
        helpText: 'These values are stored in this home’s Financing Profile and are not sent to an LLM.',
        inputSchema: { type: 'GROUP', fields },
        currentAnswer: {}, allowNotSure: false, sensitivity: 'FINANCIAL',
        destinationLabel: 'Saved to this home’s Financing Profile',
        confirmationText: 'I confirm these mortgage details are accurate enough to save to this home’s Financing Profile.',
        expectedContextVersion: financialContext.contextVersion,
      }],
      suggestions: ['Use the full Financing Profile instead'],
    };
  }

  if (!marketSnapshot) {
    return {
      status: 'UNAVAILABLE', reasonCode: 'MARKET_RATE_UNAVAILABLE', contextVersion: financialContext.contextVersion,
      blocks: [{ type: 'SUMMARY', id: 'refinance-market-unavailable', title: 'A current governed mortgage-rate benchmark is unavailable', body: 'Your loan details are ready, but Ask will not use model knowledge or an undated rate as the market benchmark. Try again after the Mortgage Refinance Radar receives a dated source snapshot.', tone: 'CAUTION', actions: [{ id: 'open-radar', label: 'Open Mortgage Refinance Radar', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/mortgage-refinance-radar`, style: 'PRIMARY' }] }],
      suggestions: ['What rate would make refinancing worth reviewing?'],
    };
  }

  const result = await refinanceRadarService.evaluateProperty(propertyId, financialContext.contextVersion);
  if (!result.available) {
    return { status: 'UNAVAILABLE', reasonCode: result.reason, contextVersion: financialContext.contextVersion, blocks: [{ type: 'SUMMARY', id: 'refinance-analysis-unavailable', title: 'The refinance analysis is not ready', body: 'The Mortgage Refinance Radar could not complete a property-specific comparison. Review the financing profile and try again.', tone: 'CAUTION', actions: [{ id: 'open-profile', label: 'Review financing profile', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/financing/profile`, style: 'PRIMARY' }] }], suggestions: [] };
  }
  const favorable = result.radarState === 'OPEN';
  const rows = [
    { id: 'current-rate', values: { metric: 'Your recorded mortgage rate', value: `${result.currentRatePct.toFixed(3)}%`, meaning: 'Existing loan note rate' } },
    { id: 'market-rate', values: { metric: 'Market benchmark rate', value: `${result.marketRatePct.toFixed(3)}%`, meaning: `National 30-year benchmark as of ${marketSnapshot.date}` } },
    { id: 'target-rate', values: { metric: 'Modeled target scenario rate', value: `${result.marketRatePct.toFixed(3)}%`, meaning: 'Illustrative target set to the latest benchmark—not a lender quote' } },
    { id: 'rate-gap', values: { metric: 'Rate difference', value: `${result.rateGapPct.toFixed(3)} percentage points`, meaning: result.rateGapPct > 0 ? 'Existing rate is higher' : 'Existing rate is not higher' } },
    ...(result.triggerRatePct == null ? [] : [{ id: 'trigger-rate', values: { metric: 'Radar review threshold', value: `${result.triggerRatePct.toFixed(3)}% or lower`, meaning: result.triggerRateExplanation } }]),
    { id: 'monthly-savings', values: { metric: 'Modeled monthly savings', value: money(result.monthlySavings), meaning: 'Principal-and-interest estimate' } },
    { id: 'lifetime-savings', values: { metric: 'Modeled lifetime savings', value: money(result.lifetimeSavings), meaning: 'Interest difference after modeled closing costs' } },
    { id: 'closing-cost', values: { metric: 'Modeled closing costs', value: money(result.closingCostAssumptionUsd), meaning: 'Planning assumption' } },
    { id: 'break-even', values: { metric: 'Estimated break-even', value: result.breakEvenMonths == null ? 'Not reached' : `${result.breakEvenMonths} months`, meaning: 'Time to recover modeled costs' } },
    { id: 'confidence', values: { metric: 'Opportunity confidence', value: result.confidenceLevel ?? 'Not qualified', meaning: 'Based on modeled savings and break-even' } },
  ];
  return {
    status: 'ANSWERED', contextVersion: financialContext.contextVersion,
    blocks: [{
      type: 'SUMMARY', id: 'refinance-analysis-summary', title: favorable ? 'Refinancing may be worth comparing now' : 'Current conditions do not meet the radar’s actionable threshold',
      body: result.radarSummary, tone: favorable ? 'POSITIVE' : 'DEFAULT',
      actions: [{ id: 'open-radar', label: 'Explore refinance scenarios', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/mortgage-refinance-radar`, style: 'PRIMARY' }],
    }, {
      type: 'TABLE', id: 'refinance-analysis-table', title: 'Current loan versus governed benchmark',
      description: 'The benchmark is not a personalized lender offer or guaranteed available rate.',
      columns: [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Estimate' }, { key: 'meaning', label: 'What it represents' }], rows, actions: [],
    }, {
      type: 'EVIDENCE', id: 'refinance-evidence', title: 'Sources used', items: [
        { label: 'Current mortgage details', source: 'Property Financing Profile', observedAt: profile!.mortgageBalanceAsOfDate?.toISOString() ?? profile!.updatedAt.toISOString() },
        { label: '30-year market benchmark', source: `${marketSnapshot.source}${marketSnapshot.sourceRef ? ` · ${marketSnapshot.sourceRef}` : ''}`, observedAt: `${marketSnapshot.date}T00:00:00.000Z` },
      ],
    }, {
      type: 'BOUNDARY', id: 'refinance-boundary', title: 'Planning estimate—not a loan offer', body: 'Actual eligibility, APR, closing costs, taxes, insurance, points, credits, and available rates depend on lender underwriting and a formal Loan Estimate. Compare offers before making a financial commitment.', severity: 'INFO', suggestions: [],
    }],
    suggestions: ['What rate would open a stronger opportunity?', 'Show me the Mortgage Refinance Radar'],
  };
}

function parseRateThreshold(message: string): number | null {
  const match = message.match(/(?:below|under|to|reaches?|hits?)\s*(\d{1,2}(?:\.\d{1,3})?)\s*%/i)
    ?? message.match(/(\d{1,2}(?:\.\d{1,3})?)\s*%/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 && value <= 30 ? value : null;
}

async function refinanceRateMonitorResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const thresholdPct = parseRateThreshold(message);
  if (thresholdPct === null) {
    return {
      status: 'NEEDS_CLARIFICATION', reasonCode: 'RATE_THRESHOLD_REQUIRED',
      ...durableFreeTextClarification('REFINANCE_RATE_MONITOR', 'What mortgage-rate threshold and term should trigger the alert?'),
      blocks: [{ type: 'SUMMARY', id: 'rate-monitor-threshold-needed', title: 'What rate should trigger the alert?', body: 'Enter a mortgage benchmark threshold such as “Notify me when 30-year rates reach 5.5%.”', tone: 'CAUTION', actions: [] }],
      suggestions: ['Notify me when 30-year rates reach 5.5%', 'Notify me when 15-year rates reach 4.75%'],
    };
  }
  const product = /\b15[ -]?year\b/i.test(message) ? RefinanceRateMonitorProduct.FIXED_15_YEAR : RefinanceRateMonitorProduct.FIXED_30_YEAR;
  const preference = await getRefinanceAlertPreference(userId, propertyId);
  if (!preference.recipientInRolloutCohort || !preference.externalDeliveryEnabled) {
    return {
      status: 'UNAVAILABLE', reasonCode: !preference.recipientInRolloutCohort ? 'REFINANCE_ALERT_ROLLOUT_UNAVAILABLE' : 'REFINANCE_ALERT_DELIVERY_UNAVAILABLE',
      blocks: [{ type: 'SUMMARY', id: 'rate-monitor-unavailable', title: 'Email rate alerts are not available for this account yet', body: 'Mortgage Refinance Radar can still show the latest governed benchmark and personalized review threshold in the app. Ask will not claim an external notification is active until delivery eligibility is confirmed.', tone: 'CAUTION', actions: [{ id: 'open-radar', label: 'Open Mortgage Refinance Radar', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/mortgage-refinance-radar`, style: 'PRIMARY' }] }],
      suggestions: ['Is refinancing worth reviewing now?'],
    };
  }
  const confirmationVersion = 1;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const quietStart = preference.quietStart ?? '21:00';
  const quietEnd = preference.quietEnd ?? '07:00';
  const contextVersion = await refinanceMonitorContextVersion(userId, propertyId);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'MONITOR_CONFIRMATION_REQUIRED', contextVersion,
    parameters: {
      thresholdPct, product, channel: 'EMAIL', cadence: 'IMMEDIATE', quietStart, quietEnd,
      timezone: preference.timezone || 'UTC', refinanceMonitorContextVersion: contextVersion, confirmationVersion, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{ type: 'SUMMARY', id: 'rate-monitor-review', title: 'Review this mortgage-rate monitor', body: 'No monitor has been created yet. Confirm the settings below to activate governed benchmark monitoring and email delivery.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `rate-monitor-${propertyId}-${confirmationVersion}`,
      version: confirmationVersion,
      title: 'Start mortgage-rate monitoring?',
      description: 'ContractToCozy will evaluate newly ingested governed mortgage-rate snapshots and notify you when the selected benchmark is at or below your threshold.',
      fields: [
        { label: 'Benchmark', value: product === RefinanceRateMonitorProduct.FIXED_15_YEAR ? '15-year fixed national benchmark' : '30-year fixed national benchmark' },
        { label: 'Threshold', value: `${thresholdPct.toFixed(3)}% or lower` },
        { label: 'Channel', value: 'Email plus in-app notification' },
        { label: 'Cadence', value: 'Immediate when a newly ingested snapshot qualifies' },
        { label: 'Quiet hours', value: `${quietStart}–${quietEnd} (${preference.timezone || 'UTC'})` },
        { label: 'Source boundary', value: 'Governed national benchmark—not a personalized lender quote' },
      ],
      confirmLabel: 'Start monitor',
      consentText: 'I consent to receive refinance threshold notifications by email using these settings.',
      expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

async function capabilityResult(userId: string, propertyId: string | null | undefined, message: string): Promise<AskOperationResult> {
  const exploreToolsHref = propertyId
    ? `/dashboard/properties/${encodeURIComponent(propertyId)}/tools`
    : '/dashboard/home-tools';
  const availability = createToolDiscoveryCapabilityAvailabilityAdapter(canonicalCapabilityRegistry);
  const catalog = buildCapabilityCatalog({
    registry: canonicalCapabilityRegistry,
    availability,
    userId,
    propertyId: propertyId ?? undefined,
    includeWorkflowContext: false,
  });
  const catalogById = new Map(catalog.capabilities.map((capability) => [capability.id, capability]));
  const availableDefinitions = availability.listAvailable({ userId, includeWorkflowOnly: false });
  const allMatches = matchCapabilityGoal({ registry: canonicalCapabilityRegistry, goal: message, limit: 5 });
  const availableMatches = matchCapabilityGoal({
    registry: canonicalCapabilityRegistry,
    goal: message,
    capabilities: availableDefinitions,
    limit: 5,
  });
  const strongest = allMatches.matches[0];
  const strongestAvailable = availableMatches.matches[0];
  const requestedUnavailable = strongest
    && !catalogById.has(strongest.capabilityId)
    && (!strongestAvailable || strongest.score - strongestAvailable.score >= 8);

  if (requestedUnavailable) {
    const capability = canonicalCapabilityRegistry.getById(strongest.capabilityId)!;
    const decision = availability.resolve(capability.id, userId);
    const workflowOnly = capability.destination.workflowOnly;
    return {
      status: 'UNAVAILABLE',
      reasonCode: workflowOnly ? 'CAPABILITY_REQUIRES_WORKFLOW_CONTEXT' : decision.reason ?? 'CAPABILITY_UNAVAILABLE',
      contextVersion: catalog.registryVersion,
      blocks: [{
        type: 'SUMMARY',
        id: 'requested-capability-unavailable',
        title: `${capability.presentation.label} is not available here`,
        body: workflowOnly
          ? 'This capability is offered only from an eligible home workflow where the required source context is present. I will not provide a stale or non-launchable shortcut.'
          : 'This capability is currently disabled, outside your rollout, or has failed a launch-readiness check. I will not recommend a tool that cannot be opened safely.',
        tone: 'CAUTION',
        actions: [{ id: 'explore-available-tools', label: 'Explore available tools', href: exploreToolsHref, style: 'SECONDARY' }],
      }],
      suggestions: ['Show me another available option', 'What can help with this goal instead?'],
    };
  }

  if (!availableMatches.matches.length) {
    return {
      status: 'ANSWERED',
      blocks: [{
        type: 'SUMMARY', id: 'no-capability-match', title: 'Tell me what outcome you want',
        body: 'I could not identify one specific tool yet. Describe the decision, task, risk, savings goal, or major home moment you want help with.',
        tone: 'DEFAULT', actions: [{ id: 'explore-tools', label: 'Explore home tools', href: exploreToolsHref, style: 'SECONDARY' }],
      }],
      suggestions: ['Help me compare contractor quotes', 'I want to plan future replacements', 'Can you monitor refinance rates?'],
    };
  }

  const readiness = propertyId
    ? await getCapabilityDiscoveryReadiness({ propertyId, userId })
    : null;
  const ranked = availableMatches.matches
    .slice(0, availableMatches.ambiguous ? 3 : 2)
    .flatMap((match) => {
      const capability = catalogById.get(match.capabilityId);
      return capability ? [{ capability, match }] : [];
    });
  const card = (capability: CapabilityCatalogItem) => {
    const requiresProperty = capability.readinessRequirements.some((requirement) => requirement.kind === 'PROPERTY');
    const policyReadiness = readiness?.readinessByCapabilityId[capability.id];
    const state = !propertyId && requiresProperty
      ? 'NEEDS_PROPERTY' as const
      : policyReadiness ?? 'READY' as const;
    const reasons = state === 'NEEDS_PROPERTY'
      ? ['Select a home so the capability can use the correct property context.']
      : readiness?.reasonsByCapabilityId[capability.id] ?? [];
    const readinessLabel = state === 'READY'
      ? 'Ready for this home'
      : state === 'NEEDS_PROPERTY'
        ? 'Home selection required'
        : state === 'NEEDS_CONTEXT'
          ? 'More home details will improve the result'
          : 'Not ready for the current context';
    return {
      id: capability.id,
      label: capability.label,
      description: capability.shortDescription,
      expectedOutput: capability.expectedOutput,
      href: capability.href,
      readiness: state,
      readinessLabel,
      readinessReasons: reasons.slice(0, 5),
      releaseStage: capability.releaseStage,
    };
  };
  const blocks: AskPresentationBlock[] = [{
    type: 'CAPABILITY_LIST',
    id: 'capability-matches',
    title: availableMatches.ambiguous ? 'A few tools could fit—choose the closest goal' : 'Best match for your goal',
    description: availableMatches.ambiguous
      ? 'These are close matches from the live capability registry. Nothing was chosen on your behalf.'
      : 'Ranked from reviewed homeowner language, current availability, and canonical readiness policy.',
    capabilities: ranked.map(({ capability }) => card(capability)),
  }];

  if (propertyId && ranked[0]) {
    try {
      const related = await getRelatedCapabilities({
        propertyId,
        userId,
        currentCapabilityId: ranked[0].capability.id,
        limit: 3,
      });
      const selectedIds = new Set(ranked.map(({ capability }) => capability.id));
      const relatedCards = related.suggestions
        .filter((suggestion) => !selectedIds.has(suggestion.capabilityId))
        .slice(0, 3)
        .flatMap((suggestion) => {
          const capability = catalogById.get(suggestion.capabilityId);
          return capability ? [card(capability)] : [];
        });
      if (relatedCards.length) {
        blocks.push({
          type: 'CAPABILITY_LIST',
          id: 'related-capabilities',
          title: 'Related tools for what comes next',
          description: 'Related through the canonical capability lifecycle and filtered for this home.',
          capabilities: relatedCards,
        });
      }
    } catch {
      // Discovery remains useful if optional continuity context is temporarily unavailable.
    }
  }

  return {
    status: 'ANSWERED',
    contextVersion: readiness?.contextVersion ?? catalog.registryVersion,
    blocks,
    suggestions: availableMatches.ambiguous
      ? ['Help me narrow these options', 'Show only tools ready for this home']
      : ['What information does this tool need?', 'What result will I get?', 'Show another option'],
  };
}

function emergencyResult(): AskOperationResult {
  return {
    status: 'BLOCKED',
    reasonCode: 'IMMEDIATE_SAFETY',
    blocks: [{
      type: 'BOUNDARY', id: 'emergency-boundary', title: 'Treat this as an immediate safety issue', severity: 'EMERGENCY',
      body: 'Leave the affected area if you can do so safely. Call 911 or your local emergency service and the appropriate utility emergency line from a safe location. Do not operate switches, appliances, flames, or vehicles near a suspected gas leak.',
      suggestions: ['Follow instructions from emergency responders or the utility.', 'Do not wait for an app assessment when there may be immediate danger.'],
    }],
    suggestions: [],
  };
}

function outOfScopeResult(): AskOperationResult {
  return {
    status: 'OUT_OF_SCOPE',
    reasonCode: 'NOT_HOMEOWNER_DOMAIN',
    blocks: [{
      type: 'BOUNDARY', id: 'out-of-scope-boundary', title: 'Ask is focused on your home', severity: 'INFO',
      body: 'I can help with home records, maintenance, coverage, costs, tools, decisions, projects, and major home moments. I cannot create unrelated programs or general-purpose coding content here.',
      suggestions: ['What maintenance is pending?', 'Which items are missing coverage?', 'Is there a tool to help with refinancing?'],
    }],
    suggestions: [],
  };
}

function unsafeRestrictedResult(): AskOperationResult {
  return {
    status: 'BLOCKED',
    reasonCode: 'ASK_SAFETY_BLOCKED',
    blocks: [{
      type: 'BOUNDARY', id: 'unsafe-restricted-boundary', title: 'I can’t help bypass safety, legal, or professional controls', severity: 'CAUTION',
      body: 'I can help you understand the safe, documented path, prepare questions and records, or find the appropriate Contract to Cozy tool. I cannot help evade permits or inspections, disable safety equipment, conceal material facts, access another user’s private records, or guarantee a regulated, coverage, structural, or professional determination.',
      suggestions: ['Review the safe permit, inspection, or policy-verification path.', 'Open only the records available for your selected home.', 'Consult the appropriate authority or qualified professional for a controlling determination.'],
    }],
    suggestions: ['What is required before my renovation can start?', 'Which home records should I verify?'],
  };
}

function routingClarificationResult(decision: AskRoutingDecision): AskOperationResult {
  const candidates = decision.candidates.slice(0, 3);
  const choices = candidates.map((candidate) => candidate.operationId.toLowerCase().replace(/_/g, ' '));
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  return {
    status: 'NEEDS_CLARIFICATION',
    reasonCode: 'ASK_ROUTING_AMBIGUOUS',
    blocks: [{
      type: 'SUMMARY',
      id: 'routing-clarification',
      title: 'What would you like to focus on?',
      body: choices.length
        ? `I found more than one possible home-related request: ${choices.join(', ')}. Add one detail so I can use the right home record and calculation.`
        : 'Add one detail about the home record, decision, task, or tool you want to use.',
      tone: 'DEFAULT',
      actions: [],
    }],
    clarification: {
      version: 1,
      question: 'Which home request would you like Ask to handle?',
      options: candidates.map((candidate) => ({
        operationId: candidate.operationId,
        label: candidate.operationId.toLowerCase().replace(/_/g, ' '),
      })),
      allowFreeText: true,
      expiresAt,
    },
    parameters: {
      clarification: {
        version: 1,
        candidateOperationIds: candidates.map((candidate) => candidate.operationId),
        expiresAt,
      },
    },
    suggestions: choices.map((choice) => `Help me with ${choice}`).slice(0, 3),
  };
}

async function maybeSynthesizeDeterministicResult(operationId: AskOperationResolution['operationId'], result: AskOperationResult, enabled: boolean): Promise<AskOperationResult> {
  if (!enabled) return result;
  try {
    const synthesized = await synthesizeAskResult(operationId, result);
    askResultSynthesisTotal.inc({ outcome: synthesized === result ? 'ineligible' : 'success' });
    return synthesized;
  } catch {
    askResultSynthesisTotal.inc({ outcome: 'failure_fallback' });
    return result;
  }
}

function operationalUnavailableResult(reason: 'ASK_DISABLED' | 'OPERATION_DISABLED' | 'REMOTE_GENERATION_DISABLED'): AskOperationResult {
  const remoteOnly = reason === 'REMOTE_GENERATION_DISABLED';
  return {
    status: 'UNAVAILABLE',
    reasonCode: reason,
    blocks: [{
      type: 'BOUNDARY', id: 'ask-operational-boundary', title: remoteOnly ? 'General guidance is temporarily limited' : 'This Ask capability is temporarily unavailable', severity: 'INFO',
      body: remoteOnly
        ? 'Record-based questions and registered home tools are still available, but open-ended generated guidance is currently turned off. Ask will not invent an answer while generation is unavailable.'
        : 'This capability has been paused by an operational control. Your home record was not changed.',
      suggestions: ['Ask about recorded maintenance, coverage, savings, inventory, home actions, or your property summary.'],
    }],
    suggestions: ['What maintenance is pending?', 'Summarize my home record', 'Which items are missing coverage?'],
  };
}

async function groundedGuidanceResult(input: { userId: string; sessionId: string; message: string; propertyId?: string | null }): Promise<AskOperationResult> {
  let answer: Awaited<ReturnType<typeof answerGroundedAsk>>;
  try {
    askRemoteGenerationCharactersTotal.inc({ direction: 'input' }, input.message.length);
    answer = await answerGroundedAsk({
      userId: input.userId,
      sessionId: input.sessionId,
      message: input.message,
      propertyId: input.propertyId ?? undefined,
    });
    askRemoteGenerationCharactersTotal.inc({ direction: 'output' }, answer.text.length);
    askRemoteGenerationTotal.inc({ outcome: 'success' });
  } catch (error) {
    askRemoteGenerationTotal.inc({ outcome: 'failure' });
    throw error;
  }
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'grounded-guidance', title: answer.groundingMode === 'PROPERTY' ? 'Guidance for this home' : 'General home guidance',
    body: answer.text, tone: answer.confidence.label === 'LOW' ? 'CAUTION' : 'DEFAULT', actions: [],
  }];
  if (answer.evidence.length) {
    blocks.push({ type: 'EVIDENCE', id: 'grounded-evidence', title: 'Sources used', items: answer.evidence.map((item) => ({ label: item.label, source: item.source, observedAt: item.observedAt })) });
  }
  blocks.push({ type: 'BOUNDARY', id: 'grounded-professional-boundary', title: 'Educational guidance—not a controlling determination', body: answer.safetyBoundary, severity: 'INFO', suggestions: [] });
  return { status: 'ANSWERED', blocks, suggestions: [answer.nextAction].filter(Boolean) };
}

async function executeOperationCore(input: { userId: string; sessionId: string; message: string; propertyId?: string | null; operation: AskOperationResolution }): Promise<AskOperationResult> {
  const controls = readAskOperationalControls();
  const definition = getAskOperationDefinition(input.operation.operationId);
  if (!controls.askEnabled) return operationalUnavailableResult('ASK_DISABLED');
  if (!controls.operationEnabled(input.operation.operationId)) return operationalUnavailableResult('OPERATION_DISABLED');
  if (definition.executionMode === 'REMOTE_GENERATION' && !controls.remoteGenerationEnabled) {
    askRemoteGenerationTotal.inc({ outcome: 'disabled' });
    return operationalUnavailableResult('REMOTE_GENERATION_DISABLED');
  }
  if (input.operation.requiresProperty && !input.propertyId) return needsPropertyResult();
  if (input.propertyId && definition.propertyRoleFloor) {
    const access = await ensurePropertyAccess(input.userId, input.propertyId);
    const rank = { VIEWER: 1, CONTRIBUTOR: 2, OWNER: 3 } as const;
    if (rank[access.role] < rank[definition.propertyRoleFloor]) {
      return {
        status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
        blocks: [{
          type: 'SUMMARY', id: 'ask-operation-permission', title: `${definition.propertyRoleFloor.toLowerCase()} access is required`,
          body: 'This registered operation is unavailable for your current household role. No home record was changed.',
          tone: 'CAUTION', actions: [],
        }],
        suggestions: ['Ask a read-only question about this home'],
      };
    }
  }
  switch (input.operation.operationId) {
    case 'EMERGENCY_BOUNDARY': return emergencyResult();
    case 'UNSAFE_RESTRICTED_BOUNDARY': return unsafeRestrictedResult();
    case 'OUT_OF_SCOPE_BOUNDARY': return outOfScopeResult();
    case 'MAINTENANCE_TASK_COMPLETE': return maintenanceTaskCompleteResult(input.userId, input.propertyId!, input.message);
    case 'MAINTENANCE_TASK_CREATE': return maintenanceTaskCreateResult(input.userId, input.propertyId!, input.message);
    case 'MAINTENANCE_TASK_UPDATE': return maintenanceTaskUpdateResult(input.userId, input.propertyId!, input.message);
    case 'MAINTENANCE_STATUS': return maintenanceResult(input.userId, input.propertyId!, input.message);
    case 'COVERAGE_GAPS': return coverageResult(input.userId, input.propertyId!, input.message);
    case 'SAVINGS_OPPORTUNITIES': return savingsOpportunitiesResult(input.userId, input.propertyId!, input.message);
    case 'OWNERSHIP_COSTS': return ownershipCostsResult(input.userId, input.propertyId!, input.message);
    case 'INVENTORY_LOOKUP': return inventoryLookupResult(input.userId, input.propertyId!, input.message);
    case 'PROPERTY_SUMMARY': return propertySummaryResult(input.userId, input.propertyId!, input.message);
    case 'HOME_ACTIONS': return homeActionsResult(input.userId, input.propertyId!, input.message);
    case 'REPLACEMENT_GUIDANCE': return replacementGuidanceResult(input.userId, input.propertyId!, input.message);
    case 'REFINANCE_ANALYSIS': return refinanceAnalysisResult(input.userId, input.propertyId!);
    case 'REFINANCE_RATE_MONITOR': return refinanceRateMonitorResult(input.userId, input.propertyId!, input.message);
    case 'SELL_HOLD_RENT_ANALYSIS': return sellHoldRentAnalysisResult(input.userId, input.propertyId!);
    case 'HOUSEHOLD_INVITATION': return householdInvitationResult(input.userId, input.propertyId!, input.message);
    case 'GUIDANCE_JOURNEY_CREATE': return guidanceJourneyCreateResult(input.userId, input.propertyId!, input.message);
    case 'QUOTE_COMPARISON_CREATE': return quoteComparisonCreateResult(input.propertyId!, input.message);
    case 'QUOTE_COMPARISON_REVIEW': return quoteComparisonReviewResult(input.propertyId!);
    case 'HOME_DEADLINE_MONITOR': return homeDeadlineMonitorResult(input.userId, input.propertyId!, input.message);
    case 'CAPITAL_RESERVE_PLAN': return capitalReservePlanResult(input.userId, input.propertyId!);
    case 'PROPERTY_TAX_APPEAL_READINESS': return propertyTaxAppealReadinessResult(input.userId, input.propertyId!, input.message);
    case 'RENOVATION_PERMIT_READINESS': return renovationPermitReadinessResult(input.propertyId!, input.message);
    case 'MAJOR_EVENT_ENTRY': return majorEventEntryResult(input.userId, input.propertyId!, input.message);
    case 'CAPABILITY_DISCOVERY': return capabilityResult(input.userId, input.propertyId, input.message);
    case 'GROUNDED_GUIDANCE': return groundedGuidanceResult(input);
  }
}

const ASK_OPERATION_CAPABILITY: Partial<Record<AskOperationResolution['operationId'], string>> = {
  MAINTENANCE_STATUS: 'maintenance',
  MAINTENANCE_TASK_CREATE: 'maintenance',
  MAINTENANCE_TASK_COMPLETE: 'maintenance',
  MAINTENANCE_TASK_UPDATE: 'maintenance',
  COVERAGE_GAPS: 'coverage-intelligence',
  SAVINGS_OPPORTUNITIES: 'savings-benefits',
  OWNERSHIP_COSTS: 'ownership-costs',
  INVENTORY_LOOKUP: 'home-records',
  PROPERTY_SUMMARY: 'property-brief',
  HOME_ACTIONS: 'home-operations',
  REPLACEMENT_GUIDANCE: 'replace-repair',
  REFINANCE_ANALYSIS: 'mortgage-refinance-radar',
  REFINANCE_RATE_MONITOR: 'mortgage-refinance-radar',
  SELL_HOLD_RENT_ANALYSIS: 'sell-hold-rent',
  GUIDANCE_JOURNEY_CREATE: 'guidance-overview',
  QUOTE_COMPARISON_CREATE: 'quote-comparison',
  QUOTE_COMPARISON_REVIEW: 'quote-comparison',
  HOME_DEADLINE_MONITOR: 'maintenance',
  CAPITAL_RESERVE_PLAN: 'capital-timeline',
  PROPERTY_TAX_APPEAL_READINESS: 'property-tax',
  RENOVATION_PERMIT_READINESS: 'home-renovation-risk-advisor',
  MAJOR_EVENT_ENTRY: 'property-brief',
};

async function executeOperation(input: { userId: string; sessionId: string; message: string; propertyId?: string | null; operation: AskOperationResolution }): Promise<AskOperationResult> {
  const coreResult = await executeOperationCore(input);
  const result: AskOperationResult = coreResult.status === 'NEEDS_ENTITY'
    ? {
      ...coreResult,
      reasonCode: 'ASK_ENTITY_REQUIRED',
      parameters: { ...(coreResult.parameters ?? {}), requirementReasonCode: coreResult.reasonCode ?? null },
    }
    : coreResult.status === 'OUT_OF_SCOPE'
      ? {
        ...coreResult,
        reasonCode: 'ASK_OPERATION_UNSUPPORTED',
        parameters: { ...(coreResult.parameters ?? {}), requirementReasonCode: coreResult.reasonCode ?? null },
      }
      : coreResult;
  const currentCapabilityId = ASK_OPERATION_CAPABILITY[input.operation.operationId];
  if (
    !input.propertyId
    || !currentCapabilityId
    || !['ANSWERED', 'COMPLETED'].includes(result.status)
    || (result.captureRequests?.length ?? 0) > 0
    || result.confirmation
    || result.blocks.some((block) => block.type === 'CAPABILITY_LIST')
  ) return result;

  try {
    const [related, catalog] = await Promise.all([
      getRelatedCapabilities({
        propertyId: input.propertyId,
        userId: input.userId,
        currentCapabilityId,
        limit: 3,
      }),
      Promise.resolve(buildCapabilityCatalog({
        registry: canonicalCapabilityRegistry,
        availability: createToolDiscoveryCapabilityAvailabilityAdapter(canonicalCapabilityRegistry),
        userId: input.userId,
        propertyId: input.propertyId,
        includeWorkflowContext: false,
      })),
    ]);
    const catalogById = new Map(catalog.capabilities.map((capability) => [capability.id, capability]));
    const capabilities = related.suggestions.slice(0, 3).flatMap((suggestion) => {
      const capability = catalogById.get(suggestion.capabilityId);
      if (!capability) return [];
      return [{
        id: capability.id,
        label: capability.label,
        description: capability.shortDescription,
        expectedOutput: capability.expectedOutput,
        href: capability.href,
        readiness: suggestion.readiness,
        readinessLabel: suggestion.readiness === 'READY'
          ? 'Ready for this home'
          : 'More home details will improve the result',
        readinessReasons: [],
        releaseStage: capability.releaseStage,
      }];
    });
    if (capabilities.length) {
      result.blocks.push({
        type: 'CAPABILITY_LIST',
        id: 'related-capabilities',
        title: 'Related tools for what comes next',
        description: 'Suggested from the completed answer and filtered through the live capability registry.',
        capabilities,
      });
    }
  } catch {
    // Optional continuity must never turn a successful primary answer into a failure.
  }
  return result;
}

function captureFallbackHref(operationId: string | null, propertyId: string | null): string | null {
  if (!propertyId) return null;
  const base = `/dashboard/properties/${encodeURIComponent(propertyId)}`;
  switch (operationId) {
    case 'REPLACEMENT_GUIDANCE':
    case 'INVENTORY_LOOKUP':
    case 'COVERAGE_GAPS': return `${base}/inventory`;
    case 'REFINANCE_ANALYSIS': return `${base}/tools/financing/profile`;
    case 'SAVINGS_OPPORTUNITIES': return `${base}/tools/home-savings`;
    case 'OWNERSHIP_COSTS': return `${base}/ownership-costs`;
    case 'SELL_HOLD_RENT_ANALYSIS': return `${base}/seller-prep`;
    case 'CAPITAL_RESERVE_PLAN': return `${base}/tools/capital-timeline`;
    case 'PROPERTY_TAX_APPEAL_READINESS': return `${base}/tools/property-tax`;
    case 'QUOTE_COMPARISON_REVIEW': return `${base}/tools/quote-comparison`;
    case 'RENOVATION_PERMIT_READINESS': return `${base}/projects`;
    case 'MAJOR_EVENT_ENTRY': return `${base}/tools`;
    case 'HOME_ACTIONS': return `${base}/home-operations`;
    case 'HOUSEHOLD_INVITATION': return `${base}/household`;
    case 'MAINTENANCE_TASK_CREATE':
    case 'MAINTENANCE_TASK_COMPLETE': return `${base}/maintenance`;
    default: return `${base}/edit`;
  }
}

function mapPersistedExecution(execution: {
  id: string; sessionId: string; message: string; status: AskExecutionStatus; propertyId: string | null; operationId: string | null;
  operationVersion: string | null; intentFamily: string | null; contextVersion: string | null; resultJson: Prisma.JsonValue | null;
  createdAt: Date; updatedAt: Date;
}, property: { id: string; label: string } | null): AskExecutionResponse {
  const stored = execution.resultJson && typeof execution.resultJson === 'object' && !Array.isArray(execution.resultJson)
    ? execution.resultJson as { schemaVersion?: unknown; blocks?: unknown; captureRequests?: unknown; confirmation?: unknown; clarification?: unknown; suggestions?: unknown }
    : {};
  const storedSchemaVersion = typeof stored.schemaVersion === 'string' ? stored.schemaVersion : ASK_RESPONSE_SCHEMA_VERSION;
  const candidate = {
    schemaVersion: storedSchemaVersion,
    executionId: execution.id,
    sessionId: execution.sessionId,
    question: execution.message,
    status: execution.status,
    property,
    operation: execution.operationId ? { id: execution.operationId, version: execution.operationVersion ?? '1.0', family: execution.intentFamily ?? 'UNKNOWN' } : null,
    contextVersion: execution.contextVersion,
    blocks: stored.blocks ?? [],
    captureRequests: Array.isArray(stored.captureRequests)
      ? stored.captureRequests.map((request) => request && typeof request === 'object' && !Array.isArray(request)
        ? {
          ...request,
          fallbackHref: typeof (request as { fallbackHref?: unknown }).fallbackHref === 'string'
            ? (request as { fallbackHref: string }).fallbackHref
            : captureFallbackHref(execution.operationId, execution.propertyId),
        }
        : request)
      : [],
    confirmation: stored.confirmation ?? null,
    clarification: stored.clarification ?? null,
    suggestions: stored.suggestions ?? [],
    createdAt: execution.createdAt.toISOString(),
    updatedAt: execution.updatedAt.toISOString(),
  };
  const parsed = AskExecutionResponseSchema.safeParse(candidate);
  if (parsed.success) return parsed.data;
  return AskExecutionResponseSchema.parse({
    schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
    executionId: execution.id,
    sessionId: execution.sessionId,
    question: execution.message,
    status: 'UNAVAILABLE',
    property,
    operation: execution.operationId ? { id: execution.operationId, version: execution.operationVersion ?? 'unknown', family: execution.intentFamily ?? 'UNKNOWN' } : null,
    contextVersion: execution.contextVersion,
    blocks: [{
      type: 'SUMMARY', id: 'ask-schema-fallback', title: 'This saved response needs to be refreshed',
      body: 'The response was saved with an unsupported presentation version. Ask preserved the execution and hid incompatible details instead of showing a broken or misleading result.',
      tone: 'CAUTION', actions: [],
    }],
    captureRequests: [],
    confirmation: null,
    clarification: null,
    suggestions: ['Ask this question again'],
    createdAt: execution.createdAt.toISOString(),
    updatedAt: execution.updatedAt.toISOString(),
  });
}

async function withAskTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          const error = new Error('Ask execution exceeded its operational timeout.');
          error.name = 'AskExecutionTimeoutError';
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function createAskExecution(userId: string, input: CreateAskExecutionRequest): Promise<AskExecutionResponse> {
  if (input.propertyId) await ensurePropertyAccess(userId, input.propertyId);
  const duplicate = await prisma.askExecution.findUnique({ where: { userId_clientRequestId: { userId, clientRequestId: input.clientRequestId } } });
  if (duplicate) return mapPersistedExecution(duplicate, await propertySummary(duplicate.propertyId));

  const controls = readAskOperationalControls();
  const expiresAt = new Date(Date.now() + controls.rawConversationRetentionDays * 24 * 60 * 60 * 1000);
  const existingSession = await prisma.askSession.findUnique({ where: { id: input.sessionId } });
  if (existingSession && existingSession.userId !== userId) {
    const error = new Error('Ask session not found.');
    (error as Error & { code?: string }).code = 'ASK_SESSION_NOT_FOUND';
    throw error;
  }
  const session = existingSession
    ? await prisma.askSession.update({
      where: { id: existingSession.id },
      data: { propertyId: input.propertyId ?? undefined, lastActiveAt: new Date(), expiresAt },
    })
    : await prisma.askSession.create({
      data: { id: input.sessionId, userId, propertyId: input.propertyId ?? null, title: input.message.slice(0, 120), expiresAt },
    });
  const execution = await prisma.askExecution.create({
    data: {
      sessionId: session.id,
      userId,
      propertyId: input.propertyId ?? null,
      clientRequestId: input.clientRequestId,
      message: input.message,
      launchContextJson: input.launchContext ? asInputJson(input.launchContext) : undefined,
      status: 'ROUTING',
      expiresAt,
    },
  });
  await prisma.askExecutionEvent.create({ data: { executionId: execution.id, eventType: 'RECEIVED', metadataJson: asInputJson({ surface: input.launchContext?.surface ?? 'unknown' }) } });

  const routingDecision = resolveAskRoutingCascade(input.message, {
    localRoutingEnabled: controls.localRoutingEnabled,
    localMinimumConfidence: controls.localRoutingMinimumConfidence,
    ambiguityMargin: controls.routingAmbiguityMargin,
  });
  const operation = routingDecision.operation;
  const operationDefinition = getAskOperationDefinition(operation.operationId);
  const generationMode = routingDecision.requiresClarification
    ? 'deterministic'
    : operationDefinition.executionMode === 'REMOTE_GENERATION' ? 'remote' : 'deterministic';
  askRoutingDecisionsTotal.inc({ stage: routingDecision.stage.toLowerCase(), outcome: routingDecision.requiresClarification ? 'clarification' : operation.operationId.toLowerCase() });
  const startedAt = Date.now();
  await prisma.askExecution.update({
    where: { id: execution.id },
    data: { operationId: operation.operationId, operationVersion: operation.version, intentFamily: operation.family, intentConfidence: operation.confidence, status: 'RUNNING' },
  });
  try {
    const rawResult = await withAskTimeout(
      routingDecision.requiresClarification
        ? Promise.resolve(routingClarificationResult(routingDecision))
        : executeOperation({ userId, sessionId: session.id, message: input.message, propertyId: input.propertyId, operation }),
      controls.executionTimeoutMs,
    );
    const result = operationDefinition.executionMode === 'DETERMINISTIC' && !routingDecision.requiresClarification
      ? await maybeSynthesizeDeterministicResult(operation.operationId, rawResult, controls.resultSynthesisEnabled && controls.remoteGenerationEnabled)
      : rawResult;
    const disallowedBlock = result.blocks.find((block) => block.type !== 'BOUNDARY' && !operationDefinition.allowedBlockTypes.includes(block.type));
    if (disallowedBlock) throw new Error(`Ask adapter returned undeclared block type ${disallowedBlock.type}.`);
    const completedAt = terminalStatus(result.status) ? new Date() : undefined;
    const saved = await prisma.askExecution.update({
      where: { id: execution.id },
      data: {
        status: result.status,
        reasonCode: result.reasonCode,
        contextVersion: result.contextVersion,
        parametersJson: result.parameters ? asInputJson(result.parameters) : undefined,
        resultJson: asInputJson({ schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: result.blocks, captureRequests: result.captureRequests ?? [], confirmation: result.confirmation ?? null, clarification: result.clarification ?? null, suggestions: result.suggestions }),
        completedAt,
      },
    });
    if (result.captureRequests?.length) askInlineCapturesTotal.inc({ operation: operation.operationId, outcome: 'PROMPTED' }, result.captureRequests.length);
    await prisma.askExecutionEvent.create({ data: { executionId: execution.id, eventType: result.status, metadataJson: asInputJson({ operationId: operation.operationId, blockTypes: result.blocks.map((block) => block.type) }) } });
    askExecutionsTotal.inc({ operation: operation.operationId, status: result.status, generation_mode: generationMode });
    askExecutionDurationSeconds.observe({ operation: operation.operationId, generation_mode: generationMode }, (Date.now() - startedAt) / 1000);
    return mapPersistedExecution(saved, await propertySummary(input.propertyId));
  } catch (caught) {
    const failureStatus = askFailureStatus(caught);
    await prisma.askExecution.update({ where: { id: execution.id }, data: { status: failureStatus, errorCode: caught instanceof Error ? caught.name : 'ASK_EXECUTION_FAILED', completedAt: failureStatus === 'FAILED_TERMINAL' ? new Date() : null } });
    await prisma.askExecutionEvent.create({ data: { executionId: execution.id, eventType: failureStatus, metadataJson: asInputJson({ operationId: operation.operationId }) } });
    askExecutionsTotal.inc({ operation: operation.operationId, status: failureStatus, generation_mode: generationMode });
    askExecutionDurationSeconds.observe({ operation: operation.operationId, generation_mode: generationMode }, (Date.now() - startedAt) / 1000);
    throw caught;
  }
}

export async function submitAskClarification(userId: string, executionId: string, input: SubmitAskClarification): Promise<AskExecutionResponse> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  const parameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
    ? execution.parametersJson as Record<string, unknown>
    : {};
  const priorReceipt = parameters.clarificationReceipt;
  if (priorReceipt && typeof priorReceipt === 'object' && !Array.isArray(priorReceipt)
    && (priorReceipt as Record<string, unknown>).idempotencyKey === input.idempotencyKey) {
    return mapPersistedExecution(execution, await propertySummary(execution.propertyId));
  }
  const clarification = parameters.clarification;
  if (!['NEEDS_CLARIFICATION', 'NEEDS_ENTITY'].includes(execution.status) || !clarification || typeof clarification !== 'object' || Array.isArray(clarification)) {
    const error = new Error('This clarification is no longer active.');
    (error as Error & { code?: string }).code = 'ASK_CLARIFICATION_NOT_ACTIVE';
    throw error;
  }
  const savedClarification = clarification as Record<string, unknown>;
  const expiresAt = typeof savedClarification.expiresAt === 'string' ? new Date(savedClarification.expiresAt) : null;
  if (savedClarification.version !== input.clarificationVersion || !expiresAt || expiresAt <= new Date()) {
    const expired = await prisma.askExecution.update({
      where: { id: execution.id },
      data: {
        status: 'EXPIRED',
        reasonCode: 'ASK_CLARIFICATION_EXPIRED',
        completedAt: new Date(),
        resultJson: asInputJson({
          schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
          blocks: [{ type: 'SUMMARY', id: 'clarification-expired', title: 'This clarification expired', body: 'Ask the question again so the answer uses current home records and routing rules.', tone: 'CAUTION', actions: [] }],
          captureRequests: [], confirmation: null, clarification: null, suggestions: ['Ask this question again'],
        }),
      },
    });
    await prisma.askExecutionEvent.create({ data: { executionId, eventType: 'EXPIRED', metadataJson: asInputJson({ reason: 'CLARIFICATION_EXPIRED' }) } });
    return mapPersistedExecution(expired, await propertySummary(execution.propertyId));
  }
  const candidateOperationIds = Array.isArray(savedClarification.candidateOperationIds)
    ? savedClarification.candidateOperationIds.filter((value): value is string => typeof value === 'string')
    : [];
  if (input.operationId && !candidateOperationIds.includes(input.operationId)) {
    const error = new Error('The selected clarification option is invalid.');
    (error as Error & { code?: string }).code = 'ASK_CLARIFICATION_INVALID_OPTION';
    throw error;
  }
  if (execution.propertyId) await ensurePropertyAccess(userId, execution.propertyId);
  const controls = readAskOperationalControls();
  const clarifiedMessage = input.answer ? `${execution.message}\nClarification: ${input.answer}` : execution.message;
  const safetyDecision = resolveAskRoutingCascade(clarifiedMessage, {
    localRoutingEnabled: controls.localRoutingEnabled,
    localMinimumConfidence: controls.localRoutingMinimumConfidence,
    ambiguityMargin: controls.routingAmbiguityMargin,
  });
  let operation: AskOperationResolution;
  if (safetyDecision.stage === 'SAFETY') {
    operation = safetyDecision.operation;
  } else if (input.operationId) {
    operation = { ...getAskOperationDefinition(input.operationId as AskOperationId), confidence: 1 };
  } else if (candidateOperationIds.length === 1) {
    operation = { ...getAskOperationDefinition(candidateOperationIds[0] as AskOperationId), confidence: 1 };
  } else {
    if (safetyDecision.requiresClarification) {
      const error = new Error('Add one more specific detail so Ask can choose the correct home workflow.');
      (error as Error & { code?: string }).code = 'ASK_CLARIFICATION_UNRESOLVED';
      throw error;
    }
    operation = safetyDecision.operation;
  }
  const operationDefinition = getAskOperationDefinition(operation.operationId);
  const claimed = await prisma.askExecution.updateMany({
    where: { id: execution.id, userId, status: { in: ['NEEDS_CLARIFICATION', 'NEEDS_ENTITY'] } },
    data: {
      operationId: operation.operationId, operationVersion: operation.version, intentFamily: operation.family, intentConfidence: operation.confidence, status: 'RUNNING',
      parametersJson: asInputJson({ ...parameters, clarificationReceipt: { idempotencyKey: input.idempotencyKey, clarificationVersion: input.clarificationVersion } }),
    },
  });
  if (claimed.count !== 1) {
    const latest = await prisma.askExecution.findFirst({ where: { id: execution.id, userId } });
    if (latest) return mapPersistedExecution(latest, await propertySummary(latest.propertyId));
    const error = new Error('This clarification is no longer active.');
    (error as Error & { code?: string }).code = 'ASK_CLARIFICATION_NOT_ACTIVE';
    throw error;
  }
  try {
    const rawResult = await withAskTimeout(
      executeOperation({ userId, sessionId: execution.sessionId, message: clarifiedMessage, propertyId: execution.propertyId, operation }),
      controls.executionTimeoutMs,
    );
    const result = operationDefinition.executionMode === 'DETERMINISTIC'
      ? await maybeSynthesizeDeterministicResult(operation.operationId, rawResult, controls.resultSynthesisEnabled && controls.remoteGenerationEnabled)
      : rawResult;
    const disallowedBlock = result.blocks.find((block) => block.type !== 'BOUNDARY' && !operationDefinition.allowedBlockTypes.includes(block.type));
    if (disallowedBlock) throw new Error(`Ask adapter returned undeclared block type ${disallowedBlock.type}.`);
    const nextParameters = {
      ...(result.parameters ?? {}),
      clarificationReceipt: { idempotencyKey: input.idempotencyKey, clarificationVersion: input.clarificationVersion },
    };
    const saved = await prisma.askExecution.update({
      where: { id: execution.id },
      data: {
        status: result.status,
        reasonCode: result.reasonCode,
        contextVersion: result.contextVersion,
        parametersJson: asInputJson(nextParameters),
        resultJson: asInputJson({ schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: result.blocks, captureRequests: result.captureRequests ?? [], confirmation: result.confirmation ?? null, clarification: result.clarification ?? null, suggestions: result.suggestions }),
        completedAt: terminalStatus(result.status) ? new Date() : null,
      },
    });
    await prisma.askExecutionEvent.create({ data: { executionId, eventType: 'CLARIFICATION_SUBMITTED', metadataJson: asInputJson({ operationId: operation.operationId }) } });
    return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
  } catch (caught) {
    const failureStatus = askFailureStatus(caught);
    await prisma.askExecution.update({ where: { id: execution.id }, data: { status: failureStatus, errorCode: caught instanceof Error ? caught.name : 'ASK_EXECUTION_FAILED', completedAt: failureStatus === 'FAILED_TERMINAL' ? new Date() : null } });
    await prisma.askExecutionEvent.create({ data: { executionId, eventType: failureStatus, metadataJson: asInputJson({ stage: 'CLARIFICATION_RESUME' }) } });
    throw caught;
  }
}

export async function submitAskCapture(userId: string, executionId: string, input: SubmitAskCaptureRequest): Promise<AskExecutionResponse> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution || !execution.propertyId) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  await ensurePropertyAccess(userId, execution.propertyId);
  const answerHash = createHash('sha256').update(JSON.stringify({ captureKey: input.captureKey, answer: input.answer, sensitiveDataConfirmed: input.sensitiveDataConfirmed ?? false })).digest('hex');
  const previousCapture = await prisma.askCaptureReceipt.findUnique({
    where: { executionId_idempotencyKey: { executionId: execution.id, idempotencyKey: input.idempotencyKey } },
  });
  if (previousCapture) {
    if (previousCapture.answerHash !== answerHash) {
      const error = new Error('The idempotency key was already used for a different inline answer.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_IDEMPOTENCY_CONFLICT';
      throw error;
    }
    const operation = resolveAskOperation(execution.message);
    const replayed = await executeOperation({ userId, sessionId: execution.sessionId, message: execution.message, propertyId: execution.propertyId, operation });
    const resumed = await prisma.askExecution.update({
      where: { id: execution.id },
      data: {
        status: replayed.status,
        reasonCode: replayed.reasonCode,
        contextVersion: replayed.contextVersion ?? previousCapture.contextVersion,
        parametersJson: replayed.parameters ? asInputJson(replayed.parameters) : execution.parametersJson ?? undefined,
        resultJson: asInputJson({ schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: replayed.blocks, captureRequests: replayed.captureRequests ?? [], confirmation: replayed.confirmation ?? null, clarification: replayed.clarification ?? null, suggestions: replayed.suggestions }),
        completedAt: terminalStatus(replayed.status) ? new Date() : null,
      },
    });
    await prisma.askExecutionEvent.create({ data: { executionId: execution.id, eventType: 'CAPTURE_RESUME_RETRIED', metadataJson: asInputJson({ captureKey: input.captureKey, resumedStatus: replayed.status }) } });
    askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: 'RESUMED' });
    if (replayed.captureRequests?.some((request) => request.captureKey === input.captureKey)) askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: 'REPEATED_PROMPT' });
    if (replayed.captureRequests?.length) askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: 'PROMPTED' }, replayed.captureRequests.length);
    return mapPersistedExecution(resumed, await propertySummary(execution.propertyId));
  }
  if (!['REPLACEMENT_GUIDANCE', 'REFINANCE_ANALYSIS', 'HOUSEHOLD_INVITATION', 'MAINTENANCE_TASK_CREATE', 'MAINTENANCE_TASK_COMPLETE', 'HOME_DEADLINE_MONITOR', 'CAPITAL_RESERVE_PLAN', 'PROPERTY_TAX_APPEAL_READINESS', 'SAVINGS_OPPORTUNITIES', 'SELL_HOLD_RENT_ANALYSIS', 'OWNERSHIP_COSTS', 'INVENTORY_LOOKUP', 'PROPERTY_SUMMARY', 'HOME_ACTIONS', 'COVERAGE_GAPS'].includes(execution.operationId ?? '')) {
    const error = new Error('This execution does not have an active inline capture.');
    (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
    throw error;
  }
  const stored = execution.resultJson && typeof execution.resultJson === 'object' && !Array.isArray(execution.resultJson)
    ? execution.resultJson as { captureRequests?: Array<{ requirementId?: unknown; captureKey?: unknown }> }
    : {};
  const active = stored.captureRequests?.some((request) => request.requirementId === input.requirementId && request.captureKey === input.captureKey);
  if (!active) {
    const error = new Error('This capture requirement is no longer active.');
    (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
    throw error;
  }
  askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: 'SUBMITTED' });

  let captureId: string;
  let capturedContextVersion: string;
  let result: AskOperationResult;
  let canonicalOwner: string;
  if (execution.operationId === 'CAPITAL_RESERVE_PLAN' || execution.operationId === 'PROPERTY_TAX_APPEAL_READINESS') {
    const tax = execution.operationId === 'PROPERTY_TAX_APPEAL_READINESS';
    const parameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown> : {};
    const capitalTimeline = !tax && parameters.phase5CaptureFeature === 'CAPITAL_TIMELINE';
    const capture = await captureFeatureContext(execution.propertyId, userId, {
      ...input,
      featureKey: tax ? 'TAX_APPEAL' : capitalTimeline ? 'CAPITAL_TIMELINE' : 'RESERVE_FUND',
      operationKey: tax ? 'RUN_ANALYSIS' : capitalTimeline ? 'RUN_TIMELINE' : 'RECALCULATE',
    });
    if (!capture || typeof capture !== 'object' || Array.isArray(capture)
      || !('captureId' in capture) || typeof capture.captureId !== 'string'
      || !('contextVersion' in capture) || typeof capture.contextVersion !== 'string') {
      throw new Error('Property context capture did not return a valid receipt.');
    }
    captureId = capture.captureId;
    capturedContextVersion = capture.contextVersion;
    const operation = resolveAskOperation(execution.message);
    result = await executeOperation({ userId, sessionId: execution.sessionId, message: execution.message, propertyId: execution.propertyId, operation });
    canonicalOwner = 'PropertyContext';
  } else if (execution.operationId === 'SAVINGS_OPPORTUNITIES') {
    const capture = await captureFeatureContext(execution.propertyId, userId, {
      ...input,
      featureKey: 'HOME_SAVINGS',
      operationKey: 'RUN_ANALYSIS',
    });
    if (!capture || typeof capture !== 'object' || Array.isArray(capture)
      || !('captureId' in capture) || typeof capture.captureId !== 'string'
      || !('contextVersion' in capture) || typeof capture.contextVersion !== 'string') {
      throw new Error('Property context capture did not return a valid receipt.');
    }
    captureId = capture.captureId;
    capturedContextVersion = capture.contextVersion;
    const operation = resolveAskOperation(execution.message);
    result = await executeOperation({
      userId, sessionId: execution.sessionId, message: execution.message, propertyId: execution.propertyId, operation,
    });
    canonicalOwner = 'PropertyContext';
  } else if (execution.operationId === 'OWNERSHIP_COSTS') {
    const capture = await captureFeatureContext(execution.propertyId, userId, {
      ...input,
      featureKey: 'OWNERSHIP_COSTS',
      operationKey: 'VIEW_ANALYSIS',
    });
    if (!capture || typeof capture !== 'object' || Array.isArray(capture)
      || !('captureId' in capture) || typeof capture.captureId !== 'string'
      || !('contextVersion' in capture) || typeof capture.contextVersion !== 'string') {
      throw new Error('Property context capture did not return a valid receipt.');
    }
    captureId = capture.captureId;
    capturedContextVersion = capture.contextVersion;
    const operation = resolveAskOperation(execution.message);
    result = await executeOperation({
      userId, sessionId: execution.sessionId, message: execution.message, propertyId: execution.propertyId, operation,
    });
    canonicalOwner = 'PropertyContext';
  } else if (execution.operationId === 'INVENTORY_LOOKUP') {
    const parameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    const inventoryItemId = parameters.inventoryItemId;
    if (typeof inventoryItemId !== 'string') {
      const error = new Error('The inventory item for this capture is no longer available.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const capture = await captureFeatureContext(execution.propertyId, userId, {
      ...input,
      featureKey: 'REPAIR_REPLACE',
      operationKey: 'RUN_ANALYSIS',
      operationInput: { inventoryItemId },
    });
    if (!capture || typeof capture !== 'object' || Array.isArray(capture)
      || !('captureId' in capture) || typeof capture.captureId !== 'string'
      || !('contextVersion' in capture) || typeof capture.contextVersion !== 'string') {
      throw new Error('Property context capture did not return a valid receipt.');
    }
    captureId = capture.captureId;
    capturedContextVersion = capture.contextVersion;
    const operation = resolveAskOperation(execution.message);
    result = await executeOperation({
      userId, sessionId: execution.sessionId, message: execution.message, propertyId: execution.propertyId, operation,
    });
    canonicalOwner = 'InventoryItem';
  } else if (execution.operationId === 'PROPERTY_SUMMARY') {
    const capture = await captureFeatureContext(execution.propertyId, userId, {
      ...input,
      featureKey: 'PROPERTY_RECORD_SUMMARY',
      operationKey: 'VIEW_SUMMARY',
    });
    if (!capture || typeof capture !== 'object' || Array.isArray(capture)
      || !('captureId' in capture) || typeof capture.captureId !== 'string'
      || !('contextVersion' in capture) || typeof capture.contextVersion !== 'string') {
      throw new Error('Property context capture did not return a valid receipt.');
    }
    captureId = capture.captureId;
    capturedContextVersion = capture.contextVersion;
    const operation = resolveAskOperation(execution.message);
    result = await executeOperation({
      userId, sessionId: execution.sessionId, message: execution.message, propertyId: execution.propertyId, operation,
    });
    canonicalOwner = 'PropertyContext';
  } else if (execution.operationId === 'HOME_ACTIONS') {
    const capture = await captureFeatureContext(execution.propertyId, userId, {
      ...input,
      featureKey: 'HOME_ACTIONS',
      operationKey: 'VIEW_FEED',
    });
    if (!capture || typeof capture !== 'object' || Array.isArray(capture)
      || !('captureId' in capture) || typeof capture.captureId !== 'string'
      || !('contextVersion' in capture) || typeof capture.contextVersion !== 'string') {
      throw new Error('Property context capture did not return a valid receipt.');
    }
    captureId = capture.captureId;
    capturedContextVersion = capture.contextVersion;
    const operation = resolveAskOperation(execution.message);
    result = await executeOperation({
      userId, sessionId: execution.sessionId, message: execution.message, propertyId: execution.propertyId, operation,
    });
    canonicalOwner = 'PropertyContext';
  } else if (execution.operationId === 'COVERAGE_GAPS') {
    const parameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    if (typeof parameters.inventoryItemId !== 'string') {
      const error = new Error('The inventory item for this coverage capture is no longer available.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const capture = await captureFeatureContext(execution.propertyId, userId, {
      ...input,
      featureKey: 'COVERAGE_INTELLIGENCE',
      operationKey: 'ASSESS_ITEM_COVERAGE',
      operationInput: {
        inventoryItemId: parameters.inventoryItemId,
        responsibilityScope: parameters.responsibilityScope,
        hasDisclosedEstimate: parameters.hasDisclosedEstimate,
      },
    });
    if (!capture || typeof capture !== 'object' || Array.isArray(capture)
      || !('captureId' in capture) || typeof capture.captureId !== 'string'
      || !('contextVersion' in capture) || typeof capture.contextVersion !== 'string') {
      throw new Error('Property context capture did not return a valid receipt.');
    }
    captureId = capture.captureId;
    capturedContextVersion = capture.contextVersion;
    const operation = resolveAskOperation(execution.message);
    result = await executeOperation({
      userId, sessionId: execution.sessionId, message: execution.message, propertyId: execution.propertyId, operation,
    });
    canonicalOwner = 'InventoryItem';
  } else if (execution.operationId === 'SELL_HOLD_RENT_ANALYSIS') {
    const capture = await captureFeatureContext(execution.propertyId, userId, {
      ...input,
      featureKey: 'SELL_HOLD_RENT',
      operationKey: 'VIEW_ANALYSIS',
    });
    if (!capture || typeof capture !== 'object' || Array.isArray(capture)
      || !('captureId' in capture) || typeof capture.captureId !== 'string'
      || !('contextVersion' in capture) || typeof capture.contextVersion !== 'string') {
      throw new Error('Property context capture did not return a valid receipt.');
    }
    captureId = capture.captureId;
    capturedContextVersion = capture.contextVersion;
    const operation = resolveAskOperation(execution.message);
    result = await executeOperation({
      userId, sessionId: execution.sessionId, message: execution.message, propertyId: execution.propertyId, operation,
    });
    canonicalOwner = 'PropertyContext';
  } else if (execution.operationId === 'MAINTENANCE_TASK_COMPLETE') {
    if (input.captureKey !== 'MAINTENANCE_COMPLETION_INPUTS') {
      const error = new Error('This maintenance completion capture is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to complete maintenance tasks.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const currentVersion = await maintenanceWorkflowVersion(execution.propertyId);
    if (currentVersion !== input.expectedContextVersion) {
      const error = new Error('Maintenance tasks changed while this form was open. Review the refreshed record and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const candidate = MaintenanceCompletionWorkflowInputSchema.safeParse(input.answer);
    if (!candidate.success) {
      const error = new Error('Select an open task and enter a valid actual cost and outcome.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
      throw error;
    }
    result = await maintenanceTaskCompleteResult(userId, execution.propertyId, execution.message, candidate.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = currentVersion;
    canonicalOwner = 'PropertyMaintenanceTaskWorkflow';
  } else if (execution.operationId === 'MAINTENANCE_TASK_CREATE') {
    if (input.captureKey !== 'MAINTENANCE_TASK_INPUTS') {
      const error = new Error('This maintenance task capture is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to create maintenance tasks.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const currentVersion = await maintenanceWorkflowVersion(execution.propertyId);
    if (currentVersion !== input.expectedContextVersion) {
      const error = new Error('Maintenance tasks changed while this form was open. Review the refreshed record and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const candidate = MaintenanceTaskWorkflowInputSchema.safeParse(input.answer);
    if (!candidate.success) {
      const error = new Error('Enter a task name and valid priority, schedule, recurrence, and estimate.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
      throw error;
    }
    result = await maintenanceTaskCreateResult(userId, execution.propertyId, execution.message, candidate.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = currentVersion;
    canonicalOwner = 'PropertyMaintenanceTaskWorkflow';
  } else if (execution.operationId === 'HOUSEHOLD_INVITATION') {
    if (input.captureKey !== 'HOUSEHOLD_INVITATION_INPUTS') {
      const error = new Error('This household invitation capture is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role !== HouseholdRole.OWNER) {
      const error = new Error('Only a household owner can prepare an invitation.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const currentVersion = await householdWorkflowVersion(execution.propertyId);
    if (currentVersion !== input.expectedContextVersion) {
      const error = new Error('Household access changed while this invitation was open. Review the current household and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const candidate = HouseholdInvitationInputSchema.safeParse(input.answer);
    if (!candidate.success) {
      const error = new Error('Enter a valid email address and choose Contributor or Viewer.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
      throw error;
    }
    result = await householdInvitationResult(userId, execution.propertyId, execution.message, candidate.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = currentVersion;
    canonicalOwner = 'HouseholdInviteWorkflow';
  } else if (execution.operationId === 'HOME_DEADLINE_MONITOR') {
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to update reminder dates.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    if (input.captureKey === 'HOME_DEADLINE_MAINTENANCE_DUE_DATE') {
      const currentVersion = await maintenanceWorkflowVersion(execution.propertyId);
      if (currentVersion !== input.expectedContextVersion) {
        const error = new Error('Maintenance tasks changed while this form was open. Review the refreshed task and try again.');
        (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
        throw error;
      }
      const candidate = HomeDeadlineTaskDueCaptureSchema.safeParse(input.answer);
      const task = candidate.success ? await prisma.propertyMaintenanceTask.findFirst({ where: { id: candidate.data.taskId, propertyId: execution.propertyId, status: { not: MaintenanceTaskStatus.CANCELLED } } }) : null;
      if (!candidate.success || !task) {
        const error = new Error('Choose an open maintenance task and enter a valid future due date.');
        (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
        throw error;
      }
      const updated = await PropertyMaintenanceTaskService.updateTask(userId, task.id, { nextDueDate: candidate.data.nextDueDate });
      result = await homeDeadlineMonitorResult(userId, execution.propertyId, execution.message);
      captureId = input.idempotencyKey;
      capturedContextVersion = maintenanceTaskVersion(updated);
      canonicalOwner = 'PropertyMaintenanceTask';
    } else if (input.captureKey === 'HOME_DEADLINE_EXPIRATION_DATE') {
      const policiesMissingExpiry = await prisma.insurancePolicy.findMany({
        where: { propertyId: execution.propertyId, expiryDate: null },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        select: { id: true, carrierName: true, coverageType: true, updatedAt: true },
      });
      const currentVersion = createHash('sha256').update(JSON.stringify(policiesMissingExpiry)).digest('hex');
      if (currentVersion !== input.expectedContextVersion) {
        const error = new Error('Coverage records changed while this form was open. Review the refreshed choices and try again.');
        (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
        throw error;
      }
      const candidate = HomeDeadlineExpirationCaptureSchema.safeParse(input.answer);
      if (!candidate.success || !policiesMissingExpiry.some((policy) => policy.id === candidate.data?.policyId)) {
        const error = new Error('Choose an undated policy and enter a valid future expiration date.');
        (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
        throw error;
      }
      const property = await prisma.property.findUnique({ where: { id: execution.propertyId }, select: { homeownerProfileId: true } });
      if (!property) {
        const error = new Error('The selected home is no longer available.');
        (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
        throw error;
      }
      await updateInsurancePolicy(candidate.data.policyId, property.homeownerProfileId, {
        expiryDate: new Date(`${candidate.data.expiryDate}T00:00:00.000Z`),
      });
      result = await homeDeadlineMonitorResult(userId, execution.propertyId, execution.message);
      captureId = input.idempotencyKey;
      capturedContextVersion = result.contextVersion ?? createHash('sha256').update(`${candidate.data.policyId}:${candidate.data.expiryDate}`).digest('hex');
      canonicalOwner = 'InsurancePolicy';
    } else {
      const error = new Error('This deadline capture is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
  } else if (execution.operationId === 'REPLACEMENT_GUIDANCE') {
    const parameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    const inventoryItemId = parameters.inventoryItemId;
    if (typeof inventoryItemId !== 'string') {
      const error = new Error('The inventory item for this capture is no longer available.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const capture = await captureFeatureContext(execution.propertyId, userId, {
      ...input,
      featureKey: 'REPAIR_REPLACE',
      operationKey: 'RUN_ANALYSIS',
      operationInput: { inventoryItemId },
    });
    if (!capture || typeof capture !== 'object' || Array.isArray(capture)
      || !('captureId' in capture) || typeof capture.captureId !== 'string'
      || !('contextVersion' in capture) || typeof capture.contextVersion !== 'string') {
      throw new Error('Property context capture did not return a valid receipt.');
    }
    captureId = capture.captureId;
    capturedContextVersion = capture.contextVersion;
    const operation = resolveAskOperation(execution.message);
    result = await executeOperation({
      userId, sessionId: execution.sessionId, message: execution.message, propertyId: execution.propertyId, operation,
    });
    canonicalOwner = 'InventoryItem';
  } else {
    if (input.captureKey !== 'FINANCING_PROFILE_REFINANCE_INPUTS') {
      const error = new Error('This financing capture is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    if (input.sensitiveDataConfirmed !== true) {
      const error = new Error('Confirm the mortgage details before saving them to the Financing Profile.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_CONFIRMATION_REQUIRED';
      throw error;
    }
    const [currentContext, profile] = await Promise.all([
      getFinancialContextDecisions(execution.propertyId, userId, 'REFINANCE_RADAR'),
      getProfile(execution.propertyId),
    ]);
    if (currentContext.contextVersion !== input.expectedContextVersion) {
      const error = new Error('The financing profile changed while this answer was open. Review the refreshed values and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const candidate = RefinanceProfileCaptureSchema.safeParse({
      currentMortgageBalanceUsd: input.answer.currentMortgageBalanceUsd ?? (profile?.currentMortgageBalanceCents == null ? undefined : profile.currentMortgageBalanceCents / 100),
      interestRatePct: input.answer.interestRatePct ?? (profile?.interestRateBps == null ? undefined : profile.interestRateBps / 100),
      remainingTermYears: input.answer.remainingTermYears ?? (profile?.remainingTermMonths == null ? undefined : profile.remainingTermMonths / 12),
      monthlyPaymentUsd: input.answer.monthlyPaymentUsd ?? (profile?.monthlyPaymentCents == null ? undefined : profile.monthlyPaymentCents / 100),
    });
    if (!candidate.success) {
      const error = new Error('Enter a valid balance, current rate, and remaining term.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
      throw error;
    }
    await upsertProfile(execution.propertyId, {
      currentMortgageBalanceCents: Math.round(candidate.data.currentMortgageBalanceUsd * 100),
      mortgageBalanceAsOfDate: input.answer.currentMortgageBalanceUsd === undefined ? undefined : new Date().toISOString(),
      interestRateBps: Math.round(candidate.data.interestRatePct * 100),
      remainingTermMonths: Math.max(1, Math.round(candidate.data.remainingTermYears * 12)),
      monthlyPaymentCents: candidate.data.monthlyPaymentUsd === undefined ? undefined : Math.round(candidate.data.monthlyPaymentUsd * 100),
    });
    const nextContext = await getFinancialContextDecisions(execution.propertyId, userId, 'REFINANCE_RADAR');
    captureId = input.idempotencyKey;
    capturedContextVersion = nextContext.contextVersion;
    await prisma.askCaptureReceipt.upsert({
      where: { executionId_idempotencyKey: { executionId: execution.id, idempotencyKey: input.idempotencyKey } },
      create: {
        executionId: execution.id,
        idempotencyKey: input.idempotencyKey,
        captureKey: input.captureKey,
        canonicalOwner: 'PropertyFinancingProfile',
        answerHash,
        contextVersion: capturedContextVersion,
      },
      update: {},
    });
    const operation = resolveAskOperation(execution.message);
    result = await executeOperation({
      userId, sessionId: execution.sessionId, message: execution.message, propertyId: execution.propertyId, operation,
    });
    canonicalOwner = 'PropertyFinancingProfile';
  }
  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.askExecution.update({
      where: { id: execution.id },
      data: {
        status: result.status,
        reasonCode: result.reasonCode,
        contextVersion: result.contextVersion ?? capturedContextVersion,
        parametersJson: result.parameters ? asInputJson(result.parameters) : execution.parametersJson ?? undefined,
        resultJson: asInputJson({ schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: result.blocks, captureRequests: result.captureRequests ?? [], confirmation: result.confirmation ?? null, clarification: result.clarification ?? null, suggestions: result.suggestions }),
        completedAt: terminalStatus(result.status) ? new Date() : null,
      },
    });
    await tx.askCaptureReceipt.upsert({
      where: { executionId_idempotencyKey: { executionId: execution.id, idempotencyKey: input.idempotencyKey } },
      create: {
        executionId: execution.id,
        idempotencyKey: input.idempotencyKey,
        captureKey: input.captureKey,
        canonicalOwner,
        answerHash,
        contextVersion: result.contextVersion ?? capturedContextVersion,
      },
      update: { contextVersion: result.contextVersion ?? capturedContextVersion },
    });
    await tx.askExecutionEvent.create({
      data: { executionId: execution.id, eventType: 'CONTEXT_CAPTURED', metadataJson: asInputJson({ captureId, captureKey: input.captureKey, canonicalOwner, resumedStatus: result.status }) },
    });
    return updated;
  });
  askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: 'RESUMED' });
  if (result.captureRequests?.some((request) => request.captureKey === input.captureKey)) {
    askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: 'REPEATED_PROMPT' });
  }
  if (result.captureRequests?.length) askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: 'PROMPTED' }, result.captureRequests.length);
  return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
}

export async function recordAskCaptureEvent(userId: string, executionId: string, input: RecordAskCaptureEvent): Promise<void> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId }, select: { id: true, operationId: true, resultJson: true } });
  if (!execution) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  const stored = execution.resultJson && typeof execution.resultJson === 'object' && !Array.isArray(execution.resultJson)
    ? execution.resultJson as { captureRequests?: Array<{ requirementId?: unknown; captureKey?: unknown }> }
    : {};
  const active = stored.captureRequests?.some((request) => request.requirementId === input.requirementId && request.captureKey === input.captureKey);
  if (!active) return;
  await prisma.askExecutionEvent.create({
    data: { executionId, eventType: `CAPTURE_${input.event}`, metadataJson: asInputJson({ requirementId: input.requirementId, captureKey: input.captureKey }) },
  });
  askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: input.event });
}

export async function recordAskCaptureFailure(executionId: string, outcome: 'CONFLICT' | 'PERMISSION_DENIED' | 'RESUME_FAILED'): Promise<void> {
  const execution = await prisma.askExecution.findUnique({ where: { id: executionId }, select: { operationId: true } });
  if (execution) askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome });
}

export async function refreshAskExecutionAfterConflict(userId: string, executionId: string): Promise<AskExecutionResponse> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution || !execution.propertyId) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  await ensurePropertyAccess(userId, execution.propertyId);
  const operation = resolveAskOperation(execution.message);
  const result = await executeOperation({ userId, sessionId: execution.sessionId, message: execution.message, propertyId: execution.propertyId, operation });
  const saved = await prisma.askExecution.update({
    where: { id: execution.id },
    data: {
      status: result.status,
      reasonCode: result.reasonCode,
      contextVersion: result.contextVersion,
      parametersJson: result.parameters ? asInputJson(result.parameters) : execution.parametersJson ?? undefined,
      resultJson: asInputJson({ schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: result.blocks, captureRequests: result.captureRequests ?? [], confirmation: result.confirmation ?? null, clarification: result.clarification ?? null, suggestions: result.suggestions }),
      completedAt: terminalStatus(result.status) ? new Date() : null,
    },
  });
  await prisma.askExecutionEvent.create({ data: { executionId, eventType: 'CONTEXT_CONFLICT_REFRESHED', metadataJson: asInputJson({ contextVersion: result.contextVersion }) } });
  if (result.captureRequests?.length) askInlineCapturesTotal.inc({ operation: operation.operationId, outcome: 'PROMPTED' }, result.captureRequests.length);
  return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
}

export async function confirmAskExecution(userId: string, executionId: string, input: SubmitAskConfirmation): Promise<AskExecutionResponse> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution || !execution.propertyId) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  const inputHash = createHash('sha256').update(JSON.stringify({
    confirmationVersion: input.confirmationVersion,
    consentConfirmed: input.consentConfirmed,
  })).digest('hex');
  const previous = await prisma.askConfirmationReceipt.findUnique({ where: { executionId } });
  if (previous) {
    if (previous.inputHash !== inputHash) {
      const error = new Error('Another confirmation already claimed this execution.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_IDEMPOTENCY_CONFLICT';
      throw error;
    }
    if (previous.status === 'COMPLETED') return mapPersistedExecution(execution, await propertySummary(execution.propertyId));
  }
  const access = await ensurePropertyAccess(userId, execution.propertyId);
  const command = getAskDomainCommandByOperation(execution.operationId ?? '');
  const recoveringClaim = previous?.status === 'CLAIMED' && execution.status === 'RUNNING';
  if (!command || (execution.status !== 'NEEDS_CONFIRMATION' && !recoveringClaim)) {
    const error = new Error('This confirmation is no longer active.');
    (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
    throw error;
  }
  const roleRank = { VIEWER: 1, CONTRIBUTOR: 2, OWNER: 3 } as const;
  if (roleRank[access.role] < roleRank[command.roleFloor]) {
    const error = new Error(`${command.roleFloor.toLowerCase()} access is required for this command.`);
    (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
    throw error;
  }
  const parameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
    ? execution.parametersJson as Record<string, unknown>
    : {};
  const expectedVersion = parameters.confirmationVersion;
  const expiresAt = typeof parameters.confirmationExpiresAt === 'string' ? new Date(parameters.confirmationExpiresAt) : null;
  // Once a command has been durably claimed, confirmation expiry must not
  // incorrectly assert that no action occurred. Recovery replays only the
  // already-confirmed input through domain idempotency controls.
  if ((!expiresAt || expiresAt <= new Date()) && !recoveringClaim) {
    const expired = await prisma.askExecution.update({
      where: { id: execution.id },
      data: {
        status: 'EXPIRED', reasonCode: 'ASK_CONFIRMATION_EXPIRED', completedAt: new Date(),
        resultJson: asInputJson({ schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: [{ type: 'WORKFLOW_PROGRESS', id: 'confirmation-expired', title: 'Confirmation expired', status: 'EXPIRED', description: 'No action was performed. Ask again to review current home records and settings.', details: [], actions: [] }], captureRequests: [], confirmation: null, clarification: null, suggestions: ['Ask this question again'] }),
      },
    });
    await prisma.askExecutionEvent.create({ data: { executionId, eventType: 'EXPIRED', metadataJson: asInputJson({ reason: 'CONFIRMATION_EXPIRED' }) } });
    return mapPersistedExecution(expired, await propertySummary(execution.propertyId));
  }
  if (expectedVersion !== input.confirmationVersion) {
    const error = new Error('This confirmation version is no longer active.');
    (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
    throw error;
  }
  if (previous) {
    const recovered = await prisma.askConfirmationReceipt.updateMany({
      where: { executionId, status: 'CLAIMED', leaseExpiresAt: { lte: new Date() } },
      data: {
        idempotencyKey: input.idempotencyKey,
        inputHash,
        leaseExpiresAt: new Date(Date.now() + 60_000),
        attemptCount: { increment: 1 },
        lastErrorCode: null,
      },
    });
    if (recovered.count !== 1) {
      const error = new Error('This action is already being completed. Ask will reconcile the durable result shortly.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_IN_PROGRESS';
      throw error;
    }
    await prisma.askExecutionEvent.create({
      data: { executionId, eventType: 'CONFIRMATION_RECOVERY_CLAIMED', metadataJson: asInputJson({ confirmationVersion: input.confirmationVersion }) },
    });
  } else {
    try {
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.askExecution.updateMany({
          where: { id: execution.id, userId, status: 'NEEDS_CONFIRMATION' },
          data: { status: 'RUNNING', reasonCode: 'ASK_CONFIRMATION_CLAIMED', completedAt: null },
        });
        if (claimed.count !== 1) {
          const error = new Error('This confirmation is no longer active.');
          (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
          throw error;
        }
        await tx.askConfirmationReceipt.create({
          data: {
            executionId,
            idempotencyKey: input.idempotencyKey,
            confirmationVersion: input.confirmationVersion,
            inputHash,
            status: 'CLAIMED',
            leaseExpiresAt: new Date(Date.now() + 60_000),
          },
        });
        await tx.askExecutionEvent.create({
          data: { executionId, eventType: 'CONFIRMATION_CLAIMED', metadataJson: asInputJson({ confirmationVersion: input.confirmationVersion }) },
        });
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const winner = await prisma.askConfirmationReceipt.findUnique({ where: { executionId } });
      if (!winner || winner.inputHash !== inputHash) {
        const conflict = new Error('Another confirmation already claimed this execution.');
        (conflict as Error & { code?: string }).code = 'ASK_CONFIRMATION_IDEMPOTENCY_CONFLICT';
        throw conflict;
      }
      if (winner.status === 'COMPLETED') {
        const completed = await prisma.askExecution.findFirstOrThrow({ where: { id: executionId, userId } });
        return mapPersistedExecution(completed, await propertySummary(execution.propertyId));
      }
      const inProgress = new Error('This action is already being completed. Ask will reconcile the durable result shortly.');
      (inProgress as Error & { code?: string }).code = 'ASK_CONFIRMATION_IN_PROGRESS';
      throw inProgress;
    }
  }
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
  if (execution.operationId === 'MAINTENANCE_TASK_COMPLETE') {
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to complete maintenance tasks.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const taskId = parameters.maintenanceTaskId;
    if (typeof taskId !== 'string') {
      const error = new Error('The maintenance task selection is invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const task = await prisma.propertyMaintenanceTask.findFirst({ where: { id: taskId, propertyId: execution.propertyId } });
    if (!task) {
      const error = new Error('The selected maintenance task is no longer available.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const completionIdempotencyKey = `ask:${execution.id}:maintenance-completion`;
    const completionMetadata = task.completionMetadata && typeof task.completionMetadata === 'object' && !Array.isArray(task.completionMetadata)
      ? task.completionMetadata as Record<string, unknown>
      : {};
    const completedByThisExecution = task.status === MaintenanceTaskStatus.COMPLETED
      && completionMetadata.completionIdempotencyKey === completionIdempotencyKey;
    if (!completedByThisExecution && (task.status === MaintenanceTaskStatus.COMPLETED
      || task.status === MaintenanceTaskStatus.CANCELLED
      || parameters.maintenanceTaskVersion !== maintenanceTaskVersion(task))) {
      const error = new Error('This task changed while the confirmation was open. Review its current status and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const actualCostUsd = parameters.maintenanceActualCostUsd;
    const outcomeHealth = parameters.maintenanceOutcomeHealth;
    if (actualCostUsd !== null && actualCostUsd !== undefined && (typeof actualCostUsd !== 'number' || actualCostUsd < 0 || actualCostUsd > 10_000_000)) {
      const error = new Error('The actual maintenance cost is invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const projectOutcomeRequired = Boolean(task.actionKey?.match(/^project:[^:]+:follow-up$/));
    if (projectOutcomeRequired && !['CONFIRMED_HEALTHY', 'NEEDS_ATTENTION', 'FAILED'].includes(String(outcomeHealth))) {
      const error = new Error('Select the project follow-up outcome before completing this task.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const updated = completedByThisExecution
      ? task
      : await PropertyMaintenanceTaskService.updateTaskStatus(
        userId,
        task.id,
        MaintenanceTaskStatus.COMPLETED,
        typeof actualCostUsd === 'number' ? actualCostUsd : undefined,
        projectOutcomeRequired ? outcomeHealth as 'CONFIRMED_HEALTHY' | 'NEEDS_ATTENTION' | 'FAILED' : undefined,
        completionIdempotencyKey,
      );
    const taskHref = `/dashboard/maintenance?propertyId=${encodeURIComponent(execution.propertyId)}&taskId=${encodeURIComponent(updated.id)}&from=ask`;
    result = {
      status: 'COMPLETED', reasonCode: 'MAINTENANCE_TASK_COMPLETED', contextVersion: maintenanceTaskVersion(updated),
      blocks: [{
        type: 'WORKFLOW_PROGRESS', id: `maintenance-completed-${updated.id}`, title: 'Maintenance task completed', status: 'COMPLETED',
        description: updated.isRecurring && updated.frequency
          ? 'This occurrence is complete and the recurring task’s next due date has been recalculated.'
          : 'Completion is recorded in this home’s canonical Maintenance record.',
        details: [
          { label: 'Task', value: updated.title },
          { label: 'Completed', value: humanDate(updated.lastCompletedDate) ?? 'Recorded now' },
          { label: 'Actual cost', value: updated.actualCost == null ? 'Not recorded' : maintenanceMoney(updated.actualCost) ?? 'Not recorded' },
          ...(updated.isRecurring ? [{ label: 'Next due', value: humanDate(updated.nextDueDate) ?? 'Not scheduled' }] : []),
          ...(projectOutcomeRequired ? [{ label: 'Project outcome', value: String(outcomeHealth).toLowerCase().replace(/_/g, ' ') }] : []),
        ],
        actions: [{ id: 'open-task', label: 'Open completed task', href: taskHref, style: 'PRIMARY' }],
      }],
      confirmation: null,
      suggestions: ['What maintenance is still pending?', 'Show maintenance completed this year'],
    };
    artifactType = 'PROPERTY_MAINTENANCE_TASK_COMPLETION';
    artifactId = updated.id;
  } else if (execution.operationId === 'MAINTENANCE_TASK_CREATE') {
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to create maintenance tasks.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const expectedMaintenanceVersion = parameters.maintenanceWorkflowVersion;
    const currentMaintenanceVersion = await maintenanceWorkflowVersion(execution.propertyId);
    const candidate = MaintenanceTaskWorkflowInputSchema.safeParse({
      title: parameters.maintenanceTitle,
      description: parameters.maintenanceDescription ?? undefined,
      priority: parameters.maintenancePriority,
      nextDueDate: parameters.maintenanceNextDueDate ?? undefined,
      estimatedCostUsd: parameters.maintenanceEstimatedCostUsd ?? undefined,
      isRecurring: parameters.maintenanceIsRecurring,
      frequency: parameters.maintenanceFrequency ?? undefined,
    });
    if (!candidate.success || expectedMaintenanceVersion !== currentMaintenanceVersion) {
      const error = new Error(expectedMaintenanceVersion !== currentMaintenanceVersion
        ? 'Maintenance tasks changed while this confirmation was open. Review the current record and try again.'
        : 'The maintenance task details are invalid.');
      (error as Error & { code?: string }).code = expectedMaintenanceVersion !== currentMaintenanceVersion
        ? 'ASK_CONTEXT_VERSION_CONFLICT'
        : 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const actionKey = `ask:${execution.id}:maintenance-task`;
    let task = await prisma.propertyMaintenanceTask.findUnique({
      where: { propertyId_actionKey: { propertyId: execution.propertyId, actionKey } },
    });
    if (!task) {
      try {
        task = await PropertyMaintenanceTaskService.createUserTask(userId, execution.propertyId, {
          title: candidate.data.title,
          description: candidate.data.description,
          priority: candidate.data.priority,
          estimatedCost: candidate.data.estimatedCostUsd,
          isRecurring: candidate.data.isRecurring,
          frequency: candidate.data.isRecurring ? candidate.data.frequency : undefined,
          nextDueDate: candidate.data.nextDueDate,
          actionKey,
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
        task = await prisma.propertyMaintenanceTask.findUnique({
          where: { propertyId_actionKey: { propertyId: execution.propertyId, actionKey } },
        });
        if (!task) throw error;
      }
    }
    const maintenanceHref = `/dashboard/maintenance?propertyId=${encodeURIComponent(execution.propertyId)}&taskId=${encodeURIComponent(task.id)}&from=ask`;
    result = {
      status: 'COMPLETED', reasonCode: 'MAINTENANCE_TASK_CREATED', contextVersion: await maintenanceWorkflowVersion(execution.propertyId),
      blocks: [{
        type: 'WORKFLOW_PROGRESS', id: `maintenance-task-${task.id}`, title: 'Maintenance task created', status: 'COMPLETED',
        description: 'The task is now part of this home’s canonical Maintenance record.',
        details: [
          { label: 'Task', value: task.title },
          { label: 'Status', value: 'Pending' },
          { label: 'Priority', value: task.priority.toLowerCase().replace(/_/g, ' ') },
          { label: 'Due', value: task.nextDueDate ? humanDate(task.nextDueDate) ?? task.nextDueDate.toISOString() : 'Not scheduled' },
          { label: 'Recurrence', value: task.isRecurring && task.frequency ? task.frequency.toLowerCase().replace(/_/g, ' ') : 'One-time' },
        ],
        actions: [{ id: 'open-task', label: 'Open task', href: maintenanceHref, style: 'PRIMARY' }],
      }],
      confirmation: null,
      suggestions: ['What maintenance is still pending?', 'Create a maintenance task'],
    };
    artifactType = 'PROPERTY_MAINTENANCE_TASK';
    artifactId = task.id;
  } else if (execution.operationId === 'MAINTENANCE_TASK_UPDATE') {
    const candidate = MaintenanceTaskUpdateInputSchema.safeParse(parameters.maintenanceUpdate);
    if (!candidate.success) {
      const error = new Error('The maintenance update is invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const current = await prisma.propertyMaintenanceTask.findFirst({ where: { id: candidate.data.taskId, propertyId: execution.propertyId } });
    if (!current || parameters.maintenanceTaskVersion !== maintenanceTaskVersion(current)) {
      const error = new Error('This task changed while the confirmation was open. Review its current state and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    if (candidate.data.action === 'ASSIGN' || candidate.data.action === 'UNASSIGN') {
      await householdService.assignTask(execution.propertyId, current.id, 'MAINTENANCE', candidate.data.assigneeUserId ?? null, userId);
    } else if (candidate.data.action === 'ARCHIVE') {
      await PropertyMaintenanceTaskService.updateTaskStatus(userId, current.id, MaintenanceTaskStatus.CANCELLED);
    } else if (candidate.data.action === 'REOPEN') {
      await PropertyMaintenanceTaskService.updateTaskStatus(userId, current.id, MaintenanceTaskStatus.PENDING);
    } else {
      await PropertyMaintenanceTaskService.updateTask(userId, current.id, {
        ...(candidate.data.priority ? { priority: candidate.data.priority } : {}),
        ...(candidate.data.nextDueDate !== undefined ? { nextDueDate: candidate.data.nextDueDate } : {}),
        ...(candidate.data.title ? { title: candidate.data.title } : {}),
      });
    }
    const updated = await prisma.propertyMaintenanceTask.findUniqueOrThrow({ where: { id: current.id }, include: { assignedTo: { select: { email: true } } } });
    const maintenanceHref = `/dashboard/maintenance?propertyId=${encodeURIComponent(execution.propertyId)}&taskId=${encodeURIComponent(updated.id)}&from=ask`;
    result = {
      status: 'COMPLETED', reasonCode: 'MAINTENANCE_TASK_UPDATED', contextVersion: maintenanceTaskVersion(updated),
      blocks: [{ type: 'WORKFLOW_PROGRESS', id: `maintenance-update-${updated.id}`, title: 'Maintenance task updated', status: candidate.data.action === 'ARCHIVE' ? 'CANCELLED' : 'COMPLETED', description: 'The canonical Maintenance record and its downstream work state were updated.', details: [{ label: 'Task', value: updated.title }, { label: 'Action', value: candidate.data.action.toLowerCase() }, { label: 'Status', value: updated.status.toLowerCase().replace(/_/g, ' ') }, { label: 'Due', value: humanDate(updated.nextDueDate) ?? 'Not scheduled' }, { label: 'Assignee', value: updated.assignedTo?.email ?? 'Unassigned' }], actions: [{ id: 'open-task', label: 'Open task', href: maintenanceHref, style: 'PRIMARY' }] }],
      confirmation: null, suggestions: candidate.data.action === 'ARCHIVE' ? [`Reopen ${updated.title}`] : ['What maintenance is pending?'],
    };
    artifactType = command.artifactType;
    artifactId = updated.id;
  } else if (execution.operationId === 'GUIDANCE_JOURNEY_CREATE') {
    const candidate = GuidanceJourneyCommandInputSchema.safeParse(parameters.guidanceJourney);
    if (!candidate.success) {
      const error = new Error('The guided plan settings are invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    if (parameters.guidanceJourneyContextVersion !== await guidanceJourneyContextVersion(execution.propertyId, candidate.data)) {
      const error = new Error('The guided-plan scope changed while confirmation was open. Review the current home record and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const journey = await guidanceJourneyService.createUserInitiatedJourney(execution.propertyId, {
      scopeCategory: candidate.data.scopeCategory,
      scopeId: candidate.data.scopeId,
      issueType: candidate.data.issueType,
      inventoryItemId: candidate.data.inventoryItemId,
      serviceKey: candidate.data.serviceKey,
      customIssueLabel: candidate.data.label,
      sourceAskExecutionId: execution.id,
    }, userId);
    const href = `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/tools/guidance-overview?journeyId=${encodeURIComponent(journey.id)}`;
    result = { status: 'COMPLETED', reasonCode: 'GUIDANCE_JOURNEY_CREATED', blocks: [{ type: 'WORKFLOW_PROGRESS', id: `guidance-journey-${journey.id}`, title: 'Guided plan started', status: 'COMPLETED', description: 'The resumable guidance journey is now linked to this home.', details: [{ label: 'Scope', value: candidate.data.label }, { label: 'Plan', value: candidate.data.issueType.replace(/_/g, ' ') }], actions: [{ id: 'open-journey', label: 'Open guided plan', href, style: 'PRIMARY' }] }], confirmation: null, suggestions: [] };
    artifactType = command.artifactType;
    artifactId = journey.id;
  } else if (execution.operationId === 'QUOTE_COMPARISON_CREATE') {
    const candidate = QuoteWorkspaceCommandInputSchema.safeParse(parameters.quoteWorkspace);
    if (!candidate.success) {
      const error = new Error('The comparison workspace settings are invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    if (parameters.quoteWorkspaceContextVersion !== await quoteWorkspaceContextVersion(execution.propertyId)) {
      const error = new Error('Quote workspaces changed while confirmation was open. Review the current comparison and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const created = await getOrCreateQuoteComparisonWorkspace(execution.propertyId, userId, candidate.data);
    const href = `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/tools/quote-comparison?workspaceId=${encodeURIComponent(created.workspace.id)}`;
    result = { status: 'COMPLETED', reasonCode: created.reused ? 'QUOTE_COMPARISON_REUSED' : 'QUOTE_COMPARISON_CREATED', blocks: [{ type: 'WORKFLOW_PROGRESS', id: `quote-workspace-${created.workspace.id}`, title: created.reused ? 'Existing comparison workspace opened' : 'Quote comparison workspace created', status: 'COMPLETED', description: 'No provider or quote was selected. Add comparable proposals in the governed workspace.', details: [{ label: 'Service', value: candidate.data.serviceCategory.toLowerCase().replace(/_/g, ' ') }, { label: 'Status', value: created.workspace.status.toLowerCase() }], actions: [{ id: 'open-workspace', label: 'Open comparison', href, style: 'PRIMARY' }] }], confirmation: null, suggestions: [] };
    artifactType = command.artifactType;
    artifactId = created.workspace.id;
  } else if (execution.operationId === 'HOME_DEADLINE_MONITOR') {
    const candidate = HomeDeadlineMonitorInputSchema.safeParse(parameters.homeDeadlineMonitor);
    if (!candidate.success) {
      const error = new Error('The expiration reminder settings are invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    let task;
    if (candidate.data.sourceType === 'MAINTENANCE') {
      task = await prisma.propertyMaintenanceTask.findFirst({ where: { id: candidate.data.sourceId, propertyId: execution.propertyId } });
      if (!task || task.status === MaintenanceTaskStatus.CANCELLED || !task.nextDueDate || parameters.maintenanceTaskVersion !== maintenanceTaskVersion(task)) {
        const error = new Error('This maintenance task changed while confirmation was open. Review the current task and try again.');
        (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
        throw error;
      }
    } else {
      const actionKey = `ask-deadline:${candidate.data.sourceType}:${candidate.data.sourceId}`;
      task = await prisma.propertyMaintenanceTask.findUnique({ where: { propertyId_actionKey: { propertyId: execution.propertyId, actionKey } } });
      if (!task) {
        try {
          task = await PropertyMaintenanceTaskService.createUserTask(userId, execution.propertyId, { title: candidate.data.title, priority: MaintenanceTaskPriority.HIGH, nextDueDate: candidate.data.dueDate, actionKey });
        } catch (error) {
          if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
          task = await prisma.propertyMaintenanceTask.findUnique({ where: { propertyId_actionKey: { propertyId: execution.propertyId, actionKey } } });
          if (!task) throw error;
        }
      } else if (task.nextDueDate?.toISOString().slice(0, 10) !== candidate.data.dueDate || task.status === MaintenanceTaskStatus.CANCELLED) {
        task = await PropertyMaintenanceTaskService.updateTask(userId, task.id, { nextDueDate: candidate.data.dueDate, status: MaintenanceTaskStatus.PENDING, priority: MaintenanceTaskPriority.HIGH });
      }
    }
    await Promise.all(['MAINTENANCE', 'MATERIAL_DEADLINE'].map((category) => upsertNotificationPreference(userId, { propertyId: execution.propertyId!, category: category as 'MAINTENANCE' | 'MATERIAL_DEADLINE', channel: 'EMAIL', enabled: true, cadence: 'IMMEDIATE', timezone: 'UTC' })));
    const href = `/dashboard/maintenance?propertyId=${encodeURIComponent(execution.propertyId)}&taskId=${encodeURIComponent(task.id)}&from=ask`;
    const maintenanceSource = candidate.data.sourceType === 'MAINTENANCE';
    result = { status: 'COMPLETED', reasonCode: maintenanceSource ? 'MAINTENANCE_MONITOR_ACTIVE' : 'HOME_DEADLINE_MONITOR_ACTIVE', blocks: [{ type: 'WORKFLOW_PROGRESS', id: `home-deadline-${task.id}`, title: maintenanceSource ? 'Maintenance reminders are active' : 'Expiration reminder is active', status: 'COMPLETED', description: maintenanceSource ? 'The existing canonical task now has governed in-app and email delivery preferences; no duplicate task was created.' : 'A canonical dated obligation now drives governed in-app and email reminders.', details: [{ label: 'Reminder', value: task.title }, { label: 'Due', value: candidate.data.dueDate }, { label: maintenanceSource ? 'Reminder window' : 'Lead time', value: maintenanceSource ? 'Within 7 days of due date' : `${candidate.data.leadDays} days` }, { label: 'Channel', value: 'In-app plus email' }], actions: [{ id: 'manage-reminder', label: 'Manage reminder', href, style: 'PRIMARY' }] }], confirmation: null, suggestions: [`Reschedule ${task.title}`, `Archive ${task.title}`] };
    artifactType = command.artifactType;
    artifactId = task.id;
  } else if (execution.operationId === 'HOUSEHOLD_INVITATION') {
    if (access.role !== HouseholdRole.OWNER) {
      const error = new Error('Only a household owner can send this invitation.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const inviteEmail = parameters.inviteEmail;
    const inviteRole = parameters.inviteRole;
    const expectedHouseholdVersion = parameters.householdContextVersion;
    const currentHouseholdVersion = await householdWorkflowVersion(execution.propertyId);
    const candidate = HouseholdInvitationInputSchema.safeParse({ email: inviteEmail, role: inviteRole });
    if (!candidate.success || expectedHouseholdVersion !== currentHouseholdVersion) {
      const error = new Error(expectedHouseholdVersion !== currentHouseholdVersion
        ? 'Household access changed while this confirmation was open. Review the current household and try again.'
        : 'The household invitation settings are invalid.');
      (error as Error & { code?: string }).code = expectedHouseholdVersion !== currentHouseholdVersion
        ? 'ASK_CONTEXT_VERSION_CONFLICT'
        : 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const invite = await householdService.sendInvite(
      execution.propertyId,
      userId,
      candidate.data,
      { sourceAskExecutionId: execution.id },
    );
    const householdHref = `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/household`;
    result = {
      status: 'COMPLETED', reasonCode: 'HOUSEHOLD_INVITATION_PENDING',
      blocks: [{
        type: 'WORKFLOW_PROGRESS', id: `household-invite-${invite.id}`, title: 'Household invitation is pending', status: 'PENDING',
        description: 'The invitation record is ready. Access is not active until the recipient accepts it.',
        details: [
          { label: 'Recipient', value: invite.inviteeEmail },
          { label: 'Role', value: invitationRoleCopy(invite.role as InvitableHouseholdRole) },
          { label: 'Expires', value: humanDate(invite.expiresAt) ?? invite.expiresAt.toISOString() },
          { label: 'Access status', value: 'Pending acceptance' },
        ],
        actions: [{ id: 'manage-invitation', label: 'Manage invitation', href: householdHref, style: 'PRIMARY' }],
      }],
      confirmation: null,
      suggestions: ['Who currently has access to this home?'],
    };
    artifactType = 'HOUSEHOLD_INVITE';
    artifactId = invite.id;
  } else {
    const thresholdPct = parameters.thresholdPct;
    const product = parameters.product;
    if (typeof thresholdPct !== 'number' || (product !== 'FIXED_30_YEAR' && product !== 'FIXED_15_YEAR')) {
      const error = new Error('The monitor settings are invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    if (parameters.refinanceMonitorContextVersion !== await refinanceMonitorContextVersion(userId, execution.propertyId)) {
      const error = new Error('Mortgage-rate data or notification settings changed while confirmation was open. Review the current settings and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const monitor = await createOrUpdateRefinanceRateMonitor({
      userId, propertyId: execution.propertyId, thresholdPct,
      product: product as RefinanceRateMonitorProduct,
      cadence: NotificationCadence.IMMEDIATE,
      quietStart: typeof parameters.quietStart === 'string' ? parameters.quietStart : null,
      quietEnd: typeof parameters.quietEnd === 'string' ? parameters.quietEnd : null,
      timezone: typeof parameters.timezone === 'string' ? parameters.timezone : 'UTC',
    });
    const radarHref = `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/tools/mortgage-refinance-radar?section=alerts`;
    result = {
      status: 'COMPLETED', reasonCode: 'RATE_MONITOR_ACTIVE',
      blocks: [{
        type: 'MONITOR', id: `rate-monitor-${monitor.id}`, monitorId: monitor.id,
        title: 'Mortgage-rate monitor is active', status: monitor.status,
        threshold: `${monitor.thresholdPct.toFixed(3)}% or lower`,
        product: monitor.product === 'FIXED_15_YEAR' ? '15-year fixed national benchmark' : '30-year fixed national benchmark',
        channel: 'Email plus in-app', cadence: monitor.cadence,
        quietHours: monitor.quietStart && monitor.quietEnd ? `${monitor.quietStart}–${monitor.quietEnd} (${monitor.timezone})` : null,
        sourceBoundary: 'Evaluates governed national benchmark snapshots; this is not a personalized lender offer.',
        actions: [
          { id: 'edit-monitor', label: 'Edit settings', href: radarHref, style: 'PRIMARY' },
          { id: 'pause-monitor', label: 'Pause', href: `${radarHref}&monitorAction=pause`, style: 'SECONDARY' },
          { id: 'stop-monitor', label: 'Stop', href: `${radarHref}&monitorAction=stop`, style: 'QUIET' },
        ],
      }],
      confirmation: null, suggestions: ['Is refinancing worth reviewing now?'],
    };
    artifactType = 'REFINANCE_RATE_MONITOR';
    artifactId = monitor.id;
  }
  let saved: typeof execution;
  try {
    saved = await prisma.$transaction(async (tx) => {
      const updated = await tx.askExecution.update({
        where: { id: execution.id },
        data: { status: result.status, reasonCode: result.reasonCode, contextVersion: result.contextVersion, resultJson: asInputJson({ schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: result.blocks, captureRequests: [], confirmation: null, clarification: null, suggestions: result.suggestions }), completedAt: new Date() },
      });
      await tx.askConfirmationReceipt.update({
        where: { executionId },
        data: { status: 'COMPLETED', artifactType, artifactId, completedAt: new Date(), lastErrorCode: null },
      });
      await tx.askExecutionEvent.create({ data: { executionId, eventType: 'CONFIRMED', metadataJson: asInputJson({ artifactType, artifactId }) } });
      return updated;
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const duplicate = await prisma.askConfirmationReceipt.findUnique({ where: { executionId } });
    if (!duplicate || duplicate.idempotencyKey !== input.idempotencyKey || duplicate.inputHash !== inputHash) throw error;
    const completed = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
    if (!completed) throw error;
    saved = completed;
  }
  return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
}

export async function cancelAskExecution(userId: string, executionId: string): Promise<AskExecutionResponse> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  if (execution.status !== 'NEEDS_CONFIRMATION') return mapPersistedExecution(execution, await propertySummary(execution.propertyId));
  const command = getAskDomainCommandByOperation(execution.operationId ?? '');
  if (!command || !command.supportsCancelBeforeExecution) {
    const error = new Error('This execution does not have an active cancellable command.');
    (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
    throw error;
  }
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'confirmation-cancelled',
    title: command.cancellation.title,
    body: command.cancellation.body,
    tone: 'DEFAULT', actions: [],
  }];
  const saved = await prisma.askExecution.update({
    where: { id: execution.id },
    data: {
      status: 'CANCELLED', reasonCode: 'USER_CANCELLED',
      resultJson: asInputJson({
        schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
        blocks,
        captureRequests: [],
        confirmation: null,
        clarification: null,
        suggestions: [command.cancellation.suggestion],
      }),
      completedAt: new Date(),
    },
  });
  await prisma.askExecutionEvent.create({ data: { executionId, eventType: 'CANCELLED' } });
  return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
}

export async function getAskSession(userId: string, sessionId: string): Promise<AskExecutionResponse[]> {
  const session = await prisma.askSession.findFirst({ where: { id: sessionId, userId }, select: { id: true } });
  if (!session) return [];
  const executions = await prisma.askExecution.findMany({ where: { sessionId, userId }, orderBy: { createdAt: 'asc' } });
  const propertyIds = [...new Set(executions.map((execution) => execution.propertyId).filter((value): value is string => Boolean(value)))];
  const properties = await prisma.property.findMany({ where: { id: { in: propertyIds } }, select: { id: true, name: true, address: true, city: true, state: true } });
  const labels = new Map(properties.map((property) => [property.id, { id: property.id, label: propertyLabel(property) }]));
  return executions.map((execution) => mapPersistedExecution(execution, execution.propertyId ? labels.get(execution.propertyId) ?? null : null));
}

export async function getAskExecution(userId: string, executionId: string): Promise<AskExecutionResponse> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  return mapPersistedExecution(execution, await propertySummary(execution.propertyId));
}

const INTERACTIVE_ASK_STATUSES: AskExecutionStatus[] = ['NEEDS_ENTITY', 'NEEDS_CLARIFICATION', 'NEEDS_CONTEXT', 'NEEDS_CONFIRMATION'];
const CONTINUABLE_ASK_STATUSES: AskExecutionStatus[] = [...INTERACTIVE_ASK_STATUSES, 'RUNNING'];

function pendingKind(status: AskExecutionStatus): AskPendingWorkItem['pendingKind'] {
  if (status === 'RUNNING') return 'COMMAND_RECOVERY';
  if (status === 'NEEDS_ENTITY') return 'ENTITY_SELECTION';
  if (status === 'NEEDS_CONTEXT') return 'CONTEXT_CAPTURE';
  if (status === 'NEEDS_CONFIRMATION') return 'CONFIRMATION';
  return 'CLARIFICATION';
}

function pendingActionLabel(status: AskExecutionStatus): string {
  if (status === 'RUNNING') return 'Check action status';
  if (status === 'NEEDS_ENTITY') return 'Choose a record';
  if (status === 'NEEDS_CONTEXT') return 'Add the missing detail';
  if (status === 'NEEDS_CONFIRMATION') return 'Review and confirm';
  return 'Answer one question';
}

function pendingInteractionExpiresAt(execution: { resultJson: Prisma.JsonValue | null }): Date | null {
  if (!execution.resultJson || typeof execution.resultJson !== 'object' || Array.isArray(execution.resultJson)) return null;
  const result = execution.resultJson as { clarification?: unknown; confirmation?: unknown };
  const interaction = result.clarification && typeof result.clarification === 'object' && !Array.isArray(result.clarification)
    ? result.clarification as Record<string, unknown>
    : result.confirmation && typeof result.confirmation === 'object' && !Array.isArray(result.confirmation)
      ? result.confirmation as Record<string, unknown>
      : null;
  const value = interaction?.expiresAt;
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function expirePendingInteraction(execution: AskExecution): Promise<AskExecution> {
  if (execution.status === 'RUNNING') return execution;
  const interactionExpiresAt = pendingInteractionExpiresAt(execution);
  if (!interactionExpiresAt || interactionExpiresAt > new Date()) return execution;
  const updated = await prisma.askExecution.updateMany({
    where: { id: execution.id, userId: execution.userId, status: execution.status },
    data: {
      status: 'EXPIRED', reasonCode: 'ASK_EXECUTION_EXPIRED', completedAt: new Date(),
      resultJson: asInputJson({
        schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
        blocks: [{ type: 'WORKFLOW_PROGRESS', id: 'pending-work-expired', title: 'This pending request expired', status: 'EXPIRED', description: 'No action was performed. Ask the question again to use current home records and settings.', details: [], actions: [] }],
        captureRequests: [], clarification: null, confirmation: null, suggestions: ['Ask this question again'],
      }),
    },
  });
  if (updated.count === 1) {
    await prisma.askExecutionEvent.create({ data: { executionId: execution.id, eventType: 'EXPIRED', metadataJson: asInputJson({ reason: 'PENDING_INTERACTION_EXPIRED' }) } });
  }
  return prisma.askExecution.findUniqueOrThrow({ where: { id: execution.id } });
}

export async function getAskPendingWork(userId: string, propertyId: string | null): Promise<AskPendingWorkItem[]> {
  if (propertyId) await ensurePropertyAccess(userId, propertyId);
  const rows = await prisma.askExecution.findMany({
    where: {
      userId,
      propertyId,
      AND: [
        { OR: [
          { status: { in: INTERACTIVE_ASK_STATUSES } },
          { status: 'RUNNING', confirmations: { some: { status: 'CLAIMED' } } },
        ] },
        { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });
  const property = await propertySummary(propertyId);
  const items: AskPendingWorkItem[] = [];
  for (const row of rows) {
    const current = await expirePendingInteraction(row);
    if (!CONTINUABLE_ASK_STATUSES.includes(current.status)) continue;
    items.push({
      pendingKind: pendingKind(current.status),
      actionLabel: pendingActionLabel(current.status),
      execution: mapPersistedExecution(current, property),
    });
  }
  return items;
}

export async function continueAskExecution(userId: string, executionId: string, input: ContinueAskExecution): Promise<AskExecutionResponse> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  if (execution.propertyId) await ensurePropertyAccess(userId, execution.propertyId);
  const current = CONTINUABLE_ASK_STATUSES.includes(execution.status) ? await expirePendingInteraction(execution) : execution;
  if (CONTINUABLE_ASK_STATUSES.includes(current.status)) {
    await prisma.askExecutionEvent.create({
      data: { executionId, eventType: 'CONTINUATION_OPENED', metadataJson: asInputJson({ surface: input.surface, status: current.status }) },
    });
    await prisma.askSession.update({ where: { id: current.sessionId }, data: { lastActiveAt: new Date() } });
  }
  return mapPersistedExecution(current, await propertySummary(current.propertyId));
}

export async function requestAskCorrection(userId: string, executionId: string, input: RequestAskCorrection): Promise<{ executionId: string; href: string }> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  if (execution.propertyId) await ensurePropertyAccess(userId, execution.propertyId);
  const href = input.kind === 'RETRY_RESPONSE'
    ? `/dashboard/ask?retryExecutionId=${encodeURIComponent(execution.id)}`
    : captureFallbackHref(execution.operationId, execution.propertyId) ?? '/dashboard/ask';
  await prisma.askExecutionEvent.create({ data: { executionId, eventType: 'CORRECTION_REQUESTED', metadataJson: asInputJson({ kind: input.kind }) } });
  return { executionId, href };
}

export async function submitAskExecutionFeedback(userId: string, executionId: string, input: SubmitAskFeedback): Promise<{ id: string; rating: 'UP' | 'DOWN' }> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId }, select: { id: true, propertyId: true } });
  if (!execution) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  const page = `ask:execution:${execution.id}`;
  const existing = await prisma.feedback.findFirst({ where: { userId, page }, orderBy: { createdAt: 'desc' } });
  const saved = existing
    ? await prisma.feedback.update({ where: { id: existing.id }, data: { rating: input.rating.toLowerCase(), comment: input.comment ?? null, propertyId: execution.propertyId } })
    : await prisma.feedback.create({ data: { userId, propertyId: execution.propertyId, rating: input.rating.toLowerCase(), comment: input.comment ?? null, page } });
  askFeedbackTotal.inc({ rating: input.rating.toLowerCase() });
  return { id: saved.id, rating: input.rating };
}
