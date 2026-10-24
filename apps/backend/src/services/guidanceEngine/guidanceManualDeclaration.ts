// An intentionally manual step: the homeowner explicitly declares something only they can know (continuation FRD section 48). It is rare and narrow. A declaration records the actor, the time, the EXACT
// declaration text the server owns (the caller names a key, never supplies the words), the subject (journey, item, signal) and the signal version. It never stands in for a mutation, a document, a provider
// outcome, a financial decision or safety/compliance proof: only steps listed here can be declared, and each listed step is one of those low-consequence "I did / I chose" facts.

import { logger } from '../../lib/logger';
import { guidanceJourneyService } from './guidanceJourney.service';
import { getGuidanceModels } from './guidanceTypes';
import { resolveGuidanceStepBinding, type GuidanceStepRefusal } from './guidanceStepBinding';

export const MANUAL_DECLARATION_TOOL_KEY = 'guidance-overview';

type Declaration = { text: string; extra?: Record<string, unknown> };
const cleaning = (key: string, label: string): [string, Declaration] => [key, { text: `I choose: ${label}.`, extra: { selectedCleaningType: key, selectedCleaningTypeLabel: label } }];

/** step key -> declaration key -> the exact declaration. Nothing else may be declared. */
export const MANUAL_DECLARATIONS: Readonly<Record<string, Readonly<Record<string, Declaration>>>> = {
  prepare_property_access: { access_prepared: { text: 'I have prepared access to the property for this service.' } },
  select_cleaning_type: Object.fromEntries([
    cleaning('standard_clean', 'Standard recurring clean'), cleaning('deep_clean', 'One-time deep clean'),
    cleaning('move_clean', 'Move-in / move-out clean'), cleaning('post_construction', 'Post-construction clean-up'),
  ]),
};
export const MANUAL_DECLARATION_STEP_KEYS = Object.keys(MANUAL_DECLARATIONS);

export type DeclareResult = { ok: true } | { ok: false; reason: GuidanceStepRefusal | 'UNKNOWN_DECLARATION' | 'RECORD_FAILED' };

export async function declareGuidanceStep(propertyId: string, actorUserId: string, stepId: string, declarationKey: string): Promise<DeclareResult> {
  const bound = await resolveGuidanceStepBinding(propertyId, stepId, { toolKey: MANUAL_DECLARATION_TOOL_KEY, stepKeys: MANUAL_DECLARATION_STEP_KEYS });
  if (!bound.ok) return { ok: false, reason: bound.reason };
  const declaration = MANUAL_DECLARATIONS[bound.binding.stepKey]?.[declarationKey];
  if (!declaration) return { ok: false, reason: 'UNKNOWN_DECLARATION' };
  const step = await getGuidanceModels().guidanceJourneyStep.findFirst({ where: { id: stepId, journey: { propertyId } }, select: { journey: { select: { primarySignal: { select: { id: true, signalIntentFamily: true, updatedAt: true } } } } } });
  const signal = step?.journey.primarySignal ?? null;
  const signalVersion = signal?.updatedAt ? new Date(signal.updatedAt).toISOString() : null;
  try {
    await guidanceJourneyService.recordToolCompletion({
      propertyId, actorUserId, journeyId: bound.binding.journeyId, inventoryItemId: bound.binding.inventoryItemId,
      signalIntentFamily: signal?.signalIntentFamily ?? 'generic_actionable_signal', sourceToolKey: MANUAL_DECLARATION_TOOL_KEY,
      sourceEntityType: 'GUIDANCE_SIGNAL', sourceEntityId: signal?.id ?? stepId, stepKey: bound.binding.stepKey, status: 'COMPLETED' as const,
      dedupeKey: `manual-declaration:${propertyId}:${stepId}:${declarationKey}:${signalVersion ?? 'none'}`,
      producedData: {
        proofType: 'manual_declaration', proofId: stepId, declarationKey, declarationText: declaration.text,
        subject: { journeyId: bound.binding.journeyId, inventoryItemId: bound.binding.inventoryItemId, signalId: signal?.id ?? null }, signalVersion,
        declaredByUserId: actorUserId, declaredAt: new Date().toISOString(), ...(declaration.extra ?? {}),
      },
    });
    return { ok: true };
  } catch (error) {
    logger.warn({ error, stepId }, '[GUIDANCE] manual declaration failed');
    return { ok: false, reason: 'RECORD_FAILED' };
  }
}
