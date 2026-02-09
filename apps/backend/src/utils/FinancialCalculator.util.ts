// apps/backend/src/utils/FinancialCalculator.util.ts

import { Prisma, Property, InsurancePolicy, Warranty, Expense, FinancialEfficiencyConfig } from '@prisma/client';

// --- Internal Types for Calculation Results ---
export interface FinancialCalculationResult {
    score: number;
    actualInsuranceCost: Prisma.Decimal;
    actualUtilityCost: Prisma.Decimal;
    actualWarrantyCost: Prisma.Decimal;
    marketAverageTotal: Prisma.Decimal;
}

// --- Input type for the calculation ---
export interface CalculationInputs {
    property: Property;
    insurancePolicies: InsurancePolicy[];
    warranties: Warranty[];
    utilityExpenses: Expense[];
    benchmark: FinancialEfficiencyConfig | null;
}

// --- Main Calculation Logic (Pure Function) ---
export function calculateFinancialEfficiency(inputs: CalculationInputs): FinancialCalculationResult {
    const { insurancePolicies, warranties, utilityExpenses, benchmark } = inputs;

    // If no benchmark is found, we cannot calculate the score.
    if (!benchmark) {
        return {
            score: 0, 
            actualInsuranceCost: new Prisma.Decimal(0),
            actualUtilityCost: new Prisma.Decimal(0),
            actualWarrantyCost: new Prisma.Decimal(0),
            marketAverageTotal: new Prisma.Decimal(0),
        };
    }

    // --- 1. Calculate Actual Annual Costs ($AC) ---

    const actualInsuranceCost = insurancePolicies.reduce(
        (sum, policy) => sum.plus(policy.premiumAmount),
        new Prisma.Decimal(0)
    );

    const actualWarrantyCost = warranties.reduce(
        (sum, warranty) => sum.plus(warranty.cost || 0),
        new Prisma.Decimal(0)
    );

    const actualUtilityCost = utilityExpenses.reduce(
        (sum, expense) => sum.plus(expense.amount),
        new Prisma.Decimal(0)
    );

    const actualTotalCost = actualInsuranceCost.plus(actualUtilityCost).plus(actualWarrantyCost);

    // --- 2. Determine Market Average Cost ($MA) ---
    const marketAverageTotal = benchmark.avgInsurancePremium
        .plus(benchmark.avgUtilityCost)
        .plus(benchmark.avgWarrantyCost);

    // --- 3. Calculate Final Score (FES) ---
    let finalScore = 0;
    
    if (actualTotalCost.greaterThan(0) && marketAverageTotal.greaterThan(0)) {
        // FES = min(100, (MA_Total / AC_Total) * 50 + 50)
        const ratio = marketAverageTotal.div(actualTotalCost);
        const rawScore = ratio.mul(50).plus(50); 
        
        finalScore = Math.min(100, rawScore.toNumber());
    } 
    // Handle edge case where AC is zero (no data entered by user)
    else if (marketAverageTotal.greaterThan(0) && actualTotalCost.equals(0)) {
         finalScore = 50; // Neutral score, user needs to enter data
    } else {
        finalScore = 0; // Cannot calculate or MA is zero
    }

    return {
        score: parseFloat(finalScore.toFixed(2)),
        actualInsuranceCost: actualInsuranceCost,
        actualUtilityCost: actualUtilityCost,
        actualWarrantyCost: actualWarrantyCost,
        marketAverageTotal: marketAverageTotal,
    };
}
