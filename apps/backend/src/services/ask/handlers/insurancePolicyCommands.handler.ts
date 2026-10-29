// Insurance policies in Ask (register "Insurance policies"; FRD v1.475): the policy list on the coverage answer, and add, edit and delete behind a review
// and a confirmation. Writes are home-management's own createInsurancePolicy / updateInsurancePolicy / deleteInsurancePolicy, the calls Desktop's Insurance
// page makes. A policy belongs to the homeowner profile that recorded it: Ask lists and changes only the caller's own policies for this home, and a policy
// can be added only by the profile that owns the home record (the canonical create refuses otherwise).
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import type { AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import type { AskOperationResult } from '../askOperationRegistry';
import type { ConfirmCapabilityContext, ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { collectionDescriptor } from '../support/collectionDescriptor';
import * as HomeManagementService from '../../home-management.service';
import {
  INSURANCE_POLICY_ACTION_IDS, INSURANCE_POLICY_CAPTURE_KEY, INSURANCE_POLICY_ENTITY_TYPE, INSURANCE_POLICY_MESSAGES, insurancePolicyChanges, maskedPolicyNumber, money, parseInsurancePolicyAnswer,
  type InsurancePolicyForm, type InsurancePolicyKind,
} from '../support/insurancePolicyCommand';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });
const day = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : '');

interface PolicyRow { id: string; carrierName: string; policyNumber: string; coverageType: string | null; premiumAmount: unknown; startDate: Date | null; expiryDate: Date | null; updatedAt: Date }
const SELECT = { id: true, carrierName: true, policyNumber: true, coverageType: true, premiumAmount: true, startDate: true, expiryDate: true, updatedAt: true } as const;
const formOf = (row: PolicyRow): InsurancePolicyForm => ({
  carrierName: row.carrierName, policyNumber: row.policyNumber, coverageType: row.coverageType || 'Homeowner', premiumAmount: Number(row.premiumAmount ?? 0), startDate: day(row.startDate), expiryDate: day(row.expiryDate),
});
const versionOf = (row: PolicyRow) => sha(`insurance-policy:${row.id}:${row.updatedAt.toISOString()}`);

const ownProfileId = async (userId: string): Promise<string | null> => (await prisma.homeownerProfile.findFirst({ where: { userId }, select: { id: true } }))?.id ?? null;
const addAction = (style: 'PRIMARY' | 'SECONDARY' = 'PRIMARY') => ({ id: INSURANCE_POLICY_ACTION_IDS.ADD, label: 'Add an insurance policy', interactionType: 'START_WORKFLOW' as const, message: INSURANCE_POLICY_MESSAGES.ADD, operationId: 'COVERAGE_COMMAND' as const, style });
const backAction = { id: 'insurance-policies-show', label: 'Show my insurance policies', interactionType: 'START_WORKFLOW' as const, message: 'Show my insurance policies', operationId: 'COVERAGE_GAPS' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'insurance-policy-unavailable', title, body, tone: 'CAUTION', actions: [backAction] }], suggestions: [],
});

/**
 * The read: every policy recorded for this home, so the shared-home answer is truthful, each labelled with who recorded it. A policy belongs to the
 * profile that recorded it, so Edit and Delete appear only on the caller's own, and Add appears only to the profile that owns the home record (the canonical
 * create refuses anyone else), never to a member who would be refused. Everyone else's policies are read-only.
 */
export async function insurancePoliciesResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const canWrite = access.role !== HouseholdRole.VIEWER;
  const profileId = await ownProfileId(userId);
  const [rows, ownsHome]: [Array<PolicyRow & { homeownerProfileId: string; homeownerProfile: { user: { firstName: string | null } | null } | null }>, boolean] = await Promise.all([
    prisma.insurancePolicy.findMany({
      where: { propertyId }, orderBy: [{ expiryDate: 'asc' }, { id: 'asc' }], take: 50,
      select: { ...SELECT, homeownerProfileId: true, homeownerProfile: { select: { user: { select: { firstName: true } } } } },
    }) as never,
    profileId && canWrite ? prisma.property.findFirst({ where: { id: propertyId, homeownerProfileId: profileId }, select: { id: true } }).then(Boolean) : Promise.resolve(false),
  ]);
  const canAdd = canWrite && ownsHome;
  const mine = (row: { homeownerProfileId: string }) => Boolean(profileId) && row.homeownerProfileId === profileId;
  const now = Date.now();
  const status = (row: PolicyRow) => (!row.expiryDate ? 'NEEDS_REVIEW' : row.expiryDate.getTime() < now ? 'EXPIRED' : row.expiryDate.getTime() - now <= 60 * 86_400_000 ? 'EXPIRING' : 'ACTIVE');
  const contextVersion = sha(JSON.stringify(rows.map((row) => [row.id, row.updatedAt.toISOString()])));
  const recordedBy = (row: (typeof rows)[number]) => (mine(row) ? 'Recorded by you' : row.homeownerProfile?.user?.firstName?.trim() ? `Recorded by ${row.homeownerProfile.user.firstName.trim()}` : 'Recorded by another household member');
  if (!rows.length) return {
    status: 'ANSWERED', reasonCode: 'INSURANCE_POLICIES_NONE', contextVersion,
    blocks: [{
      type: 'EMPTY_STATE', id: 'insurance-policies-empty', title: 'No insurance policy recorded for this home',
      body: canAdd ? 'Add a policy to track its renewal, premium and documents. Nothing is saved until you confirm.'
        : canWrite ? 'Only the member whose profile owns this home record can add a policy.' : 'A contributor or owner can add a policy.',
      actions: canAdd ? [addAction()] : [],
    }],
    suggestions: [],
  };
  const own = rows.filter(mine).length;
  const summary = {
    type: 'SUMMARY' as const, id: 'insurance-policies-summary',
    title: `${rows.length} insurance ${rows.length === 1 ? 'policy' : 'policies'} recorded for this home`,
    body: [
      `${rows.filter((row) => status(row) === 'EXPIRING').length} expiring within 60 days.`,
      own === rows.length ? 'All were recorded under your profile.' : own ? `${own} recorded under your profile; you can change only those.` : 'None were recorded under your profile, so they are shown for reading only.',
    ].join(' '),
    tone: rows.some((row) => status(row) === 'EXPIRING' || status(row) === 'EXPIRED') ? 'CAUTION' as const : 'DEFAULT' as const,
    actions: canAdd ? [addAction('SECONDARY')] : [],
  };
  const rowAction = (id: string, label: string, message: string) => ({ id, label, message, style: 'SECONDARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'COVERAGE_COMMAND' as const });
  const sections = [{
    id: 'insurance-policies', title: 'Insurance policies', count: rows.length,
    items: rows.map((row) => ({
      id: row.id, title: row.carrierName, entityType: INSURANCE_POLICY_ENTITY_TYPE, href: null,
      description: `${row.coverageType || 'Homeowner'} · policy ${maskedPolicyNumber(row.policyNumber)}`,
      status: status(row),
      meta: [row.premiumAmount != null ? `${money(Number(row.premiumAmount))} a year` : 'No premium recorded', row.expiryDate ? `Expires ${humanDate(row.expiryDate) ?? day(row.expiryDate)}` : 'No expiry date recorded', recordedBy(row)],
      actions: canWrite && mine(row) ? [rowAction(INSURANCE_POLICY_ACTION_IDS.EDIT, 'Edit policy', INSURANCE_POLICY_MESSAGES.EDIT), rowAction(INSURANCE_POLICY_ACTION_IDS.DELETE, 'Delete policy', INSURANCE_POLICY_MESSAGES.DELETE)] : undefined,
    })),
  }];
  return {
    status: 'ANSWERED', reasonCode: 'INSURANCE_POLICIES_LISTED', contextVersion,
    blocks: [summary, {
      type: 'GROUPED_LIST', filters: [], id: 'insurance-policies-list', title: 'Insurance policies', sections,
      collection: collectionDescriptor({ sourceTotal: rows.length, fetchedCount: rows.length, sections, nextPageAvailable: false }), actions: [],
    }],
    suggestions: [],
  };
}

function formCapture(kind: 'ADD' | 'EDIT', contextVersion: string, entered?: Partial<InsurancePolicyForm>): AskCaptureRequest {
  const answer = Object.fromEntries(Object.entries(entered ?? {}).filter(([, value]) => value !== undefined && value !== '' && value !== 0));
  return {
    requirementId: 'insurance-policy-inputs', captureKey: INSURANCE_POLICY_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', sensitivity: 'FINANCIAL',
    title: kind === 'ADD' ? 'Add an insurance policy' : 'Change this insurance policy', question: kind === 'ADD' ? 'What does the policy say?' : 'What should change?',
    helpText: kind === 'ADD' ? 'Nothing is saved until you review and confirm.' : 'Change only what is wrong; you will review the changes before they are saved.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'carrierName', label: 'Insurance company', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 120 } },
      { key: 'policyNumber', label: 'Policy number', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 60 } },
      { key: 'coverageType', label: 'Coverage type', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 60 } },
      { key: 'premiumAmount', label: 'Annual premium ($)', required: true, inputSchema: { type: 'NUMBER', min: 0.01, max: 10_000_000 } },
      { key: 'startDate', label: 'Policy starts', required: true, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: true } },
      { key: 'expiryDate', label: 'Policy expires', required: true, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: true } },
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: { coverageType: 'Homeowner', ...answer }, allowNotSure: false, destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  } as AskCaptureRequest;
}

type Launch = { kind: InsurancePolicyKind; entityId?: string | null; sourceExecutionId?: string | null };

export async function insurancePolicyCommandResult(userId: string, propertyId: string, launch: Launch, supplied?: Record<string, unknown>): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'insurance-policy-permission', title: 'A contributor or owner can change insurance policies', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [backAction] }], suggestions: [] };
  const profileId = await ownProfileId(userId);
  if (!profileId) return unavailable('INSURANCE_NO_HOMEOWNER_PROFILE', 'Policies are kept under a homeowner profile', 'This account has no homeowner profile to record a policy under. Nothing has changed.');
  const base = { sourceExecutionId: launch.sourceExecutionId ?? null, confirmationVersion: 1, confirmationExpiresAt: new Date(Date.now() + 30 * 60_000).toISOString() };
  const launchParameters = { insurancePolicyLaunch: { kind: launch.kind, entityId: launch.entityId ?? null, sourceExecutionId: launch.sourceExecutionId ?? null } };
  const confirmation = (id: string, title: string, description: string, confirmLabel: string, fields: Array<{ label: string; value: string }>) => ({
    confirmationId: `insurance-policy-${id}-1`, version: 1, title, description, fields, editableFields: [], confirmLabel, consentText: 'I authorize this change to the shared home record.', expiresAt: base.confirmationExpiresAt,
  });
  const review = (title: string, tone: 'DEFAULT' | 'CAUTION', body: string) => [{ type: 'SUMMARY' as const, id: 'insurance-policy-review', title, body, tone, actions: [] }];
  const invalid = (parsed: { reason: 'INVALID' | 'DATE_ORDER' }) => unavailable(parsed.reason === 'DATE_ORDER' ? 'INSURANCE_POLICY_DATE_ORDER' : 'INSURANCE_POLICY_INVALID', 'Check the policy',
    parsed.reason === 'DATE_ORDER' ? 'The policy must expire after it starts. Nothing has changed.' : 'Enter the company, a policy number, an annual premium above zero and valid dates. Nothing has changed.');

  if (launch.kind === 'ADD') {
    const ownsHome = await prisma.property.findFirst({ where: { id: propertyId, homeownerProfileId: profileId }, select: { id: true } });
    if (!ownsHome) return unavailable('INSURANCE_POLICY_NOT_HOME_OWNER', 'Only the home record\'s owner can add a policy', 'A policy is recorded under the profile that owns this home record, and yours does not. Nothing has changed.');
    const contextVersion = sha(`insurance-policy-add:${propertyId}`);
    if (!supplied) return {
      status: 'NEEDS_CONTEXT', reasonCode: 'INSURANCE_POLICY_ADD_INPUT_REQUIRED', contextVersion, parameters: launchParameters,
      blocks: [{ type: 'SUMMARY', id: 'insurance-policy-add-input', title: 'Add an insurance policy', body: 'Nothing has been saved yet. Enter the policy, then review it.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [formCapture('ADD', contextVersion)], suggestions: [],
    };
    const parsed = parseInsurancePolicyAnswer(supplied);
    if (!parsed.success) return invalid(parsed);
    const form = parsed.data;
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'INSURANCE_POLICY_ADD_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { insurancePolicy: { kind: 'ADD', input: form }, insurancePolicyContextVersion: contextVersion, ...launchParameters, ...base },
      blocks: review(`Review the ${form.carrierName} policy`, 'DEFAULT', 'No shared-home record has changed yet.'),
      confirmation: confirmation(`add-${sha(`${form.carrierName}:${form.policyNumber}:${form.startDate}`).slice(0, 12)}`, `Add the ${form.carrierName} policy?`, 'This records the policy under your homeowner profile and refreshes coverage analysis. The values are saved as confirmed policy facts.', 'Add policy',
        [{ label: 'Insurance company', value: form.carrierName }, { label: 'Policy number', value: maskedPolicyNumber(form.policyNumber) }, { label: 'Coverage type', value: form.coverageType }, { label: 'Annual premium', value: money(form.premiumAmount) }, { label: 'Starts', value: form.startDate }, { label: 'Expires', value: form.expiryDate }]),
      captureRequests: [formCapture('ADD', contextVersion, form)], suggestions: [],
    };
  }

  const row: PolicyRow | null = launch.entityId ? await prisma.insurancePolicy.findFirst({ where: { id: launch.entityId, propertyId, homeownerProfileId: profileId }, select: SELECT }) : null;
  if (!row) return unavailable('INSURANCE_POLICY_NOT_AVAILABLE', 'Ask can only change policies you recorded', 'This policy is gone or was recorded by another household member. Nothing has changed.');
  const contextVersion = versionOf(row);
  const current = formOf(row);

  if (launch.kind === 'DELETE') return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'INSURANCE_POLICY_DELETE_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { insurancePolicy: { kind: 'DELETE', policyId: row.id }, insurancePolicyContextVersion: contextVersion, ...launchParameters, ...base },
    blocks: review(`Review deleting the ${row.carrierName} policy`, 'CAUTION', 'No shared-home record has changed yet. Deleting cannot be undone.'),
    confirmation: confirmation(`delete-${row.id}`, `Delete the ${row.carrierName} policy?`, 'This permanently removes the policy, and coverage analysis and the risk premium view are refreshed without it. Documents stay in Home Records.', 'Delete policy',
      [{ label: 'Insurance company', value: row.carrierName }, { label: 'Policy number', value: maskedPolicyNumber(row.policyNumber) }, { label: 'Expires', value: current.expiryDate || 'Not recorded' }]),
    suggestions: [],
  };

  if (!supplied) return {
    status: 'NEEDS_CONTEXT', reasonCode: 'INSURANCE_POLICY_EDIT_INPUT_REQUIRED', contextVersion, parameters: launchParameters,
    blocks: [{ type: 'SUMMARY', id: 'insurance-policy-edit-input', title: `Change the ${row.carrierName} policy`, body: 'The form shows what is recorded. Change what is wrong, then review the changes.', tone: 'DEFAULT', actions: [] }],
    captureRequests: [formCapture('EDIT', contextVersion, current)], suggestions: [],
  };
  const parsed = parseInsurancePolicyAnswer(supplied);
  if (!parsed.success) return invalid(parsed);
  const changes = insurancePolicyChanges(current, parsed.data);
  if (!changes.length) return unavailable('INSURANCE_POLICY_NO_CHANGE', 'Nothing to change', 'The details match what is already recorded. Nothing has changed.');
  const patch = Object.fromEntries(changes.map((change) => [change.field, parsed.data[change.field]]));
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'INSURANCE_POLICY_EDIT_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { insurancePolicy: { kind: 'EDIT', policyId: row.id, patch }, insurancePolicyContextVersion: contextVersion, ...launchParameters, ...base },
    blocks: review(`Review changes to the ${row.carrierName} policy`, 'DEFAULT', 'No shared-home record has changed yet.'),
    confirmation: confirmation(`edit-${row.id}`, `Save ${changes.length === 1 ? '1 change' : `${changes.length} changes`} to the ${row.carrierName} policy?`,
      'This updates the policy record and refreshes coverage analysis. It does not change the verified policy terms a document review confirmed.', 'Save changes',
      [{ label: 'Policy', value: row.carrierName }, ...changes.map((change) => ({ label: change.label, value: `${change.before} → ${change.after}` }))]),
    captureRequests: [formCapture('EDIT', contextVersion, parsed.data)], suggestions: [],
  };
}

export async function confirmInsurancePolicy(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult | null> {
  const { execution, userId, parameters, access } = ctx;
  const stored = parameters.insurancePolicy as { kind?: string; policyId?: string; input?: unknown; patch?: Record<string, unknown> } | undefined;
  if (!stored?.kind) return null;
  if (access.role === HouseholdRole.VIEWER) throw stale('A contributor or owner is required to change insurance policies.', 'ASK_PERMISSION_REQUIRED');
  const propertyId = execution.propertyId!;
  const profileId = await ownProfileId(userId);
  if (!profileId) throw stale('This account has no homeowner profile to change policies under.');
  let artifactId: string; let title: string; let description: string; let reasonCode: string; let carrier: string;
  if (stored.kind === 'ADD') {
    const parsed = parseInsurancePolicyAnswer(stored.input);
    if (!parsed.success) throw stale('The policy to add is invalid.');
    const form = parsed.data;
    try {
      const created = await HomeManagementService.createInsurancePolicy(profileId, { propertyId, carrierName: form.carrierName, policyNumber: form.policyNumber, coverageType: form.coverageType, premiumAmount: form.premiumAmount, startDate: new Date(`${form.startDate}T12:00:00.000Z`), expiryDate: new Date(`${form.expiryDate}T12:00:00.000Z`) }, userId);
      artifactId = created.id;
    } catch (error) {
      if (error instanceof Error && /does not belong to this homeowner/.test(error.message)) throw stale('Only the profile that owns this home record can add a policy.', 'ASK_CONTEXT_VERSION_CONFLICT');
      throw error;
    }
    carrier = form.carrierName; title = 'Policy added'; description = `The ${form.carrierName} policy was recorded and coverage analysis was marked for refresh.`; reasonCode = 'INSURANCE_POLICY_ADDED';
  } else {
    const row: PolicyRow | null = stored.policyId ? await prisma.insurancePolicy.findFirst({ where: { id: stored.policyId, propertyId, homeownerProfileId: profileId }, select: SELECT }) : null;
    if (!row) throw stale('This policy is no longer available. It may have been removed.', 'ASK_CONTEXT_VERSION_CONFLICT');
    if (parameters.insurancePolicyContextVersion !== versionOf(row)) throw stale('This policy changed while confirmation was open. Review it and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    artifactId = row.id; carrier = row.carrierName;
    if (stored.kind === 'DELETE') {
      await HomeManagementService.deleteInsurancePolicy(row.id, profileId);
      title = 'Policy deleted'; description = `The ${row.carrierName} policy was deleted and coverage analysis was marked for refresh.`; reasonCode = 'INSURANCE_POLICY_DELETED';
    } else if (stored.kind === 'EDIT') {
      const patch: Record<string, unknown> = {};
      for (const key of ['carrierName', 'policyNumber', 'coverageType', 'premiumAmount'] as const) if (stored.patch && key in stored.patch) patch[key] = stored.patch[key];
      for (const key of ['startDate', 'expiryDate'] as const) if (stored.patch && typeof stored.patch[key] === 'string') patch[key] = new Date(`${stored.patch[key]}T12:00:00.000Z`);
      const merged = { ...formOf(row), ...Object.fromEntries(Object.entries(stored.patch ?? {})) } as InsurancePolicyForm;
      if (!parseInsurancePolicyAnswer(merged).success) throw Object.assign(new Error('The policy must expire after it starts and keep a premium above zero.'), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
      await HomeManagementService.updateInsurancePolicy(row.id, profileId, patch as never);
      title = 'Policy updated'; description = `The ${merged.carrierName} policy was updated and coverage analysis was marked for refresh.`; reasonCode = 'INSURANCE_POLICY_UPDATED';
    } else throw stale('The change to make is invalid.');
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode,
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `insurance-policy-${stored.kind.toLowerCase()}-${artifactId}`, title, status: 'COMPLETED', description, details: [{ label: 'Insurance company', value: carrier }], actions: [backAction] }], suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: `insurance-policy-refresh-failed-${artifactId}`, severity: 'CAUTION', title: 'Saved; view could not refresh', body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask "Show my insurance policies" to see the current state.' });
  }
  return { result, artifactType: 'INSURANCE_POLICY', artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
