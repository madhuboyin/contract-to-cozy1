//apps/backend/src/utils/riskCalculator.util.ts

import {
  Property,
  Warranty,
  InsurancePolicy,
  RiskAssessmentReport,
  RiskCategory,
  Prisma,
} from "@prisma/client";
import { RISK_ASSET_CONFIG, SystemRiskConfig } from "../config/risk-constants";

// --- INTERFACES & TYPES (Mirroring Prisma Models for strict typing) ---

// Extend Property type to include required relations for the calculation
interface PropertyWithDetails extends Property {
  warranties: Warranty[];
  insurancePolicies: InsurancePolicy[];
}

// Result structure for a single asset calculation
export interface AssetRiskDetail {
  assetName: string;
  systemType: string;
  category: RiskCategory;
  age: number;
  expectedLife: number;
  replacementCost: number;
  probability: number;       // P (0.0 to 1.0)
  coverageFactor: number;    // C (0.0 to 1.0)
  outOfPocketCost: number;   // Out-of-Pocket Cost * (1 - C)
  riskDollar: number;        // P * Out-of-Pocket Cost
  riskLevel: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH' | 'CRITICAL';
  actionCta?: string;
}

// --- CORE HELPER FUNCTIONS ---

const clamp = (num: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, num));
};

const getAgeInYears = (installYear: number | null, currentYear: number): number => {
    // Defensive Check 1: Ensure installYear is a number before subtraction
    if (!installYear || typeof installYear !== 'number') return 0; 
    return clamp(currentYear - installYear, 0, 100);
};

// --- STEP 2: PROBABILITY CALCULATION (P) ---
// Uses a non-linear (squared) relationship to penalize older assets more severely.
const calculateProbability = (age: number, expectedLife: number, warningBump: number = 0): number => {
    if (age === 0) return 0.05; // Baseline low risk for new/unknown age
    if (expectedLife <= 0) return 0.95; // Max risk if life is undefined

    const ageRatio = clamp(age / expectedLife, 0, 2); 
    
    // Non-linear P based on (Age Ratio)^2. P goes from 0 to 1.0 sharply near end of life.
    const P_base = 0.1 + 0.9 * Math.pow(ageRatio, 2);

    let P = clamp(P_base + warningBump, 0, 1);

    // If asset is significantly past its expected life, ensure high risk floor
    if (ageRatio >= 1.2) {
        P = Math.max(P, 0.85);
    }
    
    return clamp(P, 0.05, 1.0);
};


// --- STEP 3: COVERAGE & OUT-OF-POCKET CALCULATION (C) ---
const calculateOutofPocket = (
  replacementCost: number,
  hasActiveWarranty: boolean,
  hasDwellingInsurance: boolean,
  probability: number
): number => {
  let uncoveredCost = replacementCost;
  const standardDeductible = 1000; // Assume a typical deductible for insurance
  const warrantyDeductible = 150; // Assume a typical service fee/deductible for home warranty
  
  // [RISK-CALC-DEBUG] Log input parameters
  console.log(`[RISK-CALC-DEBUG] Asset: R-Cost=${replacementCost}, P=${probability.toFixed(2)}, Warranty=${hasActiveWarranty}, Insur=${hasDwellingInsurance}`);

  // 1. Coverage for High Probability Failures (W&T, Age-related):
  if (probability > 0.7) {
    // FIX: For high probability failures (end-of-life/W&T), assume NO coverage (full replacement cost)
    // as standard insurance and home warranties typically exclude these.
    uncoveredCost = replacementCost;
    // [RISK-CALC-DEBUG] Log execution path 1 (The fixed logic)
    console.log(`[RISK-CALC-DEBUG] Path 1 (P > 0.7, END-OF-LIFE): Setting Out-of-Pocket to FULL cost: ${uncoveredCost}`);
  } 
  // 2. Coverage for Low/Moderate Probability Failures (Accident/Sudden Loss):
  else {
    if (hasActiveWarranty) {
      // FIX: Prefer the lower Home Warranty deductible for sudden failures/accidents.
      uncoveredCost = warrantyDeductible;
      // [RISK-CALC-DEBUG] Log execution path 2
      console.log(`[RISK-CALC-DEBUG] Path 2 (P <= 0.7, ACCIDENT/WARRANTY): Using Warranty Deductible: ${uncoveredCost}`);
    } else if (hasDwellingInsurance) {
      // If no warranty, insurance covers sudden loss (higher deductible).
      uncoveredCost = standardDeductible;
      // [RISK-CALC-DEBUG] Log execution path 3
      console.log(`[RISK-CALC-DEBUG] Path 3 (P <= 0.7, ACCIDENT/INSURANCE): Using Insurance Deductible: ${uncoveredCost}`);
    } else {
      // No coverage for accidental damage. Full exposure.
      uncoveredCost = replacementCost;
      // [RISK-CALC-DEBUG] Log execution path 4
      console.log(`[RISK-CALC-DEBUG] Path 4 (P <= 0.7, ACCIDENT/NO COVERAGE): Using FULL cost (No Coverage): ${uncoveredCost}`);
    }
  }

  // [RISK-CALC-DEBUG] Log final output
  console.log(`[RISK-CALC-DEBUG] Final Out-of-Pocket Cost: ${uncoveredCost}`);
  
  return clamp(uncoveredCost, 0, replacementCost);
};

// --- ASSET FILTERING ---

/**
 * Filters asset configs to only those that exist on the property.
 * Prevents calculating risk for HVAC types, water heaters, roofs, etc. that the property doesn't have.
 */
export const filterRelevantAssets = (
  property: PropertyWithDetails,
  allConfigs: SystemRiskConfig[]
): SystemRiskConfig[] => {
  const relevantConfigs: SystemRiskConfig[] = [];

  for (const config of allConfigs) {
    let shouldInclude = false;

    switch (config.systemType) {
      // HVAC - only include the type the property actually has
      case 'HVAC_FURNACE':
        shouldInclude = property.heatingType === 'FURNACE' || property.heatingType === 'HVAC';
        break;
      case 'HVAC_HEAT_PUMP':
        shouldInclude = property.heatingType === 'HEAT_PUMP';
        break;

      // Water Heater - only include the type the property actually has
      case 'WATER_HEATER_TANK':
        shouldInclude = property.waterHeaterType === 'TANK';
        break;
      case 'WATER_HEATER_TANKLESS':
        shouldInclude = property.waterHeaterType === 'TANKLESS';
        break;

      // Roof - only include the type the property actually has
      case 'ROOF_SHINGLE':
        shouldInclude = property.roofType === 'SHINGLE';
        break;
      case 'ROOF_TILE_METAL':
        shouldInclude = property.roofType === 'TILE' || property.roofType === 'METAL';
        break;

      // Electrical Panel - based on age
      case 'ELECTRICAL_PANEL_MODERN':
        shouldInclude = !property.electricalPanelAge || property.electricalPanelAge < 30;
        break;
      case 'ELECTRICAL_PANEL_OLD':
        shouldInclude = property.electricalPanelAge !== null && property.electricalPanelAge >= 30;
        break;

      // Foundation - include if matches or is default
      case 'FOUNDATION_CONCRETE_SLAB':
        shouldInclude = !property.foundationType || 
                       Boolean(property.foundationType && (
                         property.foundationType.includes('SLAB') || 
                         property.foundationType.includes('CONCRETE')
                       ));
        break;

      // Safety - include if property has detectors
      case 'SAFETY_SMOKE_CO_DETECTORS':
        shouldInclude = property.hasSmokeDetectors === true || property.hasCoDetectors === true;
        break;

      // Major Appliances - assume all properties have these
      case 'MAJOR_APPLIANCE_FRIDGE':
      case 'MAJOR_APPLIANCE_DISHWASHER':
        shouldInclude = true;
        break;

      default:
        shouldInclude = false;
        console.warn(`[RISK-UTIL:FILTER] Unknown asset type: ${config.systemType} - skipping`);
    }

    if (shouldInclude) {
      relevantConfigs.push(config);
    }
  }

  console.log(`[RISK-UTIL:FILTER] Filtered from ${allConfigs.length} to ${relevantConfigs.length} assets for property`);
  return relevantConfigs;
};

// --- MAIN CALCULATION FUNCTIONS ---

/**
 * Calculates the Risk Dollar and all metrics for a single asset.
 */
export const calculateAssetRisk = (
  assetName: string,
  assetConfig: SystemRiskConfig,
  property: PropertyWithDetails,
  currentYear: number,
): AssetRiskDetail | null => {
  
  // 1. Identify Installation Year based on asset type (Simplified for Phase 1)
  let installYear: number | null = null;
  switch (assetConfig.systemType) {
    case "HVAC_FURNACE":
    case "HVAC_HEAT_PUMP":
      installYear = property.hvacInstallYear;
      break;
    case "WATER_HEATER_TANK":
    case "WATER_HEATER_TANKLESS":
      installYear = property.waterHeaterInstallYear;
      break;
    case "ROOF_SHINGLE":
    case "ROOF_TILE_METAL":
      installYear = property.roofReplacementYear;
      break;
    default:
        // For components like Detectors, assume age based on a fixed 10-year rule
        if (assetConfig.category === RiskCategory.SAFETY) {
            // Use yearBuilt as a fallback for fixed-life assets, default to 2020 if none
            installYear = property.yearBuilt || 2020; 
        }
        break;
  }
  
  // If we can't determine the age, skip this asset for now
  if (!installYear) return null;

  const age = getAgeInYears(installYear, currentYear);
  const expectedLife = assetConfig.expectedLife;
  const replacementCost = assetConfig.replacementCost;

  // 2. Apply Warning Flags (Simplified Phase 1 check on Property fields)
  let warningBump = 0;
  // Defensive check: Ensure property.hasDrainageIssues is explicitly boolean true before access
  if (property.hasDrainageIssues === true && assetConfig.warningFlags?.hasDrainageIssues) {
    warningBump += assetConfig.warningFlags.hasDrainageIssues;
  }
  
  // 3. Calculate Probability (P)
  const P = calculateProbability(age, expectedLife, warningBump);

  // 4. Calculate Coverage Status (C)
  const now = new Date();
  const hasActiveWarranty = property.warranties.some(
    (w) => Boolean(w.expiryDate && new Date(w.expiryDate) >= now)
  );
  const hasDwellingInsurance = property.insurancePolicies.length > 0; // Simplified check
  
  // 5. Calculate Out-of-Pocket Cost
  const outOfPocketCost = calculateOutofPocket(replacementCost, hasActiveWarranty, hasDwellingInsurance, P);
  
  // 6. Calculate Risk Dollar
  const riskDollar = P * outOfPocketCost;
  
  // 7. Determine Risk Level (Color Buckets)
  const scoreRatio = riskDollar / (replacementCost * 0.5); // Arbitrary scoring metric for single asset
  let riskLevel: AssetRiskDetail['riskLevel'];
  if (scoreRatio < 0.1) riskLevel = 'LOW';
  else if (scoreRatio < 0.3) riskLevel = 'MODERATE';
  else if (scoreRatio < 0.6) riskLevel = 'ELEVATED';
  else riskLevel = 'HIGH';

  // 8. Determine Action CTA (Phase 3 logic placeholder)
  let actionCta = '';
  if (riskLevel === 'HIGH' && !hasActiveWarranty) {
      actionCta = 'Add Home Warranty';
  } else if (age > expectedLife && outOfPocketCost > 0) {
      actionCta = 'Schedule Inspection/Replacement';
  }

  return {
    assetName,
    systemType: assetConfig.systemType,
    category: assetConfig.category,
    age,
    expectedLife,
    replacementCost,
    probability: Math.round(P * 100) / 100,
    coverageFactor:
      replacementCost > 0
        ? Math.round(clamp(1 - outOfPocketCost / replacementCost, 0, 1) * 100) / 100
        : 0, // C is derivative
    outOfPocketCost: Math.round(outOfPocketCost),
    riskDollar: Math.round(riskDollar),
    riskLevel,
    actionCta,
  };
};

/**
 * Main function to aggregate risks and calculate the final normalized score.
 * @returns RiskAssessmentReport structure data.
 */
export const calculateTotalRiskScore = (
  property: PropertyWithDetails,
  assetRisks: AssetRiskDetail[],
): Omit<RiskAssessmentReport, 'id' | 'propertyId' | 'property' | 'createdAt'> => {
  
  const totalRiskDollar = assetRisks.reduce((sum, risk) => sum + risk.riskDollar, 0);
  
  // --- STEP 5: NORMALIZE TO 0–100 SCORE ---
  
  // Dynamic MAX_RISK: Define max acceptable risk as 15% of the property's potential replacement cost.
  // Using property size (sqft) * a fixed cost as a simplified proxy for total asset value/replacement cost.
  const PROPERTY_VALUE_RATE = 25; // $25 per square foot of total internal assets
  
  // DEFENSIVE FIX: Ensure property.propertySize is a number, defaulting to 2000 if null/0/invalid
  const propertySize = (typeof property.propertySize === 'number' && property.propertySize > 0) 
      ? property.propertySize 
      : 2000; 
      
  const maxPotentialExposure = propertySize * PROPERTY_VALUE_RATE; 
  
  // Max tolerable risk is 20% of the max potential exposure (a tuning parameter)
  const MAX_RISK_DOLLAR = maxPotentialExposure * 0.20; 

  // Non-Linear Mapping (Squared Inverse): Punishes high-risk exposure more severely.
  const riskRatio = clamp(totalRiskDollar / MAX_RISK_DOLLAR, 0, 1);
  const score = 100 * (1 - Math.pow(riskRatio, 2));

  // --- STEP 6: COLOR BUCKETS (Final Score Status) ---
  const finalScore = Math.round(score);

  return {
    riskScore: finalScore,
    financialExposureTotal: new Prisma.Decimal(totalRiskDollar),
    details: assetRisks as any, // Cast to any because Prisma's Json type is flexible
    lastCalculatedAt: new Date(),
  };
};
