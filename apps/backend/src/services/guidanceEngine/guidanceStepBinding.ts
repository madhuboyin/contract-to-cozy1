// The one check every connected guided-journey tool makes before it reports a step: re-read the step inside this home and require the step's own tool, an open
// step and an open journey. A stale or incompatible step is a refusal with a reason; it never falls back to another compatible step. (Ask launch helpers live in
// ask/support/guidanceStepBinding.ts.)
import { getGuidanceModels } from './guidanceTypes';

export type GuidanceStepBinding = {
  stepId: string;
  stepKey: string;
  journeyId: string;
  signalIntentFamily: string | null;
  inventoryItemId: string | null;
};
export type GuidanceStepRefusal = 'NOT_FOUND' | 'WRONG_TOOL' | 'WRONG_STEP' | 'STEP_DONE' | 'STEP_CLOSED' | 'JOURNEY_CLOSED';
export type GuidanceStepBindingResult = { ok: true; binding: GuidanceStepBinding } | { ok: false; reason: GuidanceStepRefusal };

export const GUIDANCE_STEP_REFUSAL_TEXT: Record<GuidanceStepRefusal, string> = {
  NOT_FOUND: 'The journey step this was started from is no longer available.',
  WRONG_TOOL: 'The journey step this was started from belongs to a different tool.',
  WRONG_STEP: 'The journey step this was started from is not one this can complete.',
  STEP_DONE: 'The journey step this was started from is already done.',
  STEP_CLOSED: 'The journey step this was started from is no longer open.',
  JOURNEY_CLOSED: 'The journey this was started from is no longer open.',
};

type StepWhere = { id: string } | { journeyId: string; stepKey: string };
const STEP_SELECT = { id: true, stepKey: true, toolKey: true, status: true, journey: { select: { id: true, status: true, inventoryItemId: true, primarySignal: { select: { signalIntentFamily: true } } } } } as const;

async function resolve(propertyId: string, where: StepWhere, expected: { toolKey: string; stepKeys?: readonly string[] }): Promise<GuidanceStepBindingResult> {
  const step = await getGuidanceModels().guidanceJourneyStep.findFirst({ where: { ...where, journey: { propertyId } }, select: STEP_SELECT });
  if (!step) return { ok: false, reason: 'NOT_FOUND' };
  if (step.toolKey !== expected.toolKey) return { ok: false, reason: 'WRONG_TOOL' };
  if (expected.stepKeys && !expected.stepKeys.includes(step.stepKey)) return { ok: false, reason: 'WRONG_STEP' };
  if (!['ACTIVE', 'NOT_STARTED'].includes(String(step.journey.status))) return { ok: false, reason: 'JOURNEY_CLOSED' };
  if (step.status === 'COMPLETED') return { ok: false, reason: 'STEP_DONE' };
  if (!['PENDING', 'IN_PROGRESS'].includes(String(step.status))) return { ok: false, reason: 'STEP_CLOSED' };
  return { ok: true, binding: { stepId: step.id ?? ('id' in where ? where.id : ''), stepKey: step.stepKey, journeyId: step.journey.id, signalIntentFamily: step.journey.primarySignal?.signalIntentFamily ?? null, inventoryItemId: step.journey.inventoryItemId ?? null } };
}

export const resolveGuidanceStepBinding = (propertyId: string, stepId: string, expected: { toolKey: string; stepKeys?: readonly string[] }) => resolve(propertyId, { id: stepId }, expected);
/** For a record that stored its journey and step key (a price finalization), not the step id. */
export const resolveGuidanceStepBindingByKey = (propertyId: string, journeyId: string, stepKey: string, expected: { toolKey: string; stepKeys?: readonly string[] }) =>
  resolve(propertyId, { journeyId, stepKey }, expected);
