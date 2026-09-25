// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { AskExecution, MaintenanceTaskPriority, MaintenanceTaskStatus, NotificationCadence, Prisma, RefinanceRateMonitorProduct } from '@prisma/client';
import { createHash } from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import { logger } from '../../../lib/logger';
import { ASK_RESPONSE_SCHEMA_VERSION, type AskExecutionResponse, type EditAskConfirmation } from '../../../productFramework/ask/ask.contract';
import { PropertyMaintenanceTaskService } from '../../PropertyMaintenanceTask.service';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { assertCoverageConflictFree } from '../../coverageConflict.service';
import { createOrUpdateRefinanceRateMonitor } from '../../../refinanceRadar/refinanceRateMonitor.service';
import { PropertySaleCaseService } from '../../propertySaleCase.service';
import { guidanceJourneyService } from '../../guidanceEngine/guidanceJourney.service';
import { getOrCreateQuoteComparisonWorkspace } from '../../quoteComparison.service';
import { upsertNotificationPreference } from '../../notificationPreference.service';
import { asInputJson, GuidanceJourneyCommandInputSchema, guidanceJourneyContextVersion, HomeDeadlineMonitorInputSchema, homeDeadlineSourceVersion, InspectionResolution, InspectionResolutionSchema, mapPersistedExecution, preservedExecutionHistory, propertySummary, QuoteWorkspaceCommandInputSchema } from '../askHandlerSupport';
import { INSPECTION_RESOLUTION_DEFAULT, inspectionFindingVersion, inspectionResolutionEditableFields } from '../handlers/inspection.handler';
import { quoteWorkspaceContextVersion } from '../handlers/quotes.handler';
import { refinanceMonitorBlock, refinanceMonitorContextVersion } from '../handlers/refinance.handler';
import { SALE_READINESS_ITEM_STATUS_LABELS, saleCaseHref, sellerPrepItemContextVersion } from '../handlers/sellHoldRent.handler';
import { CLAIM_TYPE_PATTERNS, claimConflictDescription } from '../handlers/claims.handler';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { maintenanceTaskVersion } from '../handlers/maintenance.handler';
import { ClaimsService } from '../../claims/claims.service';
import type { ClaimStatus, ClaimType } from '../../../types/claims.types';
import { acceptFindingAsWork, dismissFinding, resolveFinding } from '../../inspectionHub.service';

export function saleReadinessItemConflictDescription(item: { title: string; status: string }): string {
  const statusLabel = SALE_READINESS_ITEM_STATUS_LABELS[item.status] ?? item.status.toLowerCase().replace(/_/g, ' ');
  return `"${item.title}" changed in another session before this could be confirmed -- it is now ${statusLabel}. Review its current state and try again.`;
}

export async function editInspectionFindingResolveConfirmation(
  execution: AskExecution,
  parameters: Record<string, unknown>,
  input: EditAskConfirmation,
  userId: string,
): Promise<AskExecutionResponse> {
  void userId;
  const existing = InspectionResolutionSchema.safeParse(parameters.inspectionResolution);
  if (parameters.inspectionFindingAction !== 'RESOLVE' || !existing.success) throw Object.assign(new Error('Editing is not available for this proposal.'), { code: 'ASK_EDIT_NOT_SUPPORTED' });
  const unknownField = Object.keys(input.edits).find((key) => !['method', 'notes', 'costCents'].includes(key));
  if (unknownField) throw Object.assign(new Error('Only the resolution method, notes and cost can be edited.'), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
  const next: InspectionResolution = { ...existing.data };
  if (input.edits.method !== undefined) {
    const method = InspectionResolutionSchema.shape.method.safeParse(input.edits.method.trim());
    if (!method.success) throw Object.assign(new Error('Choose one of the listed resolution methods.'), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
    next.method = method.data;
  }
  if (input.edits.notes !== undefined) {
    if (input.edits.notes.trim().length > 1000) throw Object.assign(new Error('Keep the notes to 1000 characters or fewer.'), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
    next.notes = input.edits.notes.trim() || null;
  }
  if (input.edits.costCents !== undefined) {
    const text = input.edits.costCents.trim();
    if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(text)) throw Object.assign(new Error('Enter an amount in dollars, such as 850 or 850.50.'), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
    next.costCents = Math.round(Number(text) * 100);
  }
  const resolution = InspectionResolutionSchema.parse(next);
  const findingId = typeof parameters.inspectionFindingId === 'string' ? parameters.inspectionFindingId : '';
  const finding = await prisma.inspectionFinding.findFirst({ where: { id: findingId, propertyId: execution.propertyId! }, select: { id: true, homeSystem: true, severity: true, inspectorDescription: true } });
  if (!finding) throw Object.assign(new Error('This inspection finding is no longer available.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  const nextVersion = input.confirmationVersion + 1;
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const newConfirmation = {
    confirmationId: `inspection-finding-${finding.id}-${nextVersion}`, version: nextVersion, title: 'Resolve this finding?', description: finding.inspectorDescription,
    fields: [{ label: 'System', value: finding.homeSystem }, { label: 'Severity', value: String(finding.severity).toLowerCase() }, { label: 'Action', value: 'resolve' }],
    editableFields: inspectionResolutionEditableFields(resolution), confirmLabel: 'Resolve finding',
    consentText: 'I reviewed this inspection finding and authorize updating its canonical disposition.', expiresAt: expiresAt.toISOString(),
  };
  const reviewBlock = { type: 'SUMMARY' as const, id: 'inspection-finding-review', title: 'Review resolve action', body: 'Resolving records how this finding was handled on the canonical inspection record.', tone: 'CAUTION' as const, actions: [] };
  const editWrite = await prisma.askExecution.updateMany({
    where: { id: execution.id, status: 'NEEDS_CONFIRMATION', parametersJson: { path: ['confirmationVersion'], equals: input.confirmationVersion } },
    data: {
      parametersJson: asInputJson({ ...parameters, inspectionResolution: resolution, confirmationVersion: nextVersion, confirmationExpiresAt: expiresAt.toISOString() }),
      resultJson: asInputJson({
        schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: [reviewBlock], captureRequests: [], confirmation: newConfirmation, clarification: null, suggestions: [],
        ...preservedExecutionHistory(execution.resultJson, [reviewBlock]),
      }),
    },
  });
  if (editWrite.count !== 1) throw Object.assign(new Error('This confirmation changed before your edit was applied. Review the current proposal and try again.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  await prisma.askExecutionEvent.create({
    data: { executionId: execution.id, eventType: 'CONFIRMATION_EDITED', metadataJson: asInputJson({ previousVersion: input.confirmationVersion, newVersion: nextVersion, editedFields: Object.keys(input.edits) }) },
  });
  const saved = await prisma.askExecution.findUniqueOrThrow({ where: { id: execution.id } });
  return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
}

// Ask Cozy Stage 3, Phase 2 (implementation plan section 8, item "New this
// revision (Section 4.9)"; FRD section 17). Replaces confirmAskExecution's former
// ~960-line domain-branching write-dispatch if/else chain with a
// confirm-time capability registry, mirroring Phase 1's propose-time
// migration exactly -- one thin registration per confirmation-required
// operation, handler bodies unchanged (moved verbatim, not rewritten),
// keyed by each command's own declared adapterKey
// (ASK_DOMAIN_COMMAND_REGISTRY, the authoritative source for all 25
// confirmation-required operations). confirmAskExecution's own claim/
// lease/authorization/completion lifecycle (FRD section 22) is untouched --
// only the per-operation write dispatch inside its try block moved.
async function confirmClaimFile(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const title = parameters.claimTitle;
    const type = parameters.claimType;
    const description = parameters.claimDescription;
    const sourceType = parameters.claimSourceType;
    if (typeof title !== 'string' || !title.trim() || typeof type !== 'string' || !CLAIM_TYPE_PATTERNS.some(([, candidate]) => candidate === type) && type !== 'OTHER') {
      const error = new Error('The draft claim details are no longer valid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const claim = await ClaimsService.createClaim(execution.propertyId, userId, {
      title: title.trim(), type: type as ClaimType,
      description: typeof description === 'string' ? description : null,
      sourceType: typeof sourceType === 'string' ? sourceType as 'INSURANCE' | 'HOME_WARRANTY' | 'MANUFACTURER_WARRANTY' | 'OUT_OF_POCKET' | 'UNKNOWN' : 'UNKNOWN',
      generateChecklist: true,
    });
    artifactType = 'CLAIM'; artifactId = claim.id;
    result = { status: 'COMPLETED', reasonCode: 'CLAIM_DRAFT_CREATED', blocks: [{ type: 'WORKFLOW_PROGRESS', id: `claim-created-${claim.id}`, title: 'Draft claim created', status: 'COMPLETED', description: 'The canonical draft claim, checklist, timeline event, and linked Operational Work were created. Nothing was submitted to an insurer or warranty provider.', details: [{ label: 'Claim', value: claim.title }, { label: 'Status', value: String(claim.status).toLowerCase() }], actions: [{ id: 'open-claim', label: 'Open claim', href: `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/claims/${claim.id}`, style: 'PRIMARY' }] }], suggestions: ['What should I gather for this claim?'] };
    // P05 fix: previously never called any reconciliation mechanism -- a
    // durable receipt existed, but the incidents/claims list the homeowner
    // may have been viewing (INCIDENT_CONTINUATION) had no read-retry path
    // back to its current state beyond re-asking from scratch.
    const claimFileRefresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (claimFileRefresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `claim-list-refresh-failed-${claim.id}`, title: 'Saved; list could not refresh',
        body: 'This draft claim was created. The list you were viewing could not refresh automatically -- ask "Show my recorded claims" to see its current state.',
        severity: 'CAUTION',
      });
      result.suggestions = [...new Set([...result.suggestions, 'Show my recorded claims'])];
    }
  return { result, artifactType, artifactId, refreshedExecutions: claimFileRefresh.refreshedExecutions };
}

async function confirmClaimTransition(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const claimId = parameters.claimId;
    const nextStatus = parameters.claimToStatus;
    if (typeof claimId !== 'string' || typeof nextStatus !== 'string') throw Object.assign(new Error('The claim transition is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const claim = await prisma.claim.findFirst({ where: { id: claimId, propertyId: execution.propertyId }, select: { id: true, title: true, status: true, updatedAt: true } });
    if (!claim) throw Object.assign(new Error('The selected claim is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const currentVersion = createHash('sha256').update(`${claim.id}:${claim.status}:${claim.updatedAt.toISOString()}`).digest('hex');
    if (parameters.claimContextVersion !== currentVersion && claim.status !== nextStatus) throw Object.assign(new Error(claimConflictDescription(claim)), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
    let updated: { status: string; title: string };
    try {
      updated = claim.status === nextStatus ? await ClaimsService.getClaim(execution.propertyId, claim.id) : await ClaimsService.updateClaim(execution.propertyId, claim.id, userId, { status: nextStatus as ClaimStatus });
    } catch (error) {
      // The same checklist gate the traditional Claims page reports (ClaimQuickActions): name what blocks submitting.
      const blocked = error as { code?: string; details?: { blocking?: Array<{ title: string; missingDocs?: number }> } };
      if (blocked?.code !== 'CLAIM_SUBMIT_BLOCKED') throw error;
      const items = (blocked.details?.blocking ?? []).slice(0, 3).map((item) => item.missingDocs ? `${item.title} (missing ${item.missingDocs} document${item.missingDocs === 1 ? '' : 's'})` : `${item.title} (not done)`);
      throw Object.assign(new Error(`This claim cannot be submitted yet. Finish its checklist first${items.length ? `: ${items.join('; ')}` : ''}. Nothing was changed.`), { code: 'CLAIM_SUBMIT_BLOCKED' });
    }
    artifactType = 'CLAIM'; artifactId = claim.id;
    result = { status: 'COMPLETED', reasonCode: 'CLAIM_STATUS_UPDATED', blocks: [{ type: 'WORKFLOW_PROGRESS', id: `claim-updated-${claim.id}`, title: 'Claim status updated', status: 'COMPLETED', description: 'The canonical claim lifecycle and linked Operational Work/outcome reconciliation were updated through the Claims service.', details: [{ label: 'Claim', value: updated.title }, { label: 'Status', value: String(updated.status).toLowerCase().replace(/_/g, ' ') }], actions: [{ id: 'open-claim', label: 'Open claim', href: `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/claims/${claim.id}`, style: 'PRIMARY' }] }], suggestions: ['Show my open claims'] };
    // P05 fix: see confirmClaimFile's identical fix above -- same missing
    // reconciliation mechanism, same INCIDENT_CONTINUATION sibling.
    const claimTransitionRefresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (claimTransitionRefresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `claim-list-refresh-failed-${claim.id}`, title: 'Saved; list could not refresh',
        body: 'This claim status change was saved. The list you were viewing could not refresh automatically -- ask "Show my open claims" to see its current state.',
        severity: 'CAUTION',
      });
      result.suggestions = [...new Set([...result.suggestions, 'Show my open claims'])];
    }
  return { result, artifactType, artifactId, refreshedExecutions: claimTransitionRefresh.refreshedExecutions };
}

// IW-PRES-015 (FRD v1.75): applies a deck batch. Each finding is re-read and re-checked exactly as the single confirm
// does (a change made while the confirmation was open leaves that finding untouched; an already-applied change counts
// as done). The writes are not one transaction, so the receipt says what happened to each finding.
async function confirmInspectionFindingBatch(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const entries = (Array.isArray(parameters.inspectionFindingBatch) ? parameters.inspectionFindingBatch : []) as Array<Record<string, unknown>>;
  const valid = entries.filter((entry) => typeof entry.findingId === 'string' && typeof entry.reportId === 'string' && (entry.action === 'ACCEPT' || entry.action === 'DISMISS'));
  if (!valid.length || valid.length !== entries.length) throw Object.assign(new Error('The inspection finding decisions are invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const outcomes: Array<{ id: string; title: string; outcome: 'APPLIED' | 'ALREADY' | 'CHANGED' | 'GONE' | 'FAILED'; action: 'ACCEPT' | 'DISMISS' }> = [];
  for (const entry of valid) {
    const findingId = entry.findingId as string;
    const reportId = entry.reportId as string;
    const action = entry.action as 'ACCEPT' | 'DISMISS';
    const finding = await prisma.inspectionFinding.findFirst({ where: { id: findingId, reportId, propertyId: execution.propertyId }, select: { id: true, homeSystem: true, inspectorDescription: true, status: true, workDisposition: true, updatedAt: true } });
    if (!finding) { outcomes.push({ id: findingId, title: 'A finding', outcome: 'GONE', action }); continue; }
    const title = `${finding.homeSystem}: ${finding.inspectorDescription}`;
    const alreadyApplied = (action === 'ACCEPT' && finding.workDisposition === 'ACCEPTED') || (action === 'DISMISS' && finding.status === 'DISMISSED');
    if (alreadyApplied) { outcomes.push({ id: finding.id, title, outcome: 'ALREADY', action }); continue; }
    if (entry.contextVersion !== inspectionFindingVersion(finding)) { outcomes.push({ id: finding.id, title, outcome: 'CHANGED', action }); continue; }
    try {
      if (action === 'ACCEPT') await acceptFindingAsWork(finding.id, reportId, execution.propertyId, userId);
      else await dismissFinding(finding.id, reportId, execution.propertyId, 'Dismissed through Ask after homeowner confirmation.', userId);
      outcomes.push({ id: finding.id, title, outcome: 'APPLIED', action });
    } catch (error) {
      logger.warn({ error, findingId: finding.id }, '[ask-inspection-batch] finding update failed');
      outcomes.push({ id: finding.id, title, outcome: 'FAILED', action });
    }
  }
  const done = outcomes.filter((entry) => entry.outcome === 'APPLIED' || entry.outcome === 'ALREADY');
  if (!done.length) throw Object.assign(new Error(outcomes.some((entry) => entry.outcome === 'FAILED') ? 'None of these findings could be updated. Nothing was changed.' : 'These findings changed while the confirmation was open. Nothing was changed. Review them and try again.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  const doneLabel = (entry: typeof outcomes[number]) => entry.outcome === 'ALREADY' ? 'Already done' : entry.action === 'ACCEPT' ? 'Accepted as work' : 'Dismissed';
  const notDone = outcomes.filter((entry) => entry.outcome !== 'APPLIED' && entry.outcome !== 'ALREADY');
  const notDoneReason = { CHANGED: 'changed while the confirmation was open', GONE: 'no longer exists', FAILED: 'could not be saved', APPLIED: '', ALREADY: '' } as const;
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'INSPECTION_FINDING_BATCH_UPDATED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: 'inspection-finding-batch-updated', title: `${done.length} inspection finding${done.length === 1 ? '' : 's'} updated`, status: 'COMPLETED',
      description: 'Accepted findings are routed through canonical Operational Work. Dismissed findings are closed without work.',
      details: [...done.map((entry) => ({ label: entry.title.slice(0, 120), value: doneLabel(entry) })), ...notDone.map((entry) => ({ label: entry.title.slice(0, 120), value: 'Not changed' }))].slice(0, 12),
      actions: [],
    }, ...(notDone.length ? [{
      type: 'LIMITATION' as const, id: 'inspection-finding-batch-not-changed', title: `${notDone.length} finding${notDone.length === 1 ? ' was' : 's were'} not changed`, severity: 'CAUTION' as const,
      body: notDone.map((entry) => `${entry.title} ${notDoneReason[entry.outcome]}.`).slice(0, 10).join(' '),
    }] : [])],
    suggestions: ['Show remaining inspection findings'],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: 'inspection-finding-batch-refresh-failed', title: 'Saved; list could not refresh', severity: 'CAUTION', body: 'These updates were saved. The findings list you were viewing could not refresh automatically -- ask "Show remaining inspection findings" to see its current state.' });
  }
  return { result, artifactType: 'INSPECTION_FINDING', artifactId: done[0].id, refreshedExecutions: refresh.refreshedExecutions };
}

async function confirmInspectionFindingUpdate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  if (Array.isArray(ctx.parameters.inspectionFindingBatch)) return confirmInspectionFindingBatch(ctx);
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const findingId = parameters.inspectionFindingId;
    const reportId = parameters.inspectionReportId;
    const action = parameters.inspectionFindingAction;
    if (typeof findingId !== 'string' || typeof reportId !== 'string' || !['ACCEPT', 'DISMISS', 'RESOLVE'].includes(String(action))) throw Object.assign(new Error('The inspection finding action is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const finding = await prisma.inspectionFinding.findFirst({ where: { id: findingId, reportId, propertyId: execution.propertyId }, select: { id: true, homeSystem: true, status: true, workDisposition: true, updatedAt: true } });
    if (!finding) throw Object.assign(new Error('The selected inspection finding is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const currentVersion = createHash('sha256').update(`${finding.id}:${finding.status}:${finding.workDisposition}:${finding.updatedAt.toISOString()}`).digest('hex');
    const alreadyApplied = (action === 'ACCEPT' && finding.workDisposition === 'ACCEPTED') || (action === 'DISMISS' && finding.status === 'DISMISSED') || (action === 'RESOLVE' && finding.status === 'RESOLVED');
    if (parameters.inspectionFindingContextVersion !== currentVersion && !alreadyApplied) throw Object.assign(new Error('This inspection finding changed while confirmation was open. Review it and try again.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
    if (!alreadyApplied) {
      if (action === 'ACCEPT') await acceptFindingAsWork(finding.id, reportId, execution.propertyId, userId);
      else if (action === 'DISMISS') await dismissFinding(finding.id, reportId, execution.propertyId, 'Dismissed through Ask after homeowner confirmation.', userId);
      else {
        // Older proposals (before FRD v1.43) carry no resolution; they get the traditional dialog's default method.
        const resolution = InspectionResolutionSchema.safeParse(parameters.inspectionResolution ?? INSPECTION_RESOLUTION_DEFAULT);
        if (!resolution.success) throw Object.assign(new Error('The resolution details are invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
        await resolveFinding(finding.id, execution.propertyId, {
          resolutionMethod: resolution.data.method,
          ...(resolution.data.notes ? { resolutionNotes: resolution.data.notes } : {}),
          ...(resolution.data.costCents !== null ? { resolutionCostCents: resolution.data.costCents } : {}),
        });
      }
    }
    artifactType = 'INSPECTION_FINDING'; artifactId = finding.id;
    const findingReasonCode = action === 'ACCEPT' ? 'INSPECTION_FINDING_ACCEPTED' : action === 'DISMISS' ? 'INSPECTION_FINDING_DISMISSED' : 'INSPECTION_FINDING_RESOLVED';
    result = { status: 'COMPLETED', reasonCode: findingReasonCode, blocks: [{ type: 'WORKFLOW_PROGRESS', id: `inspection-finding-updated-${finding.id}`, title: 'Inspection finding updated', status: 'COMPLETED', description: action === 'ACCEPT' ? 'The finding is now routed through canonical Operational Work and its appropriate execution workflow.' : 'The canonical finding and any linked work reconciliation were updated.', details: [{ label: 'System', value: finding.homeSystem }, { label: 'Action', value: String(action).toLowerCase() }], actions: [{ id: 'open-inspection', label: 'Open Inspection Hub', href: `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/inspection`, style: 'PRIMARY' }] }], suggestions: ['Show remaining inspection findings'] };
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's INSPECTION_FINDING_UPDATE entry.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'BOUNDARY', id: `inspection-finding-refresh-failed-${finding.id}`, severity: 'CAUTION', title: 'Saved; list could not refresh',
        body: 'This update was saved to the canonical inspection record. The findings list you were viewing could not refresh automatically -- ask "Show remaining inspection findings" to see its current state.',
        suggestions: ['Show remaining inspection findings'],
      });
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}

// Ask Cozy Stage 3, Phase 7 write-path slice (implementation plan §13; FRD
// §31). Unlike INSPECTION_FINDING_UPDATE's three actions, none of which are
// each other's exact inverse, PropertySaleCaseService.setItemDecision is
// fully idempotent and unconditional (re-applying the same action is a safe
// no-op re-write, confirmed by reading its implementation before relying on
// this) -- so this handler does NOT need an "alreadyApplied" staleness
// bypass the way confirmInspectionFindingUpdate does; the contextVersion
// check below always applies, which is actually MORE important here since
// there is no idempotent-no-op safety net protecting a stale confirm from
// silently overwriting a decision (and its reason) made by someone else in
// the meantime.
async function confirmSellerPrepItemDecision(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const itemId = parameters.saleReadinessItemId;
  const action = parameters.saleReadinessItemAction;
  const reason = typeof parameters.saleReadinessItemReason === 'string' ? parameters.saleReadinessItemReason : undefined;
  if (typeof itemId !== 'string' || !['WAIVE', 'PURSUE', 'REOPEN', 'UNPURSUE'].includes(String(action))) {
    throw Object.assign(new Error('The seller-prep item decision is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  }
  const item = await prisma.saleReadinessItem.findFirst({
    where: { id: itemId, saleCase: { propertyId: execution.propertyId } },
    select: { id: true, title: true, status: true, updatedAt: true },
  });
  if (!item) throw Object.assign(new Error('The selected checklist item is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const currentVersion = sellerPrepItemContextVersion(item);
  if (parameters.saleReadinessItemContextVersion !== currentVersion) {
    throw Object.assign(new Error(saleReadinessItemConflictDescription(item)), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  }
  await PropertySaleCaseService.setItemDecision(userId, execution.propertyId, item.id, action as 'WAIVE' | 'PURSUE' | 'REOPEN' | 'UNPURSUE', reason);
  const result: AskOperationResult = {
    status: 'COMPLETED',
    reasonCode: `SELLER_PREP_ITEM_${action}`,
    blocks: [{
      type: 'WORKFLOW_PROGRESS',
      id: `seller-prep-item-updated-${item.id}`,
      title: 'Seller-prep checklist item updated',
      status: 'COMPLETED',
      description: 'The shared seller-prep checklist was updated.',
      details: [{ label: 'Item', value: item.title }, { label: 'Decision', value: String(action).toLowerCase() }],
      actions: [{ id: 'open-seller-prep', label: 'Open sale readiness checklist', href: saleCaseHref(execution.propertyId, item.id), style: 'PRIMARY' }],
    }],
    suggestions: ['Check my sale readiness'],
  };
  // IW-FRESH-003 fix: previously called no reconciliation mechanism at all
  // -- see ASK_MUTATION_IMPACT_MAP's SELLER_PREP_ITEM_DECISION entry.
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'BOUNDARY', id: `seller-prep-refresh-failed-${item.id}`, severity: 'CAUTION', title: 'Saved; list could not refresh',
      body: 'This decision was saved to the shared seller-prep checklist. The checklist you were viewing could not refresh automatically -- ask "Check my sale readiness" to see its current state.',
      suggestions: ['Check my sale readiness'],
    });
  }
  return { result, artifactType: 'SALE_READINESS_ITEM', artifactId: item.id, refreshedExecutions: refresh.refreshedExecutions };
}

async function confirmGuidanceJourneyCreate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
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
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all. No sibling declared in ASK_MUTATION_IMPACT_MAP (no "list my
    // guidance journeys" read exists) -- this still gets the explicit
    // sourceExecutionId refresh for free.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'BOUNDARY', id: `guidance-journey-refresh-failed-${journey.id}`, severity: 'CAUTION', title: 'Saved; list could not refresh',
        body: 'The guided plan was started successfully. A result you were viewing could not refresh automatically -- open the guided plan directly to see its current state.',
        suggestions: [],
      });
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}

async function confirmQuoteComparisonCreate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
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
    const workspaceLabel = created.workspace.scopeSummary?.trim()
      || `${String(created.workspace.serviceCategory ?? candidate.data.serviceCategory).toLowerCase().replace(/_/g, ' ')} quote comparison`;
    result = {
      status: 'COMPLETED', reasonCode: created.reused ? 'QUOTE_COMPARISON_REUSED' : 'QUOTE_COMPARISON_CREATED',
      blocks: [{
        type: 'WORKFLOW_PROGRESS', id: `quote-workspace-${created.workspace.id}`, title: created.reused ? 'Existing comparison workspace opened' : 'Quote comparison workspace created', status: 'COMPLETED',
        description: 'No provider or quote was selected. Add comparable proposals in the governed workspace.',
        details: [{ label: 'Service', value: candidate.data.serviceCategory.toLowerCase().replace(/_/g, ' ') }, { label: 'Status', value: created.workspace.status.toLowerCase() }],
        actions: [],
      }, {
        type: 'OUTPUT_ARTIFACTS', id: `quote-workspace-output-${created.workspace.id}`, title: 'Workspace record',
        items: [{
          artifactType: 'QUOTE_COMPARISON_WORKSPACE', artifactId: created.workspace.id,
          relationship: created.reused ? 'REUSED' : 'CREATED', label: workspaceLabel,
          status: created.workspace.status, createdAt: created.workspace.createdAt.toISOString(),
          navigation: { label: 'Open comparison', href },
        }],
      }],
      confirmation: null, suggestions: [],
    };
    artifactType = command.artifactType;
    artifactId = created.workspace.id;
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's QUOTE_COMPARISON_CREATE entry.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'BOUNDARY', id: `quote-comparison-create-refresh-failed-${created.workspace.id}`, severity: 'CAUTION', title: 'Saved; list could not refresh',
        body: 'The comparison workspace was saved. A result you were viewing could not refresh automatically -- open the workspace directly to see its current state.',
        suggestions: [],
      });
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}

async function confirmHomeDeadlineMonitor(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
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
      // Unlike the MAINTENANCE branch above, this previously reused
      // candidate.data.dueDate/title from prep time with no recheck at all
      // -- editing or deleting the warranty/policy during the confirmation
      // window would silently create a reminder pinned to a stale
      // expiration date. Re-fetch the actual source record and require it
      // to match the version captured at prep time before proceeding.
      const currentSource = candidate.data.sourceType === 'WARRANTY'
        ? await prisma.warranty.findFirst({ where: { id: candidate.data.sourceId, propertyId: execution.propertyId } })
        : await prisma.insurancePolicy.findFirst({ where: { id: candidate.data.sourceId, propertyId: execution.propertyId } });
      await assertCoverageConflictFree(execution.propertyId, prisma, candidate.data.sourceType === 'WARRANTY'
        ? { warrantyId: candidate.data.sourceId }
        : { insurancePolicyId: candidate.data.sourceId });
      if (!currentSource || !currentSource.expiryDate || parameters.homeDeadlineSourceVersion !== homeDeadlineSourceVersion(currentSource as { id: string; expiryDate: Date | null; updatedAt: Date })) {
        const error = new Error(`This ${candidate.data.sourceType === 'WARRANTY' ? 'warranty' : 'insurance policy'} changed while confirmation was open. Review the current record and try again.`);
        (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
        throw error;
      }
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
    // Notification categories are property-wide switches (userId + property +
    // category + channel), not scoped to the single task/policy just
    // confirmed. Enabling both MAINTENANCE and MATERIAL_DEADLINE regardless
    // of which reminder was actually confirmed silently turns on emails for
    // an unrelated category the consent copy never disclosed. Enable only
    // the category the confirmed reminder belongs to.
    const deadlineCategory: 'MAINTENANCE' | 'MATERIAL_DEADLINE' = candidate.data.sourceType === 'MAINTENANCE' ? 'MAINTENANCE' : 'MATERIAL_DEADLINE';
    const property = await prisma.property.findUnique({ where: { id: execution.propertyId }, select: { timezone: true } });
    await upsertNotificationPreference(userId, { propertyId: execution.propertyId!, category: deadlineCategory, channel: 'EMAIL', enabled: true, cadence: 'IMMEDIATE', timezone: property?.timezone ?? 'UTC' });
    const href = `/dashboard/maintenance?propertyId=${encodeURIComponent(execution.propertyId)}&taskId=${encodeURIComponent(task.id)}&from=ask`;
    const maintenanceSource = candidate.data.sourceType === 'MAINTENANCE';
    result = { status: 'COMPLETED', reasonCode: maintenanceSource ? 'MAINTENANCE_MONITOR_ACTIVE' : 'HOME_DEADLINE_MONITOR_ACTIVE', blocks: [{ type: 'WORKFLOW_PROGRESS', id: `home-deadline-${task.id}`, title: maintenanceSource ? 'Maintenance reminders are active' : 'Expiration reminder is active', status: 'COMPLETED', description: maintenanceSource ? 'The existing canonical task now has governed in-app and email delivery preferences; no duplicate task was created.' : 'A canonical dated obligation now drives governed in-app and email reminders.', details: [{ label: 'Reminder', value: task.title }, { label: 'Due', value: candidate.data.dueDate }, { label: maintenanceSource ? 'Reminder window' : 'Lead time', value: maintenanceSource ? 'Within 7 days of due date' : `${candidate.data.leadDays} days` }, { label: 'Channel', value: 'In-app plus email' }], actions: [{ id: 'manage-reminder', label: 'Manage reminder', href, style: 'PRIMARY' }] }], confirmation: null, suggestions: [`Reschedule ${task.title}`, `Archive ${task.title}`] };
    artifactType = command.artifactType;
    artifactId = task.id;
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's HOME_DEADLINE_MONITOR entry
    // (the non-maintenance branch above creates/updates a real
    // PropertyMaintenanceTask, so MAINTENANCE_STATUS is a genuine sibling).
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'BOUNDARY', id: `home-deadline-monitor-refresh-failed-${task.id}`, severity: 'CAUTION', title: 'Saved; list could not refresh',
        body: 'The reminder was saved successfully. A result you were viewing could not refresh automatically -- ask "What maintenance is still pending?" to see its current state.',
        suggestions: ['What maintenance is still pending?'],
      });
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}

async function confirmRefinanceRateMonitor(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
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
    result = {
      status: 'COMPLETED', reasonCode: 'RATE_MONITOR_ACTIVE',
      blocks: [refinanceMonitorBlock(monitor, 'Mortgage-rate monitor started')],
      confirmation: null, suggestions: ['Is refinancing worth reviewing now?'],
    };
    artifactType = 'REFINANCE_RATE_MONITOR';
    artifactId = monitor.id;
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's REFINANCE_RATE_MONITOR entry.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `refinance-monitor-refresh-failed-${monitor.id}`, title: 'Saved; list could not refresh',
        body: 'This monitor was saved. A refinance result you were viewing could not refresh automatically -- ask "Is refinancing worth reviewing now?" to see its current state.',
        severity: 'CAUTION',
      });
      result.suggestions = [...new Set([...result.suggestions, 'Is refinancing worth reviewing now?'])];
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}

registerConfirmCapabilityHandler('incident-claim.file', confirmClaimFile);

registerConfirmCapabilityHandler('incident-claim.transition', confirmClaimTransition);

registerConfirmCapabilityHandler('inspection-findings.update', confirmInspectionFindingUpdate);

registerConfirmCapabilityHandler('seller-prep.item-decision', confirmSellerPrepItemDecision);

registerConfirmCapabilityHandler('guidance.journey.create', confirmGuidanceJourneyCreate);

registerConfirmCapabilityHandler('quote-comparison.create', confirmQuoteComparisonCreate);

registerConfirmCapabilityHandler('home-deadline.monitor', confirmHomeDeadlineMonitor);

registerConfirmCapabilityHandler('refinance.monitor', confirmRefinanceRateMonitor);
