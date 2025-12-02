// apps/backend/src/utils/FinancialCalculator.util.ts

import { prisma } from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { Property, FinancialEfficiencyReport, InsurancePolicy, Warranty, Expense, ExpenseCategory, FinancialEfficiencyConfig } from '@prisma/client';

// --- Internal Types for Calculation Results ---
interface FinancialCalculationResult {
    score: number;
    actualInsuranceCost: Decimal;
    actualUtilityCost: Decimal;
    actualWarrantyCost: Decimal;
    marketAverageTotal: Decimal;
}

// --- Helper function to find the relevant benchmark ---
async function getBenchmark(property: Property): Promise<FinancialEfficiencyConfig | null> {
    // 1. Try to find the most specific benchmark (by zipCode and propertyType)
    let benchmark: FinancialEfficiencyConfig | null = null;
    
    if (property.propertyType) {
        benchmark = await prisma.financialEfficiencyConfig.findUnique({
            where: { zipCode_propertyType: { zipCode: property.zipCode, propertyType: property.propertyType } },
        });
    }

    // 2. If not found, try by propertyType only (global default for that type)
    if (!benchmark && property.propertyType) {
        benchmark = await prisma.financialEfficiencyConfig.findFirst({
            where: { zipCode: null, propertyType: property.propertyType },
        });
    }

    // 3. Fallback: If still not found, return null (score cannot be calculated)
    return benchmark;
}

// --- Main Calculation Logic (2.1) ---
export async function calculateFinancialEfficiency(propertyId: string): Promise<FinancialCalculationResult> {
    // Fetch property and all related financial data (Insurance, Warranties, 12 months of Utilities)
    const property = await prisma.property.findUnique({
        where: { id: propertyId },
        include: {
            insurancePolicies: true,
            warranties: true,
            expenses: {
                where: {
                    category: ExpenseCategory.UTILITY,
                    // Filter for the last 12 months of utility expenses
                    transactionDate: { gte: new Date(new Date().setFullYear(new Date().getFullYear() - 1)) },
                },
            },
        },
    });

    if (!property) {
        throw new Error(`Property with ID ${propertyId} not found.`);
    }

    const benchmark = await getBenchmark(property);

    // If no benchmark is found, we cannot calculate the score.
    if (!benchmark) {
        // Return a default zero score result, implying insufficient data for comparison
        return {
            score: 0, 
            actualInsuranceCost: new Decimal(0),
            actualUtilityCost: new Decimal(0),
            actualWarrantyCost: new Decimal(0),
            marketAverageTotal: new Decimal(0),
        };
    }

    // --- 1. Calculate Actual Annual Costs ($AC) ---

    // Sum actual annual costs (assuming policy premiums/costs are annual/annualized)
    const actualInsuranceCost = property.insurancePolicies.reduce(
        (sum, policy) => sum.plus(policy.premiumAmount),
        new Decimal(0)
    );

    const actualWarrantyCost = property.warranties.reduce(
        (sum, warranty) => sum.plus(warranty.cost || 0),
        new Decimal(0)
    );

    // Sum 12 months of utility expenses
    const actualUtilityCost = property.expenses.reduce(
        (sum, expense) => sum.plus(expense.amount),
        new Decimal(0)
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
        
        finalScore = Math.min(
            100, 
            rawScore.toNumber() 
        );
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