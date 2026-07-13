// apps/backend/src/modules/personalization/application/compareShadowWithDailyPulse.usecase.ts
//
// Migration step 5: "Dual-read behind flag, shadow evaluate, compare
// diagnostics" — compares the personalization engine's shadow evaluation
// of the HVAC-filter proof definition against Daily Pulse's existing,
// independent HVAC_FILTER_CHECK micro-action state for the same property.
// Structured diagnostic logging only — no UI change, no write to Daily
// Pulse's own tables, and no decision is made about which system is
// "right." This is the roadmap's step 5 language verbatim: "Shadow only
// (compare with existing Action Center/Daily Pulse)" — Daily Pulse chosen
// over Action Center as the comparison target because it's a single-slot
// surface, simpler to diff against than Action Center's full ranked list.
import { logger } from '../../../lib/logger';
import { shadowEvaluateHvacFilterProofForProperty } from './shadowEvaluateHvacFilterProof.usecase';
import { loadDailyPulseHvacFilterCheckState } from '../infrastructure/dailyPulseComparisonRepository';

export type ShadowDiagnosticAgreement =
  | 'AGREE_BOTH_FLAG'
  | 'AGREE_BOTH_CLEAR'
  | 'DISAGREE_PERSONALIZATION_ONLY'
  | 'DISAGREE_DAILY_PULSE_ONLY';

export interface ShadowDiagnosticResult {
  propertyId: string;
  personalizationEligible: boolean;
  personalizationResult?: 'TRUE' | 'FALSE' | 'UNKNOWN';
  dailyPulseHasActiveAction: boolean;
  agreement: ShadowDiagnosticAgreement;
}

function classifyAgreement(personalizationEligible: boolean, dailyPulseHasActiveAction: boolean): ShadowDiagnosticAgreement {
  if (personalizationEligible && dailyPulseHasActiveAction) return 'AGREE_BOTH_FLAG';
  if (!personalizationEligible && !dailyPulseHasActiveAction) return 'AGREE_BOTH_CLEAR';
  if (personalizationEligible && !dailyPulseHasActiveAction) return 'DISAGREE_PERSONALIZATION_ONLY';
  return 'DISAGREE_DAILY_PULSE_ONLY';
}

export async function compareShadowWithDailyPulseForProperty(propertyId: string): Promise<ShadowDiagnosticResult> {
  const shadow = await shadowEvaluateHvacFilterProofForProperty(propertyId);
  const dailyPulseState = await loadDailyPulseHvacFilterCheckState(propertyId);

  const personalizationEligible = shadow.evaluation.eligible === true;
  const dailyPulseHasActiveAction = dailyPulseState.hasActiveHvacFilterCheckAction;
  const agreement = classifyAgreement(personalizationEligible, dailyPulseHasActiveAction);

  const diagnostic: ShadowDiagnosticResult = {
    propertyId,
    personalizationEligible,
    personalizationResult: shadow.evaluation.result,
    dailyPulseHasActiveAction,
    agreement,
  };

  logger.info(
    {
      personalizationShadowDiagnostic: true,
      definitionCode: 'hvac_filter_replacement_check_proof',
      propertyId,
      personalizationEligible,
      personalizationResult: shadow.evaluation.result,
      dailyPulseHasActiveAction,
      agreement,
    },
    '[PERSONALIZATION-SHADOW] Daily Pulse comparison',
  );

  return diagnostic;
}
