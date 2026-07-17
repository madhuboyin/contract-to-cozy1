import type { FeatureDecision, PropertyContextSnapshot } from '../../modules/propertyContext';
import { PropertyContextDecisionBuilder } from '../propertyContextDecision';

interface FinancingProfileContext {
  purchasePriceCents?: number | null;
  purchaseDate?: string | null;
  currentMortgageBalanceCents?: number | null;
  mortgageBalanceAsOfDate?: string | null;
  interestRateBps?: number | null;
  remainingTermMonths?: number | null;
  monthlyPaymentCents?: number | null;
}

function availableCollection(
  context: PropertyContextSnapshot,
  key: string,
  availableReason: string,
  unavailableReason: string,
): FeatureDecision {
  const facts = new PropertyContextDecisionBuilder(context);
  return facts.read<unknown[]>(key) === undefined
    ? facts.unknown(unavailableReason)
    : facts.decision('APPLICABLE', [availableReason]);
}

export function evaluateFinancialContext(context: PropertyContextSnapshot) {
  const financingFacts = new PropertyContextDecisionBuilder(context);
  const profile = financingFacts.read<FinancingProfileContext>('financial.financingProfile');
  const canonicalFinancingSource = profile
    ? financingFacts.decision('APPLICABLE', ['CANONICAL_FINANCING_PROFILE_AVAILABLE'])
    : financingFacts.unknown('CANONICAL_FINANCING_PROFILE_MISSING');

  const mortgageFacts = new PropertyContextDecisionBuilder(context);
  const mortgageProfile = mortgageFacts.read<FinancingProfileContext>('financial.currentMortgage');
  const hasMortgageInputs = Boolean(
    mortgageProfile &&
    typeof mortgageProfile.currentMortgageBalanceCents === 'number' &&
    typeof mortgageProfile.interestRateBps === 'number' &&
    typeof mortgageProfile.remainingTermMonths === 'number' &&
    typeof mortgageProfile.mortgageBalanceAsOfDate === 'string' &&
    mortgageProfile.remainingTermMonths > 0,
  );
  const mortgageModeling = hasMortgageInputs
    ? mortgageFacts.decision('APPLICABLE', ['CURRENT_MORTGAGE_INPUTS_AVAILABLE'])
    : mortgageFacts.unknown('CURRENT_MORTGAGE_INPUTS_INCOMPLETE');

  const equityFacts = new PropertyContextDecisionBuilder(context);
  const equityModeling = equityFacts.read<Record<string, unknown>>('financial.latestEquity')
    ? equityFacts.decision('APPLICABLE', ['CURRENT_EQUITY_POSITION_AVAILABLE'])
    : equityFacts.unknown('CURRENT_EQUITY_POSITION_MISSING');

  const reserveFacts = new PropertyContextDecisionBuilder(context);
  const reservePlanning = reserveFacts.read<Record<string, unknown>>('financial.reserveFund')
    ? reserveFacts.decision('APPLICABLE', ['RESERVE_FUND_POSTURE_AVAILABLE'])
    : reserveFacts.unknown('RESERVE_FUND_POSTURE_MISSING');

  return {
    canonicalFinancingSource,
    mortgageModeling,
    equityModeling,
    reservePlanning,
    capitalPlanning: availableCollection(
      context,
      'financial.upcomingCapitalExposure',
      'CAPITAL_EXPOSURE_AVAILABLE',
      'CAPITAL_EXPOSURE_UNAVAILABLE',
    ),
    ownershipCostModeling: availableCollection(
      context,
      'financial.ownershipExpenseSummary',
      'OWNERSHIP_EXPENSE_SUMMARY_AVAILABLE',
      'OWNERSHIP_EXPENSE_SUMMARY_UNAVAILABLE',
    ),
    scenarioSeparation: availableCollection(
      context,
      'financial.activeScenarios',
      'SCENARIO_STATE_SEPARATE_FROM_CANONICAL_FACTS',
      'SCENARIO_STATE_UNAVAILABLE',
    ),
  };
}
