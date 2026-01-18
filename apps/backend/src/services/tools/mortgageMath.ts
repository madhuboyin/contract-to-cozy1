// apps/backend/src/services/tools/mortgageMath.ts

export type MortgageInputs = {
    balanceNow: number;
    annualRate: number;         // decimal
    remainingTermMonths: number;
    monthlyPayment?: number | null; // if absent, compute amortizing payment
  };
  
  export function computeMonthlyPayment(p: MortgageInputs): number {
    const r = p.annualRate / 12;
    const n = Math.max(1, p.remainingTermMonths);
    if (r === 0) return p.balanceNow / n;
    return (p.balanceNow * r) / (1 - Math.pow(1 + r, -n));
  }
  
  export function amortizeYears(p: MortgageInputs, years: number) {
    const months = Math.min(p.remainingTermMonths, years * 12);
    const payment = p.monthlyPayment ?? computeMonthlyPayment(p);
    const r = p.annualRate / 12;
  
    let bal = p.balanceNow;
    let interestPaid = 0;
    let principalPaid = 0;
  
    for (let i = 0; i < months; i++) {
      const interest = bal * r;
      const principal = Math.max(0, payment - interest);
      const actualPrincipal = Math.min(principal, bal);
      bal = Math.max(0, bal - actualPrincipal);
  
      interestPaid += interest;
      principalPaid += actualPrincipal;
  
      if (bal <= 0) break;
    }
  
    return { endingBalance: bal, interestPaid, principalPaid, monthlyPayment: payment, monthsSimulated: months };
  }
  