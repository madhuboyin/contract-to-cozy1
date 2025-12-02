// apps/backend/src/services/FinancialReport.service.ts

import { prisma } from '../lib/prisma';
import { calculateFinancialEfficiency } from '../utils/FinancialCalculator.util';
import { FinancialEfficiencyReport, PropertyType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';


// Define expected structure for the public-facing report summary
export interface FinancialReportSummary {
    propertyId: string;
    financialEfficiencyScore: number;
    financialExposureTotal: number; // This is the sum of AC for the summary card
    status: 'CALCULATED' | 'QUEUED' | 'MISSING_DATA' | 'NO_PROPERTY';
    lastCalculatedAt: Date | null;
}

// --- Main Service Logic (2.2) ---
export class FinancialReportService {

    /**
     * Executes the FES calculation and persists the result to the database.
     * @param propertyId The ID of the property to calculate the score for.
     * @returns The saved FinancialEfficiencyReport object.
     */
    public async calculateAndSaveFES(propertyId: string): Promise<FinancialEfficiencyReport> {
        console.log(`Starting FES calculation for property: ${propertyId}`);
        
        // 1. Get Calculation Results
        const result = await calculateFinancialEfficiency(propertyId);

        // Check for missing data (e.g., if FES calculation returned 0 because no MA was found)
        if (result.marketAverageTotal.equals(0)) {
            console.warn(`FES calculation failed for ${propertyId}: Missing market averages.`);
            
            // Create/Update report with status indicating missing benchmark data
            return prisma.financialEfficiencyReport.upsert({
                where: { propertyId },
                update: {
                    financialEfficiencyScore: 0,
                    actualInsuranceCost: result.actualInsuranceCost,
                    actualUtilityCost: result.actualUtilityCost,
                    actualWarrantyCost: result.actualWarrantyCost,
                    marketAverageTotal: new Decimal(0),
                    lastCalculatedAt: new Date(),
                },
                create: {
                    propertyId,
                    financialEfficiencyScore: 0,
                    actualInsuranceCost: result.actualInsuranceCost,
                    actualUtilityCost: result.actualUtilityCost,
                    actualWarrantyCost: result.actualWarrantyCost,
                    marketAverageTotal: new Decimal(0),
                },
            });
        }


        // 2. Persist/Update the Report
        const report = await prisma.financialEfficiencyReport.upsert({
            where: { propertyId },
            update: {
                financialEfficiencyScore: result.score,
                actualInsuranceCost: result.actualInsuranceCost,
                actualUtilityCost: result.actualUtilityCost,
                actualWarrantyCost: result.actualWarrantyCost,
                marketAverageTotal: result.marketAverageTotal,
            },
            create: {
                propertyId,
                financialEfficiencyScore: result.score,
                actualInsuranceCost: result.actualInsuranceCost,
                actualUtilityCost: result.actualUtilityCost,
                actualWarrantyCost: result.actualWarrantyCost,
                marketAverageTotal: result.marketAverageTotal,
            },
        });

        console.log(`✅ FES calculation complete for property ${propertyId}. Score: ${report.financialEfficiencyScore}`);
        return report;
    }

    /**
     * Retrieves the FES summary for the dashboard.
     */
    public async getFinancialEfficiencySummary(propertyId: string): Promise<FinancialReportSummary> {
        const property = await prisma.property.findUnique({
            where: { id: propertyId },
            select: { name: true, financialReport: true }
        });

        if (!property) {
            return {
                propertyId,
                financialEfficiencyScore: 0,
                financialExposureTotal: 0,
                status: 'NO_PROPERTY',
                lastCalculatedAt: null,
            };
        }

        const report = property.financialReport;
        
        // If no report exists, simulate the 'QUEUED' status for the frontend
        if (!report) {
             return {
                propertyId,
                financialEfficiencyScore: 0,
                financialExposureTotal: 0,
                status: 'QUEUED', 
                lastCalculatedAt: null,
            };
        }

        // Check for missing benchmark data
        if (report.financialEfficiencyScore === 0 && report.marketAverageTotal.equals(0)) {
            return {
                propertyId,
                financialEfficiencyScore: 0,
                financialExposureTotal: 0,
                status: 'MISSING_DATA',
                lastCalculatedAt: report.lastCalculatedAt,
            };
        }
        
        const actualTotal = report.actualUtilityCost.plus(report.actualInsuranceCost).plus(report.actualWarrantyCost);

        return {
            propertyId,
            financialEfficiencyScore: report.financialEfficiencyScore,
            financialExposureTotal: actualTotal.toNumber(),
            status: 'CALCULATED',
            lastCalculatedAt: report.lastCalculatedAt,
        };
    }
    
    /**
     * Retrieves the full detailed FES report.
     */
    public async getFinancialEfficiencyReport(propertyId: string): Promise<FinancialEfficiencyReport | 'QUEUED'> {
        const report = await prisma.financialEfficiencyReport.findUnique({
            where: { propertyId },
        });
        
        if (!report) {
            return 'QUEUED';
        }
        
        return report;
    }
}