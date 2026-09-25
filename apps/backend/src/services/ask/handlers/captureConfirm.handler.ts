// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { AskCaptureAttribution, Prisma, PropertyFactSourceType, WarrantyCategory } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { capturePropertyFact } from '../../../modules/propertyContext/application/capturePropertyFact';
import { capturePropertyFinancingFact, FINANCING_CAPTURE_FACT_KEY } from '../../../modules/propertyContext/application/capturePropertyFinancingFact';
import { captureWarranty } from '../../../modules/propertyContext/application/captureWarranty';
import { PropertyContextAccessDeniedError } from '../../../modules/propertyContext/application/getPropertyContext';
import { USER_ADD_ORIGIN } from '../conversationalUnderstanding/conversationalCapture';
import { APIError } from '../../../middleware/error.middleware';
import { homeEventsServiceForCapture } from '../handlers/homeRecordWrites.handler';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { captureEventResult } from '../askHandlerSupport';

async function confirmCaptureFact(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, command } = ctx;
  const factKey = parameters.factKey;
  if (typeof factKey !== 'string' || !factKey.trim()) {
    throw Object.assign(new Error('The fact to capture is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  }
  const sourceType: PropertyFactSourceType = typeof parameters.sourceType === 'string'
    ? parameters.sourceType as PropertyFactSourceType
    : 'USER_REPORTED';
  const attribution: AskCaptureAttribution | null = typeof parameters.attribution === 'string'
    ? parameters.attribution as AskCaptureAttribution
    : null;
  const captureChannel = typeof parameters.captureChannel === 'string' ? parameters.captureChannel : 'ASK_CHAT';
  const extractionConfidence = typeof parameters.extractionConfidence === 'number' ? parameters.extractionConfidence : null;
  const confidence = typeof parameters.confidence === 'number' ? parameters.confidence : null;

  // Ask Cozy Stage 3, Phase 3 (implementation plan §9; FRD §19's "not every
  // scalar fact goes through capturePropertyFact" finding). factKey ===
  // FINANCING_CAPTURE_FACT_KEY is the one case this pass gives its own
  // writer to -- capturePropertyFact's own !definition.writable gate would
  // otherwise reject it outright, and the target model isn't
  // PropertyFactEvidence in the first place.
  let capture: Awaited<ReturnType<typeof capturePropertyFact>>;
  try {
    if (factKey === FINANCING_CAPTURE_FACT_KEY) {
      if (typeof parameters.value !== 'number') {
        throw Object.assign(new Error('The mortgage rate to capture is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
      }
      capture = await capturePropertyFinancingFact(execution.propertyId, userId, {
        value: parameters.value,
        sourceType,
        confidence,
        attribution,
        captureChannel,
        extractionConfidence,
        captureExecutionId: execution.id,
      });
    } else {
      capture = await capturePropertyFact(execution.propertyId, userId, factKey, {
        value: parameters.value,
        sourceType,
        confidence,
        attribution,
        captureChannel,
        extractionConfidence,
        captureExecutionId: execution.id,
      });
    }
  } catch (error) {
    if (error instanceof PropertyContextAccessDeniedError) {
      throw Object.assign(new Error('You do not have permission to update this property record.'), { code: 'ASK_PERMISSION_REQUIRED' });
    }
    throw error;
  }
  const evidenceId = capture.evidenceIds[0] ?? '';
  const propertyRecordHref = `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/edit`;
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'FACT_CAPTURED',
    blocks: [{
      type: 'SUMMARY', id: `fact-captured-${evidenceId}`, title: 'Recorded to your property record', tone: 'POSITIVE',
      body: `"${factKey}" is now saved to your Living Home Record.`,
      actions: [{ id: 'open-property-record', label: 'Open property record', href: propertyRecordHref, style: 'PRIMARY' }],
    }],
    confirmation: null, suggestions: [],
  };
  // IW-FRESH-003 fix: previously called no reconciliation mechanism at all
  // -- see ASK_MUTATION_IMPACT_MAP's CAPTURE_FACT_CONFIRM entry.
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `capture-fact-refresh-failed-${evidenceId}`, title: 'Saved; list could not refresh',
      body: 'This fact was saved to your Living Home Record. A list you were viewing could not refresh automatically -- ask again to see its current state.',
      severity: 'CAUTION',
    });
  }
  return { result, artifactType: command.artifactType, artifactId: evidenceId, refreshedExecutions: refresh.refreshedExecutions };
}

registerConfirmCapabilityHandler('capture.fact.confirm', confirmCaptureFact);

// IW-FRESH-003 fix: confirmCaptureEvent previously called no reconciliation
// mechanism at all on any of its five return paths (idempotent replay, two
// concurrent-write-race recoveries, the normal correction write, and the
// normal create) -- see ASK_MUTATION_IMPACT_MAP's CAPTURE_EVENT_CONFIRM
// entry. Extracted once so every path reconciles identically instead of
// duplicating the same three lines five times.
async function captureEventConfirmResult(
  execution: ConfirmCapabilityContext['execution'],
  userId: string,
  parameters: Record<string, unknown>,
  event: { id: string; title: string },
  corrected: boolean,
  artifactType: string,
): Promise<ConfirmCapabilityResult> {
  const result = captureEventResult(execution.propertyId, event, corrected);
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `capture-event-refresh-failed-${event.id}`, title: 'Saved; list could not refresh',
      body: 'This event was saved to your home timeline. A list you were viewing could not refresh automatically -- ask again to see its current state.',
      severity: 'CAUTION',
    });
  }
  return { result, artifactType, artifactId: event.id, refreshedExecutions: refresh.refreshedExecutions };
}

async function confirmCaptureEvent(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, command } = ctx;

  // Ask Cozy Stage 3, Phase 2 (implementation plan §8/§4.1; FRD §20).
  // Correction is built on HomeEvent's existing supersedesEventId/isCurrent
  // revision chain (HomeEventsService.updateHomeEvent, already proven by the
  // homeowner-facing timeline correction UI) -- never on correctionModes,
  // which §4.1 confirmed is entirely unconsumed metadata. A homeowner
  // follow-up that corrects something Ask already captured supplies
  // correctingEventId (how that resolution happens -- matching the
  // conversational reference to the right prior HomeEvent -- is Phase 3's
  // extraction job, not this phase's).
  const correctingEventId = typeof parameters.correctingEventId === 'string' ? parameters.correctingEventId : null;
  if (correctingEventId) {
    // updateHomeEvent has no idempotency check of its own (unlike
    // createHomeEvent) -- it unconditionally supersedes and creates a
    // replacement every time it's called, so a lease-reclaim retry of this
    // same execution would otherwise chain a second, spurious correction on
    // top of the first. Guard it the same way capturePropertyFact guards
    // its own write: check for this execution's own prior replacement
    // before ever calling the writer.
    const correctionIdempotencyKey = `ask-correction:${execution.id}`;
    const alreadyCorrected = await prisma.homeEvent.findFirst({
      where: { propertyId: execution.propertyId, idempotencyKey: correctionIdempotencyKey },
    });
    if (alreadyCorrected) {
      return captureEventConfirmResult(execution, userId, parameters, alreadyCorrected, true, command.artifactType);
    }
    let replacement: Awaited<ReturnType<typeof homeEventsServiceForCapture.updateHomeEvent>>;
    try {
      replacement = await homeEventsServiceForCapture.updateHomeEvent(
        execution.propertyId,
        correctingEventId,
        {
          ...parameters,
          correctionReason: typeof parameters.correctionReason === 'string' && parameters.correctionReason.trim()
            ? parameters.correctionReason
            : 'Corrected through Ask after homeowner confirmation.',
        },
        userId,
        { idempotencyKey: correctionIdempotencyKey },
      );
    } catch (error) {
      if (error instanceof APIError && error.code === 'HOME_EVENT_NOT_FOUND') {
        // Code review finding (2026-09-12): a second, tighter race than the
        // P2002 one below -- if a concurrent winning attempt's WHOLE
        // transaction (supersede existing.isCurrent -> false AND create the
        // replacement) commits strictly BETWEEN this call's own
        // `alreadyCorrected` pre-check and updateHomeEvent's OWN internal
        // `existing` lookup (findFirst({... isCurrent: true ...})), this
        // attempt's lookup sees the original event ALREADY superseded and
        // throws HOME_EVENT_NOT_FOUND -- never reaching the P2002 case below
        // at all, since it never gets far enough to attempt its own create.
        // Because the winner's supersede and its replacement-create happen
        // in the SAME transaction, "the original is already superseded" and
        // "the winning replacement already exists" become true atomically
        // together -- so re-reading by correctionIdempotencyKey here is
        // guaranteed to find the winner whenever this exact race occurs.
        // Re-check before rejecting, exactly like the P2002 recovery below,
        // rather than reporting a spurious "no longer available" for a
        // correction that actually already succeeded.
        const winner = await prisma.homeEvent.findFirst({
          where: { propertyId: execution.propertyId, idempotencyKey: correctionIdempotencyKey },
        });
        if (winner) {
          return captureEventConfirmResult(execution, userId, parameters, winner, true, command.artifactType);
        }
        throw Object.assign(new Error('The event to correct is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
      }
      // Code review finding (2026-09-12): the pre-check above (`alreadyCorrected`)
      // is not itself atomic with the write below it -- two overlapping
      // attempts for this same execution.id (e.g. a lease-reclaim retry
      // racing the still-running original, per confirmAskExecution's own
      // "Timeout / stale lease" reclaim pattern, which does not verify the
      // original actually crashed) can both pass it and then both reach
      // updateHomeEvent's create, which shares this one correctionIdempotencyKey.
      // Whichever commits second hits @@unique([propertyId, idempotencyKey])
      // as a P2002 here. Recover exactly like capturePropertyFact/
      // capturePropertyFinancingFact's own outer-catch pattern: re-read the
      // winner's already-committed row and return it, rather than letting a
      // raw P2002 propagate up to confirmAskExecution's shared catch block,
      // which would otherwise mark this (losing) attempt's execution EXPIRED
      // -- even after the winner already completed successfully.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await prisma.homeEvent.findFirst({
          where: { propertyId: execution.propertyId, idempotencyKey: correctionIdempotencyKey },
        });
        if (winner) {
          return captureEventConfirmResult(execution, userId, parameters, winner, true, command.artifactType);
        }
      }
      throw error;
    }
    return captureEventConfirmResult(execution, userId, parameters, replacement, true, command.artifactType);
  }

  const type = parameters.type;
  const title = parameters.title;
  const occurredAt = parameters.occurredAt;
  if (typeof type !== 'string' || typeof title !== 'string' || !title.trim() || typeof occurredAt !== 'string') {
    throw Object.assign(new Error('The home event to record is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  }
  const created = await homeEventsServiceForCapture.createHomeEvent({
    propertyId: execution.propertyId,
    userId,
    body: {
      ...parameters,
      type,
      title,
      occurredAt,
      idempotencyKey: execution.id,
    },
  });
  return captureEventConfirmResult(execution, userId, parameters, created, false, command.artifactType);
}

registerConfirmCapabilityHandler('capture.event.confirm', confirmCaptureEvent);

// Ask Cozy Stage 3, Phase 3 warranty capture writer (implementation plan
// §9/§22). Delegates the write to captureWarranty.ts, an idempotent create
// keyed on this execution's own id (Warranty.sourceExecutionId), mirroring
// confirmCaptureFact/confirmCaptureEvent's own delegation shape exactly.
async function confirmCaptureWarranty(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, command } = ctx;
  const providerName = parameters.providerName;
  const category = parameters.category;
  const startDate = parameters.startDate;
  const expiryDate = parameters.expiryDate;
  if (
    typeof providerName !== 'string' || !providerName.trim()
    || typeof category !== 'string'
    || typeof startDate !== 'string'
    || typeof expiryDate !== 'string'
  ) {
    throw Object.assign(new Error('The warranty to capture is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  }
  let warranty: Awaited<ReturnType<typeof captureWarranty>>;
  try {
    warranty = await captureWarranty(execution.propertyId, userId, {
      providerName,
      category: category as WarrantyCategory,
      policyNumber: typeof parameters.policyNumber === 'string' ? parameters.policyNumber : null,
      coverageDetails: typeof parameters.coverageDetails === 'string' ? parameters.coverageDetails : null,
      cost: typeof parameters.cost === 'number' ? parameters.cost : null,
      startDate,
      expiryDate,
      sourceExecutionId: execution.id,
    });
  } catch (error) {
    if (error instanceof PropertyContextAccessDeniedError) {
      throw Object.assign(new Error('You do not have permission to update this property record.'), { code: 'ASK_PERMISSION_REQUIRED' });
    }
    throw error;
  }
  const propertyRecordHref = `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/edit`;
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'WARRANTY_CAPTURED',
    blocks: [{
      type: 'SUMMARY', id: `warranty-captured-${warranty.id}`, title: 'Recorded to your property record', tone: 'POSITIVE',
      body: `Your ${providerName} warranty is now saved to your Living Home Record.`,
      actions: [{ id: 'open-property-record', label: 'Open property record', href: propertyRecordHref, style: 'PRIMARY' }],
    }],
    confirmation: null, suggestions: [],
  };
  // IW-FRESH-003 fix: previously called no reconciliation mechanism at all
  // -- see ASK_MUTATION_IMPACT_MAP's CAPTURE_WARRANTY_CONFIRM entry.
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'BOUNDARY', id: `capture-warranty-refresh-failed-${warranty.id}`, severity: 'CAUTION', title: 'Saved; list could not refresh',
      body: 'This warranty was saved to your Living Home Record. A list you were viewing could not refresh automatically -- ask again to see its current state.',
      suggestions: [],
    });
  }
  return { result, artifactType: command.artifactType, artifactId: warranty.id, refreshedExecutions: refresh.refreshedExecutions };
}

registerConfirmCapabilityHandler('capture.warranty.confirm', confirmCaptureWarranty);

// Ask Cozy Stage 3, Phase 2 external review (implementation plan §8/§4.2;
// FRD §23's UPLOAD_EVIDENCE resolution). Delegates the actual write to
// HomeEventsService.attachDocument -- the same real, already-authorized,
// already-idempotent (upsert on the [eventId, evidenceKey] unique
// constraint) mechanism the traditional UI's own document-attach flow uses,
// not a new writer. Unlike confirmCaptureWarranty, this cannot simply
// create its own record standalone: HomeEventEvidence.eventId is a
// required, non-nullable column, so this candidate's real domain write can
// only happen once its paired EVENT sibling's HomeEvent already exists.
// That sibling's linkedExecutionId was set by persistCandidates
// (conversationalCapture.ts) at creation time; this handler reads it
// SYNCHRONOUSLY here rather than through captureLinkReconciliation.ts's
// async ASK_CAPTURE_LINK_RECONCILE path (which exists for exactly the
// opposite case -- HomeEvent.warrantyId, a nullable column that CAN be
// filled in later regardless of confirmation order). A deliberate,
// disclosed scope limitation: confirming EVIDENCE before its sibling EVENT
// is confirmed fails with a clear, recoverable message rather than
// deferring the write -- see persistCandidates's own comment on this.
async function confirmCaptureEvidence(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, command } = ctx;
  const documentId = parameters.documentId;
  if (typeof documentId !== 'string' || !documentId.trim()) {
    throw Object.assign(new Error('The document to attach is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  }
  // Phase 3 evidence-upload add slice: a homeowner-initiated attach (evidenceAttachResult, above) already knows and
  // re-verified its target event at propose time, so it has no extraction sibling to wait on -- eventId comes
  // straight from this execution's own stored parameters, not a linked execution's receipt.
  let eventId: string;
  if (parameters.captureOrigin === USER_ADD_ORIGIN) {
    if (typeof parameters.eventId !== 'string' || !parameters.eventId.trim()) {
      throw Object.assign(new Error('The timeline event to attach evidence to is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    }
    eventId = parameters.eventId;
  } else {
    if (!execution.linkedExecutionId) {
      throw Object.assign(new Error('Cozy could not find the home timeline event this evidence belongs to. Attach the document from the property record instead.'), { code: 'EVIDENCE_SIBLING_EVENT_MISSING' });
    }
    const sibling = await prisma.askConfirmationReceipt.findUnique({
      where: { executionId: execution.linkedExecutionId },
      select: { status: true, artifactType: true, artifactId: true },
    });
    if (sibling?.status !== 'COMPLETED' || sibling.artifactType !== 'HOME_EVENT' || !sibling.artifactId) {
      throw Object.assign(new Error('Confirm the related home timeline event first, then attach this document.'), { code: 'EVIDENCE_SIBLING_EVENT_NOT_CONFIRMED' });
    }
    eventId = sibling.artifactId;
  }
  let link: Awaited<ReturnType<typeof homeEventsServiceForCapture.attachDocument>>;
  try {
    link = await homeEventsServiceForCapture.attachDocument({
      propertyId: execution.propertyId,
      eventId,
      documentId,
      userId,
    });
  } catch (error) {
    if (error instanceof APIError) {
      throw Object.assign(new Error(error.message), { code: error.code ?? 'ASK_CONFIRMATION_NOT_ACTIVE' });
    }
    throw error;
  }
  const homeTimelineHref = `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/timeline`;
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'EVIDENCE_ATTACHED',
    blocks: [{
      type: 'SUMMARY', id: `evidence-attached-${link.id}`, title: 'Attached to your home timeline', tone: 'POSITIVE',
      body: `${link.document?.name ?? 'The document'} is now attached as evidence on your home timeline.`,
      actions: [],
    }, {
      type: 'RELATED_RECORDS', id: `evidence-related-records-${link.id}`, title: 'Related records',
      relationships: [{
        relationshipType: 'DOCUMENT_EVIDENCE_FOR_HOME_EVENT',
        source: { recordType: 'DOCUMENT', recordId: link.documentId, label: link.document?.name ?? 'Attached document' },
        target: { recordType: 'HOME_EVENT', recordId: link.eventId, label: link.event.title },
        navigation: { label: 'Open home timeline', href: homeTimelineHref },
      }],
    }],
    confirmation: null, suggestions: [],
  };
  // IW-FRESH-003 fix: previously called no reconciliation mechanism at all
  // -- see ASK_MUTATION_IMPACT_MAP's CAPTURE_EVIDENCE_CONFIRM entry.
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'BOUNDARY', id: `capture-evidence-refresh-failed-${link.id}`, severity: 'CAUTION', title: 'Saved; list could not refresh',
      body: 'This evidence was attached to your home timeline. A list you were viewing could not refresh automatically -- ask again to see its current state.',
      suggestions: [],
    });
  }
  return { result, artifactType: command.artifactType, artifactId: link.id, refreshedExecutions: refresh.refreshedExecutions };
}

registerConfirmCapabilityHandler('capture.evidence.confirm', confirmCaptureEvidence);
