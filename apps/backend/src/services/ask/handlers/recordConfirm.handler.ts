// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { PROPERTY_AREA_CAPTURE_FEATURE, PROPERTY_AREA_CAPTURE_OPERATION } from '../../../modules/propertyContext/catalog/featureRequirementRegistry';
import { getFactDefinition } from '../../../modules/propertyContext/catalog/factCatalog';
import { AskExecution, HouseholdRole, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import { ASK_RESPONSE_SCHEMA_VERSION, type AskExecutionResponse, type EditAskConfirmation } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { captureFeatureContext, PropertyContextCaptureValidationError, PropertyContextVersionConflictError } from '../../../modules/propertyContext/application/captureFeatureContext';
import { PropertyContextAccessDeniedError } from '../../../modules/propertyContext/application/getPropertyContext';
import { APIError } from '../../../middleware/error.middleware';
import { markDoNothingRunsStale } from '../../doNothingSimulator.service';
import { updateWarranty } from '../../home-management.service';
import { correctionDisplay, correctionNormalized } from '../askCorrectionFields';
import { markCoverageAnalysisStale, markItemCoverageAnalysesStale } from '../../coverageAnalysis.service';
import { markReplaceRepairStale } from '../../replaceRepairAnalysis.service';
import { markRiskPremiumOptimizerStale } from '../../riskPremiumOptimizer.service';
import { humanDate } from '../askFormatting';
import { AreaCaptureAnswerSchema, areaCaptureError, areaCaptureStateFrom } from '../handlers/propertySummary.handler';
import { areaCaptureFallbackHref, areaCaptureProgress, areaLabel, areaProgressBlock, asInputJson, captureEventResult, ensurePropertyAccess, HOME_EVENT_CORRECTION_FIELDS, HOME_EVENT_LINK_FIELDS, HOME_EVENT_VISIBILITY_LABELS, HomeEventCorrectionInputSchema, HomeEventVisibilityInputSchema, HouseholdInvitationInputSchema, InventoryCreateInputSchema, InventoryItemCorrectionInputSchema, InvitableHouseholdRole, invitationRoleCopy, mapPersistedExecution, preservedExecutionHistory, propertySummary, RoomCreateInputSchema, RoomRenameInputSchema, WarrantyCorrectionInputSchema } from '../askHandlerSupport';
import { homeEventContextVersion, homeEventCorrectionBlocker, homeEventCorrectionConfirmation, homeEventCorrectionValueError, homeEventFieldCurrent, homeEventFieldPatch, homeEventLinkOptions, homeEventsServiceForCapture, homeEventVisibilityBlocker, homeEventVisibilityConfirmation, householdService, householdWorkflowVersion, ROOM_CORRECTION_FIELDS, roomContextVersion, roomCorrectionNormalized, roomCorrectionValueError, roomFieldCurrent, roomFieldDisplay, roomRenameConfirmation, roomTypeLabel, WARRANTY_CORRECTION_FIELDS, warrantyContextVersion, warrantyCorrectionConfirmation, warrantyCorrectionValueError, warrantyFieldCurrent, warrantyFieldPatch } from '../handlers/homeRecordWrites.handler';
import { INVENTORY_CORRECTION_FIELDS, INVENTORY_CORRECTION_NO_ROOM_VALUE, INVENTORY_NO_ROOM_VALUE, INVENTORY_ROOM_LINK_FIELD, inventoryCategoryLabel, inventoryCorrectionCombinedBlocker, inventoryCorrectionConfirmation, inventoryCreateBlocker, inventoryCreateRooms, inventoryFieldCurrent, inventoryFieldDisplay, inventoryFieldNormalized, inventoryFieldPatch, inventoryFieldValueError, inventoryItemContextVersion, inventoryRoomLinkOptions, inventoryService } from '../handlers/inventory.handler';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { recordDocumentPromotionOutcome } from '../../decisionPlatform/outcomeObservationService';
import { applyWriteBacks } from '../../inspectionWriteBack.service';
import { MaterialSpecService } from '../../materialSpec.service';
import { confirmPolicyFact } from '../../insurancePolicyRecord.service';
import { transitionWorkItem } from '../../../modules/homeOperations/application/transitionWorkItem.usecase';
import { assertUserWorkItemTransition } from '../../../modules/homeOperations/domain/userGovernance';
import { snoozeWorkItem } from '../../../modules/homeOperations/application/snoozeWorkItem.usecase';
import { completeAcceptedOperationalWorkItem } from '../../homeActionCompletion.service';
import { resolveWorkItemRecommendationSnapshotId } from '../../decisionPlatform/homeActionDecisionLineage';

const materialSpecService = new MaterialSpecService();

async function confirmDocumentPromotionConfirm(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const kind = parameters.documentPromotionKind;
    const candidateId = parameters.documentPromotionId;
    const parentId = parameters.documentPromotionParentId;
    const decision = parameters.documentPromotionDecision;
    if (typeof candidateId !== 'string' || typeof parentId !== 'string' || !['CONFIRM', 'REJECT'].includes(String(decision))) throw Object.assign(new Error('The document-promotion decision is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    if (kind === 'MATERIAL_EXTRACTION_REVIEW') {
      const review = await prisma.materialExtractionReview.findFirst({ where: { id: candidateId, materialSpecId: parentId, propertyId: execution.propertyId }, select: { id: true, status: true, candidateFields: true, updatedAt: true } });
      if (!review) throw Object.assign(new Error('The selected material extraction review is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
      const currentVersion = createHash('sha256').update(`${kind}:${review.id}:${review.updatedAt.toISOString()}`).digest('hex');
      if (review.status === 'NEEDS_REVIEW' && parameters.documentPromotionContextVersion !== currentVersion) throw Object.assign(new Error('This document candidate changed while confirmation was open.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
      if (review.status === 'NEEDS_REVIEW') await materialSpecService.reviewExtraction(execution.propertyId, parentId, review.id, userId, { status: decision === 'CONFIRM' ? 'CONFIRMED' : 'REJECTED', reviewedFields: decision === 'CONFIRM' ? review.candidateFields as Record<string, unknown> : undefined, reviewNotes: `${decision === 'CONFIRM' ? 'Confirmed' : 'Rejected'} through Ask after explicit homeowner review.` });
      if (decision === 'CONFIRM') await recordDocumentPromotionOutcome({ propertyId: execution.propertyId, promotedEntityType: 'MATERIAL_SPEC', promotedEntityId: parentId, userId });
      artifactType = 'MATERIAL_EXTRACTION_REVIEW'; artifactId = review.id;
    } else if (kind === 'INSURANCE_POLICY_FACT') {
      const fact = await prisma.insurancePolicyFact.findFirst({ where: { id: candidateId, policyTerm: { propertyId: execution.propertyId, insurancePolicyId: parentId } }, include: { policyTerm: { include: { insurancePolicy: { select: { homeownerProfileId: true } } } } } });
      if (!fact) throw Object.assign(new Error('The selected policy fact is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
      const currentVersion = createHash('sha256').update(`${kind}:${fact.id}:${fact.updatedAt.toISOString()}`).digest('hex');
      if (fact.confirmationStatus === 'PENDING' && parameters.documentPromotionContextVersion !== currentVersion) throw Object.assign(new Error('This policy fact changed while confirmation was open.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
      if (fact.confirmationStatus === 'PENDING') await confirmPolicyFact({ policyId: parentId, factId: fact.id, homeownerProfileId: fact.policyTerm.insurancePolicy.homeownerProfileId, userId, confirmationStatus: decision === 'CONFIRM' ? 'CONFIRMED' : 'REJECTED' });
      if (decision === 'CONFIRM') await recordDocumentPromotionOutcome({ propertyId: execution.propertyId, promotedEntityType: 'INSURANCE_POLICY_FACT', promotedEntityId: fact.id, userId });
      artifactType = 'INSURANCE_POLICY_FACT'; artifactId = fact.id;
    } else if (kind === 'INSPECTION_REPORT' && decision === 'CONFIRM') {
      const report = await prisma.inspectionReport.findFirst({ where: { id: candidateId, propertyId: execution.propertyId }, select: { id: true, status: true, updatedAt: true } });
      if (!report) throw Object.assign(new Error('The selected inspection report is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
      const currentVersion = createHash('sha256').update(`${kind}:${report.id}:${report.updatedAt.toISOString()}`).digest('hex');
      if (report.status === 'REVIEW_PENDING' && parameters.documentPromotionContextVersion !== currentVersion) throw Object.assign(new Error('This inspection report changed while confirmation was open.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
      if (report.status === 'REVIEW_PENDING') await applyWriteBacks(report.id, execution.propertyId, userId);
      await recordDocumentPromotionOutcome({ propertyId: execution.propertyId, promotedEntityType: 'INSPECTION_REPORT', promotedEntityId: report.id, userId });
      artifactType = 'INSPECTION_REPORT'; artifactId = report.id;
    } else throw Object.assign(new Error('This document-promotion action must be reviewed again.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    result = { status: 'COMPLETED', reasonCode: decision === 'CONFIRM' ? 'DOCUMENT_PROMOTION_CONFIRMED' : 'DOCUMENT_PROMOTION_REJECTED', blocks: [{ type: 'WORKFLOW_PROGRESS', id: `document-promotion-${candidateId}`, title: decision === 'CONFIRM' ? 'Document-derived record promoted' : 'Document candidate rejected', status: 'COMPLETED', description: decision === 'CONFIRM' ? 'The canonical domain adapter applied the reviewed values and recorded a promotion outcome.' : 'The source evidence remains available, but its candidate values were not promoted.', details: [{ label: 'Candidate id', value: candidateId }, { label: 'Decision', value: String(decision).toLowerCase() }], actions: [{ id: 'open-documents', label: 'Open Documents', href: `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/documents`, style: 'PRIMARY' }] }], suggestions: ['Show remaining document reviews'] };
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's DOCUMENT_PROMOTION_CONFIRM entry.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `document-promotion-refresh-failed-${candidateId}`, title: 'Saved; list could not refresh',
        body: 'This decision was saved to the canonical record. The document review list you were viewing could not refresh automatically -- ask "Show remaining document reviews" to see its current state.',
        severity: 'CAUTION',
      });
      result.suggestions = [...new Set([...result.suggestions, 'Show remaining document reviews'])];
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}

async function confirmOperationalWorkUpdate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const workItemId = parameters.operationalWorkItemId;
    const action = parameters.operationalWorkAction;
    if (typeof workItemId !== 'string' || !['ACCEPT', 'DEFER', 'SNOOZE', 'COMPLETE'].includes(String(action))) throw Object.assign(new Error('The Operational Work command is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const observedResult = parameters.operationalWorkObservedResult;
    if (action === 'COMPLETE' && !['CONFIRMED_HEALTHY', 'NEEDS_ATTENTION', 'FAILED'].includes(String(observedResult))) throw Object.assign(new Error('The Operational Work completion result is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const item = await prisma.operationalWorkItem.findFirst({ where: { id: workItemId, propertyId: execution.propertyId }, include: { executions: true } });
    if (!item) throw Object.assign(new Error('The selected Operational Work item is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const currentVersion = createHash('sha256').update(`${item.id}:${item.state}:${item.updatedAt.toISOString()}:${item.snoozedUntil?.toISOString() ?? ''}`).digest('hex');
    const alreadyApplied = action === 'ACCEPT' ? item.state === 'ACCEPTED' : action === 'DEFER' ? item.state === 'DEFERRED' : action === 'SNOOZE' ? item.snoozedUntil?.toISOString() === parameters.operationalWorkUntil : ['VERIFIED', 'CLOSED'].includes(item.state);
    if (parameters.operationalWorkContextVersion !== currentVersion && !alreadyApplied) throw Object.assign(new Error('This work item changed while confirmation was open. Review it and try again.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
    if (!alreadyApplied) {
      if (action === 'ACCEPT' || action === 'DEFER') {
        const target = action === 'ACCEPT' ? 'ACCEPTED' : 'DEFERRED'; assertUserWorkItemTransition(item, target);
        await transitionWorkItem({ workItemId: item.id, to: target, actorType: 'USER', actorUserId: userId, idempotencyKey: `ask:${execution.id}:operational-work:${action.toLowerCase()}`, timestampValue: action === 'DEFER' && typeof parameters.operationalWorkUntil === 'string' ? new Date(parameters.operationalWorkUntil) : undefined });
      } else if (action === 'SNOOZE') {
        if (typeof parameters.operationalWorkUntil !== 'string') throw Object.assign(new Error('The snooze date is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
        await snoozeWorkItem({ workItemId: item.id, snoozedUntil: new Date(parameters.operationalWorkUntil), actorUserId: userId, idempotencyKey: `ask:${execution.id}:operational-work:snooze` });
      } else await completeAcceptedOperationalWorkItem({
        workItemId: item.id,
        propertyId: execution.propertyId,
        userId,
        safetyTier: item.safetyTier,
        decisionLineage: null,
        recommendationSnapshotId: await resolveWorkItemRecommendationSnapshotId(execution.propertyId, item.id),
        observedResult: observedResult as 'CONFIRMED_HEALTHY' | 'NEEDS_ATTENTION' | 'FAILED',
        completedAt: new Date().toISOString(),
      });
    }
    artifactType = 'OPERATIONAL_WORK_ITEM'; artifactId = item.id;
    const workReasonCode = action === 'ACCEPT' ? 'OPERATIONAL_WORK_ACCEPTED' : action === 'DEFER' ? 'OPERATIONAL_WORK_DEFERRED' : action === 'SNOOZE' ? 'OPERATIONAL_WORK_SNOOZED' : 'OPERATIONAL_WORK_COMPLETED';
    result = { status: 'COMPLETED', reasonCode: workReasonCode, blocks: [{ type: 'WORKFLOW_PROGRESS', id: `operational-work-updated-${item.id}`, title: 'Operational Work updated', status: 'COMPLETED', description: action === 'COMPLETE' ? 'The authoritative maintenance execution, Operational Work lifecycle, evidence, and outcome were reconciled.' : 'The governed Operational Work command was applied to the canonical shared item.', details: [{ label: 'Work', value: item.title }, { label: 'Action', value: String(action).toLowerCase() }], actions: [{ id: 'open-work', label: 'Open Home Actions', href: `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/home-actions`, style: 'PRIMARY' }] }], suggestions: ['What needs my attention next?'] };
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's OPERATIONAL_WORK_UPDATE entry.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'BOUNDARY', id: `operational-work-refresh-failed-${item.id}`, severity: 'CAUTION', title: 'Saved; list could not refresh',
        body: 'This update was saved to the canonical Operational Work item. The list you were viewing could not refresh automatically -- ask "What needs my attention next?" to see its current state.',
        suggestions: ['What needs my attention next?'],
      });
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}

async function confirmHouseholdInvitation(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
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
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all. No sibling declared in ASK_MUTATION_IMPACT_MAP (no "list
    // household members" read exists) -- this still gets the explicit
    // sourceExecutionId refresh for free.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'BOUNDARY', id: `household-invitation-refresh-failed-${invite.id}`, severity: 'CAUTION', title: 'Saved; list could not refresh',
        body: 'The invitation was saved successfully. A result you were viewing could not refresh automatically -- ask "Who currently has access to this home?" to see its current state.',
        suggestions: ['Who currently has access to this home?'],
      });
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}

async function confirmInventoryItemCorrect(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const candidate = InventoryItemCorrectionInputSchema.safeParse(parameters.inventoryCorrection);
  if (!candidate.success) throw Object.assign(new Error('The inventory correction is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const { itemId, field, value } = candidate.data;
  const invalid = await inventoryFieldValueError(execution.propertyId!, field, value);
  if (invalid || typeof value !== 'string') throw Object.assign(new Error(invalid ?? 'Enter the corrected value before confirming.'), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
  const normalized = inventoryFieldNormalized(field, value);
  const dynamicOptions = field === INVENTORY_ROOM_LINK_FIELD ? await inventoryRoomLinkOptions(execution.propertyId!) : undefined;
  const item = await prisma.inventoryItem.findFirst({ where: { id: itemId, propertyId: execution.propertyId } });
  if (!item) throw Object.assign(new Error('This inventory item is no longer available. It may have been deleted.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  // A recovery retry of this same execution (receipt reclaimed after the
  // write below committed) sees the already-corrected value: treat it as
  // applied rather than misreporting the execution's own success as a
  // concurrent change. updateItem is a plain overwrite, so this is also the
  // only replay guard the write needs.
  const previous = inventoryFieldCurrent(item, field);
  const alreadyApplied = previous === (field === INVENTORY_ROOM_LINK_FIELD ? (normalized === INVENTORY_CORRECTION_NO_ROOM_VALUE ? null : normalized) : normalized);
  if (!alreadyApplied && parameters.inventoryCorrectionContextVersion !== inventoryItemContextVersion(item)) {
    throw Object.assign(new Error('This inventory item changed while confirmation was open. Review it and try again.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  }
  if (!alreadyApplied) {
    const combinedBlocker = inventoryCorrectionCombinedBlocker(item, field, normalized);
    if (combinedBlocker) throw Object.assign(new Error(combinedBlocker), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
    await inventoryService.updateItem(execution.propertyId!, item.id, inventoryFieldPatch(field, normalized));
    // The traditional item PATCH controller (not the service) marks these five analyses stale; repeat them so an
    // Ask correction has the same downstream effect (a changed date, cost or condition alters replace-or-repair,
    // coverage and risk analyses).
    await markCoverageAnalysisStale(execution.propertyId!);
    await markItemCoverageAnalysesStale(execution.propertyId!, item.id);
    await markReplaceRepairStale(execution.propertyId!, item.id);
    await markRiskPremiumOptimizerStale(execution.propertyId!);
    await markDoNothingRunsStale(execution.propertyId!);
  }
  const updated = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
  const meta = INVENTORY_CORRECTION_FIELDS[field];
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'INVENTORY_ITEM_CORRECTED', contextVersion: inventoryItemContextVersion(updated),
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `inventory-corrected-${item.id}`, title: 'Inventory record updated', status: 'COMPLETED',
      description: 'The canonical inventory record was updated and dependent analyses were marked for refresh.',
      details: [{ label: 'Item', value: item.name }, { label: 'Field', value: meta.label }, { label: 'Previous value', value: alreadyApplied ? 'Already corrected' : inventoryFieldDisplay(field, previous, dynamicOptions) }, { label: 'New value', value: inventoryFieldDisplay(field, normalized, dynamicOptions) }],
      actions: [{ id: 'open-inventory', label: 'Open home inventory', href: `/dashboard/properties/${encodeURIComponent(execution.propertyId!)}/inventory?tab=items`, style: 'PRIMARY' }],
    }],
    suggestions: ['Show my home inventory'],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `inventory-refresh-failed-${item.id}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'This correction was saved to the canonical inventory record. The result you were viewing could not refresh automatically -- ask "Show my home inventory" to see its current state.',
    });
  }
  return { result, artifactType: 'INVENTORY_ITEM', artifactId: item.id, refreshedExecutions: refresh.refreshedExecutions };
}

registerConfirmCapabilityHandler('inventory.item-correct', confirmInventoryItemCorrect);

async function confirmHomeEventCorrect(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const candidate = HomeEventCorrectionInputSchema.safeParse(parameters.homeEventCorrection);
  if (!candidate.success) throw Object.assign(new Error('The timeline correction is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const { eventId, field, value } = candidate.data;
  const invalid = await homeEventCorrectionValueError(execution.propertyId!, field, value);
  if (invalid || typeof value !== 'string') throw Object.assign(new Error(invalid ?? 'Enter the corrected value before confirming.'), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
  const normalized = correctionNormalized(HOME_EVENT_CORRECTION_FIELDS[field], value);
  // updateHomeEvent has no idempotency of its own and supersedes every time:
  // a lease-reclaim retry must find this execution's own replacement first.
  const correctionKey = `ask-correction:${execution.id}`;
  const finish = async (replacement: { id: string; title: string }): Promise<ConfirmCapabilityResult> => {
    const result = captureEventResult(execution.propertyId!, replacement, true);
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `home-event-refresh-failed-${replacement.id}`, title: 'Saved; view could not refresh',
        body: 'This correction was saved to your home timeline. The result you were viewing could not refresh automatically -- ask "Show my home timeline" to see its current state.',
        severity: 'CAUTION',
      });
    }
    return { result, artifactType: 'HOME_EVENT', artifactId: replacement.id, refreshedExecutions: refresh.refreshedExecutions };
  };
  const findWinner = () => prisma.homeEvent.findFirst({ where: { propertyId: execution.propertyId, idempotencyKey: correctionKey } });
  const already = await findWinner();
  if (already) return finish(already);
  const current = await prisma.homeEvent.findFirst({
    where: { id: eventId, propertyId: execution.propertyId, isCurrent: true, deletedAt: null },
    select: { id: true, title: true, revision: true, visibility: true, createdById: true, datePrecision: true, type: true, roomId: true, inventoryItemId: true },
  });
  if (!current || (current.visibility === 'PRIVATE' && current.createdById !== userId)) {
    throw Object.assign(new Error('This timeline event is no longer available. It may have been corrected or removed.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  }
  if (parameters.homeEventCorrectionContextVersion !== homeEventContextVersion(current)) {
    throw Object.assign(new Error('This timeline event changed while confirmation was open. Review it and try again.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  }
  const blocker = homeEventCorrectionBlocker(current, field);
  if (blocker) throw Object.assign(new Error(blocker), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const patch = homeEventFieldPatch(field, normalized);
  try {
    const replacement = await homeEventsServiceForCapture.updateHomeEvent(
      execution.propertyId!, current.id,
      { ...patch, correctionReason: 'Corrected through Ask after homeowner confirmation.' },
      userId, { idempotencyKey: correctionKey },
    );
    return finish(replacement);
  } catch (error) {
    // Same two race recoveries as confirmCaptureEvent: the winner's whole
    // supersede+create transaction commits atomically, so re-reading by this
    // execution's key finds it.
    if ((error instanceof APIError && error.code === 'HOME_EVENT_NOT_FOUND') || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
      const winner = await findWinner();
      if (winner) return finish(winner);
      if (error instanceof APIError) throw Object.assign(new Error('The event to correct is no longer available.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
    }
    throw error;
  }
}

registerConfirmCapabilityHandler('home-event.correct', confirmHomeEventCorrect);

async function confirmHomeEventVisibility(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const candidate = HomeEventVisibilityInputSchema.safeParse(parameters.homeEventVisibility);
  if (!candidate.success || candidate.data.value === null) throw Object.assign(new Error('The visibility to save is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const { eventId, value: proposed } = candidate.data;
  const current = await prisma.homeEvent.findFirst({
    where: { id: eventId, propertyId: execution.propertyId, isCurrent: true, deletedAt: null },
    select: { id: true, title: true, revision: true, visibility: true, createdById: true },
  });
  if (!current || (current.visibility === 'PRIVATE' && current.createdById !== userId)) {
    throw Object.assign(new Error('This timeline event is no longer available. It may have been corrected or removed.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  }
  const alreadyApplied = current.visibility === proposed;
  if (!alreadyApplied) {
    const blocker = homeEventVisibilityBlocker(userId, current.createdById, current.visibility, proposed);
    if (blocker) throw Object.assign(new Error(blocker), { code: 'ASK_PERMISSION_REQUIRED' });
    if (parameters.homeEventVisibilityContextVersion !== homeEventContextVersion(current)) {
      throw Object.assign(new Error('This timeline event changed while confirmation was open. Review it and try again.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
    }
    await homeEventsServiceForCapture.setVisibility({ propertyId: execution.propertyId!, eventId: current.id, visibility: proposed });
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'HOME_EVENT_VISIBILITY_CHANGED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `home-event-visibility-${current.id}`, title: alreadyApplied ? 'Visibility already set' : 'Visibility changed', status: 'COMPLETED',
      description: 'The canonical timeline event was updated in place.',
      details: [{ label: 'Event', value: current.title }, { label: 'Previous visibility', value: alreadyApplied ? 'Already set' : HOME_EVENT_VISIBILITY_LABELS[current.visibility] ?? current.visibility }, { label: 'New visibility', value: HOME_EVENT_VISIBILITY_LABELS[proposed] ?? proposed }],
      actions: [{ id: 'open-timeline', label: 'Open home timeline', href: `/dashboard/properties/${encodeURIComponent(execution.propertyId!)}/timeline`, style: 'PRIMARY' }],
    }],
    suggestions: ['Show my home timeline'],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `home-event-visibility-refresh-failed-${current.id}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'This visibility change was saved to the canonical timeline event. The result you were viewing could not refresh automatically -- ask "Show my home timeline" to see its current state.',
    });
  }
  return { result, artifactType: 'HOME_EVENT', artifactId: current.id, refreshedExecutions: refresh.refreshedExecutions };
}

registerConfirmCapabilityHandler('home-event.visibility', confirmHomeEventVisibility);

async function confirmWarrantyCorrect(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const candidate = WarrantyCorrectionInputSchema.safeParse(parameters.warrantyCorrection);
  if (!candidate.success) throw Object.assign(new Error('The warranty correction is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const { warrantyId, field, value } = candidate.data;
  const warranty = await prisma.warranty.findFirst({
    where: { id: warrantyId, propertyId: execution.propertyId },
    include: { homeownerProfile: { select: { id: true, userId: true } } },
  });
  if (!warranty) throw Object.assign(new Error('This warranty is no longer available. It may have been deleted.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  // Ownership is re-verified at execution time: updateWarranty is scoped to
  // the owning homeownerProfile, and Ask must not widen that.
  if (warranty.homeownerProfile.userId !== userId) {
    throw Object.assign(new Error('Only the household member who added this warranty can change it.'), { code: 'ASK_PERMISSION_REQUIRED' });
  }
  const invalid = warrantyCorrectionValueError(field, value, warranty);
  if (invalid || typeof value !== 'string') throw Object.assign(new Error(invalid ?? 'Enter a corrected value before confirming.'), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
  const next = correctionNormalized(WARRANTY_CORRECTION_FIELDS[field], value);
  const previous = warrantyFieldCurrent(warranty, field);
  // A recovery retry of this same execution sees the already-corrected value.
  const alreadyApplied = previous === next;
  if (!alreadyApplied && parameters.warrantyCorrectionContextVersion !== warrantyContextVersion(warranty)) {
    throw Object.assign(new Error('This warranty changed while confirmation was open. Review it and try again.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  }
  // Narrowed patch: never the request body, only the one confirmed field.
  if (!alreadyApplied) await updateWarranty(warranty.id, warranty.homeownerProfile.id, warrantyFieldPatch(field, next));
  const updated = await prisma.warranty.findUniqueOrThrow({ where: { id: warranty.id } });
  const meta = WARRANTY_CORRECTION_FIELDS[field];
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'WARRANTY_CORRECTED', contextVersion: warrantyContextVersion(updated),
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `warranty-corrected-${warranty.id}`, title: 'Warranty updated', status: 'COMPLETED',
      description: 'The warranty record was updated and dependent coverage analysis was marked for refresh.',
      details: [{ label: 'Warranty', value: updated.providerName }, { label: 'Field', value: meta.label }, { label: 'Previous value', value: alreadyApplied ? 'Already corrected' : correctionDisplay(meta, previous) }, { label: 'New value', value: correctionDisplay(meta, next) }],
      actions: [{ id: 'open-warranties', label: 'Open Warranties', href: '/dashboard/warranties', style: 'PRIMARY' }],
    }],
    suggestions: ['Show my warranties'],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `warranty-refresh-failed-${warranty.id}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'This correction was saved to the warranty record. The result you were viewing could not refresh automatically -- ask "Show my warranties" to see its current state.',
    });
  }
  return { result, artifactType: 'WARRANTY', artifactId: warranty.id, refreshedExecutions: refresh.refreshedExecutions };
}

registerConfirmCapabilityHandler('warranty.correct', confirmWarrantyCorrect);

async function confirmRoomRename(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const candidate = RoomRenameInputSchema.safeParse(parameters.roomRename);
  if (!candidate.success) throw Object.assign(new Error('The room correction is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const { roomId, field, value } = candidate.data;
  const meta = ROOM_CORRECTION_FIELDS[field];
  const room = await prisma.inventoryRoom.findFirst({ where: { id: roomId, propertyId: execution.propertyId } });
  if (!room) throw Object.assign(new Error('This room is no longer available. It may have been deleted.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  const proposed = typeof value === 'string' ? roomCorrectionNormalized(field, value) : '';
  const previous = roomFieldCurrent(room, field);
  // A recovery retry of this same execution sees the already-applied value.
  const alreadyApplied = proposed.length > 0 && previous === proposed;
  if (!alreadyApplied) {
    const invalid = await roomCorrectionValueError(execution.propertyId!, room.id, field, value);
    if (invalid) throw Object.assign(new Error(invalid), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
    if (parameters.roomRenameContextVersion !== roomContextVersion(room)) {
      throw Object.assign(new Error('This room changed while confirmation was open. Review it and try again.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
    }
    // Narrowed to the one field being corrected.
    const patch = field === 'floorLevel' ? { floorLevel: Number(proposed) } : field === 'type' ? { type: proposed } : { name: proposed };
    try {
      await inventoryService.updateRoom(execution.propertyId!, room.id, patch);
    } catch (error) {
      if (error instanceof APIError && error.code === 'ROOM_ALREADY_EXISTS') throw Object.assign(new Error('Another room in this home already has that name.'), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
      throw error;
    }
    // The traditional PATCH controller (not the service) marks these stale;
    // repeat them so an Ask correction has the same downstream effect.
    await markCoverageAnalysisStale(execution.propertyId!);
    await markRiskPremiumOptimizerStale(execution.propertyId!);
    await markDoNothingRunsStale(execution.propertyId!);
  }
  const renamed = field === 'name';
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: renamed ? 'ROOM_RENAMED' : 'ROOM_CORRECTED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `room-${renamed ? 'renamed' : 'corrected'}-${room.id}`, title: renamed ? 'Room renamed' : 'Room updated', status: 'COMPLETED',
      description: 'The canonical room record was updated and dependent coverage analysis was marked for refresh.',
      details: renamed
        ? [{ label: 'Previous name', value: alreadyApplied ? 'Already renamed' : room.name }, { label: 'New name', value: proposed }]
        : [{ label: 'Room', value: room.name }, { label: 'Field', value: meta.label }, { label: 'Previous value', value: alreadyApplied ? 'Already corrected' : roomFieldDisplay(field, previous) }, { label: 'New value', value: roomFieldDisplay(field, proposed) }],
      actions: [{ id: 'open-rooms', label: 'Open Rooms', href: `/dashboard/properties/${encodeURIComponent(execution.propertyId!)}/rooms`, style: 'PRIMARY' }],
    }],
    suggestions: ['Show my rooms'],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `room-refresh-failed-${room.id}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: `This ${renamed ? 'rename' : 'correction'} was saved to the canonical room record. The result you were viewing could not refresh automatically -- ask "Show my rooms" to see its current state.`,
    });
  }
  return { result, artifactType: 'INVENTORY_ROOM', artifactId: room.id, refreshedExecutions: refresh.refreshedExecutions };
}

registerConfirmCapabilityHandler('room.rename', confirmRoomRename);

async function confirmRoomCreate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const candidate = RoomCreateInputSchema.safeParse(parameters.roomCreate);
  if (!candidate.success) throw Object.assign(new Error('The room to add is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const { type, name, floorLevel } = candidate.data;
  const propertyId = execution.propertyId!;
  const existing = await prisma.inventoryRoom.findFirst({ where: { propertyId, name }, select: { id: true, createdAt: true } });
  let roomId: string;
  let alreadyAdded = false;
  if (existing) {
    // createRoom has no idempotency key: a same-named room created since this execution began is this execution's own
    // earlier write (a lease-reclaim retry), not a clash with something else.
    if (existing.createdAt.getTime() < execution.createdAt.getTime()) {
      throw Object.assign(new Error(`A room named "${name}" already exists in this home.`), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
    }
    roomId = existing.id;
    alreadyAdded = true;
  } else {
    try {
      const created = await inventoryService.createRoom(propertyId, { type, name, floorLevel });
      roomId = created.id;
    } catch (error) {
      if (error instanceof APIError && error.code === 'ROOM_ALREADY_EXISTS') throw Object.assign(new Error(`A room named "${name}" already exists in this home.`), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
      throw error;
    }
    // The traditional POST controller (not the service) marks these stale; repeat them for the same downstream effect.
    await markCoverageAnalysisStale(propertyId);
    await markRiskPremiumOptimizerStale(propertyId);
    await markDoNothingRunsStale(propertyId);
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'ROOM_CREATED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `room-created-${roomId}`, title: alreadyAdded ? 'Room already added' : 'Room added', status: 'COMPLETED',
      description: 'The room is now part of your home record and dependent coverage analysis was marked for refresh.',
      details: [{ label: 'Room name', value: name }, { label: 'Type', value: roomTypeLabel(type) }, ...(floorLevel !== null ? [{ label: 'Floor level', value: String(floorLevel) }] : [])],
      actions: [{ id: 'open-rooms', label: 'Open Rooms', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/rooms`, style: 'PRIMARY' }],
    }],
    suggestions: ['Show my rooms'],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `room-refresh-failed-${roomId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'This room was added to the canonical record. The result you were viewing could not refresh automatically -- ask "Show my rooms" to see its current state.',
    });
  }
  return { result, artifactType: 'INVENTORY_ROOM', artifactId: roomId, refreshedExecutions: refresh.refreshedExecutions };
}

registerConfirmCapabilityHandler('room.create', confirmRoomCreate);

async function confirmInventoryItemCreate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const candidate = InventoryCreateInputSchema.safeParse(parameters.inventoryCreate);
  if (!candidate.success) throw Object.assign(new Error('The item to add is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const input = candidate.data;
  const propertyId = execution.propertyId!;
  const refuse = (message: string) => Object.assign(new Error(message), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
  // createItem has no idempotency key: a same-named, same-category item created since this execution began is this
  // execution's own earlier write (a lease-reclaim retry). Checked first so the writer's own duplicate-appliance rule
  // cannot misreport that retry as a clash.
  const earlier = await prisma.inventoryItem.findFirst({
    where: { propertyId, name: input.name, category: input.category, createdAt: { gte: execution.createdAt } },
    select: { id: true },
  });
  let itemId: string;
  let alreadyAdded = false;
  if (earlier) {
    itemId = earlier.id;
    alreadyAdded = true;
  } else {
    const rooms = await inventoryCreateRooms(propertyId);
    const blocker = await inventoryCreateBlocker(propertyId, input, rooms);
    if (blocker) throw refuse(`${blocker.title}. ${blocker.body}`);
    try {
      const created = await inventoryService.createItem(propertyId, {
        name: input.name, category: input.category,
        roomId: input.roomId === INVENTORY_NO_ROOM_VALUE ? null : input.roomId,
        brand: input.brand, model: input.model,
      }, userId);
      itemId = created.id;
    } catch (error) {
      if (error instanceof APIError && error.statusCode < 500) throw refuse(error.message);
      throw error;
    }
    // The traditional POST controller (not the service) marks these stale; repeat them for the same downstream effect.
    await markCoverageAnalysisStale(propertyId);
    await markRiskPremiumOptimizerStale(propertyId);
    await markDoNothingRunsStale(propertyId);
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'INVENTORY_ITEM_CREATED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `inventory-created-${itemId}`, title: alreadyAdded ? 'Item already added' : 'Item added', status: 'COMPLETED',
      description: 'The item is now part of your home record and dependent coverage analysis was marked for refresh. Ask can correct its dates, condition, costs and notes from the inventory list.',
      details: [{ label: 'Item name', value: input.name }, { label: 'Category', value: inventoryCategoryLabel(input.category) }, ...(input.brand ? [{ label: 'Brand', value: input.brand }] : []), ...(input.model ? [{ label: 'Model', value: input.model }] : [])],
      actions: [{ id: 'open-inventory', label: 'Open home inventory', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory?tab=items`, style: 'PRIMARY' }],
    }],
    suggestions: ['Show my home inventory'],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `inventory-refresh-failed-${itemId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'This item was added to the canonical record. The result you were viewing could not refresh automatically -- ask "Show my inventory" to see its current state.',
    });
  }
  return { result, artifactType: 'INVENTORY_ITEM', artifactId: itemId, refreshedExecutions: refresh.refreshedExecutions };
}

registerConfirmCapabilityHandler('inventory.create', confirmInventoryItemCreate);

async function confirmPropertyAreaCapture(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const candidate = AreaCaptureAnswerSchema.safeParse(parameters.areaCapture);
  const state = areaCaptureStateFrom(parameters);
  if (!candidate.success || !state) throw areaCaptureError('ASK_CONFIRMATION_NOT_ACTIVE', 'The answer to save is invalid.');
  const propertyId = execution.propertyId;
  const stored = candidate.data;
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) throw areaCaptureError('ASK_PERMISSION_REQUIRED', 'A contributor or owner is required to add home details.');
  const confirmationVersion = typeof parameters.confirmationVersion === 'number' ? parameters.confirmationVersion : 1;
  // One write per execution + question + review version: a retry after a lost response returns the stored capture.
  const idempotencyKey = `ask-area-${createHash('sha256').update(`${execution.id}:${stored.requirementId}:${confirmationVersion}`).digest('hex').slice(0, 40)}`;
  const earlier = await prisma.propertyContextCaptureReceipt.findUnique({ where: { propertyId_userId_idempotencyKey: { propertyId, userId, idempotencyKey } }, select: { id: true, result: true } });
  const alreadyApplied = Boolean(earlier?.result);
  let updatedFactKeys: string[];
  try {
    const capture = await captureFeatureContext(propertyId, userId, {
      requirementId: stored.requirementId, captureKey: stored.captureKey,
      featureKey: PROPERTY_AREA_CAPTURE_FEATURE, operationKey: PROPERTY_AREA_CAPTURE_OPERATION,
      operationInput: { scope: stored.scope, skipFactKeys: state.skipFactKeys },
      expectedContextVersion: stored.expectedContextVersion, idempotencyKey, answer: stored.answer,
    }) as { updatedFactKeys?: string[] };
    updatedFactKeys = Array.isArray(capture.updatedFactKeys) ? capture.updatedFactKeys : [];
  } catch (error) {
    if (error instanceof PropertyContextVersionConflictError || (error instanceof Error && /no longer active/i.test(error.message))) {
      throw areaCaptureError('ASK_CONTEXT_VERSION_CONFLICT', 'The home record changed while you were reviewing. Start again from the area.');
    }
    if (error instanceof PropertyContextCaptureValidationError) throw areaCaptureError('ASK_INVALID_CONFIRMATION_EDIT', error.message);
    if (error instanceof PropertyContextAccessDeniedError) throw areaCaptureError('ASK_PERMISSION_REQUIRED', 'A contributor or owner is required to add home details.');
    throw error;
  }
  const writtenAreas = [...new Set(updatedFactKeys.map((key) => areaLabel(getFactDefinition(key).scope)))];
  const skip = new Set(state.skipFactKeys);
  const progress = await areaCaptureProgress(userId, propertyId, state.scope, skip);
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'AREA_CAPTURE_SAVED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `area-capture-saved-${stored.requirementId}`, title: alreadyApplied ? 'Already saved' : 'Details saved', status: 'COMPLETED',
      description: alreadyApplied ? 'This answer was already saved by this conversation; nothing was written again.' : 'The answer is now part of your home record.',
      details: [...stored.rows, { label: 'Areas updated', value: (writtenAreas.length ? writtenAreas : stored.areas).join(', ') }],
      actions: [{ id: 'open-property-record', label: 'Open property record', href: areaCaptureFallbackHref(propertyId, state.scope), style: 'SECONDARY' }],
    },
    areaProgressBlock(propertyId, state.scope, progress, progress.askable.length === 0, true)],
    suggestions: ['How complete is my home record?'],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `area-capture-refresh-failed-${stored.requirementId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'This answer was saved to the home record. The summary you were viewing could not refresh automatically -- ask "How complete is my home record?" to see the current state.',
    });
  }
  return { result, artifactType: 'PROPERTY_CONTEXT', artifactId: stored.requirementId, refreshedExecutions: refresh.refreshedExecutions };
}

registerConfirmCapabilityHandler('property-context.area-capture', confirmPropertyAreaCapture);

registerConfirmCapabilityHandler('document-promotion.confirm', confirmDocumentPromotionConfirm);

registerConfirmCapabilityHandler('home-operations.update', confirmOperationalWorkUpdate);

registerConfirmCapabilityHandler('household.invitation', confirmHouseholdInvitation);

export async function editInventoryItemCorrectConfirmation(
  execution: AskExecution,
  parameters: Record<string, unknown>,
  input: EditAskConfirmation,
): Promise<AskExecutionResponse> {
  const existing = InventoryItemCorrectionInputSchema.safeParse(parameters.inventoryCorrection);
  if (!existing.success) throw Object.assign(new Error('Editing is not available for this proposal.'), { code: 'ASK_EDIT_NOT_SUPPORTED' });
  const invalidEdit = await inventoryFieldValueError(execution.propertyId!, existing.data.field, input.edits.value);
  if (invalidEdit) throw Object.assign(new Error(invalidEdit), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
  const valueEdit = inventoryFieldNormalized(existing.data.field, input.edits.value);
  const item = await prisma.inventoryItem.findFirst({ where: { id: existing.data.itemId, propertyId: execution.propertyId! } });
  if (!item) throw Object.assign(new Error('The selected inventory item is no longer available.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  const combinedBlocker = inventoryCorrectionCombinedBlocker(item, existing.data.field, valueEdit);
  if (combinedBlocker) throw Object.assign(new Error(combinedBlocker), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
  const updatedInput = InventoryItemCorrectionInputSchema.parse({ ...existing.data, value: valueEdit });
  const nextVersion = input.confirmationVersion + 1;
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const dynamicOptions = existing.data.field === INVENTORY_ROOM_LINK_FIELD ? await inventoryRoomLinkOptions(execution.propertyId!) : undefined;
  const newConfirmation = inventoryCorrectionConfirmation(item, existing.data.field, inventoryFieldCurrent(item, existing.data.field), valueEdit, nextVersion, expiresAt, dynamicOptions);
  const reviewBlock = { type: 'SUMMARY' as const, id: 'inventory-correct-review', title: `Review this ${INVENTORY_CORRECTION_FIELDS[existing.data.field].label} correction`, body: 'No shared-home record has changed yet. Enter the corrected value, then confirm.', tone: 'DEFAULT' as const, actions: [] };
  // Same version-AND-status guarded optimistic write as the maintenance edit
  // path: a claimed/completed/expired execution matches nothing.
  const editWrite = await prisma.askExecution.updateMany({
    where: { id: execution.id, status: 'NEEDS_CONFIRMATION', parametersJson: { path: ['confirmationVersion'], equals: input.confirmationVersion } },
    data: {
      parametersJson: asInputJson({ ...parameters, inventoryCorrection: updatedInput, confirmationVersion: nextVersion, confirmationExpiresAt: expiresAt.toISOString() }),
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

export async function editHomeEventCorrectConfirmation(
  execution: AskExecution,
  parameters: Record<string, unknown>,
  input: EditAskConfirmation,
): Promise<AskExecutionResponse> {
  const existing = HomeEventCorrectionInputSchema.safeParse(parameters.homeEventCorrection);
  if (!existing.success) throw Object.assign(new Error('Editing is not available for this proposal.'), { code: 'ASK_EDIT_NOT_SUPPORTED' });
  const invalidEdit = await homeEventCorrectionValueError(execution.propertyId!, existing.data.field, input.edits.value);
  if (invalidEdit) throw Object.assign(new Error(invalidEdit), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
  const event = await prisma.homeEvent.findFirst({ where: { id: existing.data.eventId, propertyId: execution.propertyId!, isCurrent: true, deletedAt: null }, select: { id: true, title: true, occurredAt: true, summary: true, amount: true, type: true, importance: true, roomId: true, inventoryItemId: true } });
  if (!event) throw Object.assign(new Error('The selected timeline event is no longer available.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  const cleaned = correctionNormalized(HOME_EVENT_CORRECTION_FIELDS[existing.data.field], input.edits.value);
  const updatedInput = HomeEventCorrectionInputSchema.parse({ ...existing.data, value: cleaned });
  const nextVersion = input.confirmationVersion + 1;
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const current = homeEventFieldCurrent(event, existing.data.field);
  const dynamicOptions = HOME_EVENT_LINK_FIELDS.has(existing.data.field) ? await homeEventLinkOptions(execution.propertyId!, existing.data.field as 'roomId' | 'inventoryItemId') : undefined;
  const newConfirmation = homeEventCorrectionConfirmation(event, existing.data.field, current, cleaned, nextVersion, expiresAt, dynamicOptions);
  const reviewBlock = { type: 'SUMMARY' as const, id: 'home-event-correct-review', title: `Review this ${HOME_EVENT_CORRECTION_FIELDS[existing.data.field].label} correction`, body: 'No shared-home record has changed yet. Edit the corrected value, then confirm.', tone: 'DEFAULT' as const, actions: [] };
  const editWrite = await prisma.askExecution.updateMany({
    where: { id: execution.id, status: 'NEEDS_CONFIRMATION', parametersJson: { path: ['confirmationVersion'], equals: input.confirmationVersion } },
    data: {
      parametersJson: asInputJson({ ...parameters, homeEventCorrection: updatedInput, confirmationVersion: nextVersion, confirmationExpiresAt: expiresAt.toISOString() }),
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

export async function editHomeEventVisibilityConfirmation(
  execution: AskExecution,
  parameters: Record<string, unknown>,
  input: EditAskConfirmation,
  userId: string,
): Promise<AskExecutionResponse> {
  const existing = HomeEventVisibilityInputSchema.safeParse(parameters.homeEventVisibility);
  if (!existing.success) throw Object.assign(new Error('Editing is not available for this proposal.'), { code: 'ASK_EDIT_NOT_SUPPORTED' });
  const event = await prisma.homeEvent.findFirst({ where: { id: existing.data.eventId, propertyId: execution.propertyId!, isCurrent: true, deletedAt: null }, select: { id: true, title: true, visibility: true, createdById: true } });
  if (!event) throw Object.assign(new Error('The selected timeline event is no longer available.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  const proposed = HomeEventVisibilityInputSchema.shape.value.safeParse(input.edits.value);
  if (!proposed.success || proposed.data === null) throw Object.assign(new Error('Choose Private, Household, or Resale pack.'), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
  const blocker = homeEventVisibilityBlocker(userId, event.createdById, event.visibility, proposed.data);
  if (blocker) throw Object.assign(new Error(blocker), { code: 'ASK_PERMISSION_REQUIRED' });
  const updatedInput = HomeEventVisibilityInputSchema.parse({ ...existing.data, value: proposed.data });
  const nextVersion = input.confirmationVersion + 1;
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const newConfirmation = homeEventVisibilityConfirmation(event, event.visibility, proposed.data, nextVersion, expiresAt);
  const reviewBlock = { type: 'SUMMARY' as const, id: 'home-event-visibility-review', title: `Review who can see ${event.title}`, body: 'No shared-home record has changed yet. Choose the visibility, then confirm.', tone: 'DEFAULT' as const, actions: [] };
  const editWrite = await prisma.askExecution.updateMany({
    where: { id: execution.id, status: 'NEEDS_CONFIRMATION', parametersJson: { path: ['confirmationVersion'], equals: input.confirmationVersion } },
    data: {
      parametersJson: asInputJson({ ...parameters, homeEventVisibility: updatedInput, confirmationVersion: nextVersion, confirmationExpiresAt: expiresAt.toISOString() }),
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

export async function editWarrantyCorrectConfirmation(
  execution: AskExecution,
  parameters: Record<string, unknown>,
  input: EditAskConfirmation,
  userId: string,
): Promise<AskExecutionResponse> {
  const existing = WarrantyCorrectionInputSchema.safeParse(parameters.warrantyCorrection);
  if (!existing.success) throw Object.assign(new Error('Editing is not available for this proposal.'), { code: 'ASK_EDIT_NOT_SUPPORTED' });
  const warranty = await prisma.warranty.findFirst({
    where: { id: existing.data.warrantyId, propertyId: execution.propertyId! },
    select: { id: true, providerName: true, startDate: true, expiryDate: true, category: true, policyNumber: true, cost: true, coverageDetails: true, homeownerProfile: { select: { userId: true } } },
  });
  if (!warranty) throw Object.assign(new Error('The selected warranty is no longer available.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  if (warranty.homeownerProfile.userId !== userId) throw Object.assign(new Error('Only the household member who added this warranty can change it.'), { code: 'ASK_PERMISSION_REQUIRED' });
  const invalid = warrantyCorrectionValueError(existing.data.field, input.edits.value, warranty);
  if (invalid) throw Object.assign(new Error(invalid), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
  const cleaned = correctionNormalized(WARRANTY_CORRECTION_FIELDS[existing.data.field], input.edits.value);
  const updatedInput = WarrantyCorrectionInputSchema.parse({ ...existing.data, value: cleaned });
  const nextVersion = input.confirmationVersion + 1;
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const current = warrantyFieldCurrent(warranty, existing.data.field);
  const newConfirmation = warrantyCorrectionConfirmation(warranty, existing.data.field, current, cleaned, nextVersion, expiresAt);
  const reviewBlock = { type: 'SUMMARY' as const, id: 'warranty-correct-review', title: `Review this ${WARRANTY_CORRECTION_FIELDS[existing.data.field].label} correction`, body: 'No warranty record has changed yet. Edit the corrected value, then confirm.', tone: 'DEFAULT' as const, actions: [] };
  const editWrite = await prisma.askExecution.updateMany({
    where: { id: execution.id, status: 'NEEDS_CONFIRMATION', parametersJson: { path: ['confirmationVersion'], equals: input.confirmationVersion } },
    data: {
      parametersJson: asInputJson({ ...parameters, warrantyCorrection: updatedInput, confirmationVersion: nextVersion, confirmationExpiresAt: expiresAt.toISOString() }),
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

export async function editRoomRenameConfirmation(
  execution: AskExecution,
  parameters: Record<string, unknown>,
  input: EditAskConfirmation,
): Promise<AskExecutionResponse> {
  const existing = RoomRenameInputSchema.safeParse(parameters.roomRename);
  if (!existing.success) throw Object.assign(new Error('Editing is not available for this proposal.'), { code: 'ASK_EDIT_NOT_SUPPORTED' });
  const { field } = existing.data;
  const meta = ROOM_CORRECTION_FIELDS[field];
  const room = await prisma.inventoryRoom.findFirst({ where: { id: existing.data.roomId, propertyId: execution.propertyId! }, select: { id: true, name: true, type: true, floorLevel: true } });
  if (!room) throw Object.assign(new Error('The selected room is no longer available.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  const invalid = await roomCorrectionValueError(execution.propertyId!, room.id, field, input.edits.value);
  if (invalid) throw Object.assign(new Error(invalid), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
  const cleaned = roomCorrectionNormalized(field, input.edits.value);
  const updatedInput = RoomRenameInputSchema.parse({ ...existing.data, value: cleaned });
  const nextVersion = input.confirmationVersion + 1;
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const newConfirmation = roomRenameConfirmation(room, field, roomFieldCurrent(room, field), cleaned, nextVersion, expiresAt);
  const reviewBlock = { type: 'SUMMARY' as const, id: 'room-rename-review', title: field === 'name' ? `Review renaming ${room.name}` : `Review the ${meta.label} of ${room.name}`, body: `No shared-home record has changed yet. ${field === 'name' ? 'Enter the new name' : 'Choose the corrected value'}, then confirm.`, tone: 'DEFAULT' as const, actions: [] };
  const editWrite = await prisma.askExecution.updateMany({
    where: { id: execution.id, status: 'NEEDS_CONFIRMATION', parametersJson: { path: ['confirmationVersion'], equals: input.confirmationVersion } },
    data: {
      parametersJson: asInputJson({ ...parameters, roomRename: updatedInput, confirmationVersion: nextVersion, confirmationExpiresAt: expiresAt.toISOString() }),
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
