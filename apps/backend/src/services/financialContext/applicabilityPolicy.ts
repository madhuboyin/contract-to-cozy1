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

export interface FinancialContextInput {
  inventoryItemId?: string | null;
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

export function evaluateFinancialContext(
  context: PropertyContextSnapshot,
  input: FinancialContextInput = {},
) {
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

  const lifecycleFacts = new PropertyContextDecisionBuilder(context);
  const inventoryItems = lifecycleFacts.read<Array<{ id?: string; condition?: string | null }>>('inventory.items');
  const selectedItem = input.inventoryItemId
    ? inventoryItems?.find((item) => item.id === input.inventoryItemId)
    : undefined;
  const repairReplace = inventoryItems === undefined
    ? lifecycleFacts.unknown('CANONICAL_INVENTORY_UNAVAILABLE')
    : input.inventoryItemId && !selectedItem
      ? lifecycleFacts.decision('NOT_APPLICABLE', ['INVENTORY_ITEM_NOT_IN_PROPERTY_CONTEXT'])
      : lifecycleFacts.decision('APPLICABLE', [
          selectedItem ? 'CANONICAL_INVENTORY_ITEM_AVAILABLE' : 'CANONICAL_INVENTORY_AVAILABLE',
          selectedItem?.condition && selectedItem.condition !== 'UNKNOWN'
            ? 'ITEM_CONDITION_AVAILABLE'
            : 'ITEM_CONDITION_MISSING_CONFIDENCE_REDUCED',
        ]);

  const capitalPlanning = availableCollection(
    context,
    'inventory.items',
    'CANONICAL_INVENTORY_AVAILABLE_FOR_CAPITAL_PLANNING',
    'CANONICAL_INVENTORY_UNAVAILABLE',
  );

  const reserveFacts = new PropertyContextDecisionBuilder(context);
  const reservePlanning = reserveFacts.read<unknown[]>('financial.upcomingCapitalExposure') === undefined
    ? reserveFacts.unknown('CAPITAL_EXPOSURE_UNAVAILABLE')
    : reserveFacts.decision('APPLICABLE', ['CAPITAL_EXPOSURE_SOURCE_AVAILABLE']);

  return {
    canonicalFinancingSource,
    mortgageModeling,
    equityModeling,
    repairReplace,
    reservePlanning,
    capitalPlanning,
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
