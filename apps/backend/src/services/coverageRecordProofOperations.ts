// A saved policy or warranty record, and what it proves to a guided journey (continuation FRD section 45).
//
// `activate_warranty_coverage` and `bind_policy_and_record_documents` are done when an ACTUAL, active coverage record exists for the journey's subject that was saved after the journey began. A person's
// say-so that they did it (the old Desktop "I recorded it" completion) is not proof, and neither is an uploaded document or a record that already existed. This one function evaluates the saved
// records and reports the exact step; the Desktop page and the Ask command both call it, so neither can complete the step on weaker proof.

import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { logger } from '../lib/logger';
import { guidanceJourneyService } from './guidanceEngine/guidanceJourney.service';
import { resolveGuidanceStepBinding, type GuidanceStepBinding, type GuidanceStepBindingResult } from './guidanceEngine/guidanceStepBinding';

export const COVERAGE_RECORD_TOOL_KEY = 'documents';
export const COVERAGE_RECORD_STEP_KINDS: Record<string, 'WARRANTY' | 'POLICY'> = { activate_warranty_coverage: 'WARRANTY', bind_policy_and_record_documents: 'POLICY' };
export const COVERAGE_RECORD_STEP_KEYS = Object.keys(COVERAGE_RECORD_STEP_KINDS);

export type QualifyingRecord = { kind: 'WARRANTY' | 'POLICY'; id: string; label: string; savedAt: Date };

export async function resolveCoverageRecordBinding(propertyId: string, stepId: string): Promise<GuidanceStepBindingResult> {
  return resolveGuidanceStepBinding(propertyId, stepId, { toolKey: COVERAGE_RECORD_TOOL_KEY, stepKeys: COVERAGE_RECORD_STEP_KEYS });
}

/**
 * The record that proves the step: active (not expired), for the journey's subject (its item, or the home when the journey has none), and created or updated after the journey began so a
 * record that was already there is not mistaken for the work. Newest first.
 */
export async function findQualifyingCoverageRecord(propertyId: string, binding: GuidanceStepBinding): Promise<QualifyingRecord | null> {
  const kind = COVERAGE_RECORD_STEP_KINDS[binding.stepKey];
  if (!kind) return null;
  const journey = await prisma.guidanceJourney.findFirst({ where: { id: binding.journeyId, propertyId }, select: { createdAt: true } });
  if (!journey) return null;
  const now = new Date();
  if (kind === 'POLICY') {
    const rows = await prisma.insurancePolicy.findMany({
      where: { propertyId, updatedAt: { gte: journey.createdAt }, OR: [{ expiryDate: null }, { expiryDate: { gte: now } }] }, orderBy: { updatedAt: 'desc' }, take: 1,
    });
    const row = rows[0];
    return row ? { kind, id: row.id, label: row.carrierName, savedAt: row.updatedAt } : null;
  }
  const scope = binding.inventoryItemId ? { inventoryItemId: binding.inventoryItemId } : { OR: [{ propertyId }, { inventoryItem: { propertyId } }] };
  const rows = await prisma.warranty.findMany({ where: { ...scope, updatedAt: { gte: journey.createdAt }, expiryDate: { gte: now } }, orderBy: { updatedAt: 'desc' }, take: 1 });
  const row = rows[0];
  return row ? { kind, id: row.id, label: row.providerName, savedAt: row.updatedAt } : null;
}

export function buildCoverageRecordCompletion(propertyId: string, actorUserId: string, record: QualifyingRecord, binding: GuidanceStepBinding) {
  return {
    propertyId, actorUserId, journeyId: binding.journeyId, inventoryItemId: binding.inventoryItemId, signalIntentFamily: binding.signalIntentFamily ?? 'coverage_gap_or_uncertainty', issueDomain: 'FINANCIAL' as const,
    sourceToolKey: COVERAGE_RECORD_TOOL_KEY, sourceEntityType: record.kind === 'POLICY' ? 'INSURANCE_POLICY' : 'WARRANTY', sourceEntityId: record.id, stepKey: binding.stepKey, status: 'COMPLETED' as const,
    dedupeKey: `coverage-record:${propertyId}:${record.id}:${binding.stepId}`,
    producedData: { proofType: 'coverage_record_saved', proofId: record.id, recordKind: record.kind, recordId: record.id, savedAt: record.savedAt.toISOString() },
  };
}

export type CheckCoverageRecordResult = { record: QualifyingRecord; guidanceReported: boolean };

/**
 * Checks the saved records for the step and reports it. With no qualifying record it refuses (`COVERAGE_RECORD_NOT_FOUND`) and reports nothing: save the plan first. The step is re-read
 * (open, documents tool, one of the two steps) every time.
 */
export async function checkCoverageRecordWithEffects(propertyId: string, userId: string, stepId: string): Promise<CheckCoverageRecordResult> {
  const bound = await resolveCoverageRecordBinding(propertyId, stepId);
  if (!bound.ok) throw new APIError('That journey step cannot be completed this way.', bound.reason === 'NOT_FOUND' ? 404 : 409, `GUIDANCE_STEP_${bound.reason}`);
  const record = await findQualifyingCoverageRecord(propertyId, bound.binding);
  if (!record) {
    const what = COVERAGE_RECORD_STEP_KINDS[bound.binding.stepKey] === 'POLICY' ? 'insurance policy' : 'warranty';
    throw new APIError(`No active ${what} has been saved for this journey yet. Save it first, then check again.`, 409, 'COVERAGE_RECORD_NOT_FOUND');
  }
  try {
    await guidanceJourneyService.recordToolCompletion(buildCoverageRecordCompletion(propertyId, userId, record, bound.binding));
    return { record, guidanceReported: true };
  } catch (guidanceError) {
    logger.warn({ guidanceError, recordId: record.id }, '[GUIDANCE] coverage record completion report failed');
    return { record, guidanceReported: false };
  }
}
