// apps/backend/src/services/financingCalculator.service.ts

export interface HELOCResult {
  drawMonthlyPaymentCents: number;
  repaymentMonthlyPaymentCents: number;
  totalCostCents: number;
  totalInterestCents: number;
  rateBps: number;
}

export interface HomeEquityLoanResult {
  monthlyPaymentCents: number;
  totalInterestCents: number;
  termYears: number;
  rateBps: number;
}

export interface PersonalLoanScenario {
  termYears: number;
  rateBps: number;
  monthlyPaymentCents: number;
  totalInterestCents: number;
}

export interface PersonalLoanResult {
  scenarios: PersonalLoanScenario[];
}

export interface ContractorFinancingResult {
  promoMonths: number;
  promoMonthlyIfPaidInFullCents: number;
  deferredInterestRiskCents: number;
  ongoingMonthlyIfNotPaidCents: number;
  ongoingAprBps: number;
  warningText: string;
}

export interface PayCashResult {
  opportunityCostFiveYearCents: number;
  opportunityCostTenYearCents: number;
  opportunityCostRateBps: number;
}

export interface RateSnapshot {
  helocRateBps: number;
  helRateBps: number;
  personalLoanMinRateBps: number;
  personalLoanMaxRateBps: number;
  contractorPromoMonths: number;
  contractorOngoingAprBps: number;
  opportunityCostRateBps: number;
}

export interface FinancingResultSet {
  projectCostCents: number;
  helocEligible: boolean;
  helocCapacityCents: number;
  heloc: HELOCResult;
  homeEquityLoan: HomeEquityLoanResult;
  personalLoan: PersonalLoanResult;
  contractorFinancing: ContractorFinancingResult;
  payCash: PayCashResult;
  ratesAsOf: string;
  disclaimer: string;
}

function amortizedMonthlyPayment(principalCents: number, annualRateBps: number, months: number): number {
  const r = annualRateBps / 100 / 100 / 12;
  if (r === 0) return Math.round(principalCents / months);
  const payment = principalCents * (r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  return Math.round(payment);
}

const DISCLAIMER =
  'Rates shown are national averages. Actual rates depend on your credit score, lender, and market conditions. This is not a credit offer or rate commitment.';

export class FinancingCalculatorService {
  computeAll(
    projectCostCents: number,
    rates: RateSnapshot,
    equity: { helocEligible: boolean; helocCapacityCents: number } | null,
    ratesAsOf: string,
  ): FinancingResultSet {
    return {
      projectCostCents,
      helocEligible: equity?.helocEligible ?? false,
      helocCapacityCents: equity?.helocCapacityCents ?? 0,
      heloc: this.computeHELOC(projectCostCents, rates.helocRateBps),
      homeEquityLoan: this.computeHomeEquityLoan(projectCostCents, rates.helRateBps),
      personalLoan: this.computePersonalLoan(
        projectCostCents,
        rates.personalLoanMinRateBps,
        rates.personalLoanMaxRateBps,
      ),
      contractorFinancing: this.computeContractorFinancing(
        projectCostCents,
        rates.contractorPromoMonths,
        rates.contractorOngoingAprBps,
      ),
      payCash: this.computePayCash(projectCostCents, rates.opportunityCostRateBps),
      ratesAsOf,
      disclaimer: DISCLAIMER,
    };
  }

  computeHELOC(projectCostCents: number, rateBps: number): HELOCResult {
    const r = rateBps / 100 / 100 / 12;
    const drawMonthly = Math.round(projectCostCents * r);
    const repayMonthly = amortizedMonthlyPayment(projectCostCents, rateBps, 120);
    const totalCost = drawMonthly * 120 + repayMonthly * 120;
    return {
      drawMonthlyPaymentCents: drawMonthly,
      repaymentMonthlyPaymentCents: repayMonthly,
      totalCostCents: totalCost,
      totalInterestCents: totalCost - projectCostCents,
      rateBps,
    };
  }

  computeHomeEquityLoan(projectCostCents: number, rateBps: number): HomeEquityLoanResult {
    const monthly = amortizedMonthlyPayment(projectCostCents, rateBps, 120);
    return {
      monthlyPaymentCents: monthly,
      totalInterestCents: monthly * 120 - projectCostCents,
      termYears: 10,
      rateBps,
    };
  }

  computePersonalLoan(projectCostCents: number, minRateBps: number, maxRateBps: number): PersonalLoanResult {
    const scenarios: PersonalLoanScenario[] = [];
    for (const rateBps of [minRateBps, maxRateBps]) {
      for (const termYears of [3, 5]) {
        const months = termYears * 12;
        const monthly = amortizedMonthlyPayment(projectCostCents, rateBps, months);
        scenarios.push({
          termYears,
          rateBps,
          monthlyPaymentCents: monthly,
          totalInterestCents: monthly * months - projectCostCents,
        });
      }
    }
    return { scenarios };
  }

  computeContractorFinancing(
    projectCostCents: number,
    promoMonths: number,
    ongoingAprBps: number,
  ): ContractorFinancingResult {
    const promoMonthly = Math.round(projectCostCents / promoMonths);
    const deferredInterest = Math.round(projectCostCents * (ongoingAprBps / 100 / 100 / 12) * promoMonths);
    const remainingBalance = projectCostCents + deferredInterest;
    const ongoingMonthly = amortizedMonthlyPayment(remainingBalance, ongoingAprBps, 60);
    const deferredDollars = (deferredInterest / 100).toFixed(0);
    return {
      promoMonths,
      promoMonthlyIfPaidInFullCents: promoMonthly,
      deferredInterestRiskCents: deferredInterest,
      ongoingMonthlyIfNotPaidCents: ongoingMonthly,
      ongoingAprBps,
      warningText: `If not paid in full within ${promoMonths} months, back-interest of ~$${deferredDollars} is added to your balance`,
    };
  }

  computePayCash(projectCostCents: number, opportunityCostRateBps: number): PayCashResult {
    const rate = opportunityCostRateBps / 100 / 100;
    const fiveYear = Math.round(projectCostCents * (Math.pow(1 + rate, 5) - 1));
    const tenYear = Math.round(projectCostCents * (Math.pow(1 + rate, 10) - 1));
    return {
      opportunityCostFiveYearCents: fiveYear,
      opportunityCostTenYearCents: tenYear,
      opportunityCostRateBps: opportunityCostRateBps,
    };
  }

  isHELOCEligible(equity: { helocEligible: boolean }): boolean {
    return equity.helocEligible;
  }
}
