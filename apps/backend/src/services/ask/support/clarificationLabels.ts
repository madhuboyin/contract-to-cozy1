// Ask handler support: the text of a clarification option. Normally the operation's first supported job; where that line does not say what the
// homeowner would get (so two options look alike), the label is stated here. Facts only: each must be true of the operation's answer.
import { getAskOperationDefinition, type AskOperationId } from '../askOperationRegistry';
import { ASK_DEFAULT_LANGUAGE, type AskLanguageCode } from '../askLanguageRegistry';

const LABEL_OVERRIDES: Readonly<Partial<Record<AskOperationId, string>>> = Object.freeze({
  GUIDANCE_JOURNEY_CONTINUE: 'View current guided journey steps',
  // The capital timeline accepts a 5-year or 10-year horizon (parseCapitalTimelineHorizonRequest); the upkeep budget is a yearly view.
  SELLER_PREP_CHECKLIST: 'get the home ready to sell (seller-prep checklist)',
  HOME_UPGRADE_SCENARIOS: 'see my saved upgrade options and what they would cost and save',
  CAPITAL_RESERVE_PLAN: 'plan reserves for big future home expenses over a 5-year or 10-year horizon',
});

export function clarificationLabelFor(operationId: AskOperationId, language: AskLanguageCode = ASK_DEFAULT_LANGUAGE): string {
  const override = LABEL_OVERRIDES[operationId];
  if (override) return override;
  const definition = getAskOperationDefinition(operationId);
  return definition.semantic.languagePacks[language]?.supportedJobs[0] ?? definition.semantic.supportedJobs[0];
}

export const UPGRADE_OBJECTIVE_REASON = 'UPGRADE_OBJECTIVE_UNKNOWN';

// When the homeowner asks which upgrades are worth doing without saying why, each option names the goal it serves. Facts only: each is what the operation answers.
const UPGRADE_OBJECTIVE_LABELS: Readonly<Partial<Record<AskOperationId, string>>> = Object.freeze({
  SELLER_PREP_CHECKLIST: 'Resale value: what to fix or improve before selling (seller-prep checklist)',
  HOME_UPGRADE_SCENARIOS: 'Comfort or energy savings: my saved upgrade options and what they would cost and save',
  APPLIANCE_FAILURE_RISK: 'Maintenance risk: which appliances and systems are old enough to be likely to fail',
});

export function upgradeObjectiveLabelFor(operationId: AskOperationId, language: AskLanguageCode = ASK_DEFAULT_LANGUAGE): string {
  return UPGRADE_OBJECTIVE_LABELS[operationId] ?? clarificationLabelFor(operationId, language);
}
