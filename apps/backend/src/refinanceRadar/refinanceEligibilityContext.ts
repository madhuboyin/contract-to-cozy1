import {
  buildRefinanceProgramGuidance,
  type RefinanceProgramPathway,
} from './refinanceProgramGuidance';

export type RefinanceValueSource =
  | 'APPRAISED_VALUE'
  | 'PURCHASE_PRICE_FALLBACK'
  | 'UNKNOWN';

export type RefinanceEquityConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export type RefinanceLeverageBand =
  | 'LOWER_LEVERAGE'
  | 'HIGHER_LEVERAGE'
  | 'VERY_HIGH_LEVERAGE'
  | 'UNKNOWN';

export interface RefinanceEligibilityContext {
  valueSource: RefinanceValueSource;
  valueConfidence: RefinanceEquityConfidence;
  estimatedPropertyValueUsd: number | null;
  propertyValueAsOf: string | null;
  firstLienLtvPct: number | null;
  combinedLtvPct: number | null;
  estimatedEquityUsd: number | null;
  leverageBand: RefinanceLeverageBand;
  hasSecondMortgage: boolean;
  secondMortgageBalanceUsd: number | null;
  hasMortgageInsurance: boolean;
  occupancyStatus: string;
  propertyType: string;
  propertyState: string;
  loanType: string;
  conformingLimitUsd: number | null;
  conformingContext: 'WITHIN_CONFIGURED_LIMIT' | 'ABOVE_CONFIGURED_LIMIT' | 'NOT_CONFIGURED';
  programPathways: RefinanceProgramPathway[];
  warnings: string[];
  followUpActions: Array<
    | 'UPDATE_PROPERTY_VALUE'
    | 'CONFIRM_SECOND_LIEN_BALANCE'
    | 'REVIEW_MORTGAGE_INSURANCE'
    | 'CONFIRM_LOAN_PROGRAM'
  >;
}

const APPRAISAL_CURRENT_DAYS = 365;

function roundPct(value: number): number {
  return Math.round(value * 10) / 10;
}

function validPositive(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function ageDays(value: string | null | undefined, now: Date): number | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const days = Math.floor((now.getTime() - parsed.getTime()) / 86_400_000);
  return days < -1 ? null : days;
}

export function buildRefinanceEligibilityContext(
  input: {
    currentMortgageBalanceUsd: number;
    appraisedValueUsd?: number | null;
    appraisalDate?: string | null;
    purchasePriceUsd?: number | null;
    hasSecondMortgage: boolean;
    secondMortgageBalanceUsd?: number | null;
    hasMortgageInsurance: boolean;
    occupancyStatus?: string | null;
    propertyType?: string | null;
    propertyState?: string | null;
    loanType?: string | null;
    conformingLimitUsd?: number | null;
  },
  now = new Date(),
): RefinanceEligibilityContext {
  const appraisedValue = validPositive(input.appraisedValueUsd);
  const purchasePrice = validPositive(input.purchasePriceUsd);
  const appraisalAgeDays = ageDays(input.appraisalDate, now);

  const valueSource: RefinanceValueSource = appraisedValue
    ? 'APPRAISED_VALUE'
    : purchasePrice
      ? 'PURCHASE_PRICE_FALLBACK'
      : 'UNKNOWN';
  const estimatedPropertyValueUsd = appraisedValue ?? purchasePrice;
  const valueConfidence: RefinanceEquityConfidence =
    valueSource === 'UNKNOWN'
      ? 'UNKNOWN'
      : valueSource === 'PURCHASE_PRICE_FALLBACK'
        ? 'LOW'
        : appraisalAgeDays != null && appraisalAgeDays <= APPRAISAL_CURRENT_DAYS
          ? 'HIGH'
          : 'MEDIUM';

  const firstLienLtvPct = estimatedPropertyValueUsd
    ? roundPct(
        (Math.max(0, input.currentMortgageBalanceUsd) /
          estimatedPropertyValueUsd) *
          100,
      )
    : null;
  const knownSecondBalance = validPositive(input.secondMortgageBalanceUsd);
  const secondLienIncomplete =
    input.hasSecondMortgage && knownSecondBalance == null;
  const totalKnownDebt =
    Math.max(0, input.currentMortgageBalanceUsd) +
    (input.hasSecondMortgage ? knownSecondBalance ?? 0 : 0);
  const combinedLtvPct =
    estimatedPropertyValueUsd && !secondLienIncomplete
      ? roundPct((totalKnownDebt / estimatedPropertyValueUsd) * 100)
      : null;
  const estimatedEquityUsd =
    estimatedPropertyValueUsd && combinedLtvPct != null
      ? estimatedPropertyValueUsd - totalKnownDebt
      : null;
  const leverageBand: RefinanceLeverageBand =
    combinedLtvPct == null
      ? 'UNKNOWN'
      : combinedLtvPct <= 80
        ? 'LOWER_LEVERAGE'
        : combinedLtvPct <= 95
          ? 'HIGHER_LEVERAGE'
          : 'VERY_HIGH_LEVERAGE';

  const warnings: string[] = [];
  const followUpActions: RefinanceEligibilityContext['followUpActions'] = [];
  const conformingLimitUsd = validPositive(input.conformingLimitUsd);
  const conformingContext = conformingLimitUsd == null
    ? 'NOT_CONFIGURED'
    : input.currentMortgageBalanceUsd <= conformingLimitUsd
      ? 'WITHIN_CONFIGURED_LIMIT'
      : 'ABOVE_CONFIGURED_LIMIT';
  if (conformingContext === 'ABOVE_CONFIGURED_LIMIT') {
    warnings.push(
      'The current balance is above the configured baseline conforming limit; high-cost-area and lender-specific limits may differ.',
    );
  }
  if (!input.loanType || input.loanType === 'UNKNOWN') {
    warnings.push('Loan type is not recorded, so program-specific refinance paths cannot be screened.');
    followUpActions.push('CONFIRM_LOAN_PROGRAM');
  }

  if (!estimatedPropertyValueUsd) {
    warnings.push(
      'A current property value is not recorded, so refinance leverage and equity cannot be estimated.',
    );
    followUpActions.push('UPDATE_PROPERTY_VALUE');
  } else if (valueSource === 'PURCHASE_PRICE_FALLBACK') {
    warnings.push(
      'LTV uses the recorded purchase price because no appraised value is available; this may not reflect current market value.',
    );
    followUpActions.push('UPDATE_PROPERTY_VALUE');
  } else if (appraisalAgeDays == null) {
    warnings.push(
      'The appraised value has no usable as-of date, so its current accuracy cannot be confirmed.',
    );
    followUpActions.push('UPDATE_PROPERTY_VALUE');
  } else if (appraisalAgeDays > APPRAISAL_CURRENT_DAYS) {
    warnings.push(
      'The recorded appraisal is more than one year old and may differ from a lender-ordered valuation.',
    );
    followUpActions.push('UPDATE_PROPERTY_VALUE');
  }

  if (secondLienIncomplete) {
    warnings.push(
      'A second mortgage is recorded without a balance, so combined LTV is intentionally not estimated.',
    );
    followUpActions.push('CONFIRM_SECOND_LIEN_BALANCE');
  } else if (combinedLtvPct != null && combinedLtvPct > 80) {
    warnings.push(
      'Combined LTV above roughly 80% may affect pricing, mortgage-insurance requirements, and available loan programs.',
    );
  }

  if (input.hasMortgageInsurance) {
    warnings.push(
      'Mortgage insurance is recorded. Compare whether a new appraisal or loan structure could change it; removal is not guaranteed.',
    );
    followUpActions.push('REVIEW_MORTGAGE_INSURANCE');
  }
  const programPathways = buildRefinanceProgramGuidance({
    loanType: input.loanType ?? 'UNKNOWN',
    occupancyStatus: input.occupancyStatus ?? 'UNKNOWN',
    firstLienLtvPct,
    combinedLtvPct,
    hasMortgageInsurance: input.hasMortgageInsurance,
    hasSecondMortgage: input.hasSecondMortgage,
    secondMortgageBalanceUsd: input.hasSecondMortgage
      ? knownSecondBalance
      : null,
    conformingContext,
  });

  return {
    valueSource,
    valueConfidence,
    estimatedPropertyValueUsd,
    propertyValueAsOf:
      valueSource === 'APPRAISED_VALUE' ? input.appraisalDate ?? null : null,
    firstLienLtvPct,
    combinedLtvPct,
    estimatedEquityUsd,
    leverageBand,
    hasSecondMortgage: input.hasSecondMortgage,
    secondMortgageBalanceUsd: input.hasSecondMortgage
      ? knownSecondBalance
      : null,
    hasMortgageInsurance: input.hasMortgageInsurance,
    occupancyStatus: input.occupancyStatus ?? 'UNKNOWN',
    propertyType: input.propertyType ?? 'UNKNOWN',
    propertyState: input.propertyState ?? 'UNKNOWN',
    loanType: input.loanType ?? 'UNKNOWN',
    conformingLimitUsd,
    conformingContext,
    programPathways,
    warnings,
    followUpActions: [...new Set(followUpActions)],
  };
}
