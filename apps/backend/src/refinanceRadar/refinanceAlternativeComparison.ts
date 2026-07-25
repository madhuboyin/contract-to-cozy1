import { calcMonthlyPayment, calcTotalInterest } from './engine/refinanceCalculation.engine';

export type RefinanceDecisionAlternativeKind =
  | 'RETAIN_CURRENT'
  | 'EXTRA_PRINCIPAL'
  | 'RECAST'
  | 'CASH_OUT_REFINANCE';

export interface RefinanceDecisionAlternative {
  kind: RefinanceDecisionAlternativeKind;
  label: string;
  principalAfterActionUsd: number;
  monthlyPaymentUsd: number;
  upfrontCashUsd: number;
  estimatedTotalInterestUsd: number;
  payoffMonths: number;
  guidance: string;
}

function remainingMonthsForPayment(
  principal: number,
  annualRatePct: number,
  monthlyPayment: number,
): number {
  const monthlyRate = annualRatePct / 100 / 12;
  if (principal <= 0) return 0;
  if (monthlyRate === 0) return Math.ceil(principal / monthlyPayment);
  const interestOnly = principal * monthlyRate;
  if (monthlyPayment <= interestOnly) return Number.MAX_SAFE_INTEGER;
  return Math.ceil(
    -Math.log(1 - (principal * monthlyRate) / monthlyPayment) /
      Math.log(1 + monthlyRate),
  );
}

export function compareRefinanceDecisionAlternatives(input: {
  loanBalanceUsd: number;
  currentRatePct: number;
  remainingTermMonths: number;
  currentMonthlyPaymentUsd: number;
  targetRatePct: number;
  targetTermMonths: number;
  refinanceMonthlyPaymentUsd: number;
  refinanceTotalInterestUsd: number;
  refinanceCashToCloseUsd: number;
  extraPrincipalUsd?: number;
  recastPrincipalUsd?: number;
  recastFeeUsd?: number;
  cashOutAmountUsd?: number;
}): RefinanceDecisionAlternative[] {
  const alternatives: RefinanceDecisionAlternative[] = [{
    kind: 'RETAIN_CURRENT',
    label: 'Keep current mortgage',
    principalAfterActionUsd: input.loanBalanceUsd,
    monthlyPaymentUsd: input.currentMonthlyPaymentUsd,
    upfrontCashUsd: 0,
    estimatedTotalInterestUsd: calcTotalInterest(
      input.currentMonthlyPaymentUsd,
      input.remainingTermMonths,
      input.loanBalanceUsd,
    ),
    payoffMonths: input.remainingTermMonths,
    guidance: 'Preserves the current payoff schedule and avoids refinance costs.',
  }];

  const extraPrincipal = Math.min(
    Math.max(input.extraPrincipalUsd ?? 0, 0),
    input.loanBalanceUsd,
  );
  if (extraPrincipal > 0) {
    const principal = input.loanBalanceUsd - extraPrincipal;
    const payoffMonths = remainingMonthsForPayment(
      principal,
      input.currentRatePct,
      input.currentMonthlyPaymentUsd,
    );
    alternatives.push({
      kind: 'EXTRA_PRINCIPAL',
      label: 'Apply extra principal',
      principalAfterActionUsd: principal,
      monthlyPaymentUsd: input.currentMonthlyPaymentUsd,
      upfrontCashUsd: extraPrincipal,
      estimatedTotalInterestUsd: calcTotalInterest(
        input.currentMonthlyPaymentUsd,
        payoffMonths,
        principal,
      ),
      payoffMonths,
      guidance: 'Keeps the existing loan while using cash to shorten payoff.',
    });
  }

  const recastPrincipal = Math.min(
    Math.max(input.recastPrincipalUsd ?? 0, 0),
    input.loanBalanceUsd,
  );
  if (recastPrincipal > 0) {
    const principal = input.loanBalanceUsd - recastPrincipal;
    const payment = calcMonthlyPayment(
      principal,
      input.currentRatePct,
      input.remainingTermMonths,
    );
    alternatives.push({
      kind: 'RECAST',
      label: 'Request a mortgage recast',
      principalAfterActionUsd: principal,
      monthlyPaymentUsd: payment,
      upfrontCashUsd: recastPrincipal + Math.max(input.recastFeeUsd ?? 0, 0),
      estimatedTotalInterestUsd: calcTotalInterest(
        payment,
        input.remainingTermMonths,
        principal,
      ),
      payoffMonths: input.remainingTermMonths,
      guidance: 'Modeled only; confirm that the current servicer permits recasting and its fee.',
    });
  }

  const cashOut = Math.max(input.cashOutAmountUsd ?? 0, 0);
  if (cashOut > 0) {
    const principal = input.loanBalanceUsd + cashOut;
    const payment = calcMonthlyPayment(
      principal,
      input.targetRatePct,
      input.targetTermMonths,
    );
    alternatives.push({
      kind: 'CASH_OUT_REFINANCE',
      label: 'Cash-out refinance',
      principalAfterActionUsd: principal,
      monthlyPaymentUsd: payment,
      upfrontCashUsd: input.refinanceCashToCloseUsd,
      estimatedTotalInterestUsd: calcTotalInterest(
        payment,
        input.targetTermMonths,
        principal,
      ),
      payoffMonths: input.targetTermMonths,
      guidance: 'Increases the new principal; lender limits, appraisal, and program eligibility apply.',
    });
  }

  return alternatives;
}
