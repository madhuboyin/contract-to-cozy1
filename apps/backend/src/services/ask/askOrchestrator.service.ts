import { AskExecutionStatus, HouseholdRole, MaintenanceTaskStatus, NotificationCadence, Prisma, RefinanceRateMonitorProduct } from '@prisma/client';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import {
  AskExecutionResponseSchema,
  type AskCaptureRequest,
  type AskExecutionResponse,
  type AskPresentationBlock,
  type CreateAskExecutionRequest,
  type SubmitAskCaptureRequest,
  type SubmitAskConfirmation,
} from '../../productFramework/ask/ask.contract';
import { resolvePropertyAccess } from '../propertyAccess.service';
import { PropertyMaintenanceTaskService } from '../PropertyMaintenanceTask.service';
import { getCoverageReviewItems, type CoverageReviewGroup } from '../coverageGap.service';
import { answerGroundedAsk } from '../groundedAsk.service';
import {
  buildCapabilityCatalog,
  canonicalCapabilityRegistry,
  type CapabilityCatalogItem,
} from '../../productFramework/capabilities';
import { createToolDiscoveryCapabilityAvailabilityAdapter } from '../toolDiscoveryAvailability.service';
import {
  resolveAskOperation,
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

const SESSION_TTL_DAYS = 30;
const MAX_RESULT_ITEMS = 50;
const refinanceRadarService = new RefinanceRadarService();
const mortgageRateService = new MortgageRateService();
const householdService = new HouseholdService();
const homeSavingsService = new HomeSavingsService();
const hiddenAssetService = new HiddenAssetService();
const sellHoldRentService = new SellHoldRentService();
const inventoryService = new InventoryService();

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

function asInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function humanDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(value);
}

function propertyLabel(property: { name: string | null; address: string; city: string; state: string }): string {
  return property.name?.trim() || `${property.address}, ${property.city}, ${property.state}`;
}

function terminalStatus(status: AskOperationResult['status']): boolean {
  return ['ANSWERED', 'COMPLETED', 'NOT_APPLICABLE', 'UNAVAILABLE', 'OUT_OF_SCOPE', 'BLOCKED', 'FAILED_TERMINAL'].includes(status);
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
    reasonCode: 'PROPERTY_REQUIRED',
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

async function maintenanceResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const tasks = await PropertyMaintenanceTaskService.getTasksForProperty(userId, propertyId, { includeCompleted: true });
  const completed = tasks.filter((task) => task.status === MaintenanceTaskStatus.COMPLETED);
  const pending = tasks.filter((task) => task.status !== MaintenanceTaskStatus.COMPLETED && task.status !== MaintenanceTaskStatus.CANCELLED);
  const wantsCompletedOnly = /\bcompleted|finished|done\b/i.test(message) && !/\bpending|remaining|still|overdue\b/i.test(message);
  const wantsPendingOnly = /\bpending|remaining|still|overdue|due soon\b/i.test(message) && !/\bcompleted|finished|done\b/i.test(message);
  const sections = [
    ...(!wantsPendingOnly ? [{ id: 'completed', title: 'Completed', records: completed }] : []),
    ...(!wantsCompletedOnly ? [{ id: 'pending', title: 'Pending', records: pending }] : []),
  ].map((section) => ({
    id: section.id,
    title: section.title,
    count: section.records.length,
    items: section.records.slice(0, MAX_RESULT_ITEMS).map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description ?? null,
      status: task.status,
      meta: [
        task.inventoryItem?.name ?? task.category ?? task.assetType ?? '',
        task.status === MaintenanceTaskStatus.COMPLETED
          ? humanDate(task.lastCompletedDate) ? `Completed ${humanDate(task.lastCompletedDate)}` : 'Completed date not recorded'
          : humanDate(task.nextDueDate) ? `Due ${humanDate(task.nextDueDate)}` : 'No due date',
        `${task.priority.toLowerCase()} priority`,
      ].filter(Boolean),
      href: `/dashboard/maintenance?propertyId=${encodeURIComponent(propertyId)}`,
    })),
  }));

  return {
    status: 'ANSWERED',
    blocks: [{
      type: 'SUMMARY',
      id: 'maintenance-summary',
      title: pending.length ? `${pending.length} maintenance task${pending.length === 1 ? '' : 's'} still need attention` : 'No pending maintenance tasks found',
      body: `${completed.length} completed and ${pending.length} pending task${pending.length === 1 ? '' : 's'} are recorded for this home. Cancelled tasks are excluded.`,
      tone: pending.some((task) => task.nextDueDate && task.nextDueDate < new Date()) ? 'CAUTION' : 'DEFAULT',
      actions: [{ id: 'open-maintenance', label: 'Open maintenance', href: `/dashboard/maintenance?propertyId=${encodeURIComponent(propertyId)}`, style: 'PRIMARY' }],
    }, {
      type: 'GROUPED_LIST',
      id: 'maintenance-groups',
      title: 'Maintenance record',
      description: tasks.length > MAX_RESULT_ITEMS ? `Showing up to ${MAX_RESULT_ITEMS} items per section.` : null,
      sections,
      actions: [],
    }],
    suggestions: ['Show overdue tasks only', 'What maintenance is coming up next?', 'Create a maintenance task'],
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

async function replacementGuidanceResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  const items = await prisma.inventoryItem.findMany({
    where: {
      propertyId,
      OR: [
        { name: { contains: 'refrigerator', mode: 'insensitive' } },
        { name: { contains: 'fridge', mode: 'insensitive' } },
        { assetType: { contains: 'refrigerator', mode: 'insensitive' } },
      ],
    },
    orderBy: [{ isVerified: 'desc' }, { updatedAt: 'desc' }],
    take: 2,
    select: { id: true, name: true, condition: true, installedOn: true, purchasedOn: true, expectedExpiryDate: true },
  });
  if (!items.length) {
    return {
      status: 'READY_WITH_LIMITATIONS',
      reasonCode: 'REFRIGERATOR_NOT_IN_HOME_RECORD',
      blocks: [{
        type: 'SUMMARY', id: 'refrigerator-general-estimate', title: 'Most refrigerators last about 10–15 years',
        body: 'Replacement timing also depends on condition, repair frequency, energy use, and parts availability. I could not find a refrigerator in this home’s inventory, so this is general guidance rather than a home-specific recommendation.',
        tone: 'CAUTION',
        actions: [{ id: 'add-refrigerator', label: 'Add refrigerator to inventory', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory`, style: 'PRIMARY' }],
      }],
      suggestions: ['What signs mean a refrigerator should be replaced?', 'Open Repair vs Replace'],
    };
  }
  if (items.length > 1) {
    return {
      status: 'NEEDS_ENTITY',
      reasonCode: 'MULTIPLE_REFRIGERATORS',
      blocks: [{
        type: 'GROUPED_LIST', id: 'refrigerator-selection', title: 'Which refrigerator do you mean?',
        description: 'Open the matching inventory record, or make its name more specific, then ask again.',
        sections: [{ id: 'matches', title: 'Possible matches', count: items.length, items: items.map((item) => ({
          id: item.id, title: item.name, description: null, status: item.condition, meta: [],
          href: `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory`,
        })) }], actions: [],
      }],
      suggestions: ['Open home inventory'],
    };
  }

  const item = items[0];
  const lifecycleDate = item.installedOn ?? item.purchasedOn;
  const age = yearsSince(lifecycleDate);
  const evaluation = await evaluateFeatureContext(propertyId, userId, {
    featureKey: 'REPAIR_REPLACE', operationKey: 'RUN_ANALYSIS', operationInput: { inventoryItemId: item.id },
  });
  const captureRequests: AskCaptureRequest[] = evaluation.requirements.map((requirement) => ({
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
  const remainingYears = age === null ? null : Math.max(0, 12 - age);
  const conditionCopy = item.condition === 'POOR'
    ? 'Its recorded condition is poor, so replacement planning should begin now.'
    : item.condition === 'FAIR'
      ? 'Its recorded condition is fair; compare any major repair against replacement cost and efficiency.'
      : 'Continue monitoring cooling performance, noise, seals, and repair frequency.';
  return {
    status: captureRequests.length ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: captureRequests.length ? 'LIFECYCLE_CONTEXT_OPTIONAL' : undefined,
    contextVersion: evaluation.contextVersion,
    parameters: { inventoryItemId: item.id },
    captureRequests,
    blocks: [{
      type: 'SUMMARY', id: 'refrigerator-replacement-guidance', title: age === null
        ? `${item.name}: add its age for a home-specific replacement window`
        : remainingYears === 0
          ? `${item.name} is in the typical replacement window`
          : `${item.name} may have roughly ${remainingYears} year${remainingYears === 1 ? '' : 's'} before the typical replacement window`,
      body: age === null
        ? `Most refrigerators last about 10–15 years. ${conditionCopy} Add an approximate install or purchase date below and I’ll update this answer immediately.`
        : `The home record indicates an age of about ${age} year${age === 1 ? '' : 's'}. Most refrigerators last about 10–15 years, but this is a planning range—not a guaranteed failure date. ${conditionCopy}`,
      tone: item.condition === 'POOR' || (age !== null && age >= 12) ? 'CAUTION' : 'DEFAULT',
      actions: [{ id: 'open-repair-replace', label: 'Open Repair vs Replace', href: `/dashboard/replace-repair?propertyId=${encodeURIComponent(propertyId)}&inventoryItemId=${encodeURIComponent(item.id)}`, style: 'PRIMARY' }],
    }],
    suggestions: ['What replacement warning signs should I watch?', 'How much should I budget for replacement?'],
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
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'MONITOR_CONFIRMATION_REQUIRED',
    parameters: {
      thresholdPct, product, channel: 'EMAIL', cadence: 'IMMEDIATE', quietStart, quietEnd,
      timezone: preference.timezone || 'UTC', confirmationVersion, confirmationExpiresAt: expiresAt.toISOString(),
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

function tokenize(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2));
}

function capabilityScore(message: string, capability: CapabilityCatalogItem): number {
  const query = tokenize(message);
  const text = tokenize([capability.label, capability.shortDescription, ...capability.intentAliases].join(' '));
  let score = 0;
  for (const token of query) if (text.has(token)) score += token.length > 7 ? 3 : 1;
  if (/refinanc/i.test(message) && capability.id === 'mortgage-refinance-radar') score += 20;
  if (/sell.*rent|rent.*sell/i.test(message) && capability.id === 'sell-hold-rent') score += 20;
  if (/quote/i.test(message) && capability.id === 'quote-comparison') score += 20;
  if (/saving|rebate|benefit/i.test(message) && capability.id === 'savings-benefits') score += 15;
  return score;
}

async function capabilityResult(userId: string, propertyId: string | null | undefined, message: string): Promise<AskOperationResult> {
  const catalog = buildCapabilityCatalog({
    registry: canonicalCapabilityRegistry,
    availability: createToolDiscoveryCapabilityAvailabilityAdapter(canonicalCapabilityRegistry),
    userId,
    propertyId: propertyId ?? undefined,
    includeWorkflowContext: false,
  });
  const ranked = catalog.capabilities
    .map((capability) => ({ capability, score: capabilityScore(message, capability) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.capability.label.localeCompare(right.capability.label))
    .slice(0, 3);
  if (!ranked.length) {
    return {
      status: 'ANSWERED',
      blocks: [{
        type: 'SUMMARY', id: 'no-capability-match', title: 'Tell me what outcome you want',
        body: 'I could not identify one specific tool yet. Describe the decision, task, risk, savings goal, or major home moment you want help with.',
        tone: 'DEFAULT', actions: [{ id: 'explore-tools', label: 'Explore home tools', href: '/dashboard/tools', style: 'SECONDARY' }],
      }],
      suggestions: ['Help me compare contractor quotes', 'I want to plan future replacements', 'Can you monitor refinance rates?'],
    };
  }
  return {
    status: 'ANSWERED',
    contextVersion: catalog.registryVersion,
    blocks: [{
      type: 'CAPABILITY_LIST',
      id: 'capability-matches',
      title: ranked.length === 1 ? 'This tool matches your goal' : 'Tools that match your goal',
      description: 'Availability comes from the current ContractToCozy capability registry.',
      capabilities: ranked.map(({ capability }) => ({
        id: capability.id,
        label: capability.label,
        description: capability.shortDescription,
        expectedOutput: capability.expectedOutput,
        href: capability.href,
        readiness: propertyId || !capability.routeTemplate.includes('[id]') ? 'READY' : 'NEEDS_PROPERTY',
        releaseStage: capability.releaseStage,
      })),
    }],
    suggestions: ['What information does this tool need?', 'What result will I get?', 'Show another option'],
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

async function groundedGuidanceResult(input: { userId: string; sessionId: string; message: string; propertyId?: string | null }): Promise<AskOperationResult> {
  const answer = await answerGroundedAsk({
    userId: input.userId,
    sessionId: input.sessionId,
    message: input.message,
    propertyId: input.propertyId ?? undefined,
  });
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'grounded-guidance', title: answer.groundingMode === 'PROPERTY' ? 'Guidance for this home' : 'General home guidance',
    body: answer.text, tone: answer.confidence.label === 'LOW' ? 'CAUTION' : 'DEFAULT', actions: [],
  }];
  if (answer.evidence.length) {
    blocks.push({ type: 'EVIDENCE', id: 'grounded-evidence', title: 'Sources used', items: answer.evidence.map((item) => ({ label: item.label, source: item.source, observedAt: item.observedAt })) });
  }
  return { status: 'ANSWERED', blocks, suggestions: [answer.nextAction].filter(Boolean) };
}

async function executeOperation(input: { userId: string; sessionId: string; message: string; propertyId?: string | null; operation: AskOperationResolution }): Promise<AskOperationResult> {
  if (input.operation.requiresProperty && !input.propertyId) return needsPropertyResult();
  switch (input.operation.operationId) {
    case 'EMERGENCY_BOUNDARY': return emergencyResult();
    case 'OUT_OF_SCOPE_BOUNDARY': return outOfScopeResult();
    case 'MAINTENANCE_STATUS': return maintenanceResult(input.userId, input.propertyId!, input.message);
    case 'COVERAGE_GAPS': return coverageResult(input.userId, input.propertyId!, input.message);
    case 'SAVINGS_OPPORTUNITIES': return savingsOpportunitiesResult(input.userId, input.propertyId!, input.message);
    case 'OWNERSHIP_COSTS': return ownershipCostsResult(input.userId, input.propertyId!, input.message);
    case 'INVENTORY_LOOKUP': return inventoryLookupResult(input.userId, input.propertyId!, input.message);
    case 'PROPERTY_SUMMARY': return propertySummaryResult(input.userId, input.propertyId!, input.message);
    case 'HOME_ACTIONS': return homeActionsResult(input.userId, input.propertyId!, input.message);
    case 'REPLACEMENT_GUIDANCE': return replacementGuidanceResult(input.userId, input.propertyId!);
    case 'REFINANCE_ANALYSIS': return refinanceAnalysisResult(input.userId, input.propertyId!);
    case 'REFINANCE_RATE_MONITOR': return refinanceRateMonitorResult(input.userId, input.propertyId!, input.message);
    case 'SELL_HOLD_RENT_ANALYSIS': return sellHoldRentAnalysisResult(input.userId, input.propertyId!);
    case 'HOUSEHOLD_INVITATION': return householdInvitationResult(input.userId, input.propertyId!, input.message);
    case 'CAPABILITY_DISCOVERY': return capabilityResult(input.userId, input.propertyId, input.message);
    case 'GROUNDED_GUIDANCE': return groundedGuidanceResult(input);
  }
}

function mapPersistedExecution(execution: {
  id: string; sessionId: string; message: string; status: AskExecutionStatus; propertyId: string | null; operationId: string | null;
  operationVersion: string | null; intentFamily: string | null; contextVersion: string | null; resultJson: Prisma.JsonValue | null;
  createdAt: Date; updatedAt: Date;
}, property: { id: string; label: string } | null): AskExecutionResponse {
  const stored = execution.resultJson && typeof execution.resultJson === 'object' && !Array.isArray(execution.resultJson)
    ? execution.resultJson as { blocks?: unknown; captureRequests?: unknown; confirmation?: unknown; suggestions?: unknown }
    : {};
  return AskExecutionResponseSchema.parse({
    executionId: execution.id,
    sessionId: execution.sessionId,
    question: execution.message,
    status: execution.status,
    property,
    operation: execution.operationId ? { id: execution.operationId, version: execution.operationVersion ?? '1.0', family: execution.intentFamily ?? 'UNKNOWN' } : null,
    contextVersion: execution.contextVersion,
    blocks: stored.blocks ?? [],
    captureRequests: stored.captureRequests ?? [],
    confirmation: stored.confirmation ?? null,
    suggestions: stored.suggestions ?? [],
    createdAt: execution.createdAt.toISOString(),
    updatedAt: execution.updatedAt.toISOString(),
  });
}

export async function createAskExecution(userId: string, input: CreateAskExecutionRequest): Promise<AskExecutionResponse> {
  if (input.propertyId) await ensurePropertyAccess(userId, input.propertyId);
  const duplicate = await prisma.askExecution.findUnique({ where: { userId_clientRequestId: { userId, clientRequestId: input.clientRequestId } } });
  if (duplicate) return mapPersistedExecution(duplicate, await propertySummary(duplicate.propertyId));

  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
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

  const operation = resolveAskOperation(input.message);
  await prisma.askExecution.update({
    where: { id: execution.id },
    data: { operationId: operation.operationId, operationVersion: operation.version, intentFamily: operation.family, intentConfidence: operation.confidence, status: 'RUNNING' },
  });
  try {
    const result = await executeOperation({ userId, sessionId: session.id, message: input.message, propertyId: input.propertyId, operation });
    const completedAt = terminalStatus(result.status) ? new Date() : undefined;
    const saved = await prisma.askExecution.update({
      where: { id: execution.id },
      data: {
        status: result.status,
        reasonCode: result.reasonCode,
        contextVersion: result.contextVersion,
        parametersJson: result.parameters ? asInputJson(result.parameters) : undefined,
        resultJson: asInputJson({ blocks: result.blocks, captureRequests: result.captureRequests ?? [], confirmation: result.confirmation ?? null, suggestions: result.suggestions }),
        completedAt,
      },
    });
    await prisma.askExecutionEvent.create({ data: { executionId: execution.id, eventType: result.status, metadataJson: asInputJson({ operationId: operation.operationId, blockTypes: result.blocks.map((block) => block.type) }) } });
    return mapPersistedExecution(saved, await propertySummary(input.propertyId));
  } catch (caught) {
    await prisma.askExecution.update({ where: { id: execution.id }, data: { status: 'FAILED_RETRYABLE', errorCode: caught instanceof Error ? caught.name : 'ASK_EXECUTION_FAILED' } });
    await prisma.askExecutionEvent.create({ data: { executionId: execution.id, eventType: 'FAILED_RETRYABLE', metadataJson: asInputJson({ operationId: operation.operationId }) } });
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
    return mapPersistedExecution(execution, await propertySummary(execution.propertyId));
  }
  if (!['REPLACEMENT_GUIDANCE', 'REFINANCE_ANALYSIS', 'HOUSEHOLD_INVITATION', 'SAVINGS_OPPORTUNITIES', 'SELL_HOLD_RENT_ANALYSIS', 'OWNERSHIP_COSTS', 'INVENTORY_LOOKUP', 'PROPERTY_SUMMARY', 'HOME_ACTIONS', 'COVERAGE_GAPS'].includes(execution.operationId ?? '')) {
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

  let captureId: string;
  let capturedContextVersion: string;
  let result: AskOperationResult;
  let canonicalOwner: string;
  if (execution.operationId === 'SAVINGS_OPPORTUNITIES') {
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
        resultJson: asInputJson({ blocks: result.blocks, captureRequests: result.captureRequests ?? [], confirmation: result.confirmation ?? null, suggestions: result.suggestions }),
        completedAt: terminalStatus(result.status) ? new Date() : null,
      },
    });
    await tx.askCaptureReceipt.create({
      data: {
        executionId: execution.id,
        idempotencyKey: input.idempotencyKey,
        captureKey: input.captureKey,
        canonicalOwner,
        answerHash,
        contextVersion: result.contextVersion ?? capturedContextVersion,
      },
    });
    await tx.askExecutionEvent.create({
      data: { executionId: execution.id, eventType: 'CONTEXT_CAPTURED', metadataJson: asInputJson({ captureId, captureKey: input.captureKey, canonicalOwner, resumedStatus: result.status }) },
    });
    return updated;
  });
  return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
}

export async function confirmAskExecution(userId: string, executionId: string, input: SubmitAskConfirmation): Promise<AskExecutionResponse> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution || !execution.propertyId) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  const inputHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const previous = await prisma.askConfirmationReceipt.findUnique({
    where: { executionId_idempotencyKey: { executionId, idempotencyKey: input.idempotencyKey } },
  });
  if (previous) {
    if (previous.inputHash !== inputHash) {
      const error = new Error('The idempotency key was already used for a different confirmation.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_IDEMPOTENCY_CONFLICT';
      throw error;
    }
    return mapPersistedExecution(execution, await propertySummary(execution.propertyId));
  }
  const access = await ensurePropertyAccess(userId, execution.propertyId);
  if (!['REFINANCE_RATE_MONITOR', 'HOUSEHOLD_INVITATION'].includes(execution.operationId ?? '') || execution.status !== 'NEEDS_CONFIRMATION') {
    const error = new Error('This confirmation is no longer active.');
    (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
    throw error;
  }
  const parameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
    ? execution.parametersJson as Record<string, unknown>
    : {};
  const expectedVersion = parameters.confirmationVersion;
  const expiresAt = typeof parameters.confirmationExpiresAt === 'string' ? new Date(parameters.confirmationExpiresAt) : null;
  if (expectedVersion !== input.confirmationVersion || !expiresAt || expiresAt <= new Date()) {
    const error = new Error('This confirmation expired. Ask again to review the current settings.');
    (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_EXPIRED';
    throw error;
  }
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
  if (execution.operationId === 'HOUSEHOLD_INVITATION') {
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
        data: { status: result.status, reasonCode: result.reasonCode, resultJson: asInputJson({ blocks: result.blocks, captureRequests: [], confirmation: null, suggestions: result.suggestions }), completedAt: new Date() },
      });
      await tx.askConfirmationReceipt.create({
        data: { executionId, idempotencyKey: input.idempotencyKey, confirmationVersion: input.confirmationVersion, artifactType, artifactId, inputHash },
      });
      await tx.askExecutionEvent.create({ data: { executionId, eventType: 'CONFIRMED', metadataJson: asInputJson({ artifactType, artifactId }) } });
      return updated;
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const duplicate = await prisma.askConfirmationReceipt.findUnique({
      where: { executionId_idempotencyKey: { executionId, idempotencyKey: input.idempotencyKey } },
    });
    if (!duplicate || duplicate.inputHash !== inputHash) throw error;
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
  const householdInvitation = execution.operationId === 'HOUSEHOLD_INVITATION';
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'confirmation-cancelled',
    title: householdInvitation ? 'Invitation not created' : 'Monitor not created',
    body: householdInvitation
      ? 'The household invitation was cancelled. No invitation or household access was created.'
      : 'The pending mortgage-rate monitor was cancelled. No notification preference or threshold was changed.',
    tone: 'DEFAULT', actions: [],
  }];
  const saved = await prisma.askExecution.update({
    where: { id: execution.id },
    data: {
      status: 'CANCELLED', reasonCode: 'USER_CANCELLED',
      resultJson: asInputJson({ blocks, captureRequests: [], confirmation: null, suggestions: [householdInvitation ? 'Review household access' : 'Set a different rate threshold'] }),
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
